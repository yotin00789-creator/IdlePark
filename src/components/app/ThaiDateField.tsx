import { bangkokToday, daysInMonth, THAI_MONTHS } from "@/lib/format";
import { cn } from "@/utils";
import { useState } from "react";

interface ThaiDateFieldProps {
  label: string;
  value: string; // ISO "2026-01-31" (Gregorian) or ""
  onChange: (iso: string) => void;
  hint?: string;
  className?: string;
  /** Years offered, as Buddhist years back / forward from this year. */
  yearsBack?: number;
  yearsForward?: number;
}

// A date picker that always reads in Thai: day, month name and Buddhist-era year.
// The native <input type="date"> follows the browser's language, so it is not used.
export default function ThaiDateField({ label, value, onChange, hint, className, yearsBack = 6, yearsForward = 1 }: ThaiDateFieldProps) {
  const thisYear = bangkokToday().year;
  const [y0, m0, d0] = value ? value.split("-").map(Number) : [0, 0, 0];
  const [parts, setParts] = useState({ y: y0 ? y0 + 543 : 0, m: m0, d: d0 });
  // keep in step when the parent changes the value (e.g. a "this month" shortcut)
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setParts(value ? { y: y0 + 543, m: m0, d: d0 } : { y: 0, m: 0, d: 0 });
  }

  const emit = (next: { y: number; m: number; d: number }) => {
    const fixed = { ...next };
    if (fixed.y && fixed.m) fixed.d = Math.min(fixed.d, daysInMonth(fixed.y, fixed.m));
    setParts(fixed);
    const iso = fixed.y && fixed.m && fixed.d ? `${fixed.y - 543}-${String(fixed.m).padStart(2, "0")}-${String(fixed.d).padStart(2, "0")}` : "";
    setSeen(iso);
    onChange(iso);
  };

  const maxDay = parts.y && parts.m ? daysInMonth(parts.y, parts.m) : 31;
  const years = Array.from({ length: yearsBack + yearsForward + 1 }, (_, i) => thisYear - yearsBack + i);
  const sel = "app-input h-10 min-w-0 px-2.5 pe-7";
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
        <select aria-label={`${label} วัน`} className={sel} value={parts.d || ""} onChange={(e) => emit({ ...parts, d: Number(e.target.value) })}>
          <option value="">วัน</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select aria-label={`${label} เดือน`} className={sel} value={parts.m || ""} onChange={(e) => emit({ ...parts, m: Number(e.target.value) })}>
          <option value="">เดือน</option>
          {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select aria-label={`${label} ปี พ.ศ.`} className={sel} value={parts.y || ""} onChange={(e) => emit({ ...parts, y: Number(e.target.value) })}>
          <option value="">ปี พ.ศ.</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {hint && <p className={cn("mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400")}>{hint}</p>}
    </fieldset>
  );
}
