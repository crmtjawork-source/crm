import "server-only";
import type { Db } from "./supabaseAdmin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type FallbackKind = "hold" | "task" | "notify" | "email" | "skip";
export type ChannelMode = "whatsapp" | "auto";
export type AutomationDefaults = { channel_mode?: ChannelMode; fallback?: FallbackKind; hold_expire_hours?: number };

export const DEFAULT_HOLD_EXPIRE_HOURS = 72;

// A linked-number channel is usable when it is active and the watchdog
// (gatewayHealth) has not marked it unhealthy. Cloud API numbers don't drop.
export function channelIsUp(ch: Row | null | undefined): boolean {
  if (!ch || !ch.active) return false;
  if (ch.provider === "whatsapp_cloud") return true;
  if (ch.unhealthy_since) return false;
  return ch.status == null || ch.status === "authorized";
}

export function channelDownReason(ch: Row | null | undefined): string {
  if (!ch) return "לא מוגדר חיבור וואטסאפ";
  if (!ch.active) return "חיבור הוואטסאפ כבוי או מנותק";
  return "הוואטסאפ מנותק — צריך לחבר מחדש (סריקת QR)";
}

export async function loadAutomationDefaults(db: Db, orgId: string): Promise<AutomationDefaults> {
  const { data } = await db.from("organizations").select("automation_defaults").eq("id", orgId).maybeSingle();
  return (data?.automation_defaults ?? {}) as AutomationDefaults;
}

// Effective policy of a send step: the step's own choice, else the org default,
// else strict WhatsApp + hold.
export function stepPolicy(step: Row, defaults: AutomationDefaults): { mode: ChannelMode; fallback: FallbackKind } {
  const mode: ChannelMode = step.channel_mode ?? defaults.channel_mode ?? "whatsapp";
  const fallback: FallbackKind = step.fallback ?? defaults.fallback ?? "hold";
  // Strict WhatsApp never swaps the channel: it always waits.
  return { mode, fallback: mode === "whatsapp" ? "hold" : fallback };
}

// Errors that mean "WhatsApp isn't reachable right now" (worth holding),
// as opposed to a problem with this particular message/lead.
export function isGatewayError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /Evolution (5\d\d|401|403|404)|fetch failed|ECONN|ENOTFOUND|לא הוגדר ערוץ|ערוץ הוואטסאפ|אין חיבור וואטסאפ|אין וואטסאפ אישי|מחובר|not connected|Connection Closed/i.test(m);
}

// The state shown in the automations area.
export async function orgWhatsAppState(db: Db, orgId: string) {
  const { data: channels } = await db.from("channels").select("id, name, provider, status, active, unhealthy_since, display_phone, owner_membership_id").eq("org_id", orgId).in("provider", ["evolution", "green_api", "whatsapp_cloud"]);
  const list = (channels ?? []) as Row[];
  const up = list.filter(channelIsUp);
  const down = list.filter((c) => !channelIsUp(c) && (c.display_phone || c.unhealthy_since));
  return { configured: list.length > 0, anyUp: up.length > 0, down: down.map((c) => ({ id: c.id, name: c.name, since: c.unhealthy_since })) };
}
