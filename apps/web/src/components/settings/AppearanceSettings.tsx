"use client";

import { useTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { id: ThemeChoice; label: string; hint: string }[] = [
  { id: "system", label: "לפי המכשיר", hint: "עוקב אחרי ההגדרה של הטלפון או המחשב" },
  { id: "light", label: "בהיר", hint: "רקע לבן" },
  { id: "dark", label: "כהה", hint: "רקע כהה, נוח לעיניים בערב" },
];

// Light / dark display — remembered per browser.
export function AppearanceSettings() {
  const { choice, setChoice } = useTheme();
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">מראה</h2>
      <p className="text-sm text-neutral-500 mb-3">בחירת תצוגה בהירה או כהה. הבחירה נשמרת במכשיר הזה. אפשר להחליף גם מהכפתור בסרגל העליון.</p>
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <label key={o.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${choice === o.id ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"}`}>
            <input type="radio" name="theme" checked={choice === o.id} onChange={() => setChoice(o.id)} />
            <span className="flex-1">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-neutral-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
