import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { bookSlot, BookingError, getBookingView } from "@/lib/server/booking";

// Public (no login): the unguessable per-lead token in the URL is the only
// credential, and it can do exactly one thing — book that lead's call.

export async function GET(_request: Request, ctx: RouteContext<"/api/public/booking/[token]">) {
  const { token } = await ctx.params;
  const view = await getBookingView(supabaseAdmin(), token);
  return Response.json(view, { status: view.status === "not_found" ? 404 : 200 });
}

export async function POST(request: Request, ctx: RouteContext<"/api/public/booking/[token]">) {
  const { token } = await ctx.params;
  try {
    const { start } = (await request.json()) as { start?: string };
    if (!start || Number.isNaN(Date.parse(start))) return Response.json({ error: "לא נבחרה שעה" }, { status: 400 });
    const booking = await bookSlot(supabaseAdmin(), token, new Date(start).toISOString());
    return Response.json(booking);
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 409 });
    console.error("booking failed", err);
    return Response.json({ error: "קביעת השיחה נכשלה — נסו שוב" }, { status: 500 });
  }
}
