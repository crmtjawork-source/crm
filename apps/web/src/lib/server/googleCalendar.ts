import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "./supabaseAdmin";
import { env } from "./env";

// One-way sync: meetings in the CRM → the owner's Google Calendar.
// Changes to appointments are queued by a database trigger
// (calendar_sync_jobs) and pushed by the cron job.

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
const TZ = "Asia/Jerusalem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function googleConfigured(): boolean {
  return !!(env.googleClientId() && env.googleClientSecret() && env.oauthStateSecret());
}

function sign(payload: string): string {
  return createHmac("sha256", env.oauthStateSecret()!).update(payload).digest("base64url");
}

export function makeState(userId: string, orgId: string, kind: "personal" | "company" = "personal"): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, o: orgId, k: kind, e: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string): { userId: string; orgId: string; kind: "personal" | "company" } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (Date.now() > data.e) return null;
  return { userId: data.u, orgId: data.o, kind: data.k === "company" ? "company" : "personal" };
}

export function authUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: env.googleClientId()!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.googleClientId()!, client_secret: env.googleClientSecret()!, ...params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google: ${json.error_description || json.error || res.status}`);
  return json as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  let email: string | null = null;
  if (t.id_token) {
    try {
      email = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch {
      email = null;
    }
  }
  return { ...t, email };
}

async function accessToken(db: Db, connectionId: string): Promise<string> {
  const { data: c } = await db.from("calendar_credentials").select("*").eq("connection_id", connectionId).single();
  if (!c) throw new Error("אין הרשאת גוגל שמורה");
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 60_000) return c.access_token;
  const t = await tokenRequest({ refresh_token: c.refresh_token, grant_type: "refresh_token" });
  await db
    .from("calendar_credentials")
    .update({ access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() })
    .eq("connection_id", connectionId);
  return t.access_token;
}

async function gcal(token: string, method: string, path: string, body?: unknown): Promise<Row | null> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 410) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Google Calendar ${res.status}: ${json.error?.message ?? ""}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

function eventBody(a: Row, contact: Row | null, origin: string, agent?: string | null) {
  const link = contact ? `${origin}/contacts/${contact.id}` : origin;
  const description = [
    agent ? `נציג: ${agent}` : null,
    contact ? `ליד: ${contact.name}` : null,
    contact?.phone ? `טלפון: ${contact.phone}` : null,
    a.notes ? `\n${a.notes}` : null,
    `\nבמערכת: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
  const url = (a.notes ?? "").match(/https?:\/\/\S+/)?.[0];
  return {
    summary: a.title,
    description,
    location: url ?? (a.notes && a.notes.length < 120 ? a.notes : undefined),
    start: { dateTime: a.start_at, timeZone: TZ },
    end: { dateTime: a.end_at, timeZone: TZ },
    extendedProperties: { private: { crmAppointmentId: a.id } },
  };
}

async function connectionFor(db: Db, userId: string | null): Promise<Row | null> {
  if (!userId) return null;
  const { data } = await db.from("calendar_connections").select("*").eq("user_id", userId).eq("provider", "google").eq("kind", "personal").maybeSingle();
  return data;
}

async function companyConnection(db: Db, orgId: string | null): Promise<Row | null> {
  if (!orgId) return null;
  const { data } = await db.from("calendar_connections").select("*").eq("org_id", orgId).eq("provider", "google").eq("kind", "company").maybeSingle();
  return data;
}

export async function processCalendarJobs(db: Db, origin: string): Promise<number> {
  if (!googleConfigured()) return 0;
  const { data: jobs } = await db.from("calendar_sync_jobs").select("*").is("done_at", null).lt("attempts", 5).order("created_at").limit(30);
  let done = 0;
  for (const job of jobs ?? []) {
    const finish = (error: string | null) =>
      db.from("calendar_sync_jobs").update({ done_at: error ? null : new Date().toISOString(), error, attempts: job.attempts + 1 }).eq("id", job.id);
    try {
      const company = job.target === "company";
      const conn = company ? await companyConnection(db, job.org_id) : await connectionFor(db, job.owner_user_id);
      if (!conn) {
        await db.from("calendar_sync_jobs").update({ done_at: new Date().toISOString(), error: company ? "יומן החברה לא מחובר" : "לבעל הפגישה אין יומן גוגל מחובר" }).eq("id", job.id);
        continue;
      }
      const token = await accessToken(db, conn.id);
      const cal = encodeURIComponent(conn.calendar_id);
      if (job.op === "delete") {
        if (job.google_event_id) await gcal(token, "DELETE", `calendars/${cal}/events/${encodeURIComponent(job.google_event_id)}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
        await finish(null);
        done++;
        continue;
      }
      const { data: a } = await db.from("appointments").select("*").eq("id", job.appointment_id).maybeSingle();
      if (!a) {
        await finish(null);
        continue;
      }
      const { data: contact } = a.contact_id ? await db.from("contacts").select("id, name, phone").eq("id", a.contact_id).maybeSingle() : { data: null };
      let agent: string | null = null;
      if (company && a.owner_user_id) {
        const { data: u } = await db.from("users").select("full_name, email").eq("id", a.owner_user_id).maybeSingle();
        agent = u?.full_name || u?.email || null;
      }
      const body = eventBody(a, contact, origin, agent);
      const idColumn = company ? "company_google_event_id" : "google_event_id";
      let eventId = a[idColumn] as string | null;
      if (eventId) {
        try {
          await gcal(token, "PATCH", `calendars/${cal}/events/${encodeURIComponent(eventId)}`, body);
        } catch (e) {
          if ((e as { status?: number }).status !== 404) throw e;
          eventId = null; // deleted in Google — create it again
        }
      }
      if (!eventId) {
        const created = await gcal(token, "POST", `calendars/${cal}/events`, body);
        await db.from("appointments").update({ [idColumn]: created?.id ?? null }).eq("id", a.id);
      }
      await db.from("calendar_connections").update({ last_error: null }).eq("id", conn.id);
      await finish(null);
      done++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finish(message);
      if (/invalid_grant/.test(message) && job.owner_user_id) {
        await db.from("calendar_connections").update({ last_error: "ההרשאה לגוגל בוטלה — צריך לחבר מחדש" }).eq("user_id", job.owner_user_id);
      }
    }
  }
  return done;
}
