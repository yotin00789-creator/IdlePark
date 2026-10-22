import { cn } from "@/utils";

interface TimeFieldProps {
  label: string;
  value: string; // "08:00"
  onChange: (v: string) => void;
  hint?: string;
  className?: string;
}

// Time of day as two selects so it always reads the Thai way ("08.00 น.") in 24 hours.
export default function TimeField({ label, value, onChange, hint, className }: TimeFieldProps) {
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(value) ? value : "08:00").split(":").map(Number);
  const set = (hh: number, mm: number) => onChange(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  const minutes = [...new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, m])].sort((a, b) => a - b);
  const sel = "app-input h-10 min-w-0 px-2.5 pe-7";
  return (
    <fieldset className={className}>
      <legend className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>
      <div className="flex items-center gap-2">
        <select aria-label={`${label} ชั่วโมง`} className={cn(sel, "w-20")} value={h} onChange={(e) => set(Number(e.target.value), m)}>
          {Array.from({ length: 24 }, (_, i) => i).map((x) => <option key={x} value={x}>{String(x).padStart(2, "0")}</option>)}
        </select>
        <span aria-hidden className="text-gray-500">.</span>
        <select aria-label={`${label} นาที`} className={cn(sel, "w-20")} value={m} onChange={(e) => set(h, Number(e.target.value))}>
          {minutes.map((x) => <option key={x} value={x}>{String(x).padStart(2, "0")}</option>)}
        </select>
        <span className="text-theme-sm text-gray-600 dark:text-gray-400">น.</span>
      </div>
      {hint && <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </fieldset>
  );
}
