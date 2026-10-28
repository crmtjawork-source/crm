import "server-only";
import type { Db } from "./supabaseAdmin";
import * as evo from "./evolution";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const MEDIA_BUCKET = "whatsapp-media";
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "application/pdf": "pdf",
};

// Fetches a message's media from WhatsApp (once) and keeps it in Storage.
// Returns the storage path, or null when WhatsApp no longer has the file
// (old history media) — the message is then marked so we don't keep trying.
export async function storeMessageMedia(db: Db, channel: Row, message: Row): Promise<string | null> {
  if (message.media_path) return message.media_path;
  if (!message.payload?.message) return null;
  try {
    const media = await evo.getMediaBase64(channel.external_id, { key: message.payload.key, message: message.payload.message });
    const buffer = Buffer.from(media.base64, "base64");
    const mime = (media.mimetype ?? message.media_mime ?? "application/octet-stream").split(";")[0];
    const ext = EXT[mime] ?? (message.media_name?.split(".").pop() || "bin");
    const path = `${message.org_id}/${channel.id}/${message.id}.${ext}`;
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, buffer, { contentType: mime, upsert: true });
    if (error) throw error;
    await db.from("messages").update({ media_path: path, media_mime: mime, media_name: media.fileName ?? message.media_name ?? null, media_size: buffer.length, media_failed: false }).eq("id", message.id);
    return path;
  } catch (err) {
    console.error("whatsapp media fetch failed", message.id, err instanceof Error ? err.message : err);
    await db.from("messages").update({ media_failed: true }).eq("id", message.id);
    return null;
  }
}
