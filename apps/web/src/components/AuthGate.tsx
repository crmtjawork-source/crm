"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "./AppShell";

function Gate({ children }: { children: React.ReactNode }) {
  const { loading, session, membership } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  // Pages for leads and the public (booking, legal pages Meta links to): no login, no app chrome.
  const isPublicPage = pathname.startsWith("/book/") || pathname === "/privacy" || pathname === "/data-deletion";

  useEffect(() => {
    if (loading || isPublicPage) return;
    if (!session && !isLoginPage) router.replace("/login");
    if (session && isLoginPage) router.replace("/dashboard");
  }, [loading, session, isLoginPage, isPublicPage, router]);

  if (isLoginPage || isPublicPage) return <>{children}</>;

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-neutral-400">טוען…</div>;
  }

  if (!membership) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm text-neutral-500">
            המשתמש שלך מחובר אבל עדיין לא משויך לאף ארגון במערכת. מנהל המערכת צריך להוסיף אותך לארגון כדי
            שתוכל להמשיך.
          </p>
        </div>
      </div>
    );
  }

  return (
    <StoreProvider orgId={membership.orgId} userId={session.user.id}>
      <AppShell>{children}</AppShell>
    </StoreProvider>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
