import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { graphFetch, GraphError } from "@/lib/server/graph";

type Body = {
  id?: string;
  name?: string;
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  isDefault?: boolean;
  active?: boolean;
  ownerMembershipId?: string | null;
};

// Create or update a WhatsApp Cloud API number. The access token is
// write-only: validated against Meta, stored where only the server can read
// it, and never returned to the browser.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as Body;
    const db = supabaseAdmin();

    let existing = null;
    if (body.id) {
      ({ data: existing } = await db.from("channels").select("*").eq("id", body.id).eq("org_id", orgId).maybeSingle());
      if (!existing) throw new HttpError(404, "הערוץ לא נמצא");
    }

    const phoneNumberId = body.phoneNumberId?.trim() || existing?.external_id;
    if (!phoneNumberId || !/^\d+$/.test(phoneNumberId)) throw new HttpError(400, "Phone number ID חייב להיות מספר");
    const token = body.accessToken?.trim();
    if (!existing && !token) throw new HttpError(400, "חסר טוקן גישה");
    const wabaId = body.wabaId?.trim() || existing?.waba_id || null;

    const notes: string[] = [];
    let displayPhone: string | null = existing?.display_phone ?? null;
    if (token) {
      try {
        const info = await graphFetch<{ display_phone_number?: string; verified_name?: string }>(phoneNumberId, token, {
          query: { fields: "display_phone_number,verified_name" },
        });
        displayPhone = info.display_phone_number ?? displayPhone;
      } catch (err) {
        throw new HttpError(400, `מטא דחו את הטוקן/המספר: ${err instanceof GraphError ? err.message : String(err)}`);
      }
      if (wabaId) {
        // Links this WABA's webhooks (incl. Coexistence echoes/history) to our app.
        try {
          await graphFetch(`${wabaId}/subscribed_apps`, token, { method: "POST" });
          notes.push("ה-WABA נרשם לקבלת webhooks");
        } catch (err) {
          notes.push(`רישום ה-WABA ל-webhooks נכשל: ${err instanceof GraphError ? err.message : String(err)}`);
        }
      }
    }

    if (body.isDefault) {
      const others = db.from("channels").update({ is_default: false }).eq("org_id", orgId);
      await (existing ? others.neq("id", existing.id) : others);
    }

    const row = {
      org_id: orgId,
      provider: "whatsapp_cloud",
      name: body.name?.trim() || existing?.name || displayPhone || phoneNumberId,
      external_id: phoneNumberId,
      waba_id: wabaId,
      display_phone: displayPhone,
      owner_membership_id: body.ownerMembershipId === undefined ? existing?.owner_membership_id ?? null : body.ownerMembershipId,
      is_default: body.isDefault ?? existing?.is_default ?? false,
      active: body.active ?? existing?.active ?? true,
    };
    const { data: channel, error } = existing
      ? await db.from("channels").update(row).eq("id", existing.id).select().single()
      : await db.from("channels").insert(row).select().single();
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "המספר הזה כבר מחובר (אולי בארגון אחר)");
      throw error;
    }

    if (token) {
      await db
        .from("channel_credentials")
        .upsert({ channel_id: channel.id, access_token: token, updated_at: new Date().toISOString() });
    }
    return Response.json({ channel, notes });
  } catch (err) {
    return errorResponse(err);
  }
}
