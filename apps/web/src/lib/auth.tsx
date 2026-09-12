"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

  async function loadMembership(userId: string) {
    const { data } = await supabase
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    setMembership(data ? { orgId: data.org_id, role: data.role as MemberRole } : null);
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadMembership(newSession.user.id);
      } else {
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
