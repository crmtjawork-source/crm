import "server-only";
import type { Db } from "./supabaseAdmin";
import { resolveChannel, sendToContact, type OutgoingContent } from "./whatsapp";
import { channelDownReason, channelIsUp, isGatewayError, loadAutomationDefaults, stepPolicy, DEFAULT_HOLD_EXPIRE_HOURS, type FallbackKind } from "./waHealth";
import { sendEmail } from "./email";
import { composeForLead, pickChannel, sendLeadMessage } from "./leadMessages";

export type TriggerType =
  | "new_contact"
  | "stage_change"
  | "tag_added"
  | "appointment_booked"
  | "status_changed"
  | "document_viewed"
  | "document_signed"
  | "record_created"
  | "record_stage_changed"
  | "record_field_changed"
  | "payment_due";
// source: where the lead came from, matched against automations.trigger_source
// (e.g. "meta_lead_ads"). Leads created by hand or by import pass none.
export type TriggerCtx = { pipelineId?: string; stageId?: string; tag?: string; source?: string; status?: string; value?: string; vars?: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// {{name}} {{first_name}} {{phone}} {{email}} {{booking_token}} {{field:תקציב}}
export function renderPlaceholders(text: string, contact: Row): string {
  const firstName = String(contact.name ?? "").trim().split(/\s+/)[0] ?? "";
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key: string) => {
    if (key === "name") return contact.name ?? "";
    if (key === "first_name") return firstName;
    if (key === "phone") return contact.phone ?? "";
    if (key === "email") return contact.email ?? "";
    if (key === "booking_token") return contact.booking_token ?? "";
    if (key.startsWith("field:")) return contact.fields?.[key.slice(6)] ?? "";
    return "";
  });
}

// Record context for automations on custom objects (clients, properties…).
type RecordCtx = { record: Row; type: Row; fields: Row[] };

function recordValue(f: Row, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const opt = (x: unknown) => (f.options ?? []).find((o: Row) => o.value === x)?.label ?? String(x);
  if (f.type === "select") return opt(v);
  if (f.type === "multi_select") return (Array.isArray(v) ? v : [v]).map(opt).join(", ");
  if (f.type === "checkbox") return v ? "כן" : "לא";
  if (f.type === "date") return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(String(v)));
  if (f.type === "number" || f.type === "currency") return Number(v).toLocaleString("he-IL");
  return String(v);
}

// {{record_title}} and {{record:<field label>}} inside texts of record automations.
export function renderRecordPlaceholders(text: string, rec: RecordCtx | null): string {
  if (!rec) return text;
  return text.replace(/\{\{\s*record_title\s*\}\}/g, rec.record.title ?? "").replace(/\{\{\s*record:([^}]+?)\s*\}\}/g, (_m, label: string) => {
    const f = rec.fields.find((x) => x.label === label.trim() || x.key === label.trim());
    return f ? recordValue(f, rec.record.data?.[f.key]) : "";
  });
}

