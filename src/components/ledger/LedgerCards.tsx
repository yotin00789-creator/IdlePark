import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import MonthStrip from "@/components/app/MonthStrip";
import PlateChip from "@/components/app/PlateChip";
import Sheet from "@/components/app/Sheet";
import { savePayments, useData, type PaymentChange } from "@/lib/dataStore";
import { modeFields, payMode } from "@/lib/payMode";
import { formatBaht, monthName, parseBaht } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { useState } from "react";
import { currentFee, isYearly, monthStatus, rowYearTotal } from "../../../shared/calc";
import type { LedgerRow, PayMethod } from "../../../shared/types";
import { CELL_TONE } from "./status";

interface LedgerCardsProps {
  year: number;
  today: { year: number; month: number };
  rows: LedgerRow[];
  editable: boolean;
  onEditRow: (row: LedgerRow) => void;
}

export default function LedgerCards({ year, today, rows, editable, onEditRow }: LedgerCardsProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  if (!rows.length) return <p className="app-card px-4 py-10 text-center text-theme-sm text-gray-500">ไม่พบแถวที่ตรงกับตัวกรอง</p>;
  return (
    <>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpenId(r.id)} className={cn("app-card w-full p-4 text-start active:bg-gray-50 dark:active:bg-white/5", r.kind === "excluded" && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-gray-800 dark:text-white/90">{r.ownerName}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <PlateChip plate={r.plate} />
                    {r.kind === "excluded" && <span className="text-theme-xs text-gray-500">ไม่รวมในยอด</span>}
                    {r.needsReview && <span className="text-theme-xs text-warning-600">ควรตรวจ</span>}
                    {!r.isActive && <span className="text-theme-xs text-gray-500">เลิกเช่า</span>}
                  </div>
                </div>
                <div className="text-end">
                  <Baht value={rowYearTotal(r)} className="text-base font-semibold text-gray-800 dark:text-white/90" />
                  <p className="text-theme-xs text-gray-500 dark:text-gray-400">รวมปีนี้</p>
                </div>
              </div>
              <MonthStrip className="mt-3" payments={r.payments} row={r} year={year} today={today} />
            </button>
          </li>
        ))}
      </ul>
      <MonthSheet key={open?.id ?? 0} row={open} year={year} today={today} editable={editable} onClose={() => setOpenId(null)} onEditRow={onEditRow} />
    </>
  );
}

interface MonthSheetProps {
  row: LedgerRow | null;
  year: number;
  today: { year: number; month: number };
  editable: boolean;
  onClose: () => void;
  onEditRow: (r: LedgerRow) => void;
}

function MonthSheet({ row, year, today, editable, onClose, onEditRow }: MonthSheetProps) {
  const { data } = useData();
  const accounts = data?.accounts ?? [];
  const [draft, setDraft] = useState<string[]>(() => (row ? row.payments.map((p) => (p == null ? "" : String(p / 100))) : []));
  const [methods, setMethods] = useState<PayMethod[]>(() => (row ? row.payMethods.map((m) => m ?? payMode.get().method) : []));
  if (!row) return null;

  const save = () => {
    const changes: PaymentChange[] = [];
    for (let m = 1; m <= 12; m++) {
      const parsed = parseBaht(draft[m - 1] ?? "");
      if (parsed === "invalid") return toast.error(`${monthName(m)}: กรอกเป็นตัวเลข`);
      const methodChanged = parsed != null && parsed > 0 && (methods[m - 1] ?? "cash") !== (row.payMethods[m - 1] ?? "cash");
      if (parsed !== row.payments[m - 1] || methodChanged) {
        const method = parsed != null && parsed > 0 ? (methods[m - 1] ?? modeFields(accounts).method) : undefined;
        const accountId = method === "transfer" ? (row.payAccounts[m - 1] ?? modeFields(accounts).accountId ?? accounts[0]?.id ?? null) : null;
        changes.push({ rowId: row.id, month: m, amount: parsed, ...(method ? { method, accountId } : {}) });
      }
    }
    if (changes.length) {
      void savePayments(changes);
      toast.success("บันทึกแล้ว");
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={row.ownerName}
      description={`${row.plate || "ไม่มีทะเบียน"} · ค่าเช่า ${formatBaht(currentFee(row, today))} บาท/${isYearly(row) ? `ปี (จ่ายเดือน${monthName(row.startMonth)})` : "เดือน"}${row.feeChanges.length && !isYearly(row) ? " (ปรับราคาในปีนี้)" : ""}`}
      footer={
        editable ? (
          <>
            <Button variant="outline" onClick={() => { onClose(); onEditRow(row); }}>ข้อมูลผู้เช่า</Button>
            <Button onClick={save}>บันทึก</Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>ปิด</Button>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const future = year > today.year || (year === today.year && m > today.month);
          const parsed = parseBaht(draft[i] ?? "");
          const status = monthStatus(row, m, parsed === "invalid" ? null : parsed, future);
          return (
            <label key={m} className="block">
              <span className="mb-1 block text-theme-xs text-gray-500 dark:text-gray-400">{monthName(m)}</span>
              <input
                inputMode="decimal"
                disabled={!editable}
                value={draft[i] ?? ""}
                onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder="—"
                className={cn("app-input num text-end", CELL_TONE[status])}
              />
              {(parsed !== "invalid" && (parsed ?? 0) > 0) && (
                <span className="mt-1 flex justify-end gap-1" role="group" aria-label={`วิธีรับเงิน ${monthName(m)}`}>
                  {(["cash", "transfer"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!editable}
                      aria-pressed={(methods[i] ?? "cash") === k}
                      onClick={() => setMethods((ms) => ms.map((v, j) => (j === i ? k : v)))}
                      className={cn("rounded-md px-2 py-0.5 text-theme-xs font-medium", (methods[i] ?? "cash") === k ? (k === "transfer" ? "bg-gold-100 text-gray-900 dark:bg-gold-500/20 dark:text-gold-300" : "bg-gray-200 text-gray-800 dark:bg-white/15 dark:text-gray-200") : "text-gray-500 dark:text-gray-400")}
                    >
                      {k === "cash" ? "สด" : "โอน"}
                    </button>
                  ))}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </Sheet>
  );
}
