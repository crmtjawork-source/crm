import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { advance, publicRow, registerChunks } from "@/lib/server/recordings";

export const maxDuration = 300;

// Advance one step. With chunkPaths: the browser finished cutting a big file.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await ctx.params;
    const { data: rec } = await user.db.from("call_recordings").select("id, org_id, status").eq("id", id).maybeSingle();
    if (!rec) throw new HttpError(404, "ההקלטה לא נמצאה");
    const body = (await request.json().catch(() => ({}))) as { chunkPaths?: string[]; chunkOffsets?: number[] };
    if (body.chunkPaths?.length) {
      if (rec.status !== "awaiting_chunks") throw new HttpError(409, "ההקלטה לא ממתינה לחיתוך");
      const prefix = `${rec.org_id}/recordings/`;
      if (!body.chunkPaths.every((p) => p.startsWith(prefix) && !p.includes(".."))) throw new HttpError(400, "נתיב קובץ לא תקין");
      await registerChunks(id, body.chunkPaths, body.chunkOffsets ?? body.chunkPaths.map(() => 0));
    }
    return Response.json({ recording: publicRow(await advance(id)) });
  } catch (err) {
    return errorResponse(err);
  }
}
