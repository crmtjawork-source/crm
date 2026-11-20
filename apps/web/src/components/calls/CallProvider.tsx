"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Phone, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { announceCallsChanged } from "@/lib/calls";
import type { Contact } from "@/lib/types";
import { AfterCallFlow } from "./AfterCallSheet";

// The call the agent just started from the CRM (a tel: link) and has not
// reported on yet. Kept in this browser so it survives the phone app taking
// over the screen (mobile) and a reload on the way back.
export type PendingCall = { callId: string | null; contactId: string; startedAt: number };

const KEY = "crm.pendingCall";
const STALE_MS = 6 * 60 * 60_000;
const RETURN_AFTER_MS = 3000;

const read = (): PendingCall | null => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as PendingCall | null;
    return p && Date.now() - p.startedAt < STALE_MS ? p : null;
  } catch {
    return null;
  }
};
const write = (p: PendingCall | null) => {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the bar still works for this page view
  }
};

type Ctx = { startCall: (contact: Contact) => void };
const CallContext = createContext<Ctx>({ startCall: () => {} });
export const useCalls = () => useContext(CallContext);

export function CallProvider({ children }: { children: ReactNode }) {
  const { orgId, contacts, members, currentMemberId } = useStore();
  const { session } = useAuth();
  const [pending, setPending] = useState<PendingCall | null>(null);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<string | null>(null);
  const leftAt = useRef<number | null>(null);
  const pendingRef = useRef<PendingCall | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Back from the call (tab focused again, or the page reloaded): ask how it went.
  useEffect(() => {
    const stored = read();
    if (stored) {
      // After a reload the call is already over, as far as we can tell.
      queueMicrotask(() => {
        setPending(stored);
        if (Date.now() - stored.startedAt > RETURN_AFTER_MS * 2) setOpen(true);
      });
    }
    const away = () => {
      if (pendingRef.current && leftAt.current === null) leftAt.current = Date.now();
    };
    const back = () => {
      if (leftAt.current !== null && pendingRef.current && Date.now() - leftAt.current > RETURN_AFTER_MS) setOpen(true);
      leftAt.current = null;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? away() : back());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
    };
  }, []);

  // A reminder to play the recording announcement, when the org turned it on.
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("telephony_connections")
      .select("settings")
      .eq("org_id", orgId)
      .eq("enabled", true)
      .then(({ data }) => {
        const s = data?.map((r) => r.settings as { consentAnnouncement?: boolean; consentText?: string }).find((x) => x?.consentAnnouncement);
        setConsent(s ? s.consentText?.trim() || "להודיע ללקוח שהשיחה מוקלטת" : null);
      });
  }, [orgId]);

  const finish = useCallback(() => {
    write(null);
    setPending(null);
    setOpen(false);
    announceCallsChanged();
  }, []);

  const startCall = useCallback(
    (contact: Contact) => {
      if (!contact.phone || !session) return;
      const member = members.find((m) => m.id === currentMemberId);
      const next: PendingCall = { callId: null, contactId: contact.id, startedAt: Date.now() };
      write(next);
      setPending(next);
      leftAt.current = null;
      // The tel: link is already navigating (it must happen inside the click);
      // the log row is written alongside and its id attached when it lands.
      void supabase
        .from("calls")
        .insert({
          org_id: orgId,
          contact_id: contact.id,
          direction: "outbound",
          status: "initiated",
          to_number: contact.phone,
          agent_user_id: session.user.id,
          agent_email: session.user.email ?? null,
          agent_name: member?.name ?? null,
          started_at: new Date(next.startedAt).toISOString(),
          source: "manual",
          after_call_done: false,
        })
        .select("id")
        .single()
        .then(({ data }) => {
          if (!data) return;
          const cur = read();
          if (cur && cur.startedAt === next.startedAt) {
            const withId = { ...cur, callId: data.id as string };
            write(withId);
            setPending((p) => (p && p.startedAt === next.startedAt ? withId : p));
          }
          announceCallsChanged();
        });
    },
    [orgId, session, members, currentMemberId]
  );

  // "I didn't actually call": the unfinished row is removed.
  const cancel = useCallback(async () => {
    const p = pendingRef.current;
    if (p?.callId) await supabase.from("calls").delete().eq("id", p.callId);
    finish();
  }, [finish]);

  const contact = pending ? contacts.find((c) => c.id === pending.contactId) : undefined;

  return (
    <CallContext.Provider value={{ startCall }}>
      {children}
      {pending && contact && !open && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-4 z-40 flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-lg ps-2 pe-1.5 py-1.5 text-sm max-w-full">
            <Phone size={14} className="shrink-0 mx-1" aria-hidden />
            <span className="truncate">
              שיחה עם {contact.name}
              {consent && <span className="opacity-70"> · {consent}</span>}
            </span>
            <button onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-white/15 dark:bg-black/10 px-3 py-1 font-medium">
              תיעוד השיחה
            </button>
            <button onClick={cancel} aria-label="לא התקשרתי" title="לא התקשרתי" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/15 dark:hover:bg-black/10">
              <X size={14} aria-hidden />
            </button>
          </div>
        </div>
      )}
      {pending && contact && open && <AfterCallFlow contact={contact} pending={pending} onDone={finish} onCancel={cancel} onLater={() => setOpen(false)} />}
    </CallContext.Provider>
  );
}
