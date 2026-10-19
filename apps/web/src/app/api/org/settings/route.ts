import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

// Business-wide settings an admin can change.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as { meetingReminders?: boolean };
    const patch: Record<string, unknown> = {};
    if (typeof body.meetingReminders === "boolean") patch.meeting_reminders = body.meetingReminders;
    if (!Object.keys(patch).length) throw new HttpError(400, "אין מה לעדכן");
    const { error } = await supabaseAdmin().from("organizations").update(patch).eq("id", orgId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
