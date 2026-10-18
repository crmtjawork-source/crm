import { randomBytes } from "node:crypto";
import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { configureWebhooks, getQr, getState, getWid, GreenApiError, logout, normalizeApiUrl } from "@/lib/server/greenApi";

// Linking a personal WhatsApp through Green-API. Any member may link their
// own number; admins may manage anyone's. Credentials are write-only.
type Body =
  | { action: "connect"; name?: string; idInstance?: string; apiToken?: string; apiUrl?: string; ownerMembershipId?: string }
  | { action: "status"; id: string }
  | { action: "disconnect"; id: string };

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const { data: me } = await db.from("memberships").select("id, role").eq("org_id", orgId).eq("user_id", user.userId).single();
    if (!me) throw new HttpError(403, "אין הרשאה");
    const isAdmin = me.role !== "agent";
    const body = (await request.json()) as Body;

    if (body.action === "connect") {
      const ownerId = body.ownerMembershipId || me.id;
      if (ownerId !== me.id && !isAdmin) throw new HttpError(403, "אפשר לחבר רק את הוואטסאפ שלך");
      const idInstance = body.idInstance?.trim() ?? "";
      const apiToken = body.apiToken?.trim() ?? "";
      if (!/^\d+$/.test(idInstance) || !apiToken) throw new HttpError(400, "חסרים idInstance או apiTokenInstance");
      const creds = { idInstance, apiToken, apiUrl: normalizeApiUrl(body.apiUrl) };
      let state: string;
      try {
        state = await getState(creds);
      } catch (err) {
        throw new HttpError(400, err instanceof GreenApiError ? err.message : "החיבור ל-Green-API נכשל");
      }

      const { data: existing } = await db.from("channels").select("*").eq("provider", "green_api").eq("external_id", idInstance).maybeSingle();
      if (existing && existing.org_id !== orgId) throw new HttpError(409, "החיבור הזה כבר בשימוש בארגון אחר");
      const row = {
        org_id: orgId,
        provider: "green_api",
        name: body.name?.trim() || existing?.name || "וואטסאפ אישי",
        external_id: idInstance,
        owner_membership_id: ownerId,
        active: true,
        is_default: false,
        status: state,
        status_checked_at: new Date().toISOString(),
      };
      const { data: channel, error } = existing
        ? await db.from("channels").update(row).eq("id", existing.id).select().single()
        : await db.from("channels").insert(row).select().single();
      if (error || !channel) throw error ?? new Error("שמירת החיבור נכשלה");

      const { data: oldCreds } = await db.from("channel_credentials").select("webhook_secret").eq("channel_id", channel.id).maybeSingle();
      const secret = oldCreds?.webhook_secret ?? randomBytes(24).toString("hex");
      await db.from("channel_credentials").upsert({ channel_id: channel.id, access_token: apiToken, api_url: creds.apiUrl, webhook_secret: secret, updated_at: new Date().toISOString() });
      const notes: string[] = [];
      try {
        await configureWebhooks(creds, `${new URL(request.url).origin}/api/webhooks/green-api/${secret}`);
      } catch (err) {
        notes.push(`הגדרת קבלת ההודעות נכשלה: ${err instanceof Error ? err.message : String(err)}`);
      }
      return Response.json({ channel, notes });
    }

    const { data: channel } = await db.from("channels").select("*").eq("id", body.id).eq("org_id", orgId).eq("provider", "green_api").maybeSingle();
    if (!channel) throw new HttpError(404, "החיבור לא נמצא");
    if (channel.owner_membership_id !== me.id && !isAdmin) throw new HttpError(403, "אין הרשאה");
    const { data: c } = await db.from("channel_credentials").select("access_token, api_url").eq("channel_id", channel.id).single();
    const creds = { idInstance: channel.external_id, apiToken: c!.access_token, apiUrl: c!.api_url };

    if (body.action === "status") {
      const state = await getState(creds);
      const patch: Record<string, unknown> = { status: state, status_checked_at: new Date().toISOString() };
      let qr: string | null = null;
      if (state === "authorized") {
        if (!channel.display_phone) patch.display_phone = (await getWid(creds).catch(() => null)) ?? null;
      } else {
        const r = await getQr(creds).catch(() => null);
        if (r?.type === "qrCode") qr = r.message ?? null;
      }
      const { data: updated } = await db.from("channels").update(patch).eq("id", channel.id).select().single();
      return Response.json({ channel: updated, state, qr });
    }

    if (body.action === "disconnect") {
      await logout(creds).catch(() => undefined);
      const { data: updated } = await db.from("channels").update({ active: false, status: "notAuthorized" }).eq("id", channel.id).select().single();
      return Response.json({ channel: updated });
    }
    throw new HttpError(400, "פעולה לא מוכרת");
  } catch (err) {
    return errorResponse(err);
  }
}
