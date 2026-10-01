import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { graphFetch, GraphError } from "@/lib/server/graph";

// Connects a Facebook Page's Lead Ads to this org: validates the Page access
// token, subscribes the Page to our app's `leadgen` webhook, and stores the
// token server-side (needed to fetch each lead's answers).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as { pageId?: string; pageAccessToken?: string };
    const pageId = body.pageId?.trim();
    const token = body.pageAccessToken?.trim();
    if (!pageId || !/^\d+$/.test(pageId)) throw new HttpError(400, "Page ID חייב להיות מספר");
    if (!token) throw new HttpError(400, "חסר Page Access Token");

    let pageName: string | null = null;
    try {
      const page = await graphFetch<{ id: string; name?: string }>(pageId, token, { query: { fields: "id,name" } });
      pageName = page.name ?? null;
    } catch (err) {
      throw new HttpError(400, `מטא דחו את הטוקן/הדף: ${err instanceof GraphError ? err.message : String(err)}`);
    }
    try {
      await graphFetch(`${pageId}/subscribed_apps`, token, { method: "POST", query: { subscribed_fields: "leadgen" } });
    } catch (err) {
      throw new HttpError(
        400,
        `חיבור ה-webhook לדף נכשל: ${err instanceof GraphError ? err.message : String(err)} — ודא שלטוקן יש הרשאות pages_manage_metadata ו-leads_retrieval`
      );
    }

    const db = supabaseAdmin();
    const { data: existing } = await db.from("lead_ad_pages").select("*").eq("page_id", pageId).maybeSingle();
    if (existing && existing.org_id !== orgId) throw new HttpError(409, "הדף הזה כבר מחובר לארגון אחר");
    const { data: page, error } = existing
      ? await db.from("lead_ad_pages").update({ page_name: pageName }).eq("id", existing.id).select().single()
      : await db.from("lead_ad_pages").insert({ org_id: orgId, page_id: pageId, page_name: pageName }).select().single();
    if (error) throw error;
    await db
      .from("lead_ad_page_credentials")
      .upsert({ lead_ad_page_id: page.id, page_access_token: token, updated_at: new Date().toISOString() });
    return Response.json({ page });
  } catch (err) {
    return errorResponse(err);
  }
}
