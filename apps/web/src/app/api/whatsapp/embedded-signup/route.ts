import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { GraphError } from "@/lib/server/graph";
import {
  exchangeCodeForToken,
  newRegistrationPin,
  registerPhoneNumber,
  requestCoexistenceSyncs,
  resolvePhoneNumber,
  subscribeAppToWaba,
  type SignupMode,
} from "@/lib/server/embeddedSignup";

type Body = {
  code?: string;
  mode?: SignupMode;
  wabaId?: string;
  phoneNumberId?: string;
  name?: string;
  isDefault?: boolean;
};

// Finishes Meta's Embedded Signup popup: trades the short-lived code for a
// business token, links the WABA's webhooks to our app, registers the number
// (new numbers only — a WhatsApp Business app number is already registered),
// saves the channel, and for coexistence kicks off the contacts/history sync.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);

    const body = (await request.json()) as Body;
    const code = body.code?.trim();
    const wabaId = body.wabaId?.trim();
    const mode: SignupMode = body.mode === "new_number" ? "new_number" : "coexistence";
    if (!code) throw new HttpError(400, "חסר קוד מההתחברות למטא");
    if (!wabaId || !/^\d+$/.test(wabaId)) throw new HttpError(400, "חסר מזהה חשבון וואטסאפ (WABA)");

    const token = await exchangeCodeForToken(code);
    const number = await resolvePhoneNumber(wabaId, token, body.phoneNumberId?.trim() || undefined);

    try {
      await subscribeAppToWaba(wabaId, token);
    } catch (err) {
      throw new HttpError(400, `חיבור ה-webhooks לחשבון נכשל: ${err instanceof GraphError ? err.message : String(err)}`);
    }

    let pin: string | null = null;
    if (mode === "new_number") {
      pin = newRegistrationPin();
      try {
        await registerPhoneNumber(number.id, token, pin);
      } catch (err) {
        throw new HttpError(400, `רישום המספר ל-API נכשל: ${err instanceof GraphError ? err.message : String(err)}`);
      }
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from("channels")
      .select("*")
      .eq("provider", "whatsapp_cloud")
      .eq("external_id", number.id)
      .maybeSingle();
    if (existing && existing.org_id !== orgId) throw new HttpError(409, "המספר הזה כבר מחובר לארגון אחר");

    const { count } = await db.from("channels").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    const isDefault = body.isDefault ?? (existing?.is_default || !count);
    if (isDefault) {
      const others = db.from("channels").update({ is_default: false }).eq("org_id", orgId);
      await (existing ? others.neq("id", existing.id) : others);
    }

    const row = {
      org_id: orgId,
      provider: "whatsapp_cloud",
      name: body.name?.trim() || existing?.name || number.verified_name || number.display_phone_number || number.id,
      external_id: number.id,
      waba_id: wabaId,
      display_phone: number.display_phone_number ?? null,
      is_default: isDefault,
      active: true,
      onboarding: mode === "coexistence" ? "coexistence" : "embedded_signup",
      onboarded_at: new Date().toISOString(),
      // A fresh onboarding opens a fresh one-time sync window at Meta.
      contacts_sync_requested_at: null,
      history_sync_requested_at: null,
    };
    const { data: channel, error } = existing
      ? await db.from("channels").update(row).eq("id", existing.id).select().single()
      : await db.from("channels").insert(row).select().single();
    if (error || !channel) throw error ?? new Error("שמירת הערוץ נכשלה");

    const { data: oldCreds } = await db
      .from("channel_credentials")
      .select("registration_pin")
      .eq("channel_id", channel.id)
      .maybeSingle();
    await db.from("channel_credentials").upsert({
      channel_id: channel.id,
      access_token: token,
      registration_pin: pin ?? oldCreds?.registration_pin ?? null,
      updated_at: new Date().toISOString(),
    });

    const notes = mode === "coexistence" ? await requestCoexistenceSyncs(db, channel, token) : [];
    return Response.json({ channel, notes });
  } catch (err) {
    return errorResponse(err);
  }
}
