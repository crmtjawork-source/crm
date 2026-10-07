import "server-only";
import { ATTRIBUTION_KEYS, detectPlatform } from "@/lib/attribution";
import type { InboundLead } from "./leads";

// Turns whatever a sender posts to a lead-intake URL into an InboundLead.
// Senders differ wildly (agency webhooks, Zapier/Make, landing-page forms,
// Google Ads lead forms), so field names are matched loosely and anything
// unrecognised is kept as a custom field rather than dropped.

type Flat = Record<string, string>;

const NAME = ["name", "full_name", "fullname", "שם", "שם מלא", "contact_name"];
const FIRST = ["first_name", "firstname", "שם פרטי"];
const LAST = ["last_name", "lastname", "שם משפחה"];
const PHONE = ["phone", "phone_number", "phonenumber", "mobile", "tel", "telephone", "cell", "טלפון", "נייד", "מספר טלפון"];
const EMAIL = ["email", "e-mail", "email_address", "mail", "אימייל", "מייל", 'דוא"ל'];
const CAMPAIGN = ["campaign", "campaign_name", "קמפיין"];
const CAMPAIGN_ID = ["campaign_id", "campaignid"];
const PLATFORM = ["platform", "פלטפורמה"];
const AGENCY = ["agency", "סוכנות"];
// Auth and bookkeeping keys some senders include; never stored.
const IGNORED = new Set(["google_key", "api_key", "key", "token", "secret", "api_version", "lead_id", "is_test", "user_column_data"]);

const norm = (k: string) => k.trim().toLowerCase().replace(/[\s-]+/g, "_");

function pick(flat: Flat, keys: string[], used: Set<string>): string | undefined {
  for (const k of keys) {
    const hit = Object.keys(flat).find((f) => norm(f) === norm(k));
    if (hit && flat[hit]?.trim()) {
      used.add(hit);
      return flat[hit].trim();
    }
  }
  return undefined;
}

function flatten(input: unknown, out: Flat = {}, prefix = ""): Flat {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, out, `${prefix}${k}.`);
      else if (Array.isArray(v)) out[`${prefix}${k}`] = v.map(String).join(", ");
      else if (v !== null && v !== undefined && String(v).trim() !== "") out[`${prefix}${k}`] = String(v);
    }
  }
  return out;
}

// Google Ads lead form webhook: answers arrive as user_column_data[].
function googleLeadForm(body: Record<string, unknown>): Flat | null {
  const cols = body.user_column_data;
  if (!Array.isArray(cols)) return null;
  const flat: Flat = {};
  for (const c of cols as Array<{ column_id?: string; column_name?: string; string_value?: string }>) {
    const value = c.string_value?.trim();
    if (!value) continue;
    const id = (c.column_id ?? "").toUpperCase();
    const key =
      id === "FULL_NAME" ? "full_name" : id === "FIRST_NAME" ? "first_name" : id === "LAST_NAME" ? "last_name"
      : id === "PHONE_NUMBER" ? "phone" : id === "EMAIL" ? "email" : c.column_name || c.column_id || "שדה";
    flat[key] = value;
  }
  for (const k of ["campaign_id", "adgroup_id", "creative_id", "form_id"]) if (body[k] != null) flat[k] = String(body[k]);
  if (body.gcl_id) flat.gclid = String(body.gcl_id);
  flat.platform = "google";
  return flat;
}

export function parseIntake(
  body: unknown,
  query: URLSearchParams,
  defaults: { platform?: string | null; agency?: string | null; campaignId?: string | null; sourceName: string }
): InboundLead & { isTest: boolean } {
  const b = (body ?? {}) as Record<string, unknown>;
  const flat: Flat = { ...Object.fromEntries(query), ...(googleLeadForm(b) ?? flatten(b)) };
  const used = new Set<string>();

  const first = pick(flat, FIRST, used);
  const last = pick(flat, LAST, used);
  const name = pick(flat, NAME, used) ?? ([first, last].filter(Boolean).join(" ") || undefined);
  const phone = pick(flat, PHONE, used);
  const email = pick(flat, EMAIL, used);

  const attribution: Flat = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = pick(flat, [key], used);
    if (v) attribution[key] = v;
  }
  const landing = pick(flat, ["page_url", "url", "source_url"], used);
  if (landing && !attribution.landing_page) attribution.landing_page = landing;

  const campaignName = pick(flat, CAMPAIGN, used) ?? attribution.utm_campaign;
  const campaignId = pick(flat, CAMPAIGN_ID, used);
  const platform = pick(flat, PLATFORM, used)?.toLowerCase() ?? detectPlatform(attribution) ?? defaults.platform ?? undefined;
  const agency = pick(flat, AGENCY, used) ?? defaults.agency ?? undefined;
  const isTest = String(b.is_test ?? "").toLowerCase() === "true";

  const fields: Flat = {};
  for (const [k, v] of Object.entries(flat)) {
    if (used.has(k) || IGNORED.has(norm(k)) || k.startsWith("_")) continue;
    fields[k.replace(/_/g, " ").trim()] = v.slice(0, 2000);
  }

  return {
    name,
    phone,
    email,
    fields,
    attribution,
    campaign: campaignName || campaignId ? { name: campaignName, externalId: campaignId, platform: platform ?? "other", agency } : undefined,
    defaultCampaignId: defaults.campaignId ?? null,
    tags: isTest ? ["ליד בדיקה"] : [],
    source: defaults.sourceName,
    isTest,
  };
}
