"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

export function NotificationsBell() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useStore();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read);
  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        <span>התראות</span>
        {unread.length > 0 && (
          <span className="text-xs min-w-[1.25rem] text-center px-1 rounded-full bg-red-500 text-white">
            {unread.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 start-0 w-80 max-h-96 overflow-y-auto z-40 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
              <span className="text-xs font-semibold text-neutral-500">התראות</span>
              {unread.length > 0 && (
                <button onClick={markAllNotificationsRead} className="text-xs text-neutral-400 hover:underline">
                  סמן הכול כנקרא
                </button>
              )}
            </div>
            {sorted.length === 0 ? (
              <p className="text-sm text-neutral-400 p-4">אין התראות.</p>
            ) : (
              <ul>
                {sorted.map((n) => (
                  <li
                    key={n.id}
                    className={`px-3 py-2 text-sm border-b border-neutral-100 dark:border-neutral-900 last:border-0 ${
                      n.read ? "text-neutral-400" : ""
                    }`}
                  >
                    {n.contactId ? (
                      <Link href={`/contacts/${n.contactId}`} onClick={() => markNotificationRead(n.id)} className="hover:underline">
                        {n.text}
                      </Link>
                    ) : (
                      <span onClick={() => markNotificationRead(n.id)}>{n.text}</span>
                    )}
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {new Date(n.createdAt).toLocaleString("he-IL")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
