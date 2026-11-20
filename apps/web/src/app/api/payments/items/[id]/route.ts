import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncItemReminders } from "@/lib/server/payments";

// Edit a payment / mark it paid or unpaid. Reminders are rebuilt (paid → closed, new date → new reminders).
export async function PATCH(request: Request, ctx: RouteContext<"/api/payments/items/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const b = (await request.json()) as { description?: string; amount?: number | null; dueDate?: string | null; condition?: string | null; paid?: boolean };
    const patch: Record<string, unknown> = {};
    if (typeof b.description === "string" && b.description.trim()) patch.description = b.description.trim().slice(0, 300);
    if ("amount" in b) patch.amount = typeof b.amount === "number" ? b.amount : null;
    if ("dueDate" in b) {
      if (b.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) throw new HttpError(400, "תאריך לא תקין");
      patch.due_date = b.dueDate || null;
    }
    if ("condition" in b) patch.condition_text = b.condition?.slice(0, 300) || null;
    if (typeof b.paid === "boolean") {
      patch.paid = b.paid;
      patch.paid_at = b.paid ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "אין מה לעדכן");
    const { data, error } = await user.db.from("payment_items").update(patch).eq("id", id).select("id, schedule_id");
    if (error) throw error;
    if (!data?.length) throw new HttpError(404, "התשלום לא נמצא");
    const admin = supabaseAdmin();
    await syncItemReminders(admin, id);
    // Everything paid → the schedule is completed; reopening a payment reactivates it.
    const { data: all } = await admin.from("payment_items").select("paid").eq("schedule_id", data[0].schedule_id);
    const { data: sch } = await admin.from("payment_schedules").select("status").eq("id", data[0].schedule_id).single();
    if (sch && sch.status !== "cancelled") {
      const done = (all ?? []).length > 0 && (all ?? []).every((i) => i.paid);
      const next = done ? "completed" : "active";
      if (next !== sch.status) await admin.from("payment_schedules").update({ status: next }).eq("id", data[0].schedule_id);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/payments/items/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const { data: item } = await user.db.from("payment_items").select("id").eq("id", id).maybeSingle();
    if (!item) throw new HttpError(404, "התשלום לא נמצא");
    const admin = supabaseAdmin();
    const { data: rem } = await admin.from("payment_reminders").select("task_id").eq("item_id", id);
    const tasks = (rem ?? []).map((r) => r.task_id).filter(Boolean);
    if (tasks.length) await admin.from("tasks").delete().in("id", tasks).eq("done", false);
    const { error } = await user.db.from("payment_items").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
