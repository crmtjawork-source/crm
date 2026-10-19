// A soft coloured pill for a stage / status / option.
export const PALETTE = ["#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#4f46e5", "#64748b"];

export const colorAt = (color: string | undefined, index: number) => color || PALETTE[Math.max(0, index) % PALETTE.length];

export function ColorChip({ label, color, className = "" }: { label: string; color?: string; className?: string }) {
  if (!label) return <span className="text-neutral-300 dark:text-neutral-700">—</span>;
  const c = color || "#64748b";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${className}`} style={{ backgroundColor: `${c}1f`, color: c }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
      {label}
    </span>
  );
}
