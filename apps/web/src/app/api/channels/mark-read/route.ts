import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import * as evo from "@/lib/server/evolution";

// Opening a chat in the CRM marks it read on the phone too (as WhatsApp Web does).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { conversationId } = (await request.json()) as { conversationId?: string };
    if (!conversationId) throw new HttpError(400, "חסרה שיחה");
    // Row-level security: only someone who may read the chat can mark it.
    const { data: conv } = await user.db.from("conversations").select("id, channel_id, wa_jid, external_thread_id").eq("id", conversationId).maybeSingle();
    if (!conv) throw new HttpError(404, "השיחה לא נמצאה");
    const db = supabaseAdmin();
    const { data: channel } = await db.from("channels").select("provider, external_id").eq("id", conv.channel_id).single();
    if (channel?.provider !== "evolution") return Response.json({ ok: true, skipped: true });
    const jid: string = conv.wa_jid ?? (/^\d+$/.test(conv.external_thread_id) ? `${conv.external_thread_id}@s.whatsapp.net` : conv.external_thread_id);
    const { data: msgs } = await db.from("messages").select("external_id").eq("conversation_id", conv.id).eq("direction", "inbound").not("external_id", "is", null).order("created_at", { ascending: false }).limit(15);
    await evo.markRead(channel.external_id, (msgs ?? []).map((m) => ({ remoteJid: jid, fromMe: false, id: m.external_id as string })));
    await db.from("conversations").update({ read_locally_at: new Date().toISOString() }).eq("id", conv.id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
