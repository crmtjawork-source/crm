import "server-only";
import webpush from "web-push";
import type { Db } from "./supabaseAdmin";
import { env } from "./env";

// Delivers notifications rows as Web Push to phones/browsers that turned
// notifications on. Recipients: target_email when set; otherwise the lead's
// owner and the org's admins.

let configured = false;
function configure(): boolean {
  const pub = env.vapidPublicKey();
  const priv = env.vapidPrivateKey();
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject(), pub, priv);
    configured = true;
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function userIdsByEmail(db: Db, emails: string[]): Promise<string[]> {
  if (!emails.length) return [];
  const { data } = await db.from("users").select("id, email");
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  return (data ?? []).filter((u: Row) => u.email && wanted.has(u.email.toLowerCase())).map((u: Row) => u.id);
}

async function recipients(db: Db, n: Row): Promise<string[]> {
  if (n.target_email) return userIdsByEmail(db, [n.target_email]);
  const ids = new Set<string>();
  const { data: admins } = await db.from("memberships").select("user_id").eq("org_id", n.org_id).in("role", ["owner", "admin"]);
  for (const a of admins ?? []) ids.add(a.user_id);
  if (n.contact_id) {
    const { data: contact } = await db.from("contacts").select("owner_email").eq("id", n.contact_id).maybeSingle();
    if (contact?.owner_email) for (const id of await userIdsByEmail(db, [contact.owner_email])) ids.add(id);
  }
  return [...ids];
}

export async function sendPendingPushes(db: Db): Promise<number> {
  if (!configure()) return 0;
  const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
  // Anything older than two hours is history by now, not news.
  await db.from("notifications").update({ pushed_at: new Date().toISOString() }).is("pushed_at", null).lt("created_at", cutoff);
  const { data: pending } = await db.from("notifications").select("id").is("pushed_at", null).order("created_at").limit(100);
  if (!pending?.length) return 0;
  // Claim first so overlapping runs don't push twice.
  const { data: claimed } = await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", pending.map((p: Row) => p.id))
    .is("pushed_at", null)
    .select("*");

  let sent = 0;
  for (const n of claimed ?? []) {
    const users = await recipients(db, n);
    if (!users.length) continue;
    const { data: subs } = await db.from("push_subscriptions").select("*").eq("org_id", n.org_id).in("user_id", users);
    const payload = JSON.stringify({
      title: "CRM",
      body: n.text,
      url: n.url ?? (n.contact_id ? `/contacts/${n.contact_id}` : "/dashboard"),
      tag: n.id,
    });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The phone/browser dropped this subscription.
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("push failed", status, err);
      }
    }
  }
  return sent;
}
