import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncScheduleReminders } from "@/lib/server/payments";

type ItemIn = { description?: string; amount?: number | null; dueDate?: string | null; condition?: string | null };

// Confirms a (reviewed) payment schedule: saves it, then creates the reminders and tasks.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const b = (await request.json()) as {
      contactId?: string;
      opportunityId?: string | null;
      fileId?: string | null;
      title?: string;
      summary?: string;
      totalAmount?: number | null;
      currency?: string;
      aiExtracted?: boolean;
      items?: ItemIn[];
    };
    if (!b.contactId) throw new HttpError(400, "חסר ליד");
    const items = (b.items ?? []).filter((i) => i.description?.trim());
    if (!items.length) throw new HttpError(400, "אין שורות תשלום");
    for (const i of items) if (i.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) throw new HttpError(400, "תאריך לא תקין");
    const { data: contact } = await user.db.from("contacts").select("id, name").eq("id", b.contactId).maybeSingle();
    if (!contact) throw new HttpError(404, "הליד לא נמצא");
    const { data: schedule, error } = await user.db
      .from("payment_schedules")
      .insert({
        org_id: orgId,
        contact_id: contact.id,
        opportunity_id: b.opportunityId || null,
        file_id: b.fileId || null,
        title: (b.title?.trim() || `לוח תשלומים — ${contact.name}`).slice(0, 200),
        summary: b.summary?.slice(0, 2000) || null,
        total_amount: typeof b.totalAmount === "number" ? b.totalAmount : null,
        currency: b.currency || "ILS",
        ai_extracted: Boolean(b.aiExtracted),
      })
      .select("*")
      .single();
    if (error || !schedule) throw error ?? new Error("שמירה נכשלה");
    const { error: itemsError } = await user.db.from("payment_items").insert(
      items.map((i, idx) => ({
        org_id: orgId,
        schedule_id: schedule.id,
        contact_id: contact.id,
        description: i.description!.trim().slice(0, 300),
        amount: typeof i.amount === "number" ? i.amount : null,
        due_date: i.dueDate || null,
        condition_text: i.condition?.slice(0, 300) || null,
        position: idx,
      }))
    );
    if (itemsError) {
      await user.db.from("payment_schedules").delete().eq("id", schedule.id);
      throw itemsError;
    }
    await syncScheduleReminders(supabaseAdmin(), schedule.id);
    return Response.json({ id: schedule.id });
  } catch (err) {
    return errorResponse(err);
  }
}
