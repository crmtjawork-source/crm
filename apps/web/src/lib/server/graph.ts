import "server-only";
import { env } from "./env";

export class GraphError extends Error {
  constructor(
    message: string,
    public code?: number,
    public status?: number
  ) {
    super(message);
  }
}

export async function graphFetch<T>(
  path: string,
  accessToken: string,
  init: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${env.graphVersion()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new GraphError(e.error_user_msg || e.message || `Graph API ${res.status}`, e.code, res.status);
  }
  return json as T;
}

// A Page token that doesn't expire: the token Meta tools hand out (Graph API
// Explorer, a user or Page token) lives an hour or two. Exchanged with the
// app secret it becomes long-lived, and a Page token read with a long-lived
// user token never expires. Falls back to the given token when the exchange
// isn't possible.
export async function permanentPageToken(pageId: string, token: string): Promise<string> {
  const appId = env.metaAppId();
  const secret = env.metaAppSecret();
  let longLived = token;
  if (appId && secret) {
    const url = new URL(`https://graph.facebook.com/${env.graphVersion()}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", secret);
    url.searchParams.set("fb_exchange_token", token);
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.access_token) longLived = json.access_token;
  }
  try {
    const page = await graphFetch<{ access_token?: string }>(pageId, longLived, { query: { fields: "access_token" } });
    if (page.access_token) return page.access_token;
  } catch {
    // Already a Page token: Meta doesn't return it again.
  }
  return longLived;
}
