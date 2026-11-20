import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { advance, createRecording, publicRow, routeSource } from "@/lib/server/recordings";
import { loadAiConfig } from "@/lib/server/ai/settings";
import { getSttProvider } from "@/lib/server/ai/stt";

export const maxDuration = 300;

type Body = { contactId?: string; url?: string; title?: string; sourcePath?: string; fileName?: string; size?: number; chunkPaths?: string[]; chunkOffsets?: number[] };

// Create a recording on a lead: from a link (Zoom / Drive / direct), from a file
// already uploaded to storage, or from pieces the browser cut. Then the first step runs.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as Body;
    if (!body.contactId) throw new HttpError(400, "חסר ליד");
    // RLS on the user's client: finding the lead proves access to it.
    const { data: contact } = await user.db.from("contacts").select("id, org_id").eq("id", body.contactId).maybeSingle();
    if (!contact) throw new HttpError(404, "הליד לא נמצא");
    const orgId: string = contact.org_id;
    const prefix = `${orgId}/recordings/`;
    const ownPath = (p: string) => p.startsWith(prefix) && !p.includes("..");

    const url = body.url?.trim();
    if (url) {
      if (!/^https?:\/\//i.test(url)) throw new HttpError(400, "הקישור חייב להתחיל ב-https://");
    } else if (body.chunkPaths?.length) {
      if (!body.chunkPaths.every(ownPath)) throw new HttpError(400, "נתיב קובץ לא תקין");
    } else if (!body.sourcePath || !ownPath(body.sourcePath)) throw new HttpError(400, "חסר קישור או קובץ");

    const created = await createRecording({
      orgId,
      contactId: contact.id,
      userId: user.userId,
      title: body.title,
      url,
      chunkPaths: body.chunkPaths,
      chunkOffsets: body.chunkOffsets,
    });
    let row = created;
    if (!url && !body.chunkPaths?.length) {
      // An uploaded original: transcribe directly, or ask the browser to cut it up.
      try {
        const cfg = await loadAiConfig(orgId);
        getSttProvider(cfg); // fail early if no engine is configured
        row = await routeSource(created, cfg, body.sourcePath!, body.size ?? 0, body.fileName ?? body.sourcePath!);
      } catch (err) {
        row = (await (await import("@/lib/server/supabaseAdmin")).supabaseAdmin().from("call_recordings").update({ status: "failed", error: err instanceof Error ? err.message : "שגיאה", source_path: body.sourcePath }).eq("id", created.id).select().single()).data!;
        return Response.json({ recording: publicRow(row) });
      }
    }
    if (["fetching", "transcribing"].includes(row.status)) row = await advance(row.id);
    return Response.json({ recording: publicRow(row) });
  } catch (err) {
    return errorResponse(err);
  }
}
