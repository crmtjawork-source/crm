import { supabase } from "./supabaseClient";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `שגיאה ${res.status}`, res.status, json.code);
  return json as T;
}
