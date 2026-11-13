import { errorResponse, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { graphFetch } from "@/lib/server/graph";
import { env } from "@/lib/server/env";

// Health of the Lead Ads intake, per connected Page: last pull, last error,
// token validity, the forms Meta reports, and — for retiring a third-party
// lead forwarder — how many recent leads reached the CRM through us first.
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const WINDOW_DAYS = 14;

async function tokenInfo(token: string) {
  try {
    // A token can inspect itself; unlike the app-token form this doesn't
    // depend on META_APP_SECRET matching the app that issued the token.
    const url = new URL(`https://graph.facebook.com/${env.graphVersion()}/debug_token`);
    url.searchParams.set("input_token", token);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    const d = json.data;
    if (!d) return json.error ? { valid: false, expiresAt: null, dataAccessExpiresAt: null, scopes: [] as string[], error: String(json.error.message) } : null;
    return {
      valid: Boolean(d.is_valid),
      // 0 = never expires
      expiresAt: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : null,
      // Meta cuts off reading user data (leads) when this passes, even for a
      // token that never expires; it renews while the app keeps being used.
      dataAccessExpiresAt: d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000).toISOString() : null,
      scopes: (d.scopes ?? []) as string[],
      error: d.error?.message as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const db = supabaseAdmin();

    const { data: pages } = await db.from("lead_ad_pages").select("*").eq("org_id", orgId);
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const out = [];

    for (const page of pages ?? []) {
      const { data: creds } = await db.from("lead_ad_page_credentials").select("page_access_token").eq("lead_ad_page_id", page.id).maybeSingle();
      const token = creds?.page_access_token as string | undefined;

      const { data: subs } = await db
        .from("lead_ad_submissions")
        .select("form_id,contact_id,created_at")
        .eq("page_id", page.page_id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      const contactIds = [...new Set((subs ?? []).map((s: Row) => s.contact_id).filter(Boolean))] as string[];
      const sourceById = new Map<string, string>();
      for (let i = 0; i < contactIds.length; i += 200) {
        const { data } = await db.from("contacts").select("id,source").in("id", contactIds.slice(i, i + 200));
        for (const c of data ?? []) sourceById.set(c.id, c.source ?? "");
      }
      const byForm = new Map<string, { total: number; ours: number }>();
      let ours = 0;
      for (const s of subs ?? []) {
        const mine = (sourceById.get(s.contact_id) ?? "").startsWith("פרסומת");
        if (mine) ours++;
        const f = byForm.get(s.form_id ?? "") ?? { total: 0, ours: 0 };
        f.total++;
        if (mine) f.ours++;
        byForm.set(s.form_id ?? "", f);
      }
      const dayAgo = Date.now() - 86_400_000;
      const { count: totalSubmissions } = await db.from("lead_ad_submissions").select("id", { count: "exact", head: true }).eq("page_id", page.page_id);

      let forms: Row[] = [];
      let formsError: string | null = null;
      if (token) {
        try {
          const res = await graphFetch<{ data?: Row[] }>(`${page.page_id}/leadgen_forms`, token, {
            query: { fields: "id,name,status,leads_count,created_time", limit: "100" },
          });
          forms = res.data ?? [];
        } catch (err) {
          formsError = err instanceof Error ? err.message : String(err);
        }
      }

      out.push({
        id: page.id,
        pageId: page.page_id,
        pageName: page.page_name,
        connectedAt: page.created_at,
        lastPollAt: page.last_poll_at,
        polledUntil: page.polled_until,
        lastPollError: page.last_poll_error,
        token: token ? await tokenInfo(token) : null,
        hasToken: Boolean(token),
        totalSubmissions: totalSubmissions ?? 0,
        lastSubmissionAt: subs?.[0]?.created_at ?? null,
        last24h: (subs ?? []).filter((s: Row) => new Date(s.created_at).getTime() > dayAgo).length,
        windowDays: WINDOW_DAYS,
        windowTotal: subs?.length ?? 0,
        windowOurs: ours,
        forms: forms.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          leadsCount: f.leads_count,
          recent: byForm.get(f.id)?.total ?? 0,
          recentOurs: byForm.get(f.id)?.ours ?? 0,
        })),
        formsError,
      });
    }
    return Response.json({ pages: out });
  } catch (err) {
    return errorResponse(err);
  }
}
