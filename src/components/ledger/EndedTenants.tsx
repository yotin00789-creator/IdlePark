import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import PlateChip from "@/components/app/PlateChip";
import { ChevronDownGlyph } from "@/icons";
import { setRenting } from "@/lib/ledgerActions";
import { monthName } from "@/lib/format";
import { cn } from "@/utils";
import { useState } from "react";
import { rowYearTotal } from "../../../shared/calc";
import { slotLabel } from "../../../shared/lot";
import type { LedgerRow } from "../../../shared/types";

interface Props {
  rows: LedgerRow[]; // the tenants of this year who no longer rent
  today: { year: number; month: number };
  editable: boolean;
  onEdit: (row: LedgerRow) => void;
}

/** Tenants who left: kept apart from the active ledger, with everything they paid, ready to come back. */
export default function EndedTenants({ rows, today, editable, onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  if (!rows.length) return null;
  const resume = async (r: LedgerRow) => {
    setBusy(r.id);
    await setRenting(r, true, today);
    setBusy(null);
  };
  return (
    <section className="app-card mt-4 overflow-hidden" aria-label="ผู้เช่าที่เลิกเช่าแล้ว">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
        <span>
          <span className="block text-base font-semibold text-gray-800 dark:text-white/90">เลิกเช่าแล้ว <span className="num text-gray-500 dark:text-gray-400">({rows.length})</span></span>
          <span className="block text-theme-xs text-gray-500 dark:text-gray-400">เก็บประวัติและยอดที่เคยจ่ายไว้ครบ ไม่นับในรายการเก็บเงินและไม่แจ้งค้าง (ยอดที่เคยจ่ายยังรวมอยู่ในยอดรวมของปี) · กด “กลับมาเช่า” เมื่อกลับมาเช่าอีก</span>
        </span>
        <ChevronDownGlyph className={cn("size-5 shrink-0 text-gray-500 transition-transform dark:text-gray-400", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{r.ownerName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-theme-xs text-gray-500 dark:text-gray-400">
                  <PlateChip plate={r.plate} />
                  {r.endMonth ? <span>เช่าถึงเดือน{monthName(r.endMonth)}</span> : <span>เลิกเช่าแล้ว</span>}
                  {r.slotId && <span>เดิมอยู่{slotLabel(r.slotId)}</span>}
                </p>
              </div>
              <div className="text-end">
                <Baht value={rowYearTotal(r)} className="text-theme-sm font-semibold text-gray-800 dark:text-white/90" />
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">ที่เคยจ่ายปีนี้</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(r)}>{editable ? "ดู/แก้ไข" : "ดู"}</Button>
                {editable && <Button size="sm" loading={busy === r.id} onClick={() => resume(r)}>กลับมาเช่า</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
