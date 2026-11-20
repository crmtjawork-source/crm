import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { saveFileToClientDrive } from "@/lib/server/drive";

export const maxDuration = 60;

// "Save this file to the client's Drive folder". Any member can use it on a
// file they can see (RLS on the lookup); the helper is idempotent.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const { fileId } = (await request.json()) as { fileId?: string };
    if (!fileId) throw new HttpError(400, "חסר קובץ");
    const { data: visible } = await user.db.from("files").select("id").eq("id", fileId).maybeSingle();
    if (!visible) throw new HttpError(404, "הקובץ לא נמצא");
    return Response.json(await saveFileToClientDrive(supabaseAdmin(), { orgId, fileId, userId: user.userId }));
  } catch (err) {
    return errorResponse(err);
  }
}
