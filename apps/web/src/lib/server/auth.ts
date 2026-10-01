import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type AuthedUser = {
  userId: string;
  // Runs as the signed-in user, so RLS decides what they can read/write.
  db: SupabaseClient;
};

// The browser app keeps its Supabase session in localStorage (not cookies),
// so API calls carry the access token as a Bearer header.
export async function requireUser(request: Request): Promise<AuthedUser> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "לא מחובר");

  const db = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "החיבור פג — יש להתחבר מחדש");
  return { userId: data.user.id, db };
}

export async function requireOrgRole(
  user: AuthedUser,
  orgId: string,
  roles: Array<"owner" | "admin" | "agent">
): Promise<void> {
  const { data } = await user.db
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.userId)
    .maybeSingle();
  if (!data || !roles.includes(data.role)) throw new HttpError(403, "אין הרשאה לפעולה הזו");
}

export async function requireOwnOrg(user: AuthedUser): Promise<string> {
  const { data } = await user.db.from("memberships").select("org_id").eq("user_id", user.userId).limit(1).maybeSingle();
  if (!data) throw new HttpError(403, "המשתמש לא משויך לארגון");
  return data.org_id;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: err instanceof Error ? err.message : "שגיאה לא צפויה" }, { status: 500 });
}
