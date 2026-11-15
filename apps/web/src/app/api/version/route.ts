// The id of the build that is live right now — open tabs compare it to their own.
export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "" }, { headers: { "Cache-Control": "no-store" } });
}
