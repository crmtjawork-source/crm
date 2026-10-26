import "server-only";
import type { Db } from "../supabaseAdmin";
import { graphFetch, GraphError } from "../graph";
import { upsertInboundLead } from "../leads";
import { triggerAutomations } from "../automations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type Lead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  is_organic?: boolean;
  form_id?: string;
  platform?: string;
};

const FULL_FIELDS = "created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic";
const BASIC_FIELDS = "created_time,field_data,form_id";

async function fetchLead(leadgenId: string, pageToken: string): Promise<Lead> {
  try {
    return await graphFetch<Lead>(leadgenId, pageToken, { query: { fields: FULL_FIELDS } });
  } catch (err) {
    // Ad/campaign names need ads permissions the token may not carry; the
    // lead's own answers are what matters, so fall back rather than fail.
    if (err instanceof GraphError && (err.code === 100 || err.code === 200 || err.code === 10)) {
      return graphFetch<Lead>(leadgenId, pageToken, { query: { fields: BASIC_FIELDS } });
    }
    throw err;
  }
}

// Meta's standard questions use English keys; custom questions written in
// another language (e.g. a Hebrew "שם מלא" field) keep the label as the key.
const NAME_KEYS = ["full_name", "שם_מלא", "שם"];
const FIRST_NAME_KEYS = ["first_name", "שם_פרטי"];
const LAST_NAME_KEYS = ["last_name", "שם_משפחה"];
const PHONE_KEYS = ["phone_number", "phone", "מספר_טלפון", "טלפון", "מספר_נייד", "נייד"];
const EMAIL_KEYS = ["email", 'דוא"ל', "דואל", "אימייל", "מייל", "כתובת_מייל"];
const KNOWN_KEYS = new Set([...NAME_KEYS, ...FIRST_NAME_KEYS, ...LAST_NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS]);

export function mapLeadAnswers(fieldData: Lead["field_data"] = []) {
  const get = (keys: string[]) => {
    for (const key of keys) {
      const value = fieldData.find((f) => f.name === key)?.values?.[0]?.trim();
      if (value) return value;
    }
    return undefined;
  };
  const name = get(NAME_KEYS) || [get(FIRST_NAME_KEYS), get(LAST_NAME_KEYS)].filter(Boolean).join(" ") || undefined;
  const extra: Record<string, string> = {};
  for (const f of fieldData) {
    if (KNOWN_KEYS.has(f.name)) continue;
    const value = (f.values ?? []).join(", ").trim();
    if (value) extra[f.name.replace(/_/g, " ").trim()] = value;
  }
  // An Israeli mobile typed without its leading 0 ("532298443").
  let phone = get(PHONE_KEYS);
  if (phone && /^5\d{8}$/.test(phone.replace(/\D/g, ""))) phone = `0${phone.replace(/\D/g, "")}`;
  return { name, phone, email: get(EMAIL_KEYS), extra };
}

export async function handleLeadgenChange(db: Db, value: Row): Promise<string | null> {
  const leadgenId = String(value.leadgen_id ?? "");
  const pageId = String(value.page_id ?? "");
  if (!leadgenId || !pageId) return "אירוע leadgen בלי מזהה ליד/דף";

  const { data: page } = await db.from("lead_ad_pages").select("*").eq("page_id", pageId).maybeSingle();
  if (!page) return `דף פייסבוק ${pageId} לא מחובר למערכת`;
  if (await alreadyIngested(db, page, leadgenId, value)) return null;

  const token = await pageToken(db, page);
  const lead = await fetchLead(leadgenId, token);
  await ingestLead(db, page, leadgenId, lead, value);
  return null;
}

// Idempotency: a submission row that already has a contact was fully
// processed by an earlier delivery of the same lead (webhook or poll).
async function alreadyIngested(db: Db, page: Row, leadgenId: string, raw: Row): Promise<boolean> {
  await db.from("lead_ad_submissions").upsert(
    {
      org_id: page.org_id,
      leadgen_id: leadgenId,
      page_id: page.page_id,
      form_id: raw.form_id ? String(raw.form_id) : null,
      ad_id: raw.ad_id ? String(raw.ad_id) : null,
      raw,
    },
    { onConflict: "leadgen_id", ignoreDuplicates: true }
  );
  const { data: submission } = await db.from("lead_ad_submissions").select("contact_id").eq("leadgen_id", leadgenId).single();
  return Boolean(submission?.contact_id);
}

async function pageToken(db: Db, page: Row): Promise<string> {
  const { data: creds } = await db
    .from("lead_ad_page_credentials")
    .select("page_access_token")
    .eq("lead_ad_page_id", page.id)
    .maybeSingle();
  if (!creds) throw new Error(`לדף ${page.page_name ?? page.page_id} אין טוקן גישה שמור`);
  return creds.page_access_token;
}

