import { errorResponse, HttpError, requireUser } from "@/lib/server/auth";
import { publicRow, retryRecording } from "@/lib/server/recordings";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await ctx.params;
    const { data: rec } = await user.db.from("call_recordings").select("id").eq("id", id).maybeSingle();
    if (!rec) throw new HttpError(404, "ההקלטה לא נמצאה");
    return Response.json({ recording: publicRow(await retryRecording(id)) });
  } catch (err) {
    return errorResponse(err);
  }
}
