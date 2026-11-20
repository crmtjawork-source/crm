import { errorResponse, HttpError, requireOrgRole, requireOwnOrg, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { env } from "@/lib/server/env";

const KEYS = ["stt_api_key", "llm_api_key", "zoom_client_secret"] as const;

// Admin-only: transcription / summary / Zoom configuration. Secrets are write-only —
// the response says only whether each one is set.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const { data } = await supabaseAdmin().from("org_ai_settings").select("*").eq("org_id", orgId).maybeSingle();
    return Response.json({
      sttProvider: data?.stt_provider ?? env.sttProvider() ?? "",
      sttBaseUrl: data?.stt_base_url ?? "",
      sttModel: data?.stt_model ?? "",
      llmModel: data?.llm_model ?? "",
      zoomAccountId: data?.zoom_account_id ?? "",
      zoomClientId: data?.zoom_client_id ?? "",
      has: {
        sttApiKey: !!(data?.stt_api_key || env.sttApiKey()),
        llmApiKey: !!(data?.llm_api_key || env.anthropicApiKey()),
        zoomClientSecret: !!(data?.zoom_client_secret || env.zoomClientSecret()),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const orgId = await requireOwnOrg(user);
    await requireOrgRole(user, orgId, ["owner", "admin"]);
    const b = (await request.json()) as Record<string, string | null | undefined>;
    const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
    const patch: Record<string, unknown> = { org_id: orgId, updated_at: new Date().toISOString() };
    if ("sttProvider" in b) {
      if (b.sttProvider && !["soniox", "openai", "groq", "custom", "mock"].includes(b.sttProvider)) throw new HttpError(400, "מנוע תמלול לא מוכר");
      patch.stt_provider = clean(b.sttProvider);
    }
    if ("sttBaseUrl" in b) patch.stt_base_url = clean(b.sttBaseUrl);
    if ("sttModel" in b) patch.stt_model = clean(b.sttModel);
    if ("llmModel" in b) patch.llm_model = clean(b.llmModel);
    if ("zoomAccountId" in b) patch.zoom_account_id = clean(b.zoomAccountId);
    if ("zoomClientId" in b) patch.zoom_client_id = clean(b.zoomClientId);
    // A key is changed only when a value is sent; "" clears it.
    for (const [field, col] of [["sttApiKey", KEYS[0]], ["llmApiKey", KEYS[1]], ["zoomClientSecret", KEYS[2]]] as const) {
      if (field in b && typeof b[field] === "string") patch[col] = clean(b[field], 500);
    }
    const { error } = await supabaseAdmin().from("org_ai_settings").upsert(patch, { onConflict: "org_id" });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
