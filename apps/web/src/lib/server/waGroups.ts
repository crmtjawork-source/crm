import "server-only";
import type { Db } from "./supabaseAdmin";
import * as evo from "./evolution";
import { normalizePhone } from "./phone";
import { channelIsUp } from "./waHealth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function digitsOf(jidOrPhone: string | undefined | null): string | null {
  if (!jidOrPhone) return null;
  const s = String(jidOrPhone);
  if (s.includes("@") && !s.endsWith("@s.whatsapp.net") && !s.endsWith("@c.us")) return null; // @lid etc.
  return normalizePhone(s.split("@")[0].split(":")[0]);
}

// Keeps wa_groups in step with the group chats the linked numbers already mirror
// (conversations.is_group), so the org can tag them ("מכירות", "תפעול"…).
export async function discoverGroups(db: Db, orgId: string): Promise<number> {
  const { data: convs } = await db.from("conversations").select("channel_id, wa_jid, external_thread_id, chat_name").eq("org_id", orgId).eq("is_group", true);
  const rows = (convs ?? [])
    .map((c: Row) => ({ org_id: orgId, channel_id: c.channel_id, jid: c.wa_jid ?? c.external_thread_id, name: c.chat_name ?? null }))
    .filter((r: Row) => r.jid);
  if (!rows.length) return 0;
  // Insert only new groups; never overwrite the kind an admin set.
  const { data: existing } = await db.from("wa_groups").select("jid").eq("org_id", orgId);
  const have = new Set((existing ?? []).map((g: Row) => g.jid));
  const fresh = rows.filter((r: Row, i: number) => !have.has(r.jid) && rows.findIndex((x: Row) => x.jid === r.jid) === i);
  if (fresh.length) await db.from("wa_groups").insert(fresh);
  for (const r of rows) if (r.name && have.has(r.jid)) await db.from("wa_groups").update({ name: r.name }).eq("org_id", orgId).eq("jid", r.jid);
  return fresh.length;
}

// Reads the members of every tagged group and stores them by phone number.
// Two sources: the gateway's participant list, and who has written in the group
// (a fallback when the gateway only knows members by @lid).
export async function syncGroupMembers(db: Db, orgId: string, onlyStaleHours?: number): Promise<{ groups: number; members: number; errors: string[] }> {
  await discoverGroups(db, orgId);
  const q = db.from("wa_groups").select("*").eq("org_id", orgId).not("kind", "is", null);
  const { data: groups } = await q;
  const res = { groups: 0, members: 0, errors: [] as string[] };
  for (const g of (groups ?? []) as Row[]) {
    if (onlyStaleHours && g.participants_synced_at && Date.now() - new Date(g.participants_synced_at).getTime() < onlyStaleHours * 3600_000) continue;
    const { data: ch } = g.channel_id ? await db.from("channels").select("*").eq("id", g.channel_id).maybeSingle() : { data: null };
    const phones = new Set<string>();
    let error: string | null = null;
    let gatewayOk = false;
    if (ch?.provider === "evolution" && channelIsUp(ch)) {
      try {
        const parts = await evo.groupParticipants(ch.external_id, g.jid);
        let unresolved = 0;
        for (const p of parts) {
          const d = digitsOf(p.phoneNumber) ?? digitsOf(p.id ?? p.jid);
          if (d) phones.add(d);
          else unresolved++;
        }
        gatewayOk = true;
        if (unresolved) error = `${unresolved} חברי קבוצה מזוהים רק במזהה פנימי של וואטסאפ (בלי מספר) — לא נתאימו אוטומטית; אפשר לשייך ידנית`;
      } catch (e) {
        error = `קריאת חברי הקבוצה מהשער נכשלה: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else error = "הוואטסאפ של הקבוצה לא מחובר — מוצגים רק מי שכתב בקבוצה";
    // Anyone who wrote in the group (their number rides on the message).
    const { data: convs } = await db.from("conversations").select("id").eq("org_id", orgId).eq("wa_jid", g.jid);
    const convIds = (convs ?? []).map((c: Row) => c.id);
    const fromMessages = new Set<string>();
    if (convIds.length) {
      const { data: senders } = await db.from("messages").select("sender_jid").in("conversation_id", convIds).not("sender_jid", "is", null).limit(2000);
      for (const m of senders ?? []) {
        const d = digitsOf(m.sender_jid);
        if (d) fromMessages.add(d);
      }
    }
    const all = new Map<string, "gateway" | "message">();
    for (const p of fromMessages) all.set(p, "message");
    for (const p of phones) all.set(p, "gateway");
    if (all.size) {
      await db.from("wa_group_members").upsert(
        [...all].map(([phone, source]) => ({ org_id: orgId, group_id: g.id, phone_digits: phone, source })),
        { onConflict: "group_id,phone_digits", ignoreDuplicates: true }
      );
    }
    // A complete gateway list is authoritative: drop gateway rows of people who left.
    if (gatewayOk && phones.size) {
      const { data: old } = await db.from("wa_group_members").select("id, phone_digits").eq("group_id", g.id).eq("source", "gateway");
      const gone = (old ?? []).filter((m: Row) => !phones.has(m.phone_digits)).map((m: Row) => m.id);
      if (gone.length) await db.from("wa_group_members").delete().in("id", gone);
    }
    await db.from("wa_groups").update({ participants_synced_at: new Date().toISOString(), participants_error: error }).eq("id", g.id);
    res.groups++;
    res.members += all.size;
    if (error) res.errors.push(`${g.name ?? g.jid}: ${error}`);
  }
  return res;
}

// Cron: refresh tagged groups that have not been read for a while.
export async function syncStaleGroups(db: Db): Promise<number> {
  const { data: orgs } = await db.from("wa_groups").select("org_id").not("kind", "is", null);
  let n = 0;
  for (const orgId of [...new Set((orgs ?? []).map((o: Row) => o.org_id as string))]) n += (await syncGroupMembers(db, orgId, 6)).groups;
  return n;
}
