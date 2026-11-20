import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { env } from "@/lib/server/env";

// Per-organisation payment-reminder settings (days before each due date, tasks on/off).
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const { data } = await user.db.from("organizations").select("payment_reminder_days, payment_create_tasks").eq("id", orgId).maybeSingle();
    return Response.json({
      days: (data?.payment_reminder_days as number[] | undefined) ?? [7, 1],
      createTasks: data?.payment_create_tasks ?? true,
      aiConfigured: Boolean(env.anthropicApiKey()),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const b = (await request.json()) as { days?: number[]; createTasks?: boolean };
    const patch: Record<string, unknown> = {};
    if (Array.isArray(b.days)) {
      const days = [...new Set(b.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365))].sort((a, c) => c - a).slice(0, 8);
      patch.payment_reminder_days = days;
    }
    if (typeof b.createTasks === "boolean") patch.payment_create_tasks = b.createTasks;
    if (!Object.keys(patch).length) throw new HttpError(400, "אין מה לעדכן");
    const { error } = await supabaseAdmin().from("organizations").update(patch).eq("id", orgId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
