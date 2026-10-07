// Marketing attribution vocabulary shared by the server (lead intake) and
// the UI (campaign dashboard, lead card). Platforms are free text in the DB;
// these are the well-known ones with labels.

export const PLATFORMS: { id: string; label: string }[] = [
  { id: "meta", label: "Meta (פייסבוק / אינסטגרם)" },
  { id: "google", label: "Google" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "taboola", label: "Taboola" },
  { id: "outbrain", label: "Outbrain" },
  { id: "website", label: "אתר / דף נחיתה" },
  { id: "organic", label: "אורגני / סושיאל" },
  { id: "referral", label: "המלצות ושיתופי פעולה" },
  { id: "email", label: "אימייל" },
  { id: "sms", label: "SMS" },
  { id: "whatsapp", label: "וואטסאפ" },
  { id: "other", label: "אחר" },
];

export function platformLabel(id: string | null | undefined): string {
  if (!id) return "ללא";
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

// Tracking keys kept as-is in contacts.attribution.
export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "ttclid",
  "li_fat_id",
  "msclkid",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "adgroup_id",
  "creative_id",
  "form_id",
  "form_name",
  "landing_page",
  "referrer",
] as const;

export const ATTRIBUTION_LABELS: Record<string, string> = {
  utm_source: "מקור (utm_source)",
  utm_medium: "ערוץ (utm_medium)",
  utm_campaign: "קמפיין (utm_campaign)",
  utm_content: "תוכן (utm_content)",
  utm_term: "מילת מפתח (utm_term)",
  ad_name: "מודעה",
  adset_name: "קהל / ad set",
  form_name: "טופס",
  landing_page: "דף נחיתה",
  referrer: "הגיע מ",
};

// Best guess of the platform from click ids and UTM source.
export function detectPlatform(a: Record<string, string | undefined>): string | undefined {
  if (a.gclid || a.gbraid || a.wbraid) return "google";
  if (a.fbclid) return "meta";
  if (a.ttclid) return "tiktok";
  if (a.li_fat_id) return "linkedin";
  if (a.msclkid) return "other";
  const src = (a.utm_source ?? "").toLowerCase();
  if (!src) return undefined;
  if (/facebook|^fb$|instagram|^ig$|meta/.test(src)) return "meta";
  if (/google|adwords|youtube/.test(src)) return "google";
  if (/tiktok/.test(src)) return "tiktok";
  if (/linkedin/.test(src)) return "linkedin";
  if (/taboola/.test(src)) return "taboola";
  if (/outbrain/.test(src)) return "outbrain";
  if (/mail|newsletter/.test(src)) return "email";
  if (/sms/.test(src)) return "sms";
  if (/whatsapp/.test(src)) return "whatsapp";
  return "other";
}
