import { useState } from "react";

const SLICES = [
  { key: "full", label: "ชำระครบ", stroke: "stroke-success-500", dot: "bg-success-500" },
  { key: "partial", label: "ชำระบางส่วน", stroke: "stroke-gold-400", dot: "bg-gold-400" },
  { key: "none", label: "ยังไม่ชำระ", stroke: "stroke-error-500", dot: "bg-error-500" },
] as const;

// Donut of how many vehicles have paid this month: green paid, gold part-paid, red not yet. Plain SVG.
export default function PayDonut({ full, partial, none }: { full: number; partial: number; none: number }) {
  const values = { full, partial, none };
  const total = full + partial + none;
  const [hover, setHover] = useState<number | null>(null);
  const R = 82;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const shown = hover != null ? SLICES[hover] : null;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative size-52">
        <svg viewBox="0 0 200 200" className="size-full -rotate-90" role="img" aria-label={`ชำระครบ ${full} ชำระบางส่วน ${partial} ยังไม่ชำระ ${none} จากทั้งหมด ${total} คัน`}>
          <circle cx="100" cy="100" r={R} fill="none" strokeWidth="22" className="stroke-gray-100 dark:stroke-gray-800" />
          {total > 0 && SLICES.map((s, i) => {
            const v = values[s.key];
            if (!v) return null;
            const len = (v / total) * C;
            const gap = total > v ? 2 : 0;
            const el = (
              <circle
                key={s.key}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                strokeWidth={hover === i ? 26 : 22}
                strokeDasharray={`${Math.max(0, len - gap)} ${C - len + gap}`}
                strokeDashoffset={-offset}
                className={`${s.stroke} transition-[stroke-width] duration-150`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-3xl font-semibold text-gray-900 dark:text-white">{shown ? values[shown.key] : total}</span>
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">{shown ? `${shown.label} (คัน)` : "ทั้งหมด (คัน)"}</span>
        </div>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-theme-sm text-gray-600 dark:text-gray-400">
        {SLICES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${s.dot}`} aria-hidden />{s.label} {values[s.key]}</li>
        ))}
      </ul>
    </div>
  );
}
