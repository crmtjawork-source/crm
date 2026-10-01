import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { requestCoexistenceSyncs, within24hOfOnboarding } from "@/lib/server/embeddedSignup";

// Retries the coexistence contacts/history sync if the first attempt failed
// (typically because the webhook wasn't reachable yet). Meta only honours it
// within 24h of onboarding; after that the number must be onboarded again.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const { channelId } = (await request.json()) as { channelId?: string };
    if (!channelId) throw new HttpError(400, "חסר channelId");

    const db = supabaseAdmin();
    const { data: channel } = await db.from("channels").select("*").eq("id", channelId).eq("org_id", orgId).maybeSingle();
    if (!channel) throw new HttpError(404, "הערוץ לא נמצא");
    if (channel.onboarding !== "coexistence") throw new HttpError(400, "סנכרון היסטוריה קיים רק למספר שחובר מאפליקציית WhatsApp Business");
    if (!within24hOfOnboarding(channel)) {
      throw new HttpError(409, "עברו יותר מ-24 שעות מהחיבור — מטא מאפשרים סנכרון רק אחרי חיבור מחדש של המספר");
    }

    const { data: creds } = await db.from("channel_credentials").select("access_token").eq("channel_id", channel.id).maybeSingle();
    if (!creds) throw new HttpError(400, "לערוץ אין טוקן שמור");
    const notes = await requestCoexistenceSyncs(db, channel, creds.access_token);
    return Response.json({ notes });
  } catch (err) {
    return errorResponse(err);
  }
}
