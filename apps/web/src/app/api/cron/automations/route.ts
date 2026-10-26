import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { resumeDueRuns } from "@/lib/server/automations";
import { retryPendingWebhookEvents } from "@/lib/server/webhooks/process";
import { sendDueScheduledMessages } from "@/lib/server/leadMessages";
import { sendPendingPushes } from "@/lib/server/push";
import { processCalendarJobs } from "@/lib/server/googleCalendar";
import { pollLeadAdPages } from "@/lib/server/webhooks/leadgen";

// Hit every minute by a scheduler (Supabase pg_cron + pg_net, or Vercel
// Cron) with `Authorization: Bearer <CRON_SECRET>`. Resumes automation runs
// whose wait elapsed, retries webhook events that failed to process, and
// sends scheduled messages (meeting reminders) that are due, and polls
// connected Facebook Pages for new lead-form submissions.

function authorized(request: Request): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function run(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const db = supabaseAdmin();
  const resumed = await resumeDueRuns(db);
  const retried = await retryPendingWebhookEvents(db);
  const reminders = await sendDueScheduledMessages(db);
  const pushes = await sendPendingPushes(db);
  const calendar = await processCalendarJobs(db, new URL(request.url).origin);
  const leadAds = await pollLeadAdPages(db);
  return Response.json({ resumed, retried, reminders, pushes, calendar, leadAds });
}

export const GET = run;
export const POST = run;
