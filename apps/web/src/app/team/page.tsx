"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { MemberRole } from "@/lib/types";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "בעלים",
  admin: "מנהל",
  agent: "נציג",
};

export default function TeamPage() {
  const { members, currentMemberId, addMember, updateMemberRole, removeMember, setCurrentMember } = useStore();
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("agent");

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    addMember(name.trim(), email.trim(), role);
    setName("");
    setEmail("");
    setRole("agent");
    setShowInvite(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">צוות והרשאות</h1>
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          + הזמנת חבר צוות
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        אין עדיין התחברות אמיתית — "מציג כ" למטה מדמה עם איזה משתמש אתה גולש, כדי לבדוק שהרשאות
        התפקידים אכן מגבילות פעולות (למשל נציג לא יכול למחוק לידים או הזדמנויות).
      </p>

      {showInvite && (
        <form onSubmit={handleInvite} className="mb-6 flex flex-wrap items-end gap-2 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">שם</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">אימייל</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              dir="ltr"
              required
              className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">תפקיד</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            >
              <option value="admin">מנהל</option>
              <option value="agent">נציג</option>
            </select>
          </label>
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            שליחת הזמנה
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3"
          >
            <div>
              <p className="font-medium text-sm">
                {m.name}
                {m.id === currentMemberId && (
                  <span className="ms-2 text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                    זה אתה
                  </span>
                )}
                {m.status === "invited" && (
                  <span className="ms-2 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                    ממתין להצטרפות
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-500" dir="ltr">
                {m.email}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={m.role}
                onChange={(e) => updateMemberRole(m.id, e.target.value as MemberRole)}
                disabled={m.role === "owner"}
                className="text-sm bg-transparent border border-neutral-200 dark:border-neutral-800 rounded-md px-2 py-1"
              >
                <option value="owner">בעלים</option>
                <option value="admin">מנהל</option>
                <option value="agent">נציג</option>
              </select>
              {m.id !== currentMemberId && (
                <button
                  onClick={() => setCurrentMember(m.id)}
                  className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline"
                >
                  הצג כ{ROLE_LABELS[m.role]} הזה
                </button>
              )}
              {m.role !== "owner" && m.id !== currentMemberId && (
                <button onClick={() => removeMember(m.id)} className="text-xs text-neutral-400 hover:text-red-500">
                  הסרה
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
