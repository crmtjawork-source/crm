"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { LeadFilterPanel } from "@/components/leads/LeadFilterPanel";
import { compileFilter, condComplete, describeCond, EMPTY_FILTER, type FilterField, type LeadFilter } from "@/lib/leadFilters";

type SavedView = { name: string; filter: LeadFilter };

// The active filter survives leaving the page (per tab); saved views are kept
// per browser for each business.
function readJson<T>(storage: "local" | "session", key: string, fallback: T): T {
  try {
    const raw = (storage === "local" ? localStorage : sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(storage: "local" | "session", key: string, value: unknown) {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — the filter just isn't remembered
  }
}

// Advanced filtering for any list of records. `scope` names the list (it keys
// the saved state); `fields` describes what can be filtered. Place `controls`
// next to the page's other filters and `chips` under them.
export function useRecordFilter<T>(scope: string, fields: FilterField<T>[], title = "סינון") {
  const { membership } = useAuth();
  const orgKey = membership?.orgId ?? "";
  const filterKey = `crm-filter:${orgKey}:${scope}`;
  const viewsKey = `crm-views:${orgKey}:${scope}`;
  const [filter, setFilterState] = useState<LeadFilter>(() => readJson("session", filterKey, EMPTY_FILTER));
  const [views, setViewsState] = useState<SavedView[]>(() => readJson("local", viewsKey, []));
  const [viewName, setViewName] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  // Another list (e.g. a different pipeline): load its own saved state.
  const [loadedKey, setLoadedKey] = useState(filterKey);
  if (loadedKey !== filterKey) {
    setLoadedKey(filterKey);
    setFilterState(readJson("session", filterKey, EMPTY_FILTER));
    setViewsState(readJson("local", viewsKey, []));
    setViewName("");
  }

  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const matches = useMemo(() => compileFilter(filter, fields), [filter, fields]);
  const active = filter.conds.filter((c) => condComplete(fieldsByKey.get(c.field), c));

  function setFilter(f: LeadFilter, name = "") {
    setFilterState(f);
    setViewName(name);
    writeJson("session", filterKey, f);
  }
  function setViews(v: SavedView[]) {
    setViewsState(v);
    writeJson("local", viewsKey, v);
  }
  function saveView() {
    const name = window.prompt("שם לתצוגה (למשל: חדשים מהשבוע)", viewName)?.trim();
    if (!name) return;
    setViews([...views.filter((v) => v.name !== name), { name, filter }]);
    setViewName(name);
  }

  const controls: ReactNode = (
    <>
      <button
        onClick={() => setPanelOpen(true)}
        className={`px-3 py-1.5 text-sm rounded-md border ${active.length ? "border-neutral-900 dark:border-white font-medium" : "border-neutral-200 dark:border-neutral-800"}`}
      >
        ⚲ סינון{active.length ? ` (${active.length})` : ""}
      </button>
      {views.length > 0 && (
        <select
          value={viewName}
          onChange={(e) => {
            const v = views.find((x) => x.name === e.target.value);
            setFilter(v?.filter ?? EMPTY_FILTER, v?.name ?? "");
          }}
          className="px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent max-w-48"
        >
          <option value="">תצוגות שמורות</option>
          {views.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      )}
      {panelOpen && (
        <LeadFilterPanel
          title={title}
          fields={fields}
          filter={filter}
          onClose={() => setPanelOpen(false)}
          onApply={(f) => {
            setFilter(f, viewName);
            setPanelOpen(false);
          }}
        />
      )}
    </>
  );

  const chips: ReactNode =
    active.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        {active.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-neutral-400">{filter.match === "all" ? "וגם" : "או"}</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 ps-2.5 pe-1 py-1">
              <button onClick={() => setPanelOpen(true)} className="hover:underline">
                {describeCond(fieldsByKey.get(c.field), c)}
              </button>
              <button onClick={() => setFilter({ ...filter, conds: filter.conds.filter((x) => x.id !== c.id) }, viewName)} aria-label="הסרת התנאי" className="text-neutral-400 hover:text-red-500 px-1">
                ×
              </button>
            </span>
          </span>
        ))}
        <button onClick={saveView} className="text-neutral-500 hover:underline ms-1">
          {viewName ? "עדכון התצוגה" : "שמירה כתצוגה"}
        </button>
        {viewName && (
          <button
            onClick={() => window.confirm(`למחוק את התצוגה "${viewName}"?`) && (setViews(views.filter((v) => v.name !== viewName)), setViewName(""))}
            className="text-neutral-400 hover:text-red-500 hover:underline"
          >
            מחיקת התצוגה
          </button>
        )}
        <button onClick={() => setFilter(EMPTY_FILTER)} className="text-neutral-400 hover:underline">
          ניקוי
        </button>
      </div>
    ) : null;

  return { matches, active: active.length, controls, chips, filter };
}
