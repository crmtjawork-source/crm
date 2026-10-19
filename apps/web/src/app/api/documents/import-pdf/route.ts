import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { pdfToSections } from "@/lib/server/pdfImport";

// Turns an uploaded PDF into document-template sections (nothing is saved
// here — the browser creates the template from the result).
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "לא התקבל קובץ");
    if (file.size > 4 * 1024 * 1024) throw new HttpError(413, "הקובץ גדול מ-4MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new HttpError(400, "הקובץ אינו PDF");
    const result = await pdfToSections(bytes);
    if (!result.sections.length) throw new HttpError(422, "לא נמצא טקסט בקובץ — ייתכן שזה מסמך סרוק (תמונה)");
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
