import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { MEDIA_BUCKET, storeMessageMedia } from "@/lib/server/waMedia";

export const maxDuration = 60;

// A short-lived URL for one WhatsApp message's media. The person must be able
// to read the message (row-level security decides: personal chats belong to
// their owner). Media not yet saved is fetched from WhatsApp now.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { messageId } = (await request.json()) as { messageId?: string };
    if (!messageId) throw new HttpError(400, "חסר מזהה הודעה");

    const { data: visible } = await user.db.from("messages").select("id, conversation_id").eq("id", messageId).maybeSingle();
    if (!visible) throw new HttpError(404, "ההודעה לא נמצאה");

    const db = supabaseAdmin();
    const { data: message } = await db.from("messages").select("*").eq("id", messageId).single();
    if (!message) throw new HttpError(404, "ההודעה לא נמצאה");
    let path: string | null = message.media_path;
    let failed = Boolean(message.media_failed);
    if (!path && !failed) {
      const { data: conv } = await db.from("conversations").select("channel_id").eq("id", message.conversation_id).single();
      const { data: channel } = conv ? await db.from("channels").select("*").eq("id", conv.channel_id).single() : { data: null };
      if (channel) path = await storeMessageMedia(db, channel, message);
      failed = !path;
    }
    if (!path) return Response.json({ available: false });
    const { data: signed, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    if (error || !signed) throw new HttpError(500, "יצירת הקישור נכשלה");
    const { data: fresh } = await db.from("messages").select("media_mime, media_name, media_size").eq("id", messageId).single();
    return Response.json({ available: true, url: signed.signedUrl, mime: fresh?.media_mime ?? message.media_mime, name: fresh?.media_name ?? message.media_name, size: fresh?.media_size ?? message.media_size });
  } catch (err) {
    return errorResponse(err);
  }
}
