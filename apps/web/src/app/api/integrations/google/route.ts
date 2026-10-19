import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { authUrl, googleConfigured, makeState } from "@/lib/server/googleCalendar";

// Start linking (returns Google's consent URL) or unlink your Google Calendar.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const { action } = (await request.json()) as { action: "start" | "disconnect" };
    if (action === "start") {
      if (!googleConfigured()) throw new HttpError(503, "חיבור ליומן גוגל עוד לא הוגדר במערכת");
      const redirectUri = `${new URL(request.url).origin}/api/integrations/google/callback`;
      return Response.json({ url: authUrl(redirectUri, makeState(user.userId, orgId)) });
    }
    if (action === "disconnect") {
      await supabaseAdmin().from("calendar_connections").delete().eq("user_id", user.userId).eq("org_id", orgId).eq("provider", "google");
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "פעולה לא מוכרת");
  } catch (err) {
    return errorResponse(err);
  }
}
