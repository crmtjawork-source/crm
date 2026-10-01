"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { apiPost, ApiError } from "@/lib/api";
import { loadFacebookSdk } from "@/lib/facebookSdk";

type SignupMode = "coexistence" | "new_number";
type Session = { event?: string; wabaId?: string; phoneNumberId?: string; error?: string };

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID;

// The session-info postMessage and the FB.login callback race each other;
// give the message a moment to land before giving up on it.
async function waitForSession(ref: React.RefObject<Session | null>, timeoutMs: number): Promise<Session | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (ref.current?.wabaId || ref.current?.event === "CANCEL") return ref.current;
    await new Promise((r) => setTimeout(r, 100));
  }
  return ref.current;
}

export function EmbeddedSignupPanel() {
  const { reloadIntegrations } = useStore();
  const [busy, setBusy] = useState<SignupMode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let data;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      sessionRef.current = {
        event: data.event,
        wabaId: data.data?.waba_id,
        phoneNumberId: data.data?.phone_number_id,
        error: data.data?.error_message,
      };
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!APP_ID || !CONFIG_ID) {
    return (
      <p className="text-xs text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md p-3">
        חיבור בלחיצה (Embedded Signup) עוד לא מוגדר — חסרים NEXT_PUBLIC_META_APP_ID / NEXT_PUBLIC_META_ES_CONFIG_ID. זה ייפתח אחרי
        שהאפליקציה תאושר כ-Tech Provider.
      </p>
    );
  }

  async function start(mode: SignupMode) {
    setBusy(mode);
    setMessage(null);
    sessionRef.current = null;
    try {
      const FB = await loadFacebookSdk(APP_ID!);
      const code = await new Promise<string | null>((resolve) =>
        FB.login((response) => resolve(response.authResponse?.code ?? null), {
          config_id: CONFIG_ID,
          response_type: "code",
          override_default_response_type: true,
          extras:
            mode === "coexistence"
              ? { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }
              : { setup: {}, sessionInfoVersion: "3" },
        })
      );
      const session = await waitForSession(sessionRef, 3000);
      if (!code || session?.event === "CANCEL") {
        setMessage(session?.error ? `החיבור לא הושלם: ${session.error}` : "החיבור בוטל");
        return;
      }
      if (!session?.wabaId) {
        setMessage("מטא לא החזירו את פרטי החשבון — נסו שוב");
        return;
      }
      const res = await apiPost<{ notes: string[] }>("/api/whatsapp/embedded-signup", {
        code,
        mode,
        wabaId: session.wabaId,
        phoneNumberId: session.phoneNumberId,
      });
      await reloadIntegrations();
      setMessage(["המספר חובר ✓", ...(res.notes ?? [])].join(" · "));
    } catch (err) {
      setMessage(err instanceof ApiError || err instanceof Error ? err.message : "החיבור נכשל");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-md p-3">
      <div>
        <button
          onClick={() => start("coexistence")}
          disabled={!!busy}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50"
        >
          {busy === "coexistence" ? "ממתין לחיבור…" : "חיבור מספר מאפליקציית WhatsApp Business"}
        </button>
        <p className="text-xs text-neutral-500 mt-1">
          המספר ממשיך לעבוד באפליקציה בטלפון, ועד 6 חודשי שיחות נכנסים למערכת. דורש אפליקציה בגרסה 2.24.17 ומעלה וסריקת QR.
          סנכרון ההיסטוריה אפשרי פעם אחת בלבד — לחבר רק אחרי שה-webhook מוגדר במטא.
        </p>
      </div>
      <div>
        <button
          onClick={() => start("new_number")}
          disabled={!!busy}
          className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 disabled:opacity-50"
        >
          {busy === "new_number" ? "ממתין לחיבור…" : "חיבור מספר חדש (בלי אפליקציה)"}
        </button>
        <p className="text-xs text-neutral-500 mt-1">למספר שלא מותקן עליו וואטסאפ — יעבוד רק דרך המערכת.</p>
      </div>
      {message && <p className="text-xs text-neutral-600 dark:text-neutral-300">{message}</p>}
    </div>
  );
}
