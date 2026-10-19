"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { FEATURES, LEAD_SCOPES, OBJECT_ACCESS } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { Sheet } from "@/components/ui/Sheet";

const input = "w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent";

// Roles: what each kind of team member sees. Owners and managers always see
// everything; assigning a role to a member is done on the team screen.
export function RolesSettings({ isAdmin }: { isAdmin: boolean }) {
  const { roles, members } = useStore();
  const [open, setOpen] = useState<Role | "new" | null>(null);

  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-1">תפקידים והרשאות</h2>
      <p className="text-sm text-neutral-500 mb-3 leading-relaxed">
        מה כל סוג איש צוות רואה: אילו לידים (כולם / רק שלו), גישה לכל אובייקט, ואילו מסכים מופיעים בתפריט. ההרשאות נאכפות במסד הנתונים, לא רק
        בתצוגה. בעלים ומנהלים תמיד רואים הכל. משייכים תפקיד לאנשי הצוות במסך &quot;צוות&quot;.
      </p>
      <ul className="space-y-2 mb-3">
        {roles.map((r) => (
          <li key={r.id}>
            <button onClick={() => isAdmin && setOpen(r)} className="w-full flex items-center gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm text-start">
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-neutral-400">{LEAD_SCOPES.find((s) => s.id === r.leadsScope)?.label}</span>
              <span className="text-xs text-neutral-400 ms-auto">{members.filter((m) => m.roleId === r.id).length} אנשים</span>
            </button>
          </li>
        ))}
      </ul>
      {isAdmin && (
        <button onClick={() => setOpen("new")} className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          + תפקיד
        </button>
      )}
      {open && <RoleEditor role={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function RoleEditor({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const { objectTypes, roles, saveRole, deleteRole } = useStore();
  const [r, setR] = useState<Omit<Role, "id"> & { id?: string }>(role ?? { name: "", leadsScope: "own_unassigned", objectAccess: {}, position: roles.length });
  const [error, setError] = useState("");
  const features = r.features ?? FEATURES.map((f) => f.id);

  async function save() {
    if (!r.name.trim()) return setError("צריך שם לתפקיד");
    try {
      await saveRole({ ...r, name: r.name.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השמירה נכשלה");
    }
  }

  return (
    <Sheet title={role ? role.name : "תפקיד חדש"} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">שם התפקיד</span>
          <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="למשל: סוכן מכירות" className={input} />
        </label>
        <label className="block text-xs">
          <span className="block text-neutral-500 mb-1">לידים</span>
          <select value={r.leadsScope} onChange={(e) => setR({ ...r, leadsScope: e.target.value as Role["leadsScope"] })} className={input}>
            {LEAD_SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="text-neutral-400">חל גם על השיחות, המשימות, הפגישות, ההסכמים וההיסטוריה של הלידים.</span>
        </label>
        {objectTypes.length > 0 && (
          <div className="text-xs space-y-1">
            <span className="block text-neutral-500">אובייקטים</span>
            {objectTypes.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <span className="w-28">
                  {t.icon} {t.name}
                </span>
                <select
                  value={r.objectAccess[t.id] ?? "all"}
                  onChange={(e) => setR({ ...r, objectAccess: { ...r.objectAccess, [t.id]: e.target.value as "all" | "own" | "none" } })}
                  className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                >
                  {OBJECT_ACCESS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="text-xs">
          <span className="block text-neutral-500 mb-1">מסכים בתפריט</span>
          <div className="grid grid-cols-2 gap-1">
            {FEATURES.map((f) => (
              <label key={f.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={features.includes(f.id)}
                  onChange={(e) => setR({ ...r, features: e.target.checked ? [...features, f.id] : features.filter((x) => x !== f.id) })}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center gap-3">
          <button onClick={save} className="px-4 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            שמירה
          </button>
          {role && (
            <button
              onClick={async () => {
                if (!confirm(`למחוק את התפקיד "${role.name}"? מי שמשויך אליו יחזור לגישה מלאה.`)) return;
                await deleteRole(role.id);
                onClose();
              }}
              className="text-xs text-neutral-400 hover:text-red-500 ms-auto"
            >
              מחיקה
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
