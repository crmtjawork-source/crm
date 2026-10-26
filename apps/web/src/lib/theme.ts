"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "crm-theme";
const listeners = new Set<() => void>();

const read = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};

// Puts the `dark` class on <html> for the chosen theme (system = follow the device).
export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// Runs before the page paints (inlined in <head>), so there's no flash of the wrong theme.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as ThemeChoice);
  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // not remembered
    }
    applyTheme(next);
    listeners.forEach((l) => l());
  }, []);
  // While on "system", follow the device when it switches.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);
  return { choice, setChoice };
}