async function ingestLead(db: Db, page: Row, leadgenId: string, lead: Lead, value: Row) {
  const answers = mapLeadAnswers(lead.field_data);
  const attribution: Record<string, string> = {};
  for (const key of ["ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "form_id"] as const) {
    const v = lead[key] ?? (key === "ad_id" || key === "form_id" ? value[key] : undefined);
    if (v) attribution[key] = String(v);
  }
  if (lead.platform) attribution.platform = lead.platform;
  if (lead.is_organic) attribution.organic = "true";

  const { contactId, created } = await upsertInboundLead(db, page.org_id, {
    name: answers.name,
    phone: answers.phone,
    email: answers.email,
    fields: answers.extra,
    attribution,
    campaign: { name: lead.campaign_name, externalId: lead.campaign_id, platform: "meta" },
    source: `פרסומת ${lead.platform === "ig" ? "אינסטגרם" : "פייסבוק"}`,
    // The same submission may already have arrived through another
    // integration (e.g. a CRM forwarding its own Facebook leads).
    quietWithinMinutes: 120,
  });

  // Mark processed before running automations: a crash while sending the
  // welcome message must not re-create the lead on retry.
  await db.from("lead_ad_submissions").update({ contact_id: contactId }).eq("leadgen_id", leadgenId);
  if (created) await triggerAutomations(db, page.org_id, "new_contact", contactId, { source: "meta_lead_ads" });
}

// Meta delivers `leadgen` webhooks only to published apps, so every
// connected Page is also polled: each form's leads created since the last
// poll. Runs from the cron; a Page is polled at most every POLL_EVERY_MS.
const POLL_EVERY_MS = 2 * 60_000;
// Overlap between polls, in case Meta exposes a lead a little after its
// created_time. Duplicates are dropped by lead_ad_submissions.
const OVERLAP_SECONDS = 600;

type Paged<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

async function allPages<T>(path: string, token: string, query: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const res = await graphFetch<Paged<T>>(path, token, { query: { ...query, limit: "100", ...(after ? { after } : {}) } });
    out.push(...(res.data ?? []));
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

async function fetchFormLeads(formId: string, token: string, sinceUnix: number): Promise<(Lead & { id: string })[]> {
  const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]);
  try {
    return await allPages(`${formId}/leads`, token, { fields: `id,${FULL_FIELDS}`, filtering });
  } catch (err) {
    if (err instanceof GraphError && (err.code === 100 || err.code === 200 || err.code === 10)) {
      return allPages(`${formId}/leads`, token, { fields: `id,${BASIC_FIELDS}`, filtering });
    }
    throw err;
  }
}

async function pollPage(db: Db, page: Row): Promise<number> {
  const startedAt = new Date();
  const token = await pageToken(db, page);
  // A Page's first poll starts from when it was connected: older leads
  // already reached the CRM some other way, or are imported on purpose.
  const since = new Date(page.polled_until ?? page.created_at);
  const sinceUnix = Math.floor(since.getTime() / 1000) - OVERLAP_SECONDS;

  const forms = await allPages<{ id: string; status?: string }>(`${page.page_id}/leadgen_forms`, token, { fields: "id,status" });
  const leads: (Lead & { id: string })[] = [];
  for (const form of forms) {
    if (form.status === "ARCHIVED" || form.status === "DELETED") continue;
    for (const lead of await fetchFormLeads(form.id, token, sinceUnix)) leads.push({ ...lead, form_id: lead.form_id ?? form.id });
  }
  leads.sort((a, b) => (a.created_time ?? "").localeCompare(b.created_time ?? ""));

  let added = 0;
  for (const lead of leads) {
    const value = { leadgen_id: lead.id, page_id: page.page_id, form_id: lead.form_id, ad_id: lead.ad_id, via: "poll" };
    if (await alreadyIngested(db, page, lead.id, value)) continue;
    await ingestLead(db, page, lead.id, lead, value);
    added++;
  }
  await db
    .from("lead_ad_pages")
    .update({ polled_until: startedAt.toISOString(), last_poll_at: new Date().toISOString(), last_poll_error: null })
    .eq("id", page.id);
  return added;
}

export async function pollLeadAdPages(db: Db): Promise<{ pages: number; added: number; errors: number }> {
  const cutoff = new Date(Date.now() - POLL_EVERY_MS + 5_000).toISOString();
  const { data: pages } = await db.from("lead_ad_pages").select("*").or(`last_poll_at.is.null,last_poll_at.lt.${cutoff}`);
  let added = 0;
  let errors = 0;
  for (const page of pages ?? []) {
    try {
      added += await pollPage(db, page);
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error("lead ads poll failed", page.page_id, message);
      await db
        .from("lead_ad_pages")
        .update({ last_poll_at: new Date().toISOString(), last_poll_error: message.slice(0, 500) })
        .eq("id", page.id);
    }
  }
  return { pages: pages?.length ?? 0, added, errors };
}
