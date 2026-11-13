import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { backfillLeadAdPage } from "@/lib/server/webhooks/leadgen";

export const maxDuration = 60;

// Pulls a connected Page's leads from the last N days that the CRM missed.
// Existing leads are matched by phone and merged silently; no automations run.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as { pageRowId?: string; days?: number };
    const days = Math.min(Math.max(Math.floor(body.days ?? 30), 1), 90);
    if (!body.pageRowId) throw new HttpError(400, "חסר דף");
    const db = supabaseAdmin();
    const { data: page } = await db.from("lead_ad_pages").select("id").eq("id", body.pageRowId).eq("org_id", orgId).maybeSingle();
    if (!page) throw new HttpError(404, "הדף לא נמצא");
    const added = await backfillLeadAdPage(db, page.id, days);
    return Response.json({ added });
  } catch (err) {
    return errorResponse(err);
  }
}
