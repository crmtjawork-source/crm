import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { authUrl, googleConfigured, makeState } from "@/lib/server/googleCalendar";

// Start linking (returns Google's consent URL) or unlink your Google Calendar.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const { action } = (await request.json()) as { action: "start" | "disconnect" | "start_company" | "disconnect_company" };
    // The company calendar is set up once by an owner / admin.
    if (action === "start_company" || action === "disconnect_company") {
      await requireOrgRole(user, orgId, ["owner", "admin"]);
      if (action === "disconnect_company") {
        await supabaseAdmin().from("calendar_connections").delete().eq("org_id", orgId).eq("provider", "google").eq("kind", "company");
        return Response.json({ ok: true });
      }
      if (!googleConfigured()) throw new HttpError(503, "חיבור ליומן גוגל עוד לא הוגדר במערכת");
      const redirectUri = `${new URL(request.url).origin}/api/integrations/google/callback`;
      return Response.json({ url: authUrl(redirectUri, makeState(user.userId, orgId, "company")) });
    }
    if (action === "start") {
      if (!googleConfigured()) throw new HttpError(503, "חיבור ליומן גוגל עוד לא הוגדר במערכת");
      const redirectUri = `${new URL(request.url).origin}/api/integrations/google/callback`;
      return Response.json({ url: authUrl(redirectUri, makeState(user.userId, orgId)) });
    }
    if (action === "disconnect") {
      await supabaseAdmin().from("calendar_connections").delete().eq("user_id", user.userId).eq("org_id", orgId).eq("provider", "google").eq("kind", "personal");
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "פעולה לא מוכרת");
  } catch (err) {
    return errorResponse(err);
  }
}
