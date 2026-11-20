import "server-only";
import type { Db } from "./supabaseAdmin";
import { hasDriveScope } from "./driveCore";

// OAuth callback for the Drive connection: stores the account + granted scopes.
// If the user unticked the Drive permission on Google's consent screen the
// scopes lack it, and settings shows "reconnect to grant Drive".
export async function handleDriveConnected(
  db: Db,
  state: { userId: string; orgId: string },
  t: { access_token: string; expires_in: number; refresh_token?: string; email: string | null; scope?: string },
  origin: string
): Promise<Response> {
  const back = (r: string) => Response.redirect(`${origin}/settings/drive?google=${r}`, 302);
  const ok = hasDriveScope(t.scope);
  const { error } = await db.from("drive_settings").upsert(
    {
      org_id: state.orgId,
      account_email: t.email,
      scopes: t.scope ?? "",
      connected_by: state.userId,
      last_error: ok ? null : "לא אושרה הרשאת דרייב",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) throw error;
  await db.from("drive_credentials").upsert({
    org_id: state.orgId,
    refresh_token: t.refresh_token!,
    access_token: t.access_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  });
  if (!ok) return back("drive_no_scope");
  // Jobs that failed for lack of a connection / permission get another go.
  await db.from("drive_jobs").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), locked_at: null }).eq("org_id", state.orgId).eq("status", "failed");
  return back("drive_connected");
}
