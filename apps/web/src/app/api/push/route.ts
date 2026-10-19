import { after } from "next/server";
import { errorResponse, HttpError, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { sendPendingPushes } from "@/lib/server/push";

// Turn phone/browser notifications on or off, or send yourself a test.
type Body =
  | { action: "subscribe"; endpoint: string; keys: { p256dh: string; auth: string } }
  | { action: "unsubscribe"; endpoint: string }
  | { action: "test" };

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    const db = supabaseAdmin();
    const body = (await request.json()) as Body;

    if (body.action === "subscribe") {
      if (!body.endpoint?.startsWith("https://") || !body.keys?.p256dh || !body.keys?.auth) throw new HttpError(400, "מנוי התראות לא תקין");
      const { error } = await db.from("push_subscriptions").upsert(
        { user_id: user.userId, org_id: orgId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null },
        { onConflict: "endpoint" }
      );
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (body.action === "unsubscribe") {
      await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.userId);
      return Response.json({ ok: true });
    }
    if (body.action === "test") {
      const { data: me } = await db.from("users").select("email").eq("id", user.userId).single();
      await db.from("notifications").insert({ org_id: orgId, text: "🔔 התראת בדיקה — ההתראות עובדות", target_email: me?.email?.toLowerCase() ?? null, url: "/settings" });
      after(() => sendPendingPushes(db));
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "פעולה לא מוכרת");
  } catch (err) {
    return errorResponse(err);
  }
}
