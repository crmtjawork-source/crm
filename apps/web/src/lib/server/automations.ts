import "server-only";
import type { Db } from "./supabaseAdmin";
import { sendToContact, type OutgoingContent } from "./whatsapp";
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
  | "record_field_changed";
// source: where the lead came from, matched against automations.trigger_source
// (e.g. "meta_lead_ads"). Leads created by hand or by import pass none.
export type TriggerCtx = { pipelineId?: string; stageId?: string; tag?: string; source?: string; status?: string };

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
    return true;
  });

  const runIds: string[] = [];
  for (const automation of matched) {
    const { data: run } = await db
      .from("automation_runs")
      .insert({ org_id: orgId, automation_id: automation.id, contact_id: contactId, status: "running", steps_log: [] })
      .select("id")
      .single();
    if (!run) continue;
    runIds.push(run.id);
    await executeRun(db, run.id);
  }
  return runIds;
}

async function executeStep(
  db: Db,
  automation: Row,
  step: Row,
  contact: Row | null,
  rec: RecordCtx | null
): Promise<{ entry: string; contact: Row | null }> {
  const fill = (t: string) => renderRecordPlaceholders(contact ? renderPlaceholders(t, contact) : t, rec);
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
    case "send_message": {
      // From the lead owner's own WhatsApp and/or with a ready-made message.
      if (step.sender === "owner" || step.message_template_id) {
        try {
          let ownerUserId: string | null = null;
          if (contact.owner_email) {
            const { data: u } = await db.from("users").select("id").ilike("email", contact.owner_email).maybeSingle();
            ownerUserId = u?.id ?? null;
          }
          // Owner's WhatsApp when linked; otherwise the business's default number.
          const channelId: string | null = step.channel_id ?? (await pickChannel(db, automation.org_id, contact, step.sender === "owner"));
          if (!channelId) throw new Error("לא הוגדר ערוץ וואטסאפ לשליחה");
          const { text, templateName, attachment } = await composeForLead(db, {
            orgId: automation.org_id,
            contactId: contact.id,
            userId: ownerUserId,
            templateId: step.message_template_id,
            text: step.message_template_id ? null : fill(step.message ?? ""),
          });
          // Ready-made messages may use the record's fields too.
          await sendLeadMessage(db, { orgId: automation.org_id, channelId, contactId: contact.id, text: renderRecordPlaceholders(text, rec), attachment, label: `אוטומציה "${automation.name}"`, userId: ownerUserId, origin: "automation" });
          return { entry: `נשלחה הודעה${templateName ? ` "${templateName}"` : ""}`, contact };
        } catch (err) {
          return { entry: `❌ שליחת הודעה נכשלה: ${err instanceof Error ? err.message : String(err)}`, contact };
        }
      }
      const content: OutgoingContent = step.template_name
        ? {
            kind: "template",
            name: step.template_name,
            language: step.template_language || "he",
            bodyParams: (step.template_params ?? []).map((p: string) => renderPlaceholders(p, contact)),
            ...(step.template_button_param ? { buttonUrlParam: renderPlaceholders(step.template_button_param, contact) } : {}),
          }
        : { kind: "text", body: fill(step.message ?? "") };
      try {
        await sendToContact(db, {
          orgId: automation.org_id,
          contactId: contact.id,
          channelId: step.channel_id,
          content,
          origin: "automation",
        });
        return { entry: step.template_name ? `נשלחה תבנית וואטסאפ "${step.template_name}"` : "נשלחה הודעת וואטסאפ", contact };
      } catch (err) {
        return { entry: `❌ שליחת הודעה נכשלה: ${err instanceof Error ? err.message : String(err)}`, contact };
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
    const result = await executeStep(db, automation, step, contact, rec);
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
