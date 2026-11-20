import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getShareFileUrl } from "@/lib/server/shares";

// Public: redirects to a short-lived signed URL of a file the share names.
export async function GET(_request: Request, ctx: RouteContext<"/api/public/shares/[token]/file/[fileId]">) {
  const { token, fileId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return new Response("not found", { status: 404 });
  const file = await getShareFileUrl(supabaseAdmin(), token, fileId);
  if (!file) return new Response("not found", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: file.url, "Cache-Control": "private, max-age=120", "Referrer-Policy": "no-referrer" } });
}
