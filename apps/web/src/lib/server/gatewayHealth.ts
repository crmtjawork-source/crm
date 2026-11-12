import "server-only";
import type { Db } from "./supabaseAdmin";
import * as evo from "./evolution";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Watches every linked (Evolution) WhatsApp, run each minute by the cron job:
//  - a connection that dropped gets one quiet reconnect attempt from the saved
//    session (no QR needed when it is still valid);
//  - if it is still down after GRACE_MS the team is told (push + the bell), once,
//    then reminded every REMIND_MS while it stays down;
//  - when it comes back, that is announced too.
const GRACE_MS = 2 * 60_000;
const REMIND_MS = 6 * 3600_000;

async function notify(db: Db, channel: Row, text: string) {
  // A personal number tells its owner; the business number tells the admins.
  let targetEmail: string | null = null;
  if (channel.owner_membership_id) {
    const { data: m } = await db.from("memberships").select("user_id").eq("id", channel.owner_membership_id).maybeSingle();
    if (m?.user_id) {
      const { data: u } = await db.from("users").select("email").eq("id", m.user_id).maybeSingle();
      targetEmail = u?.email?.toLowerCase() ?? null;
    }
  }
  await db.from("notifications").insert({
    org_id: channel.org_id,
    text,
    target_email: targetEmail,
    url: channel.owner_membership_id ? "/my-whatsapp" : "/settings/integrations",
  });
}

const label = (c: Row) => `${c.owner_membership_id ? "הוואטסאפ האישי" : "וואטסאפ החברה"}${c.display_phone ? ` (${c.display_phone})` : ""}`;

async function checkOne(db: Db, c: Row): Promise<string> {
  let state: string;
  try {
    state = await evo.getState(c.external_id);
  } catch {
    state = "unreachable"; // the gateway server itself isn't answering
  }
  const now = Date.now();

  if (state === "open") {
    if (c.unhealthy_since || c.status !== "authorized") {
      await db.from("channels").update({ status: "authorized", status_checked_at: new Date(now).toISOString(), unhealthy_since: null, disconnect_alerted_at: null }).eq("id", c.id);
      if (c.disconnect_alerted_at) await notify(db, c, `✅ ${label(c)} חזר להיות מחובר`);
    }
    return "ok";
  }

  const since = c.unhealthy_since ? new Date(c.unhealthy_since).getTime() : now;
  const patch: Row = { status_checked_at: new Date(now).toISOString() };
  if (!c.unhealthy_since) patch.unhealthy_since = new Date(now).toISOString();
  if (state !== "unreachable") patch.status = "notAuthorized";

  // One reconnect attempt per minute from the saved session while we wait out the grace period.
  if (state !== "unreachable" && now - since < 30 * 60_000) await evo.restart(c.external_id).catch(() => undefined);

  if (now - since >= GRACE_MS && (!c.disconnect_alerted_at || now - new Date(c.disconnect_alerted_at).getTime() >= REMIND_MS)) {
    const text =
      state === "unreachable"
        ? `⚠ שרת הוואטסאפ לא עונה — ${label(c)} לא יקבל ולא ישלח הודעות עד שיחזור`
        : `⚠ ${label(c)} התנתק — צריך לחבר מחדש (סריקת QR). עד אז הודעות לא נקלטות ואוטומציות לא נשלחות`;
    await notify(db, c, text);
    patch.disconnect_alerted_at = new Date(now).toISOString();
  }
  await db.from("channels").update(patch).eq("id", c.id);
  return state;
}

export async function checkGatewayHealth(db: Db): Promise<Record<string, number>> {
  const { data, error } = await db.from("channels").select("*").eq("provider", "evolution").eq("active", true).not("display_phone", "is", null); // only numbers that were linked at least once (not one still waiting for its first QR scan)
  if (error) {
    console.error("gateway health: channels query failed", error.message);
    return {};
  }
  const counts: Record<string, number> = {};
  await Promise.all(
    (data ?? []).map(async (c) => {
      try {
        const r = await checkOne(db, c);
        counts[r] = (counts[r] ?? 0) + 1;
      } catch (err) {
        console.error("gateway health failed for", c.id, err);
      }
    })
  );
  return counts;
}
