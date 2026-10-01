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
