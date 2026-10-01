"use client";

import { useState } from "react";

export type TemplateInput = { name: string; language: string; params: string[]; buttonParam?: string };

// WhatsApp only allows a pre-approved template to open (or reopen, after
// 24h of silence) a conversation. Params fill the template's {{1}}, {{2}}…
export function TemplateForm({
  submitLabel,
  onSubmit,
  busy,
}: {
  submitLabel: string;
  onSubmit: (t: TemplateInput) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("he");
  const [params, setParams] = useState<string[]>([]);
  const [buttonParam, setButtonParam] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      language: language.trim() || "he",
      params: params.map((p) => p.trim()),
      buttonParam: buttonParam.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם התבנית (למשל welcome_message)"
          dir="ltr"
          className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="he"
          dir="ltr"
          title="קוד שפה של התבנית"
          className="w-16 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
      </div>
      {params.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-xs text-neutral-400 w-10 shrink-0" dir="ltr">{`{{${i + 1}}}`}</span>
          <input
            value={p}
            onChange={(e) => setParams((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
            className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <button
            type="button"
            onClick={() => setParams((list) => list.filter((_, j) => j !== i))}
            className="text-xs text-neutral-400 hover:text-red-500"
          >
            ×
          </button>
        </div>
      ))}
      <input
        value={buttonParam}
        onChange={(e) => setButtonParam(e.target.value)}
        placeholder="סיומת לכפתור קישור דינמי (אם יש בתבנית)"
        dir="ltr"
        className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
        >
          {busy ? "שולח…" : submitLabel}
        </button>
        <button type="button" onClick={() => setParams((list) => [...list, ""])} className="text-xs text-neutral-500 hover:underline">
          + פרמטר
        </button>
      </div>
    </form>
  );
}
