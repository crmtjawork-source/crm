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

const KNOWN_KEYS = new Set(["full_name", "first_name", "last_name", "phone_number", "phone", "email"]);

export function mapLeadAnswers(fieldData: Lead["field_data"] = []) {
  const get = (name: string) => fieldData.find((f) => f.name === name)?.values?.[0]?.trim() || undefined;
  const name = get("full_name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ") || undefined;
  const extra: Record<string, string> = {};
  for (const f of fieldData) {
    if (KNOWN_KEYS.has(f.name)) continue;
    const value = (f.values ?? []).join(", ").trim();
    if (value) extra[f.name.replace(/_/g, " ").trim()] = value;
  }
  return { name, phone: get("phone_number") || get("phone"), email: get("email"), extra };
}

export async function handleLeadgenChange(db: Db, value: Row): Promise<string | null> {
  const leadgenId = String(value.leadgen_id ?? "");
  const pageId = String(value.page_id ?? "");
  if (!leadgenId || !pageId) return "אירוע leadgen בלי מזהה ליד/דף";

  const { data: page } = await db.from("lead_ad_pages").select("*").eq("page_id", pageId).maybeSingle();
  if (!page) return `דף פייסבוק ${pageId} לא מחובר למערכת`;

  // Idempotency: a submission row that already has a contact was fully
  // processed by an earlier delivery of the same lead.
  await db.from("lead_ad_submissions").upsert(
    {
      org_id: page.org_id,
      leadgen_id: leadgenId,
      page_id: pageId,
      form_id: value.form_id ? String(value.form_id) : null,
      ad_id: value.ad_id ? String(value.ad_id) : null,
      raw: value,
    },
    { onConflict: "leadgen_id", ignoreDuplicates: true }
  );
  const { data: submission } = await db.from("lead_ad_submissions").select("*").eq("leadgen_id", leadgenId).single();
  if (submission?.contact_id) return null;

  const { data: creds } = await db
    .from("lead_ad_page_credentials")
    .select("page_access_token")
    .eq("lead_ad_page_id", page.id)
    .maybeSingle();
  if (!creds) throw new Error(`לדף ${page.page_name ?? pageId} אין טוקן גישה שמור`);

  const lead = await fetchLead(leadgenId, creds.page_access_token);
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
  });

  // Mark processed before running automations: a crash while sending the
  // welcome message must not re-create the lead on retry.
  await db.from("lead_ad_submissions").update({ contact_id: contactId }).eq("leadgen_id", leadgenId);
  if (created) await triggerAutomations(db, page.org_id, "new_contact", contactId, { source: "meta_lead_ads" });
  return null;
}
