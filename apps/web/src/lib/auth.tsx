"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { MemberRole } from "./types";

type Membership = { orgId: string; role: MemberRole } | null;

type AuthState = {
  loading: boolean;
  session: Session | null;
  membership: Membership;
  refreshMembership: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership>(null);
  const hasMembership = useRef(false);

  // A just-signed-in session can briefly read as "no membership" (the token isn't attached to the
  // first query yet), so an empty answer is retried before the user is shown the "no organisation" screen.
  async function loadMembership(userId: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data } = await supabase
        .from("memberships")
        .select("org_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (data) {
        hasMembership.current = true;
        setMembership({ orgId: data.org_id, role: data.role as MemberRole });
        return;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    // Keep an already-known membership through a transient failure; only an unknown one becomes "none".
    if (!hasMembership.current) setMembership(null);
  }

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        loadMembership(data.session.user.id).finally(() => !cancelled && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession) {
        // Not awaited inside the callback (supabase-js can deadlock on that); the loader stays up
        // for a fresh sign-in until the membership answer is in.
        if (event === "SIGNED_IN" && !hasMembership.current) setLoading(true);
        setTimeout(() => {
          loadMembership(newSession.user.id).finally(() => !cancelled && setLoading(false));
        }, 0);
      } else {
        hasMembership.current = false;
        setMembership(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function refreshMembership() {
    if (session) await loadMembership(session.user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ loading, session, membership, refreshMembership, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
