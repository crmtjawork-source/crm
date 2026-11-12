import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import * as evo from "@/lib/server/evolution";

// Profile pictures for the chats on screen (contacts and groups), fetched from
// WhatsApp and remembered. Only chats the signed-in person may read are touched
// (row-level security), at most 12 per call, and a chat is re-checked at most
// once a day (WhatsApp's picture links expire).
const DAY = 86400000;

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { ids } = (await request.json()) as { ids?: string[] };
    if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "חסרות שיחות");
    const { data: convs } = await user.db.from("conversations").select("id, channel_id, wa_jid, external_thread_id, avatar_url, avatar_checked_at").in("id", ids.slice(0, 40));
    const due = (convs ?? [])
      .filter((c) => c.wa_jid && !c.wa_jid.endsWith("@lid") && (!c.avatar_checked_at || Date.now() - new Date(c.avatar_checked_at).getTime() > (c.avatar_url ? 6 * 3600000 : DAY)))
      .slice(0, 12);
    if (!due.length) return Response.json({ avatars: {} });

    const db = supabaseAdmin();
    const { data: channels } = await db.from("channels").select("id, provider, external_id").in("id", [...new Set(due.map((c) => c.channel_id))]);
    const nameOf = new Map((channels ?? []).filter((c) => c.provider === "evolution").map((c) => [c.id, c.external_id as string]));

    const avatars: Record<string, string | null> = {};
    await Promise.all(
      due.map(async (c) => {
        const instance = nameOf.get(c.channel_id);
        if (!instance) return;
        const url = await evo.profilePictureUrl(instance, c.wa_jid as string);
        avatars[c.id] = url;
        await db.from("conversations").update({ avatar_url: url, avatar_checked_at: new Date().toISOString() }).eq("id", c.id);
      })
    );
    return Response.json({ avatars });
  } catch (err) {
    return errorResponse(err);
  }
}
