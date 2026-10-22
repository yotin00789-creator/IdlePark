import Baht from "@/components/app/Baht";
import EditableCell from "@/components/app/EditableCell";
import FormulaPopover from "@/components/app/FormulaPopover";
import PlateChip from "@/components/app/PlateChip";
import { explainMonth, explainTotal } from "@/lib/formulas";
import { formatBaht, monthName, monthShort, parseBaht } from "@/lib/format";
import { confirmItemChanges, savePayments, saveItems, useData, type ItemChange, type PaymentChange } from "@/lib/dataStore";
import { modeFields, payMode } from "@/lib/payMode";
import { setExcluded } from "@/lib/ledgerActions";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { isYearly, monthStatus, rowYearTotal, isPrepaid, yearlyStatus, feeFor } from "../../../shared/calc";
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

const BAR_TONE: Record<string, string> = {
  full: "bg-success-50 text-success-700 ring-success-200 dark:bg-success-500/10 dark:text-success-400 dark:ring-success-500/30",
  partial: "bg-warning-50 text-warning-800 ring-warning-200 dark:bg-warning-500/10 dark:text-warning-400 dark:ring-warning-500/30",
  zero: "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-400 dark:ring-error-500/30",
  empty: "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-400 dark:ring-error-500/30",
  future: "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/5 dark:text-gray-300 dark:ring-gray-700",
};

/** A yearly renter is one long bar across the twelve months: the yearly fee, the month it falls due, and the amount paid. */
function YearlyBar({ row, year, today, r, editable, dim, onCommit, onPaste }: { row: LedgerRow; year: number; today: { year: number; month: number }; r: number; editable: boolean; dim: boolean; onCommit: (v: number | null) => void; onPaste: (r: number, c: number, m: string[][]) => void }) {
  const status = yearlyStatus(row, today);
  const fee = feeFor(row, row.startMonth);
  const paid = rowYearTotal(row);
  const label = status === "full" ? "ชำระแล้ว" : status === "partial" ? `ชำระบางส่วน · ขาด ${formatBaht(Math.max(0, fee - paid))}` : status === "future" ? "ยังไม่ถึงกำหนด" : "ยังไม่ชำระ";
  return (
    <div className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 ring-1 ring-inset", dim ? "bg-gray-50 text-gray-500 ring-gray-200 dark:bg-white/3 dark:ring-gray-700" : BAR_TONE[status])}>
      <span className="shrink-0 whitespace-nowrap text-theme-sm">
        <b className="font-semibold">รายปี</b> · จ่ายปีละครั้ง เดือน{monthName(row.startMonth)} {year} · ค่าเช่า <b className="num font-semibold">{formatBaht(fee)}</b> บาท
        <span className="ms-2 text-theme-xs">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-theme-xs">
        รับแล้ว
        <span className="inline-block h-8 w-28 overflow-hidden rounded-md bg-white/80 dark:bg-gray-900/70">
          <EditableCell grid="ledger" r={r} c={row.startMonth - 1} value={row.payments[row.startMonth - 1]} editable={editable} label={`${row.ownerName} ${row.plate} ค่าเช่ารายปี`} tone="text-gray-800 dark:text-white/90" placeholder="กรอกยอด" onCommit={onCommit} onPasteMatrix={onPaste} />
        </span>
      </span>
    </div>
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
          <div className="flex items-stretch">
          {editable && row.kind !== "bulk" && (
            <label className="flex shrink-0 cursor-pointer items-center ps-2" title={dim ? "ไม่รวมในบัญชี (ติ๊กอยู่) — เอาติ๊กออกเพื่อนับยอดตามปกติ" : "ติ๊กเพื่อไม่รวมผู้เช่านี้ในบัญชี (ยังบันทึกการเก็บเงินได้)"}>
              <input type="checkbox" checked={dim} onChange={(e) => void setExcluded(row, e.target.checked)} aria-label={`ไม่รวม ${row.ownerName} ในบัญชี`} className="size-4 cursor-pointer rounded border-gray-300 accent-brand-500" />
            </label>
          )}
          <button onClick={() => onEditRow(row)} className="flex min-w-0 flex-1 flex-col items-start px-2.5 py-2 text-start" title="แก้ไขข้อมูลผู้เช่า">
            <span className={cn("max-w-full truncate text-theme-sm font-medium", dim ? "text-gray-500" : "text-gray-800 dark:text-white/90")}>{row.ownerName}</span>
            <span className="flex flex-wrap gap-x-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
              {row.isOwner && <span className="text-blue-700 dark:text-blue-300">เจ้าของ</span>}
              {dim && <span>ไม่รวมในยอด</span>}
              {row.needsReview && <span className="text-warning-600 dark:text-warning-400">ควรตรวจ</span>}
              {!row.isActive && <span>เลิกเช่า</span>}
              {row.paidThroughMonth && <span>จ่ายถึง {monthShort(row.paidThroughMonth)} {String(row.paidThroughYear).slice(-2)}</span>}
            </span>
          </button>
          </div>
        </td>
        <td className={cn(cellBase, sticky2, "bg-white px-2 group-hover:bg-gray-50 dark:bg-gray-900 dark:group-hover:bg-gray-800")}>
          <PlateChip plate={row.plate} />
        </td>
        {row.isOwner ? (
          <td colSpan={12} className={cn(cellBase, "px-2 py-1.5")}>
            <div className="flex min-h-10 items-center rounded-lg bg-blue-50 px-3 text-theme-sm text-blue-800 ring-1 ring-blue-200 ring-inset dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30"><b className="font-semibold">เจ้าของ</b><span className="ms-2">· ไม่คิดค่าเช่า ไม่แจ้งค้างชำระ ไม่นับในยอด</span></div>
          </td>
        ) : isYearly(row) ? (
          <td colSpan={12} className={cn(cellBase, "px-2 py-1.5")}>
            <YearlyBar row={row} year={year.year} today={today} r={r} editable={editable} dim={dim} onCommit={(v) => void savePayments([{ rowId: row.id, month: row.startMonth, amount: v, ...fieldsFor(row, row.startMonth, v) }])} onPaste={pasteRows} />
          </td>
        ) : MONTHS.map((m) => {
          const amount = row.payments[m - 1];
          const prepaid = isPrepaid(row, year.year, m) && amount == null;
          const status = monthStatus(row, m, amount, isFuture(m));
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
