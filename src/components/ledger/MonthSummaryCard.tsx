import Baht from "@/components/app/Baht";
import FormulaPopover from "@/components/app/FormulaPopover";
import { confirmItemChanges, saveItems, type ItemChange } from "@/lib/dataStore";
import { explainMonth, explainTotal } from "@/lib/formulas";
import { monthName, parseBaht } from "@/lib/format";
import { cn } from "@/utils";
import { useState } from "react";
import type { ItemKind, YearCalc, YearData } from "../../../shared/types";

const ITEMS: { kind: ItemKind; label: string; total: "toFather" | "payAunt" | "totalExpense" | "collect" }[] = [
  { kind: "to_father", label: "ให้พ่อ", total: "toFather" },
  { kind: "pay_aunt", label: "จ่ายป้า", total: "payAunt" },
  { kind: "total_expense", label: "ค่าใช้จ่ายรวม", total: "totalExpense" },
  { kind: "collect", label: "เก็บเงิน", total: "collect" },
];

interface MonthSummaryCardProps {
  year: YearData;
  calc: YearCalc;
  initialMonth: number;
  editable: boolean;
}

/** The bottom rows of the desktop table for phones: one month at a time, with the figures that can be edited and the year totals. */
export default function MonthSummaryCard({ year, calc, initialMonth, editable }: MonthSummaryCardProps) {
  const [month, setMonth] = useState(initialMonth);
  const m = calc.months[month - 1];

  return (
    <section className="app-card mt-4 overflow-hidden" aria-label="สรุปรายเดือนและรายปี">
      <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">สรุปเดือน</h2>
        <select aria-label="เดือนที่สรุป" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="app-input h-10 w-auto py-0 pe-7 text-theme-sm">
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)} {year.year}</option>)}
        </select>
      </header>

      <dl className="divide-y divide-gray-100 dark:divide-gray-800">
        <Line label="รวม" strong>
          <FormulaPopover explain={explainMonth(year, calc, month, "income")}>
            <Baht value={m.income} />
            {m.legacyIncome && <span className="block text-[10px] font-normal text-warning-600 dark:text-warning-400">สูตรเดิม</span>}
          </FormulaPopover>
        </Line>
        {ITEMS.map((it) => (
          <Line key={it.kind} label={it.label}>
            <ItemInput key={`${year.year}-${month}-${it.kind}-${year.items[it.kind][month - 1]}`} label={`${it.label} ${monthName(month)}`} value={year.items[it.kind][month - 1]} editable={editable} onCommit={(amount) => {
              const ch: ItemChange[] = [{ year: year.year, month, kind: it.kind, amount }];
              void confirmItemChanges(ch, [year]).then((ok) => ok && saveItems(ch));
            }} />
          </Line>
        ))}
        <Line label="รวม(หักแล้ว)" strong>
          <FormulaPopover explain={explainMonth(year, calc, month, "net")}>
            <Baht value={m.net} signColor />
            {m.legacyNoCollect && <span className="block text-[10px] font-normal text-warning-600 dark:text-warning-400">สูตรเดิม</span>}
          </FormulaPopover>
        </Line>
      </dl>

      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/3">
        <h3 className="mb-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">รวมทั้งปี {year.year}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-theme-sm">
          <Total label="รวม"><FormulaPopover explain={explainTotal(calc, "รวม", calc.totals.income, "รวม")}><Baht value={calc.totals.income} /></FormulaPopover></Total>
          {ITEMS.map((it) => <Total key={it.kind} label={it.label}><Baht value={calc.totals[it.total]} /></Total>)}
          <Total label="รวม(หักแล้ว)"><FormulaPopover explain={explainTotal(calc, "รวม(หักแล้ว)", calc.totals.net, "รวม(หักแล้ว)")}><Baht value={calc.totals.net} signColor /></FormulaPopover></Total>
          <Total label="ยอดคงเหลือสะสม"><Baht value={calc.cumulative} signColor /></Total>
        </dl>
      </div>
    </section>
  );
}

function Line({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-2.5", strong && "bg-gray-50 dark:bg-white/3")}>
      <dt className={cn("text-theme-sm", strong ? "font-semibold text-gray-800 dark:text-white/90" : "text-gray-700 dark:text-gray-300")}>{label}</dt>
      <dd className={cn("num text-end", strong && "font-semibold")}>{children}</dd>
    </div>
  );
}

function Total({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="num font-semibold text-gray-800 dark:text-white/90">{children}</dd>
    </div>
  );
}

// An amount you can type into; it is committed when you leave the field (the money confirmation pops up first).
function ItemInput({ label, value, editable, onCommit }: { label: string; value: number | null; editable: boolean; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value / 100));
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      disabled={!editable}
      value={draft}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = parseBaht(draft);
        if (v === "invalid") return setDraft(value == null ? "" : String(value / 100));
        if (v !== value) onCommit(v);
      }}
      className="app-input num h-10 w-36 text-end"
    />
  );
}
