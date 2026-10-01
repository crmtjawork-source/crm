import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { resumeDueRuns } from "@/lib/server/automations";
import { retryPendingWebhookEvents } from "@/lib/server/webhooks/process";

// Hit every minute by a scheduler (Supabase pg_cron + pg_net, or Vercel
// Cron) with `Authorization: Bearer <CRON_SECRET>`. Resumes automation runs
// whose wait elapsed and retries webhook events that failed to process.

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
  return Response.json({ resumed, retried });
}

export const GET = run;
export const POST = run;
