import { CalendarGlyph, ChevronLeftGlyph, ChevronRightGlyph, XMarkGlyph } from "@/icons";
import { bangkokToday, daysInMonth, THAI_MONTHS, THAI_MONTHS_SHORT } from "@/lib/format";
import { cn } from "@/utils";
import { useEffect, useRef, useState } from "react";

export interface DateRange {
  from: string; // ISO "2026-10-23" (Gregorian) or ""
  to: string;
}

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string; // accessible name of the button
  className?: string;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y: y + 543, m, d }; // Buddhist year, as shown
};
const show = (s: string) => {
  if (!s) return "";
  const { y, m, d } = parse(s);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${y}`;
};
const WEEK = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/**
 * One button that opens a calendar: pick the first day, then the last day. Month and Buddhist year are drop-downs in the
 * header, so any date is two clicks away. Shortcuts cover the usual ranges. Always Thai (no native date input).
 */
export default function ThaiDateRangePicker({ value, onChange, label = "ช่วงวันที่", className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const todayBE = bangkokToday(); // year in the Buddhist era
  const todayISO = iso(todayBE.year - 543, todayBE.month, todayBE.day);
  const start = value.from ? parse(value.from) : null;
  const [view, setView] = useState({ y: (start?.y ?? todayBE.year) as number, m: start?.m ?? todayBE.month }); // month on show (Buddhist year)
  const [first, setFirst] = useState<string | null>(null); // the day clicked first, waiting for the last day
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const openIt = () => {
    const s = value.from ? parse(value.from) : null;
    setView({ y: s?.y ?? todayBE.year, m: s?.m ?? todayBE.month });
    setFirst(null);
    setHover(null);
    setOpen(true);
  };
  const apply = (from: string, to: string) => {
    onChange({ from, to });
    setOpen(false);
    setFirst(null);
  };

  const pick = (d: string) => {
    if (!first) return setFirst(d);
    apply(first <= d ? first : d, first <= d ? d : first);
  };

  const shift = (n: number) =>
    setView((v) => {
      const t = v.y * 12 + (v.m - 1) + n;
      return { y: Math.floor(t / 12), m: (t % 12) + 1 };
    });

  const gregorian = view.y - 543;
  const lead = new Date(Date.UTC(gregorian, view.m - 1, 1)).getUTCDay();
  const days = daysInMonth(view.y, view.m);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  // the range being drawn: the saved one, or first click → pointer
  const a = first ?? value.from;
  const b = first ? (hover ?? first) : value.to;
  const [lo, hi] = a && b ? (a <= b ? [a, b] : [b, a]) : ["", ""];

  const shortcut = (from: Date, to: Date) => apply(iso(from.getFullYear(), from.getMonth() + 1, from.getDate()), iso(to.getFullYear(), to.getMonth() + 1, to.getDate()));
  const now = new Date(Date.UTC(todayBE.year - 543, todayBE.month - 1, todayBE.day));
  const day = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const minus = (n: number) => day(new Date(now.getTime() - n * 86_400_000));
  const shortcuts: [string, () => void][] = [
    ["วันนี้", () => shortcut(day(now), day(now))],
    ["7 วันล่าสุด", () => shortcut(minus(6), day(now))],
    ["30 วันล่าสุด", () => shortcut(minus(29), day(now))],
    ["เดือนนี้", () => shortcut(new Date(now.getUTCFullYear(), now.getUTCMonth(), 1), new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))],
    ["ปีนี้", () => shortcut(new Date(now.getUTCFullYear(), 0, 1), new Date(now.getUTCFullYear(), 11, 31))],
  ];

  const has = Boolean(value.from || value.to);
  const years = Array.from({ length: 12 }, (_, i) => todayBE.year - 8 + i);
  if (!years.includes(view.y)) years.push(view.y);
  years.sort((p, q) => p - q);
  const sel = "h-8 rounded-md border border-gray-200 bg-transparent px-1.5 text-theme-sm font-medium text-gray-800 dark:border-gray-700 dark:text-white/90 [&>option]:text-gray-900";

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openIt())}
        className={cn("app-input flex h-10 w-full items-center gap-2 text-start", !has && "text-gray-500 dark:text-gray-400")}
      >
        <CalendarGlyph className="size-4 shrink-0 text-gray-500 dark:text-gray-400" />
        <span className="num min-w-0 flex-1 truncate">{has ? `${show(value.from) || "…"}  →  ${show(value.to) || "…"}` : "ตั้งแต่วันที่  →  ถึงวันที่"}</span>
        {has && (
          <span
            role="button"
            tabIndex={0}
            aria-label="ล้างวันที่"
            onClick={(e) => { e.stopPropagation(); onChange({ from: "", to: "" }); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange({ from: "", to: "" }); } }}
            className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10"
          >
            <XMarkGlyph className="size-4" />
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="absolute start-0 top-full z-40 mt-1.5 w-[19.5rem] max-w-[92vw] rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 flex items-center gap-1.5">
            <button type="button" aria-label="เดือนก่อน" onClick={() => shift(-1)} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><ChevronLeftGlyph className="size-4" /></button>
            <select aria-label="เดือน" value={view.m} onChange={(e) => setView({ ...view, m: Number(e.target.value) })} className={cn(sel, "flex-1")}>
              {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="ปี พ.ศ." value={view.y} onChange={(e) => setView({ ...view, y: Number(e.target.value) })} className={cn(sel, "w-[4.75rem]")}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => shift(1)} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><ChevronRightGlyph className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-theme-xs text-gray-500 dark:text-gray-400">{WEEK.map((w) => <span key={w} className="py-1">{w}</span>)}</div>
          <div className="grid grid-cols-7" onPointerLeave={() => setHover(null)}>
            {cells.map((d, i) => {
              if (d == null) return <span key={`e${i}`} />;
              const s = iso(gregorian, view.m, d);
              const edge = s === lo || s === hi;
              const inside = lo && hi && s > lo && s < hi;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pick(s)}
                  onPointerEnter={() => setHover(s)}
                  aria-label={`${d} ${THAI_MONTHS[view.m - 1]} ${view.y}`}
                  aria-pressed={edge}
                  className={cn(
                    "num h-9 text-theme-sm",
                    edge ? "bg-brand-500 font-semibold text-on-brand" : inside ? "bg-brand-50 text-gray-900 dark:bg-white/10 dark:text-white" : "text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10",
                    s === lo && "rounded-s-lg",
                    s === hi && "rounded-e-lg",
                    !lo && "rounded-lg",
                    lo && hi && !edge && !inside && "rounded-lg",
                    s === todayISO && !edge && "font-semibold text-link",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">{first ? "เลือกวันสุดท้ายของช่วง" : "เลือกวันแรกของช่วง แล้วเลือกวันสุดท้าย"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2 dark:border-gray-800">
            {shortcuts.map(([name, run]) => (
              <button key={name} type="button" onClick={run} className="rounded-full border border-gray-200 px-2.5 py-1 text-theme-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5">{name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
