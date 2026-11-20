import "server-only";
import type { Db } from "./supabaseAdmin";
import { formatValue, type FieldValue } from "@/lib/objects";
import type { ObjectField } from "@/lib/types";

// Public (no login) side of shared record pages. The token is the only
// credential, and ONLY what the share's allow-lists name is ever returned:
// chosen field keys (of safe types), chosen file ids of that same record.
// Notes, tasks, history, relations, owners and other records never leave.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const TOKEN = /^[a-f0-9]{64}$/;
// Relation / user / contact fields point at internal data — never shareable.
export const SHAREABLE_TYPES = ["text", "long_text", "number", "currency", "date", "datetime", "select", "multi_select", "checkbox", "url"];
const FILES_BUCKET = "files";

export type PublicShare = {
  title: string;
  intro: string | null;
  facts: { label: string; value: string; href?: string }[];
  texts: { label: string; value: string }[];
  images: { id: string; name: string; caption: string | null }[];
  documents: { id: string; name: string; mime: string | null; size: number | null }[];
  brand: { name: string; logoUrl?: string; accentColor?: string; phone?: string; contactName?: string };
};

async function liveShare(db: Db, token: string): Promise<Row | null> {
  if (!TOKEN.test(token)) return null;
  const { data } = await db.from("record_shares").select("*").eq("token", token).maybeSingle();
  if (!data || !data.published) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

const isImage = (mime: string | null) => Boolean(mime && mime.startsWith("image/") && !/svg/.test(mime));

export async function getPublicShare(db: Db, token: string, opts: { countView?: boolean } = {}): Promise<PublicShare | null> {
  const share = await liveShare(db, token);
  if (!share) return null;
  const { data: record } = await db.from("records").select("id, org_id, object_type_id, title, data").eq("id", share.record_id).eq("org_id", share.org_id).maybeSingle();
  if (!record) return null;

  const keys = new Set<string>(share.field_keys ?? []);
  const { data: fieldRows } = await db.from("object_fields").select("*").eq("object_type_id", record.object_type_id).order("position");
  const fields: ObjectField[] = (fieldRows ?? [])
    .filter((f: Row) => keys.has(f.key) && SHAREABLE_TYPES.includes(f.type))
    .map((f: Row) => ({ id: f.id, objectTypeId: f.object_type_id, key: f.key, label: f.label, type: f.type, options: f.options ?? [], required: false, showInList: false, position: f.position }));

  const facts: PublicShare["facts"] = [];
  const texts: PublicShare["texts"] = [];
  for (const f of fields) {
    const raw = (record.data ?? {})[f.key] as FieldValue;
    const value = formatValue(f, raw);
    if (!value) continue;
    if (f.type === "long_text") texts.push({ label: f.label, value });
    else if (f.type === "url") {
      if (/^https?:\/\//i.test(String(raw))) facts.push({ label: f.label, value: String(raw).replace(/^https?:\/\//i, ""), href: String(raw) });
    } else facts.push({ label: f.label, value });
  }

  const ids: string[] = share.file_ids ?? [];
  const { data: fileRows } = ids.length ? await db.from("files").select("id, name, mime, size, caption").in("id", ids).eq("record_id", share.record_id).eq("org_id", share.org_id) : { data: [] };
  const byId = new Map((fileRows ?? []).map((f: Row) => [f.id, f]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const images = ordered.filter((f) => isImage(f.mime)).map((f) => ({ id: f.id, name: f.name, caption: f.caption ?? null }));
  const documents = ordered.filter((f) => !isImage(f.mime)).map((f) => ({ id: f.id, name: f.name, mime: f.mime ?? null, size: f.size ?? null }));

  const { data: org } = await db.from("organizations").select("name, share_brand").eq("id", share.org_id).maybeSingle();
  const b = (org?.share_brand ?? {}) as Row;
  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
  const http = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : undefined);

  if (opts.countView) {
    await db.from("record_shares").update({ view_count: (share.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() }).eq("id", share.id);
  }

  return {
    title: (share.title as string | null)?.trim() || record.title || "",
    intro: (share.intro as string | null)?.trim() || null,
    facts,
    texts,
    images,
    documents,
    brand: { name: org?.name ?? "", logoUrl: http(b.logoUrl), accentColor: hex(b.accentColor), phone: typeof b.phone === "string" ? b.phone : undefined, contactName: typeof b.contactName === "string" ? b.contactName : undefined },
  };
}

// A short-lived URL for one file of a live share — only if the share names it.
export async function getShareFileUrl(db: Db, token: string, fileId: string): Promise<{ url: string } | null> {
  const share = await liveShare(db, token);
  if (!share || !(share.file_ids ?? []).includes(fileId)) return null;
  const { data: file } = await db.from("files").select("path, name, mime").eq("id", fileId).eq("record_id", share.record_id).eq("org_id", share.org_id).maybeSingle();
  if (!file) return null;
  const { data } = await db.storage.from(FILES_BUCKET).createSignedUrl(file.path, 300, isImage(file.mime) ? undefined : { download: false });
  return data?.signedUrl ? { url: data.signedUrl } : null;
}
