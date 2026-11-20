import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { authUrl, googleConfigured, makeState } from "@/lib/server/googleCalendar";
import { DRIVE_FILE_SCOPE, DRIVE_FULL_SCOPE, parseFolderRef } from "@/lib/server/driveCore";
import { driveApi, processDriveJobs } from "@/lib/server/drive";

// Google Drive settings for the business (owners / admins only).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const db = supabaseAdmin();
    const body = (await request.json()) as { action: string; folderTemplate?: string; rootFolder?: string; rootFolderName?: string; autoSaveSigned?: boolean };

    if (body.action === "start") {
      if (!googleConfigured()) throw new HttpError(503, "חיבור גוגל עוד לא הוגדר במערכת");
      const redirectUri = `${new URL(request.url).origin}/api/integrations/google/callback`;
      // drive.file = only files the CRM creates. A pre-existing folder needs full Drive access.
      const scope = process.env.GOOGLE_DRIVE_FULL_SCOPE === "1" ? DRIVE_FULL_SCOPE : DRIVE_FILE_SCOPE;
      return Response.json({ url: authUrl(redirectUri, makeState(user.userId, orgId, "drive"), ["openid", "email", scope]) });
    }
    if (body.action === "disconnect") {
      await db.from("drive_credentials").delete().eq("org_id", orgId);
      await db.from("drive_settings").delete().eq("org_id", orgId);
      return Response.json({ ok: true });
    }
    if (body.action === "save_settings") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.folderTemplate === "string") patch.folder_template = body.folderTemplate.trim().slice(0, 120) || "{{name}}";
      if (typeof body.autoSaveSigned === "boolean") patch.auto_save_signed = body.autoSaveSigned;
      if (typeof body.rootFolderName === "string" && body.rootFolderName.trim()) patch.root_folder_name = body.rootFolderName.trim().slice(0, 120);
      if (typeof body.rootFolder === "string") {
        if (!body.rootFolder.trim()) {
          // Back to "the CRM makes its own folder".
          patch.root_folder_id = null;
          patch.root_folder_url = null;
        } else {
          const id = parseFolderRef(body.rootFolder);
          if (!id) throw new HttpError(400, "קישור או מזהה תיקייה לא תקין");
          try {
            const f = await driveApi(db, orgId).get(id);
            if (f.mimeType !== "application/vnd.google-apps.folder") throw new HttpError(400, "זו לא תיקייה");
            patch.root_folder_id = f.id;
            patch.root_folder_name = f.name ?? "תיקיית לקוחות";
            patch.root_folder_url = f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`;
          } catch (err) {
            if (err instanceof HttpError) throw err;
            throw new HttpError(
              400,
              "אין גישה לתיקייה הזו. בהרשאת ברירת המחדל המערכת רואה רק תיקיות שהיא יצרה בעצמה — השאירו את השדה ריק והמערכת תיצור תיקיית שורש, או בקשו הפעלת גישה מלאה לדרייב."
            );
          }
        }
      }
      const { error } = await db.from("drive_settings").update(patch).eq("org_id", orgId);
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (body.action === "retry_failed") {
      await db.from("drive_jobs").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), locked_at: null }).eq("org_id", orgId).eq("status", "failed");
      const r = await processDriveJobs(db, { orgId, limit: 10 });
      return Response.json({ ok: true, ...r });
    }
    throw new HttpError(400, "פעולה לא מוכרת");
  } catch (err) {
    return errorResponse(err);
  }
}
