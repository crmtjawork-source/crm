import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { extractPaymentSchedule } from "@/lib/server/payments";

export const maxDuration = 60;

// Reads a contract stored in the lead's files with Claude and returns a PROPOSED payment
// schedule. Nothing is saved: the browser shows it for review and confirms separately.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const { fileId } = (await request.json()) as { fileId?: string };
    if (!fileId) throw new HttpError(400, "חסר קובץ");
    // Through the user's own session, so they can only read files they can see.
    const { data: file } = await user.db.from("files").select("id, org_id, name, path, mime, size").eq("id", fileId).maybeSingle();
    if (!file || file.org_id !== orgId) throw new HttpError(404, "הקובץ לא נמצא");
    if ((file.size ?? 0) > 20 * 1024 * 1024) throw new HttpError(413, "הקובץ גדול מ-20MB");
    const dl = await supabaseAdmin().storage.from("files").download(file.path);
    if (dl.error || !dl.data) throw new HttpError(404, "לא ניתן לקרוא את הקובץ");
    const lower = String(file.name).toLowerCase();
    const mime = file.mime || (lower.endsWith(".pdf") ? "application/pdf" : lower.match(/\.jpe?g$/) ? "image/jpeg" : lower.endsWith(".png") ? "image/png" : "");
    const result = await extractPaymentSchedule(new Uint8Array(await dl.data.arrayBuffer()), mime);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
