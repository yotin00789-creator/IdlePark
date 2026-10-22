import Baht from "@/components/app/Baht";
import EditableCell from "@/components/app/EditableCell";
import FormulaPopover from "@/components/app/FormulaPopover";
import PlateChip from "@/components/app/PlateChip";
import { explainMonth, explainTotal } from "@/lib/formulas";
import { monthShort, parseBaht } from "@/lib/format";
import { confirmItemChanges, savePayments, saveItems, useData, type ItemChange, type PaymentChange } from "@/lib/dataStore";
import { modeFields, payMode } from "@/lib/payMode";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { cellStatus, feeFor, rowYearTotal, isPrepaid } from "../../../shared/calc";
import type { ItemKind, LedgerRow, YearCalc, YearData } from "../../../shared/types";
import { CELL_TONE } from "./status";

interface LedgerTableProps {
  year: YearData;
  calc: YearCalc;
  today: { year: number; month: number };
  rows: LedgerRow[]; // already filtered, normal rows first
  editable: boolean;
  onEditRow: (row: LedgerRow) => void;
}

// A tiny "โอน" tag on cells paid by transfer; on a cash cell the "สด" tag shows on hover. Click flips it.
function MethodChip({ method, bank, editable, onFlip }: { method: "cash" | "transfer" | null; bank?: string; editable: boolean; onFlip: () => void }) {
  const transfer = method === "transfer";
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={!editable}
      onClick={onFlip}
      title={transfer ? `โอนเข้าบัญชี${bank ? ` ${bank}` : ""} (กดเพื่อเปลี่ยนเป็นเงินสด)` : "เงินสด (กดเพื่อเปลี่ยนเป็นโอนเข้าบัญชี)"}
      aria-label={transfer ? "ชำระด้วยการโอน" : "ชำระด้วยเงินสด"}
      className={cn(
        "absolute top-0.5 start-0.5 z-[1] rounded px-1 text-[10px] leading-4 font-medium",
        transfer ? "bg-gold-100 text-gray-800 dark:bg-gold-500/20 dark:text-gold-300" : "bg-gray-100 text-gray-500 opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 dark:bg-white/10 dark:text-gray-400",
        !editable && "pointer-events-none",
      )}
    >
      {transfer ? "โอน" : "สด"}
    </button>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const ITEMS: { kind: ItemKind; label: string }[] = [
  { kind: "to_father", label: "ให้พ่อ" },
  { kind: "pay_aunt", label: "จ่ายป้า" },
  { kind: "total_expense", label: "ค่าใช้จ่ายรวม" },
  { kind: "collect", label: "เก็บเงิน" },
];

const sticky1 = "sticky start-0 z-10 w-26 min-w-26 max-w-26 md:w-38 md:min-w-38 md:max-w-38";
const sticky2 = "sticky start-26 z-10 w-22 min-w-22 max-w-22 md:start-38 md:w-28 md:min-w-28 md:max-w-28";

export default function LedgerTable({ year, calc, today, rows, editable, onEditRow }: LedgerTableProps) {
  const { data } = useData();
  const accounts = data?.accounts ?? [];
  // money typed into an empty cell is recorded the way the toolbar says (cash / transfer); an existing cell keeps its own
  const fieldsFor = (row: LedgerRow, month: number, v: number | null) => (v != null && v > 0 && !((row.payments[month - 1] ?? 0) > 0) ? modeFields(accounts) : {});
  const flip = (row: LedgerRow, month: number) => {
    const wasTransfer = row.payMethods[month - 1] === "transfer";
    const accountId = wasTransfer ? null : (accounts.find((a) => a.id === payMode.get().accountId)?.id ?? accounts[0]?.id ?? null);
    void savePayments([{ rowId: row.id, month, amount: row.payments[month - 1], method: wasTransfer ? "cash" : "transfer", accountId }]);
  };
  const isFuture = (m: number) => year.year > today.year || (year.year === today.year && m > today.month);
  const normal = rows.filter((r) => r.kind !== "excluded");
  const excluded = rows.filter((r) => r.kind === "excluded");
  const ordered = [...normal, ...excluded];

  const pasteRows = (r0: number, c0: number, matrix: string[][]) => {
    const changes: PaymentChange[] = [];
    let skipped = 0;
    matrix.forEach((line, i) =>
      line.forEach((cell, j) => {
        const row = ordered[r0 + i];
        const month = c0 + j + 1;
        if (!row || month > 12) return;
        const v = parseBaht(cell);
        if (v === "invalid") return void skipped++;
        if (v !== row.payments[month - 1]) changes.push({ rowId: row.id, month, amount: v, ...fieldsFor(row, month, v) });
      }),
    );
    if (skipped) toast.error(`ข้าม ${skipped} ช่องที่ไม่ใช่ตัวเลข`);
    if (changes.length) {
      void savePayments(changes);
      toast.success(`วาง ${changes.length} ช่องแล้ว`);
    }
  };

  const pasteItems = (r0: number, c0: number, matrix: string[][]) => {
    const changes: ItemChange[] = [];
    matrix.forEach((line, i) =>
      line.forEach((cell, j) => {
        const it = ITEMS[r0 + i];
        const month = c0 + j + 1;
        if (!it || month > 12) return;
        const v = parseBaht(cell);
        if (v === "invalid") return;
        if (v !== year.items[it.kind][month - 1]) changes.push({ year: year.year, month, kind: it.kind, amount: v });
      }),
    );
    if (changes.length) void confirmItemChanges(changes, [year]).then((ok) => ok && saveItems(changes));
  };

  const th = "app-th border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900";
  const cellBase = "border-b border-gray-100 p-0 dark:border-gray-800";

  const renderRow = (row: LedgerRow, r: number) => {
    const dim = row.kind === "excluded";
    return (
      <tr key={row.id} className={cn("group", dim && "bg-gray-50/60 dark:bg-white/2")}>
        <td className={cn(cellBase, sticky1, "bg-white group-hover:bg-gray-50 dark:bg-gray-900 dark:group-hover:bg-gray-800")}>
          <button onClick={() => onEditRow(row)} className="flex w-full flex-col items-start px-3 py-2 text-start" title="แก้ไขข้อมูลผู้เช่า">
            <span className={cn("max-w-full truncate text-theme-sm font-medium", dim ? "text-gray-500" : "text-gray-800 dark:text-white/90")}>{row.ownerName}</span>
            <span className="flex flex-wrap gap-x-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
              {dim && <span>ไม่รวมในยอด</span>}
              {row.needsReview && <span className="text-warning-600 dark:text-warning-400">ควรตรวจ</span>}
              {!row.isActive && <span>เลิกเช่า</span>}
              {row.paidThroughMonth && <span>จ่ายถึง {monthShort(row.paidThroughMonth)} {String(row.paidThroughYear).slice(-2)}</span>}
            </span>
          </button>
        </td>
        <td className={cn(cellBase, sticky2, "bg-white px-2 group-hover:bg-gray-50 dark:bg-gray-900 dark:group-hover:bg-gray-800")}>
          <PlateChip plate={row.plate} />
        </td>
        {MONTHS.map((m) => {
          const amount = row.payments[m - 1];
          const prepaid = isPrepaid(row, year.year, m) && amount == null;
          const status = cellStatus(amount, feeFor(row, m), isFuture(m));
          return (
            <td key={m} className={cn(cellBase, "group/cell relative")}>
              {(amount ?? 0) > 0 && <MethodChip method={row.payMethods[m - 1]} bank={accounts.find((a) => a.id === row.payAccounts[m - 1])?.bank} editable={editable} onFlip={() => flip(row, m)} />}
              <EditableCell
                grid="ledger"
                r={r}
                c={m - 1}
                value={amount}
                editable={editable}
                label={`${row.ownerName} ${row.plate} เดือน ${m}`}
                tone={dim ? "text-gray-500 dark:text-gray-400" : prepaid ? "text-link" : CELL_TONE[status]}
                placeholder={prepaid ? "จ่ายล่วงหน้า" : "—"}
                onCommit={(v) => void savePayments([{ rowId: row.id, month: m, amount: v, ...fieldsFor(row, m, v) }])}
                onPasteMatrix={pasteRows}
              />
            </td>
          );
        })}
        <td className={cn(cellBase, "num px-3 text-end text-theme-sm font-semibold text-gray-800 dark:text-white/90")}>
          <Baht value={rowYearTotal(row)} />
        </td>
      </tr>
    );
  };

  const totalRow = (label: string, strong: boolean, values: (m: number) => React.ReactNode, total: React.ReactNode) => (
    <tr className={cn(strong && "bg-gray-50 dark:bg-white/3")}>
      <td colSpan={2} className={cn(cellBase, "sticky start-0 z-10 px-3 py-2.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90", strong ? "bg-gray-50 dark:bg-gray-800" : "bg-white dark:bg-gray-900")}>{label}</td>
      {MONTHS.map((m) => <td key={m} className={cn(cellBase, "text-theme-sm")}>{values(m)}</td>)}
      <td className={cn(cellBase, "text-theme-sm font-semibold")}>{total}</td>
    </tr>
  );

  return (
    <div className="custom-scrollbar max-h-[calc(100dvh-15rem)] overflow-auto" role="region" aria-label={`ตารางรายรับรายเดือน ปี ${year.year}`} tabIndex={0}>
      <table className="w-max min-w-full border-separate border-spacing-0" role="grid">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className={cn(th, sticky1, "z-30")}>ชื่อ</th>
            <th className={cn(th, sticky2, "z-30")}>เลขรถ</th>
            {MONTHS.map((m) => (
              <th key={m} className={cn(th, "w-22 min-w-22 text-end", year.year === today.year && m === today.month && "text-brand-600 dark:text-brand-400")}>
                {monthShort(m)}
              </th>
            ))}
            <th className={cn(th, "w-28 min-w-28 text-end")}>รวมแถว</th>
          </tr>
        </thead>
        <tbody>
          {normal.map((r, i) => renderRow(r, i))}
          {excluded.length > 0 && (
            <tr>
              <td colSpan={15} className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-theme-xs text-gray-500 dark:border-gray-800 dark:bg-white/3 dark:text-gray-400">
                <span className="sticky start-3">แถวต่อไปนี้แสดงไว้แต่ไม่นับในยอดรวม</span>
              </td>
            </tr>
          )}
          {excluded.map((r, i) => renderRow(r, normal.length + i))}
          {rows.length === 0 && (
            <tr><td colSpan={15} className="px-4 py-10 text-center text-theme-sm text-gray-500">ไม่พบแถวที่ตรงกับตัวกรอง</td></tr>
          )}

          {totalRow("รวม", true, (m) => (
            <FormulaPopover explain={explainMonth(year, calc, m, "income")}>
              <Baht value={calc.months[m - 1].income} />
              {calc.months[m - 1].legacyIncome && <span className="block text-[10px] font-normal text-warning-600 dark:text-warning-400">สูตรเดิม</span>}
            </FormulaPopover>
          ), <FormulaPopover explain={explainTotal(calc, "รวม", calc.totals.income, "รวม")}><Baht value={calc.totals.income} /></FormulaPopover>)}

          {ITEMS.map((it, i) => (
            <tr key={it.kind}>
              <td colSpan={2} className={cn(cellBase, "sticky start-0 z-10 bg-white px-3 py-2.5 text-theme-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300")}>{it.label}</td>
              {MONTHS.map((m) => (
                <td key={m} className={cellBase}>
                  <EditableCell
                    grid="items"
                    r={i}
                    c={m - 1}
                    value={year.items[it.kind][m - 1]}
                    editable={editable}
                    label={`${it.label} เดือน ${m}`}
                    tone="text-gray-700 dark:text-gray-300"
                    onCommit={(v) => { const ch: ItemChange[] = [{ year: year.year, month: m, kind: it.kind, amount: v }]; void confirmItemChanges(ch, [year]).then((ok) => ok && saveItems(ch)); }}
                    onPasteMatrix={pasteItems}
                  />
                </td>
              ))}
              <td className={cn(cellBase, "px-3 text-end text-theme-sm font-semibold")}>
                <Baht value={calc.totals[it.kind === "to_father" ? "toFather" : it.kind === "pay_aunt" ? "payAunt" : it.kind === "total_expense" ? "totalExpense" : "collect"]} />
              </td>
            </tr>
          ))}

          {totalRow("รวม(หักแล้ว)", true, (m) => (
            <FormulaPopover explain={explainMonth(year, calc, m, "net")}>
              <Baht value={calc.months[m - 1].net} signColor />
              {calc.months[m - 1].legacyNoCollect && <span className="block text-[10px] font-normal text-warning-600 dark:text-warning-400">สูตรเดิม</span>}
            </FormulaPopover>
          ), <FormulaPopover explain={explainTotal(calc, "รวม(หักแล้ว)", calc.totals.net, "รวม(หักแล้ว)")}><Baht value={calc.totals.net} signColor /></FormulaPopover>)}
        </tbody>
      </table>
    </div>
  );
}
