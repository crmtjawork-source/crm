import "server-only";
import type { Db } from "./supabaseAdmin";
import { sendToContact, type OutgoingContent } from "./whatsapp";

export type TriggerType = "new_contact" | "stage_change" | "tag_added" | "appointment_booked";
// source: where the lead came from, matched against automations.trigger_source
// (e.g. "meta_lead_ads"). Leads created by hand or by import pass none.
export type TriggerCtx = { pipelineId?: string; stageId?: string; tag?: string; source?: string };

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

async function executeStep(db: Db, automation: Row, step: Row, contact: Row): Promise<{ entry: string; contact: Row }> {
  switch (step.type) {
    case "send_message": {
      const content: OutgoingContent = step.template_name
        ? {
            kind: "template",
            name: step.template_name,
            language: step.template_language || "he",
            bodyParams: (step.template_params ?? []).map((p: string) => renderPlaceholders(p, contact)),
            ...(step.template_button_param ? { buttonUrlParam: renderPlaceholders(step.template_button_param, contact) } : {}),
          }
        : { kind: "text", body: renderPlaceholders(step.message ?? "", contact) };
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
      const text = renderPlaceholders(step.notify_text || `אוטומציה "${automation.name}" רצה`, contact);
      await db.from("notifications").insert({ org_id: automation.org_id, contact_id: contact.id, text });
      return { entry: `התראה: "${text}"`, contact };
    }
    default:
      return { entry: `צעד לא מוכר: ${step.type}`, contact };
  }
}

export async function executeRun(db: Db, runId: string): Promise<void> {
  const { data: run } = await db.from("automation_runs").select("*").eq("id", runId).single();
  if (!run || run.status !== "running") return;

  const [{ data: automation }, { data: steps }, { data: contactRow }] = await Promise.all([
    db.from("automations").select("*").eq("id", run.automation_id).maybeSingle(),
    db.from("automation_steps").select("*").eq("automation_id", run.automation_id).order("position"),
    db.from("contacts").select("*").eq("id", run.contact_id).maybeSingle(),
  ]);

  const log: string[] = [...(run.steps_log ?? [])];
  if (!automation || !contactRow) {
    await db.from("automation_runs").update({ status: "failed", steps_log: [...log, "האוטומציה או הליד נמחקו"] }).eq("id", runId);
    return;
  }
  if (run.next_step_position > 0 && !automation.active) {
    await db.from("automation_runs").update({ status: "cancelled", steps_log: [...log, "נעצר: האוטומציה כובתה"] }).eq("id", runId);
    return;
  }

  let contact: Row = contactRow;
  const executedNow: string[] = [];
  const orderedSteps = steps ?? [];

  const logBatch = () =>
    executedNow.length
      ? db.from("activities").insert({
          org_id: automation.org_id,
          contact_id: contact.id,
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
    const result = await executeStep(db, automation, step, contact);
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
