import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { providerById, providerList } from "@/lib/server/telephony/providers";

// The org's phone-system connections. Admin only: the response carries the
// webhook URL and signing secret, which never reach ordinary members.

async function describe(orgId: string) {
  const db = supabaseAdmin();
  const { data: connections } = await db.from("telephony_connections").select("*").eq("org_id", orgId).order("created_at");
  const ids = (connections ?? []).map((c) => c.id);
  const { data: creds } = ids.length ? await db.from("telephony_credentials").select("*").in("connection_id", ids) : { data: [] };
  return {
    providers: providerList(),
    connections: (connections ?? []).map((c) => {
      const k = creds?.find((x) => x.connection_id === c.id);
      return {
        id: c.id,
        provider: c.provider,
        label: c.label,
        enabled: c.enabled,
        settings: c.settings ?? {},
        webhookUrl: k ? `${env.appUrl()}/api/webhooks/calls/${k.webhook_secret}` : null,
        signingSecret: k?.signing_secret ?? null,
      };
    }),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    return Response.json(await describe(orgId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const body = (await request.json()) as {
      action: "create" | "update" | "rotate";
      provider?: string;
      id?: string;
      enabled?: boolean;
      label?: string;
      settings?: { consentAnnouncement?: boolean; consentText?: string };
    };
    const db = supabaseAdmin();

    if (body.action === "create") {
      if (!body.provider || !providerById(body.provider)) throw new HttpError(400, "ספק לא נתמך");
      const { data: connection, error } = await db
        .from("telephony_connections")
        .insert({ org_id: orgId, provider: body.provider, label: body.label?.trim().slice(0, 80) || null })
        .select("id")
        .single();
      if (error?.code === "23505") throw new HttpError(409, "כבר יש חיבור לספק הזה");
      if (error || !connection) throw error ?? new Error("יצירת החיבור נכשלה");
      const { error: credError } = await db.from("telephony_credentials").insert({ connection_id: connection.id });
      if (credError) throw credError;
    } else {
      if (!body.id) throw new HttpError(400, "חסר חיבור");
      const { data: own } = await db.from("telephony_connections").select("id, settings").eq("id", body.id).eq("org_id", orgId).maybeSingle();
      if (!own) throw new HttpError(404, "החיבור לא נמצא");
      if (body.action === "rotate") {
        // New URL secret and new signing secret: the old ones stop working at once.
        const fresh = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
        await db.from("telephony_credentials").update({ webhook_secret: fresh(), signing_secret: fresh(), updated_at: new Date().toISOString() }).eq("connection_id", own.id);
      } else {
        const patch: Record<string, unknown> = {};
        if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
        if (typeof body.label === "string") patch.label = body.label.trim().slice(0, 80) || null;
        if (body.settings) {
          patch.settings = {
            ...(own.settings as object),
            consentAnnouncement: Boolean(body.settings.consentAnnouncement),
            consentText: (body.settings.consentText ?? "").trim().slice(0, 300),
          };
        }
        if (Object.keys(patch).length) await db.from("telephony_connections").update(patch).eq("id", own.id);
      }
    }
    return Response.json(await describe(orgId));
  } catch (err) {
    return errorResponse(err);
  }
}
