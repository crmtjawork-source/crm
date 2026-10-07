import "server-only";
import type { Db } from "./supabaseAdmin";
import { normalizePhone } from "./phone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type InboundLead = {
  name?: string;
  phone?: string;
  email?: string;
  fields?: Record<string, string>;
  attribution?: Record<string, string>;
  // Resolved (found or created) into contacts.campaign_id.
  campaign?: { name?: string; externalId?: string; platform?: string; agency?: string };
  // Used when `campaign` doesn't identify one.
  defaultCampaignId?: string | null;
  tags?: string[];
  // contacts.source for new leads, and the channel named in the timeline.
  source: string;
};

export async function resolveCampaign(db: Db, orgId: string, c: InboundLead["campaign"]): Promise<string | null> {
  if (!c || (!c.name?.trim() && !c.externalId?.trim())) return null;
  const { data, error } = await db.rpc("resolve_campaign", {
    p_org: orgId,
    p_platform: c.platform ?? "other",
    p_name: c.name ?? null,
    p_external_id: c.externalId ?? null,
    p_agency: c.agency ?? null,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// One path for every inbound lead (Meta lead forms, intake URLs, …): match
// an existing lead by phone, then email; otherwise create one. The first
// campaign and tracking data that brought the lead are kept (first touch).
export async function upsertInboundLead(db: Db, orgId: string, lead: InboundLead): Promise<{ contactId: string; created: boolean }> {
  const campaignId = (await resolveCampaign(db, orgId, lead.campaign)) ?? lead.defaultCampaignId ?? null;
  const fields = lead.fields ?? {};
  const attribution = lead.attribution ?? {};
  const via = lead.campaign?.name ? `${lead.source} — ${lead.campaign.name}` : lead.source;

  const digits = normalizePhone(lead.phone);
  let existing: Row | null = null;
  if (digits) {
    ({ data: existing } = await db
      .from("contacts")
      .select("*")
      .eq("org_id", orgId)
      .eq("phone_digits", digits)
      .order("created_at")
      .limit(1)
      .maybeSingle());
  } else if (lead.email) {
    ({ data: existing } = await db
      .from("contacts")
      .select("*")
      .eq("org_id", orgId)
      .ilike("email", lead.email)
      .order("created_at")
      .limit(1)
      .maybeSingle());
  }

  let contactId: string;
  if (existing) {
    contactId = existing.id;
    const hasAttribution = existing.attribution && Object.keys(existing.attribution).length > 0;
    await db
      .from("contacts")
      .update({
        fields: { ...(existing.fields ?? {}), ...fields },
        email: existing.email ?? lead.email ?? null,
        phone: existing.phone ?? lead.phone ?? null,
        campaign_id: existing.campaign_id ?? campaignId,
        attribution: hasAttribution ? existing.attribution : attribution,
        tags: [...new Set([...(existing.tags ?? []), ...(lead.tags ?? [])])],
      })
      .eq("id", contactId);
    await db.from("activities").insert({
      org_id: orgId,
      contact_id: contactId,
      type: "note",
      text: `📥 השאיר/ה פרטים שוב (${via})`,
    });
    await db.from("notifications").insert({
      org_id: orgId,
      contact_id: contactId,
      text: `ליד קיים השאיר פרטים שוב (${lead.source}): ${existing.name}`,
    });
  } else {
    const displayName = lead.name || lead.phone || lead.email || `ליד מ${lead.source}`;
    const { data: contact, error } = await db
      .from("contacts")
      .insert({
        org_id: orgId,
        name: displayName,
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        source: lead.source,
        fields,
        tags: lead.tags ?? [],
        campaign_id: campaignId,
        attribution,
      })
      .select("id")
      .single();
    if (error || !contact) throw error ?? new Error("יצירת ליד נכשלה");
    contactId = contact.id;
    await db.from("activities").insert({ org_id: orgId, contact_id: contactId, type: "note", text: `📥 ליד חדש (${via})` });
    await db.from("notifications").insert({ org_id: orgId, contact_id: contactId, text: `ליד חדש (${lead.source}): ${displayName}` });
  }

  const fieldNames = Object.keys(fields);
  if (fieldNames.length) {
    await db
      .from("contact_field_defs")
      .upsert(fieldNames.map((name) => ({ org_id: orgId, name })), { onConflict: "org_id,name", ignoreDuplicates: true });
  }
  return { contactId, created: !existing };
}
