import { after } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { declineDocument, DocumentError, getPublicDocument, openDocument, pingDocument, signDocument } from "@/lib/server/documents";
import { sendPendingPushes } from "@/lib/server/push";

// Public (no login): the unguessable token in the link is the only
// credential. It can read the document, report reading time, sign or decline.

function meta(request: Request) {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "",
    ua: request.headers.get("user-agent") ?? "",
  };
}

export async function GET(_request: Request, ctx: RouteContext<"/api/public/documents/[token]">) {
  const { token } = await ctx.params;
  const doc = await getPublicDocument(supabaseAdmin(), token);
  if (!doc) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(doc, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/public/documents/[token]">) {
  const { token } = await ctx.params;
  const db = supabaseAdmin();
  try {
    // sendBeacon posts text/plain.
    const body = JSON.parse(await request.text()) as {
      action?: string;
      session?: string;
      seconds?: number;
      sections?: Record<string, number>;
      name?: string;
      fields?: Record<string, string>;
      image?: string;
      agreed?: boolean;
      reason?: string;
    };
    switch (body.action) {
      case "open":
        await openDocument(db, token, body.session ?? "", meta(request));
        break;
      case "ping":
        await pingDocument(db, token, body.session ?? "", body.seconds ?? 0, body.sections ?? {});
        return Response.json({ ok: true });
      case "sign":
        await signDocument(db, token, body, meta(request));
        break;
      case "decline":
        await declineDocument(db, token, body.reason ?? "");
        break;
      default:
        return Response.json({ error: "פעולה לא מוכרת" }, { status: 400 });
    }
    after(() => sendPendingPushes(db));
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof DocumentError) return Response.json({ error: err.message }, { status: 409 });
    console.error("document action failed", err);
    return Response.json({ error: "הפעולה נכשלה — נסו שוב" }, { status: 500 });
  }
}
