import "server-only";
import { env } from "./env";

export function emailConfigured(): boolean {
  return !!(env.resendApiKey() && env.emailFrom());
}

// Plain-text email through Resend. Throws when not configured so callers can
// fall back to something else (hold / task).
export async function sendEmail(args: { to: string; subject: string; text: string }): Promise<void> {
  const key = env.resendApiKey();
  const from = env.emailFrom();
  if (!key || !from) throw new Error("שליחת אימייל לא מוגדרת (חסר RESEND_API_KEY / EMAIL_FROM)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [args.to], subject: args.subject, text: args.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`שליחת האימייל נכשלה (${res.status})`);
}
