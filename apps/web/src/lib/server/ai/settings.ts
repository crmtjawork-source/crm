import "server-only";
import { env } from "../env";
import { supabaseAdmin } from "../supabaseAdmin";

export type SttProviderId = "soniox" | "openai" | "groq" | "custom" | "mock";

export type AiConfig = {
  sttProvider: SttProviderId | null;
  sttBaseUrl: string | null;
  sttModel: string | null;
  sttApiKey: string | null;
  llmApiKey: string | null;
  llmModel: string;
  zoom: { accountId: string; clientId: string; clientSecret: string } | null;
};

export const DEFAULT_LLM_MODEL = "claude-sonnet-5-5";

// Per-org config from org_ai_settings (service-role only), falling back to env vars.
export async function loadAiConfig(orgId: string): Promise<AiConfig> {
  const { data } = await supabaseAdmin().from("org_ai_settings").select("*").eq("org_id", orgId).maybeSingle();
  const zoomAccountId = data?.zoom_account_id || env.zoomAccountId();
  const zoomClientId = data?.zoom_client_id || env.zoomClientId();
  const zoomClientSecret = data?.zoom_client_secret || env.zoomClientSecret();
  return {
    sttProvider: ((data?.stt_provider as SttProviderId | null) || (env.sttProvider() as SttProviderId | null)) ?? null,
    sttBaseUrl: data?.stt_base_url || null,
    sttModel: data?.stt_model || null,
    sttApiKey: data?.stt_api_key || env.sttApiKey(),
    llmApiKey: data?.llm_api_key || env.anthropicApiKey(),
    llmModel: data?.llm_model || env.anthropicModel(),
    zoom: zoomAccountId && zoomClientId && zoomClientSecret ? { accountId: zoomAccountId, clientId: zoomClientId, clientSecret: zoomClientSecret } : null,
  };
}
