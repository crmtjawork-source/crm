import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncScheduleReminders } from "@/lib/server/payments";

// Edit a schedule (title, status, deal…) or rebuild its reminders ({ resync: true }).
export async function PATCH(request: Request, ctx: RouteContext<"/api/payments/schedules/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const b = (await request.json()) as { title?: string; summary?: string; status?: string; opportunityId?: string | null; totalAmount?: number | null; resync?: boolean };
    const patch: Record<string, unknown> = {};
    if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 200);
    if (typeof b.summary === "string") patch.summary = b.summary.slice(0, 2000);
    if (b.status && ["active", "completed", "cancelled"].includes(b.status)) patch.status = b.status;
    if ("opportunityId" in b) patch.opportunity_id = b.opportunityId || null;
    if ("totalAmount" in b) patch.total_amount = typeof b.totalAmount === "number" ? b.totalAmount : null;
    if (Object.keys(patch).length) {
      const { data, error } = await user.db.from("payment_schedules").update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new HttpError(404, "לוח התשלומים לא נמצא");
    } else {
      const { data } = await user.db.from("payment_schedules").select("id").eq("id", id).maybeSingle();
      if (!data) throw new HttpError(404, "לוח התשלומים לא נמצא");
    }
    if (b.resync || patch.status) await syncScheduleReminders(supabaseAdmin(), id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/payments/schedules/[id]">) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser(request);
    const { data: s } = await user.db.from("payment_schedules").select("id").eq("id", id).maybeSingle();
    if (!s) throw new HttpError(404, "לוח התשלומים לא נמצא");
    const admin = supabaseAdmin();
    // Open reminder tasks go with it.
    const { data: items } = await admin.from("payment_items").select("id").eq("schedule_id", id);
    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length) {
      const { data: rem } = await admin.from("payment_reminders").select("task_id").in("item_id", itemIds);
      const tasks = (rem ?? []).map((r) => r.task_id).filter(Boolean);
      if (tasks.length) await admin.from("tasks").delete().in("id", tasks).eq("done", false);
    }
    const { error } = await user.db.from("payment_schedules").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
