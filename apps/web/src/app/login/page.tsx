"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          router.push("/dashboard");
        } else {
          setNotice("נשלח מייל אישור — לחצו על הקישור בו כדי להשלים את ההרשמה, ואז התחברו כאן.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">CRM</h1>
        <p className="text-sm text-neutral-500 mb-6">{mode === "signin" ? "התחברות" : "הרשמה"}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">אימייל</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              dir="ltr"
              required
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">סיסמה</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              dir="ltr"
              required
              minLength={6}
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "רגע…" : mode === "signin" ? "התחברות" : "הרשמה"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 text-xs text-neutral-400 hover:underline"
        >
          {mode === "signin" ? "אין לך חשבון? הרשמה" : "כבר יש לך חשבון? התחברות"}
        </button>
      </div>
    </div>
  );
}
