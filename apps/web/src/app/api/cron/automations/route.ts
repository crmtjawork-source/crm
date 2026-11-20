import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { releaseHeldSends, resumeDueRuns } from "@/lib/server/automations";
import { retryPendingWebhookEvents } from "@/lib/server/webhooks/process";
import { sendDueScheduledMessages } from "@/lib/server/leadMessages";
import { sendPendingPushes } from "@/lib/server/push";
import { processCalendarJobs } from "@/lib/server/googleCalendar";
import { pollLeadAdPages } from "@/lib/server/webhooks/leadgen";
import { processPaymentReminders } from "@/lib/server/payments";
import { resumeStuckRecordings } from "@/lib/server/recordings";
import { syncStaleGroups } from "@/lib/server/waGroups";
import { processDriveJobs } from "@/lib/server/drive";
import { checkGatewayHealth } from "@/lib/server/gatewayHealth";

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
  const held = await releaseHeldSends(db).catch((err) => {
    console.error("release held sends failed", err);
    return null;
  });
  const retried = await retryPendingWebhookEvents(db);
  const reminders = await sendDueScheduledMessages(db);
  const pushes = await sendPendingPushes(db);
  const calendar = await processCalendarJobs(db, new URL(request.url).origin);
  const drive = await processDriveJobs(db).catch((err) => {
    console.error("drive jobs failed", err);
    return {};
  });
  const leadAds = await pollLeadAdPages(db);
  const payments = await processPaymentReminders(db).catch((err) => {
    console.error("payment reminders failed", err);
    return 0;
  });
  const gateways = await checkGatewayHealth(db).catch((err) => {
    console.error("gateway health failed", err);
    return {};
  });
  const recordings = await resumeStuckRecordings().catch((err) => {
    console.error("recordings resume failed", err);
    return 0;
  });
  return Response.json({ recordings, resumed, held, retried, reminders, pushes, calendar, leadAds, payments, gateways });
}

export const GET = run;
export const POST = run;
