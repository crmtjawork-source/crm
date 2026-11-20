import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncItemReminders } from "@/lib/server/payments";

// Adds one payment to an existing schedule.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const b = (await request.json()) as { scheduleId?: string; description?: string; amount?: number | null; dueDate?: string | null; condition?: string | null };
    if (!b.scheduleId || !b.description?.trim()) throw new HttpError(400, "חסר תיאור");
    if (b.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) throw new HttpError(400, "תאריך לא תקין");
    const { data: s } = await user.db.from("payment_schedules").select("id, org_id, contact_id").eq("id", b.scheduleId).maybeSingle();
    if (!s) throw new HttpError(404, "לוח התשלומים לא נמצא");
    const { count } = await user.db.from("payment_items").select("id", { count: "exact", head: true }).eq("schedule_id", s.id);
    const { data: item, error } = await user.db
      .from("payment_items")
      .insert({
        org_id: s.org_id,
        schedule_id: s.id,
        contact_id: s.contact_id,
        description: b.description.trim().slice(0, 300),
        amount: typeof b.amount === "number" ? b.amount : null,
        due_date: b.dueDate || null,
        condition_text: b.condition?.slice(0, 300) || null,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error || !item) throw error ?? new Error("שמירה נכשלה");
    await syncItemReminders(supabaseAdmin(), item.id);
    return Response.json({ id: item.id });
  } catch (err) {
    return errorResponse(err);
  }
}
