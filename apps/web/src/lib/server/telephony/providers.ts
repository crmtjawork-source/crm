import "server-only";
import type { TelephonyProvider } from "./types";
import { genericProvider } from "./generic";
import { voicenterProvider } from "./voicenter";

// To plug in a phone system: add an adapter file (verify + parse, optionally
// clickToCall) next to generic.ts and list it here. Nothing else changes —
// the webhook route, the dedupe, the lead matching and the UI are shared.
const PROVIDERS: Record<string, TelephonyProvider> = {
  [genericProvider.id]: genericProvider,
  [voicenterProvider.id]: voicenterProvider,
};

export const providerById = (id: string): TelephonyProvider | null => PROVIDERS[id] ?? null;
export const providerList = () => Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label }));
