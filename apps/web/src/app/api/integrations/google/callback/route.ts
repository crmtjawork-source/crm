import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { exchangeCode, readState } from "@/lib/server/googleCalendar";

// Google redirects here after consent. The signed state says who started it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (result: string) => Response.redirect(`${url.origin}/settings/calendar?google=${result}`, 302);
  const state = readState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!state || !code) return back(url.searchParams.get("error") === "access_denied" ? "denied" : "error");

  try {
    const db = supabaseAdmin();
    const t = await exchangeCode(code, `${url.origin}/api/integrations/google/callback`);
    if (!t.refresh_token) return back("no_refresh");
    const { data: conn, error } = await db
      .from("calendar_connections")
      .upsert({ org_id: state.orgId, user_id: state.userId, provider: "google", account_email: t.email, last_error: null }, { onConflict: "org_id,user_id,provider" })
      .select("id")
      .single();
    if (error || !conn) throw error;
    await db.from("calendar_credentials").upsert({
      connection_id: conn.id,
      refresh_token: t.refresh_token,
      access_token: t.access_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    });
    // Upcoming meetings of this person's leads that had no owner yet are
    // theirs; the update queues them for the calendar.
    const { data: me } = await db.from("users").select("email").eq("id", state.userId).single();
    if (me?.email) {
      const { data: leads } = await db.from("contacts").select("id").eq("org_id", state.orgId).ilike("owner_email", me.email);
      const ids = (leads ?? []).map((l) => l.id);
      for (let i = 0; i < ids.length; i += 200) {
        await db.from("appointments").update({ owner_user_id: state.userId }).is("owner_user_id", null).gt("end_at", new Date().toISOString()).in("contact_id", ids.slice(i, i + 200));
      }
    }
    // Their own upcoming meetings go to the calendar now.
    const { data: upcoming } = await db.from("appointments").select("id").eq("owner_user_id", state.userId).gt("end_at", new Date().toISOString());
    if (upcoming?.length) await db.from("calendar_sync_jobs").insert(upcoming.map((a) => ({ appointment_id: a.id, op: "upsert", owner_user_id: state.userId })));
    return back("connected");
  } catch (err) {
    console.error("google callback failed", err);
    return back("error");
  }
}
