import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "./supabaseAdmin";
import { triggerAutomations } from "./automations";
import { SIGNER_FIELDS } from "@/lib/documents";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Public (no login) side of documents: the token in the link is the only
// credential. Only what the reader needs is returned — never internal data.

export class DocumentError extends Error {}

const TOKEN = /^[a-f0-9]{64}$/;

async function byToken(db: Db, token: string): Promise<Row | null> {
  if (!TOKEN.test(token)) return null;
  const { data } = await db.from("documents").select("*").eq("token", token).maybeSingle();
  return data;
}

function isExpired(doc: Row): boolean {
  return doc.status !== "signed" && Boolean(doc.expires_at) && new Date(doc.expires_at).getTime() < Date.now();
}

export function contentHash(doc: Row): string {
  return createHash("sha256").update(JSON.stringify({ title: doc.title, cover: doc.cover, sections: doc.sections })).digest("hex");
}

export async function getPublicDocument(db: Db, token: string) {
  const doc = await byToken(db, token);
  if (!doc || doc.status === "void") return null;
  // A WhatsApp number the reader can write to with questions: the business's default one.
  const { data: channel } = await db
    .from("channels")
    .select("display_phone, external_id, provider")
    .eq("org_id", doc.org_id)
    .eq("active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  const { data: org } = await db.from("organizations").select("company_signature").eq("id", doc.org_id).maybeSingle();
  const signature = doc.signature
    ? { name: doc.signature.name, image: doc.signature.image, fields: doc.signature.fields ?? {}, signedAt: doc.signed_at, contentHash: doc.signature.content_hash }
    : null;
  return {
    title: doc.title,
    cover: doc.cover ?? {},
    sections: doc.sections ?? [],
    signerFields: (doc.signer_fields ?? []) as string[],
    status: isExpired(doc) ? "expired" : doc.status,
    expiresAt: doc.expires_at,
    signature,
    companySignature: (org?.company_signature as { image: string; name?: string; title?: string } | null) ?? null,
    contactPhone: (channel?.display_phone as string | undefined) ?? null,
  };
}

function deviceOf(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "אחר";
  const kind = /Mobi|iPhone|Android/.test(ua) ? "נייד" : "מחשב";
  return `${kind} · ${os}`;
}

async function notifySender(db: Db, doc: Row, text: string) {
  const { data: user } = doc.created_by ? await db.from("users").select("email").eq("id", doc.created_by).maybeSingle() : { data: null };
  await db.from("notifications").insert({
    org_id: doc.org_id,
    contact_id: doc.contact_id,
    text,
    target_email: user?.email ?? null,
    url: doc.contact_id ? `/contacts/${doc.contact_id}` : "/documents",
  });
}

async function contactName(db: Db, doc: Row): Promise<string> {
  if (!doc.contact_id) return "הליד";
  const { data } = await db.from("contacts").select("name").eq("id", doc.contact_id).maybeSingle();
  return data?.name ?? "הליד";
}

export async function openDocument(db: Db, token: string, session: string, meta: { ip: string; ua: string }) {
  const doc = await byToken(db, token);
  if (!doc || doc.status === "void" || !/^[\w-]{8,64}$/.test(session)) return;
  const { data } = await db.rpc("document_open", { p_doc: doc.id, p_session: session, p_device: deviceOf(meta.ua), p_ip: meta.ip, p_ua: meta.ua });
  const r = data as { new_session: boolean; first: boolean; prev_last: string | null } | null;
  if (!r?.new_session) return;
  const name = await contactName(db, doc);
  if (r.first) {
    await notifySender(db, doc, `👀 ${name} פתח/ה את "${doc.title}"`);
    if (doc.contact_id) {
      await db.from("activities").insert({ org_id: doc.org_id, contact_id: doc.contact_id, type: "note", text: `👀 פתח/ה את "${doc.title}"` });
      await triggerAutomations(db, doc.org_id, "document_viewed", doc.contact_id);
    }
  } else if (!r.prev_last || Date.now() - new Date(r.prev_last).getTime() > 30 * 60_000) {
    // Coming back to it later is a buying signal worth a ping.
    await notifySender(db, doc, `👀 ${name} חזר/ה לקרוא את "${doc.title}" (צפייה ${doc.view_count + 1})`);
  }
}

export async function pingDocument(db: Db, token: string, session: string, seconds: number, sections: Record<string, number>) {
  const doc = await byToken(db, token);
  if (!doc || doc.status === "void") return;
  const clean: Record<string, number> = {};
  const ids = new Set(((doc.sections ?? []) as Row[]).map((s) => s.id));
  for (const [k, v] of Object.entries(sections ?? {})) if (ids.has(k) && Number.isFinite(v)) clean[k] = Math.round(v);
  await db.rpc("document_ping", { p_doc: doc.id, p_session: session, p_seconds: Math.round(seconds), p_sections: clean });
}

export async function signDocument(
  db: Db,
  token: string,
  input: { name?: string; fields?: Record<string, string>; image?: string; agreed?: boolean },
  meta: { ip: string; ua: string }
) {
  const doc = await byToken(db, token);
  if (!doc || doc.status === "void") throw new DocumentError("המסמך לא נמצא");
  if (doc.status === "signed") throw new DocumentError("המסמך כבר נחתם");
  if (isExpired(doc)) throw new DocumentError("תוקף המסמך פג — פנו אלינו לקבלת מסמך מעודכן");
  const name = input.name?.trim() ?? "";
  if (name.length < 2) throw new DocumentError("יש למלא שם מלא");
  if (!input.agreed) throw new DocumentError("יש לאשר את תנאי המסמך");
  if (!input.image?.startsWith("data:image/png;base64,") || input.image.length > 400_000) throw new DocumentError("יש לחתום בתיבת החתימה");
  const fields: Record<string, string> = {};
  for (const f of doc.signer_fields ?? []) {
    const value = input.fields?.[f]?.trim() ?? "";
    if (!value) throw new DocumentError(`יש למלא ${SIGNER_FIELDS.find((x) => x.id === f)?.label ?? f}`);
    fields[f] = value.slice(0, 200);
  }
  const signature = { name: name.slice(0, 120), image: input.image, fields, ip: meta.ip, user_agent: meta.ua.slice(0, 400), content_hash: contentHash(doc) };
  const { data: updated } = await db
    .from("documents")
    .update({ status: "signed", signed_at: new Date().toISOString(), signature })
    .eq("id", doc.id)
    .neq("status", "signed")
    .select("id");
  if (!updated?.length) throw new DocumentError("המסמך כבר נחתם");

  const who = await contactName(db, doc);
  await notifySender(db, doc, `✍️ ${who} חתם/ה על "${doc.title}"`);
  if (doc.contact_id) {
    await db.from("activities").insert({ org_id: doc.org_id, contact_id: doc.contact_id, type: "note", text: `✍️ חתם/ה על "${doc.title}" (בשם: ${signature.name})` });
    await triggerAutomations(db, doc.org_id, "document_signed", doc.contact_id);
  }
}

export async function declineDocument(db: Db, token: string, reason: string) {
  const doc = await byToken(db, token);
  if (!doc || doc.status === "void" || doc.status === "signed") throw new DocumentError("לא ניתן לעדכן את המסמך");
  await db.from("documents").update({ status: "declined", declined_at: new Date().toISOString(), decline_reason: reason.slice(0, 500) || null }).eq("id", doc.id);
  const who = await contactName(db, doc);
  await notifySender(db, doc, `✖️ ${who} דחה/תה את "${doc.title}"${reason ? `: ${reason.slice(0, 100)}` : ""}`);
  if (doc.contact_id) await db.from("activities").insert({ org_id: doc.org_id, contact_id: doc.contact_id, type: "note", text: `✖️ דחה/תה את "${doc.title}"${reason ? ` — ${reason}` : ""}` });
}
