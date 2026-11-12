"use client";

// An on/off switch (instead of a checkbox) for settings that take effect immediately.
// Put it inside a <label> and clicking the text toggles it too.
export function Switch({ checked, onChange, disabled, title, "aria-label": ariaLabel }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; title?: string; "aria-label"?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${checked ? "bg-whatsapp" : "bg-neutral-300 dark:bg-neutral-600"}`}
    >
      <span
        className={`absolute top-[2px] start-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${checked ? "ltr:translate-x-[18px] rtl:-translate-x-[18px]" : ""}`}
      />
    </button>
  );
}
