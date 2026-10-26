import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { graphFetch, GraphError, permanentPageToken } from "@/lib/server/graph";

// Connects a Facebook Page's Lead Ads to this org: turns the given user or
// Page token into a non-expiring Page token, subscribes the Page to our
// app's `leadgen` webhook, and stores the token server-side (needed to fetch
// each lead's answers, and to poll the Page's forms).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as { pageId?: string; pageAccessToken?: string };
    const pageId = body.pageId?.trim();
    const given = body.pageAccessToken?.trim();
    if (!pageId || !/^\d+$/.test(pageId)) throw new HttpError(400, "Page ID חייב להיות מספר");
    if (!given) throw new HttpError(400, "חסר Page Access Token");
    const token = await permanentPageToken(pageId, given);

    let pageName: string | null = null;
    try {
      const page = await graphFetch<{ id: string; name?: string }>(pageId, token, { query: { fields: "id,name" } });
      pageName = page.name ?? null;
    } catch (err) {
      throw new HttpError(400, `מטא דחו את הטוקן/הדף: ${err instanceof GraphError ? err.message : String(err)}`);
    }
    // The webhook gives instant delivery; without it the Page is still
    // polled every couple of minutes, so a failure here isn't fatal.
    let warning: string | null = null;
    try {
      await graphFetch(`${pageId}/subscribed_apps`, token, { method: "POST", query: { subscribed_fields: "leadgen" } });
    } catch (err) {
      warning = `חיבור ה-webhook לדף נכשל (${err instanceof GraphError ? err.message : String(err)}) — הלידים ייכנסו בבדיקה כל 2 דקות`;
    }
    try {
      await graphFetch(`${pageId}/leadgen_forms`, token, { query: { fields: "id", limit: "1" } });
    } catch (err) {
      throw new HttpError(
        400,
        `אין גישה לטפסי הלידים של הדף: ${err instanceof GraphError ? err.message : String(err)} — ודא שלטוקן יש הרשאת leads_retrieval`
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
    return Response.json({ page, warning });
  } catch (err) {
    return errorResponse(err);
  }
}