// The lead a record's messages go to: its linked lead, else the lead with
// the same phone number.
async function contactForRecord(db: Db, rec: RecordCtx): Promise<Row | null> {
  if (rec.record.contact_id) {
    const { data } = await db.from("contacts").select("*").eq("id", rec.record.contact_id).maybeSingle();
    if (data) return data;
  }
  for (const f of rec.fields.filter((x) => x.type === "phone" || x.type === "contact")) {
    const v = rec.record.data?.[f.key];
    if (!v) continue;
    if (f.type === "contact") {
      const { data } = await db.from("contacts").select("*").eq("id", String(v)).maybeSingle();
      if (data) return data;
      continue;
    }
    const d = String(v).replace(/\D/g, "");
    const digits = /^0\d{8,9}$/.test(d) ? `972${d.slice(1)}` : d;
    const { data } = await db.from("contacts").select("*").eq("org_id", rec.record.org_id).eq("phone_digits", digits).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

export async function triggerAutomations(
  db: Db,
  orgId: string,
  type: TriggerType,
  contactId: string,
  ctx: TriggerCtx = {}
): Promise<string[]> {
  const { data: automations } = await db
    .from("automations")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true)
    .eq("trigger_type", type);

  const matched = (automations ?? []).filter((a: Row) => {
    if (a.trigger_pipeline_id && a.trigger_pipeline_id !== ctx.pipelineId) return false;
    if (a.trigger_stage_id && a.trigger_stage_id !== ctx.stageId) return false;
    if (a.trigger_tag && a.trigger_tag !== ctx.tag) return false;
    if (a.trigger_source && a.trigger_source !== ctx.source) return false;
    if (a.trigger_status && a.trigger_status !== ctx.status) return false;
    if (type === "payment_due" && a.trigger_value && a.trigger_value !== ctx.value) return false;
    return true;
  });

  const runIds: string[] = [];
  for (const automation of matched) {
    const { data: run } = await db
      .from("automation_runs")
      .insert({ org_id: orgId, automation_id: automation.id, contact_id: contactId, status: "running", steps_log: [], ...(ctx.vars ? { vars: ctx.vars } : {}) })
      .select("id")
      .single();
    if (!run) continue;
    runIds.push(run.id);
    await executeRun(db, run.id);
  }
  return runIds;
}

// WhatsApp can't carry the message right now (disconnected / not set up).
export class WaUnavailableError extends Error {}

// The actual WhatsApp send of a send_message step. Throws WaUnavailableError
// when no connected channel is available (nothing is sent in that case).
async function performSend(db: Db, automation: Row, step: Row, contact: Row, rec: RecordCtx | null): Promise<string> {
  const fill = (t: string) => renderRecordPlaceholders(renderPlaceholders(t, contact), rec);
  const ensureUp = async (channelId: string | null) => {
    if (!channelId) throw new WaUnavailableError("לא הוגדר ערוץ וואטסאפ לשליחה");
    const { data: ch } = await db.from("channels").select("*").eq("id", channelId).maybeSingle();
    if (!channelIsUp(ch)) throw new WaUnavailableError(channelDownReason(ch));
  };
  // Every automation but the welcome (a brand-new lead) goes out from the personal WhatsApp of whoever handles the lead.
  const welcome = automation.trigger_type === "new_contact";
  if (!welcome || step.sender === "owner" || step.message_template_id) {
    let ownerUserId: string | null = null;
    if (contact.owner_email) {
      const { data: u } = await db.from("users").select("id").ilike("email", contact.owner_email).maybeSingle();
      ownerUserId = u?.id ?? null;
    }
    // Owner's WhatsApp when linked; otherwise the business's default number.
    let channelId: string | null;
    try {
      channelId = welcome && step.channel_id ? step.channel_id : await pickChannel(db, automation.org_id, contact, !welcome || step.sender === "owner");
    } catch (e) {
      throw new WaUnavailableError(e instanceof Error ? e.message : String(e));
    }
    await ensureUp(channelId);
    const { text, templateName, attachment } = await composeForLead(db, {
      orgId: automation.org_id,
      contactId: contact.id,
      userId: ownerUserId,
      templateId: step.message_template_id,
      text: step.message_template_id ? null : fill(step.message ?? ""),
    });
    await sendLeadMessage(db, { orgId: automation.org_id, channelId: channelId!, contactId: contact.id, text: renderRecordPlaceholders(text, rec), attachment, label: `אוטומציה "${automation.name}"`, userId: ownerUserId, origin: "automation" });
    return `נשלחה הודעה${templateName ? ` "${templateName}"` : ""}`;
  }
  let target: Row | null = null;
  try {
    target = await resolveChannel(db, automation.org_id, step.channel_id);
  } catch (e) {
    throw new WaUnavailableError(e instanceof Error ? e.message : String(e));
  }
  if (!channelIsUp(target)) throw new WaUnavailableError(channelDownReason(target));
  const content: OutgoingContent = step.template_name
    ? {
        kind: "template",
        name: step.template_name,
        language: step.template_language || "he",
        bodyParams: (step.template_params ?? []).map((p: string) => renderPlaceholders(p, contact)),
        ...(step.template_button_param ? { buttonUrlParam: renderPlaceholders(step.template_button_param, contact) } : {}),
      }
    : { kind: "text", body: fill(step.message ?? "") };
  await sendToContact(db, { orgId: automation.org_id, contactId: contact.id, channelId: step.channel_id, content, origin: "automation" });
  return step.template_name ? `נשלחה תבנית וואטסאפ "${step.template_name}"` : "נשלחה הודעת וואטסאפ";
}

// What the message's text would have been (for fallbacks that carry it elsewhere).
async function previewText(db: Db, automation: Row, step: Row, contact: Row, rec: RecordCtx | null): Promise<string> {
  try {
    const { text } = await composeForLead(db, { orgId: automation.org_id, contactId: contact.id, templateId: step.message_template_id, text: step.message_template_id ? null : renderRecordPlaceholders(renderPlaceholders(step.message ?? "", contact), rec) });
    return renderRecordPlaceholders(text, rec) || `[תבנית ${step.template_name ?? ""}]`;
  } catch {
    return step.message ?? `[תבנית ${step.template_name ?? ""}]`;
  }
}

async function applyFallback(db: Db, automation: Row, step: Row, contact: Row, rec: RecordCtx | null, fallback: FallbackKind, reason: string, where: { runId: string; position: number }): Promise<string> {
  const hold = async (why: string) => {
    await db.from("automation_held_sends").upsert(
      { org_id: automation.org_id, run_id: where.runId, automation_id: automation.id, step_id: step.id ?? null, step_position: where.position, contact_id: contact.id, reason: why, status: "pending" },
      { onConflict: "run_id,step_position", ignoreDuplicates: true }
    );
    return `⏸ ממתין לחיבור וואטסאפ (${why}) — תישלח אוטומטית כשיחובר`;
  };
  if (fallback === "skip") return `⏭ וואטסאפ לא זמין (${reason}) — ההודעה דולגה`;
  const text = await previewText(db, automation, step, contact, rec);
  if (fallback === "task") {
    const ownerEmail = rec?.record.owner_email ?? contact.owner_email ?? null;
    const { data: owner } = ownerEmail ? await db.from("users").select("full_name").ilike("email", ownerEmail).maybeSingle() : { data: null };
    await db.from("tasks").insert({ org_id: automation.org_id, title: `לשלוח ל${contact.name} בעצמך (וואטסאפ לא זמין): ${text.slice(0, 80)}`, contact_id: contact.id, record_id: rec?.record.id ?? null, due_date: new Date().toISOString().slice(0, 10), assignee: owner?.full_name ?? null });
    await db.from("activities").insert({ org_id: automation.org_id, contact_id: contact.id, type: "note", text: `📝 הודעה שלא נשלחה (וואטסאפ לא זמין) — אוטומציה "${automation.name}":\n${text}` });
    return `📝 וואטסאפ לא זמין (${reason}) — נפתחה משימה לשלוח ידנית`;
  }
  if (fallback === "notify") {
    await db.from("notifications").insert({ org_id: automation.org_id, contact_id: contact.id, target_email: contact.owner_email ?? null, text: `⚠ אוטומציה "${automation.name}": הודעה ל${contact.name} לא נשלחה — וואטסאפ לא זמין. ${text.slice(0, 120)}` });
    return `🔔 וואטסאפ לא זמין (${reason}) — נשלחה התראה לצוות`;
  }
  if (fallback === "email") {
    if (!contact.email) return await hold(`${reason}; לליד אין אימייל`);
    try {
      await sendEmail({ to: contact.email, subject: automation.name, text });
      await db.from("activities").insert({ org_id: automation.org_id, contact_id: contact.id, type: "note", text: `✉️ נשלח באימייל במקום וואטסאפ — אוטומציה "${automation.name}":\n${text}` });
      return `✉️ וואטסאפ לא זמין (${reason}) — נשלח אימייל`;
    } catch (e) {
      return await hold(`${reason}; אימייל נכשל: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return await hold(reason);
}

export type ReleaseResult = { sent: number; stillHeld: number; failed: number; expired: number };

// Sends held automation messages whose channel is connected again. Each row is
// claimed (pending → sending) before the send, so overlapping cron runs and the
// "send all" button can never send the same message twice. A row that dies mid-send
// is marked failed, never resent (WhatsApp may already have delivered it).
export async function releaseHeldSends(db: Db, opts: { orgId?: string; ids?: string[] } = {}): Promise<ReleaseResult> {
  const out: ReleaseResult = { sent: 0, stillHeld: 0, failed: 0, expired: 0 };
  await db.from("automation_held_sends").update({ status: "failed", error: "השליחה נקטעה — לא ידוע אם ההודעה יצאה", resolved_at: new Date().toISOString() }).eq("status", "sending").lt("held_at", new Date(Date.now() - 10 * 60_000).toISOString());
  let q = db.from("automation_held_sends").select("*").eq("status", "pending").order("held_at").limit(100);
  if (opts.orgId) q = q.eq("org_id", opts.orgId);
  if (opts.ids?.length) q = q.in("id", opts.ids);
  const { data: held, error } = await q;
  if (error) return out; // table missing (migration not applied yet)
  const defaultsCache = new Map<string, Awaited<ReturnType<typeof loadAutomationDefaults>>>();
  const finish = (id: string, status: string, error?: string | null) => db.from("automation_held_sends").update({ status, error: error ?? null, resolved_at: new Date().toISOString() }).eq("id", id);
  for (const h of held ?? []) {
    const [{ data: automation }, { data: run }] = await Promise.all([
      db.from("automations").select("*").eq("id", h.automation_id).maybeSingle(),
      db.from("automation_runs").select("*").eq("id", h.run_id).maybeSingle(),
    ]);
    const { data: step } = h.step_id ? await db.from("automation_steps").select("*").eq("id", h.step_id).maybeSingle() : { data: null };
    const { data: contact } = h.contact_id ? await db.from("contacts").select("*").eq("id", h.contact_id).maybeSingle() : { data: null };
    const bump = (msg: string) => run && db.from("automation_runs").update({ steps_log: [...(run.steps_log ?? []), msg] }).eq("id", run.id);
    if (!automation || !run || !step || !contact || !automation.active) {
      await finish(h.id, "cancelled", "האוטומציה, הצעד או הליד לא קיימים / האוטומציה כבויה");
      continue;
    }
    // Too old to still be useful → hand it to a human instead.
    if (!defaultsCache.has(h.org_id)) defaultsCache.set(h.org_id, await loadAutomationDefaults(db, h.org_id));
    const expireH = defaultsCache.get(h.org_id)!.hold_expire_hours ?? DEFAULT_HOLD_EXPIRE_HOURS;
    if (Date.now() - new Date(h.held_at).getTime() > expireH * 3600_000) {
      const entry = await applyFallback(db, automation, step, contact, null, "task", `ממתין יותר מ-${expireH} שעות`, { runId: h.run_id, position: h.step_position });
      await finish(h.id, "expired", "פג תוקף ההמתנה");
      await bump(entry);
      out.expired++;
      continue;
    }
    const { data: claimed } = await db.from("automation_held_sends").update({ status: "sending" }).eq("id", h.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    try {
      let rec: RecordCtx | null = null;
      if (run.record_id) {
        const { data: record } = await db.from("records").select("*").eq("id", run.record_id).maybeSingle();
        if (record) {
          const [{ data: type }, { data: fields }] = await Promise.all([db.from("object_types").select("*").eq("id", record.object_type_id).single(), db.from("object_fields").select("*").eq("object_type_id", record.object_type_id).order("position")]);
          rec = { record, type, fields: fields ?? [] };
        }
      }
      const entry = await performSend(db, automation, step, contact, rec);
      await finish(h.id, "sent");
      await bump(`✓ ${entry} (אחרי שהוואטסאפ חובר מחדש)`);
      await db.from("activities").insert({ org_id: h.org_id, contact_id: contact.id, type: "note", text: `🤖 אוטומציה "${automation.name}": ${entry} (הייתה ממתינה לחיבור וואטסאפ)` });
      out.sent++;
    } catch (err) {
      if (err instanceof WaUnavailableError) {
        await db.from("automation_held_sends").update({ status: "pending", reason: err.message }).eq("id", h.id); // still down: keep waiting
        out.stillHeld++;
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        if (isGatewayError(err) && !/ייתכן שההודעה כבר יצאה/.test(msg)) {
          await db.from("automation_held_sends").update({ status: "pending", reason: msg }).eq("id", h.id);
          out.stillHeld++;
        } else {
          await finish(h.id, "failed", msg);
          await bump(`❌ שליחה מושהית נכשלה: ${msg}`);
          out.failed++;
        }
      }
    }
  }
  return out;
}

async function executeStep(
  db: Db,
  automation: Row,
  step: Row,
  contact: Row | null,
  rec: RecordCtx | null,
  where: { runId: string; position: number; vars?: Record<string, string> | null }
): Promise<{ entry: string; contact: Row | null }> {
  // {{payment_description}} {{payment_amount}} {{payment_date}} {{payment_days}} in payment_due automations.
  const withVars = (t: string) => (where.vars ? t.replace(/\{\{\s*(payment_\w+)\s*\}\}/g, (_m, k: string) => where.vars?.[k] ?? "") : t);
  const fill = (t: string) => renderRecordPlaceholders(contact ? renderPlaceholders(withVars(t), contact) : withVars(t), rec);
  switch (step.type) {
    case "update_field": {
      if (!rec) return { entry: "עדכון שדה: אין רשומה", contact };
      const f = rec.fields.find((x) => x.key === step.field_key);
      if (!f) return { entry: "❌ עדכון שדה: השדה נמחק", contact };
      const raw = fill(step.field_value ?? "");
      const value = f.type === "number" || f.type === "currency" ? Number(raw) : f.type === "checkbox" ? raw === "true" || raw === "כן" : raw;
      const { error } = await db.rpc("automation_set_record_field", { p_record: rec.record.id, p_key: f.key, p_value: value });
      if (error) return { entry: `❌ עדכון "${f.label}" נכשל`, contact };
      rec.record.data = { ...(rec.record.data ?? {}), [f.key]: value };
      return { entry: `"${f.label}" ← ${recordValue(f, value)}`, contact };
    }
    case "create_task": {
      const due = step.task_due_days != null ? new Date(Date.now() + Number(step.task_due_days) * 86400000).toISOString().slice(0, 10) : null;
      const ownerEmail = rec?.record.owner_email ?? contact?.owner_email ?? null;
      const { data: owner } = ownerEmail ? await db.from("users").select("full_name").ilike("email", ownerEmail).maybeSingle() : { data: null };
      const title = fill(step.task_title || "משימה");
      await db.from("tasks").insert({
        org_id: automation.org_id,
        title,
        record_id: rec?.record.id ?? null,
        contact_id: contact?.id ?? null,
        due_date: due,
        assignee: owner?.full_name ?? null,
      });
      return { entry: `נוצרה משימה "${title}"`, contact };
    }
  }
  if (!contact) {
    if (step.type === "notify") {
      const t = fill(step.notify_text || `אוטומציה "${automation.name}" רצה`);
      await db.from("notifications").insert({
        org_id: automation.org_id,
        text: t,
        url: rec ? `/o/${rec.record.object_type_id}/${rec.record.id}` : null,
        target_email: rec?.record.owner_email ?? null,
      });
      return { entry: `התראה: "${t}"`, contact };
    }
    return { entry: `❌ ${step.type === "send_message" ? "לא נשלחה הודעה" : "דילוג"}: אין ליד מקושר לרשומה (או ליד עם אותו טלפון)`, contact };
  }
  switch (step.type) {
    // Changes to the lead itself. They don't re-trigger automations, so two
    // rules can't loop.
    case "set_status": {
      const status = String(step.field_value ?? "").trim();
      if (!status) return { entry: "שינוי סטטוס: לא נבחר סטטוס", contact };
      const { data } = await db.from("contacts").update({ handling_status: status }).eq("id", contact.id).select().single();
      return { entry: `סטטוס ליד ← "${status}"`, contact: data ?? contact };
    }
    case "set_owner": {
      const email = String(step.field_value ?? "").trim() || null;
      const { data } = await db.from("contacts").update({ owner_email: email }).eq("id", contact.id).select().single();
      return { entry: email ? `בעל הליד ← ${email}` : "הליד הוסר מבעלים", contact: data ?? contact };
    }
    case "move_stage": {
      const { data: stage } = await db.from("stages").select("id, name, pipeline_id").eq("id", step.field_value).maybeSingle();
      if (!stage) return { entry: "❌ העברת שלב: השלב נמחק", contact };
      const { data: opp } = await db
        .from("opportunities")
        .select("id, stage_id")
        .eq("contact_id", contact.id)
        .eq("pipeline_id", stage.pipeline_id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!opp) {
        await db.from("opportunities").insert({ org_id: automation.org_id, contact_id: contact.id, pipeline_id: stage.pipeline_id, stage_id: stage.id, title: contact.name, value: 0 });
      } else if (opp.stage_id !== stage.id) {
        const { error } = await db.from("opportunities").update({ stage_id: stage.id }).eq("id", opp.id);
        // A stage gate (required checklist items / documents) can refuse the move.
        if (error?.message.startsWith("stage_gate:")) {
          let missing = "";
          try {
            missing = (JSON.parse(error.message.slice(11)) as { label: string }[]).map((m) => m.label).join(", ");
          } catch {}
          return { entry: `⚠️ העברה לשלב "${stage.name}" נחסמה — חסר: ${missing}`, contact };
        }
      }
      return { entry: `הועבר לשלב "${stage.name}"`, contact };
    }
    case "send_message": {
      const defaults = await loadAutomationDefaults(db, automation.org_id);
      const policy = stepPolicy(step, defaults);
      try {
        return { entry: await performSend(db, automation, step, contact, rec), contact };
      } catch (err) {
        if (!(err instanceof WaUnavailableError) && !isGatewayError(err)) return { entry: `❌ שליחת הודעה נכשלה: ${err instanceof Error ? err.message : String(err)}`, contact };
        const reason = err instanceof Error ? err.message : String(err);
        return { entry: await applyFallback(db, automation, step, contact, rec, policy.fallback, reason, where), contact };
      }
    }
    case "add_tag": {
      const tag = step.tag as string;
      if (!tag || (contact.tags ?? []).includes(tag)) return { entry: `תגית "${tag}" כבר קיימת`, contact };
      const { data } = await db
        .from("contacts")
        .update({ tags: [...(contact.tags ?? []), tag] })
        .eq("id", contact.id)
        .select()
        .single();
      return { entry: `הוספת תגית "${tag}"`, contact: data ?? contact };
    }
    case "notify": {
      const t = fill(step.notify_text || `אוטומציה "${automation.name}" רצה`);
      await db.from("notifications").insert({
        org_id: automation.org_id,
        contact_id: contact.id,
        text: t,
        url: rec ? `/o/${rec.record.object_type_id}/${rec.record.id}` : null,
      });
      return { entry: `התראה: "${t}"`, contact };
    }
    default:
      return { entry: `צעד לא מוכר: ${step.type}`, contact };
  }
}

export async function executeRun(db: Db, runId: string): Promise<void> {
  const { data: run } = await db.from("automation_runs").select("*").eq("id", runId).single();
  if (!run || run.status !== "running") return;

  const [{ data: automation }, { data: steps }] = await Promise.all([
    db.from("automations").select("*").eq("id", run.automation_id).maybeSingle(),
    db.from("automation_steps").select("*").eq("automation_id", run.automation_id).order("position"),
  ]);

  // Record automations run on the record, messaging its lead when it has one.
  let rec: RecordCtx | null = null;
  if (run.record_id) {
    const { data: record } = await db.from("records").select("*").eq("id", run.record_id).maybeSingle();
    if (record) {
      const [{ data: type }, { data: fields }] = await Promise.all([
        db.from("object_types").select("*").eq("id", record.object_type_id).single(),
        db.from("object_fields").select("*").eq("object_type_id", record.object_type_id).order("position"),
      ]);
      rec = { record, type, fields: fields ?? [] };
    }
  }
  let contactRow: Row | null = null;
  if (run.contact_id) contactRow = (await db.from("contacts").select("*").eq("id", run.contact_id).maybeSingle()).data;
  else if (rec) contactRow = await contactForRecord(db, rec);

  const log: string[] = [...(run.steps_log ?? [])];
  if (!automation || (!contactRow && !rec)) {
    await db.from("automation_runs").update({ status: "failed", steps_log: [...log, "האוטומציה, הליד או הרשומה נמחקו"] }).eq("id", runId);
    return;
  }
  if (run.next_step_position > 0 && !automation.active) {
    await db.from("automation_runs").update({ status: "cancelled", steps_log: [...log, "נעצר: האוטומציה כובתה"] }).eq("id", runId);
    return;
  }

  let contact: Row | null = contactRow;
  const executedNow: string[] = [];
  const orderedSteps = steps ?? [];

  const logBatch = () =>
    executedNow.length
      ? db.from("activities").insert({
          org_id: automation.org_id,
          contact_id: rec ? null : contact?.id,
          record_id: rec?.record.id ?? null,
          type: "note",
          text: `🤖 אוטומציה "${automation.name}": ${executedNow.join(" ← ")}`,
        })
      : Promise.resolve();

  for (let position = run.next_step_position; position < orderedSteps.length; position++) {
    const step = orderedSteps[position];
    if (step.type === "wait") {
      const minutes = Number(step.wait_minutes ?? 0);
      const entry = `המתנה של ${minutes} דק'`;
      log.push(entry);
      executedNow.push(entry);
      await db
        .from("automation_runs")
        .update({
          status: "waiting",
          resume_at: new Date(Date.now() + minutes * 60_000).toISOString(),
          next_step_position: position + 1,
          steps_log: log,
        })
        .eq("id", runId);
      await logBatch();
      return;
    }
    const result = await executeStep(db, automation, step, contact, rec, { runId, position, vars: run.vars as Record<string, string> | null });
    contact = result.contact;
    log.push(result.entry);
    executedNow.push(result.entry);
  }

  await db
    .from("automation_runs")
    .update({ status: "completed", next_step_position: orderedSteps.length, resume_at: null, steps_log: log })
    .eq("id", runId);
  await logBatch();
}

export async function resumeDueRuns(db: Db): Promise<number> {
  const { data: ids, error } = await db.rpc("claim_due_automation_runs", { max_runs: 50 });
  if (error) throw error;
  for (const id of (ids ?? []) as string[]) {
    try {
      await executeRun(db, id);
    } catch (err) {
      await db
        .from("automation_runs")
        .update({ status: "failed" })
        .eq("id", id);
      console.error("automation run failed", id, err);
    }
  }
  return (ids ?? []).length;
}

// A lead writing back should end nurture sequences marked stop_on_reply
// (e.g. "no answer 1..4") — a human takes it from here.
export async function cancelWaitingRunsOnReply(db: Db, orgId: string, contactId: string): Promise<void> {
  const { data: runs } = await db
    .from("automation_runs")
    .select("id, steps_log, automations!inner(stop_on_reply)")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("status", "waiting")
    .eq("automations.stop_on_reply", true);
  for (const run of runs ?? []) {
    await db
      .from("automation_runs")
      .update({ status: "cancelled", steps_log: [...(run.steps_log ?? []), "נעצר: הליד הגיב"] })
      .eq("id", run.id)
      .eq("status", "waiting");
  }
}
