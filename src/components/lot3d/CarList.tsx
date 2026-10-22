import { SearchGlyph, XMarkGlyph } from "@/icons";
import IconButton from "@/components/app/IconButton";
import { toneLabel, type LotCar } from "@/lib/lot";
import { cn } from "@/utils";
import { useMemo, useState } from "react";
import type { LedgerRow } from "../../../shared/types";
import type { SlotDef } from "./LotScene";

const DOT = { paid: "bg-success-500", pending: "bg-warning-500", late: "bg-error-500", owner: "bg-blue-600" } as const;

interface CarListProps {
  slots: SlotDef[];
  cars: LotCar[];
  unplaced: LedgerRow[];
  selected: string | null;
  onSelect: (slotId: string) => void;
  onEditRow: (row: LedgerRow) => void;
  editable: boolean;
  emptyText?: (slotId: string) => string; // what an empty slot is: ว่าง / Private / ปิดใช้งาน
  onClose: () => void;
}

// Everything on the map as a list: find a car by plate or name, and see who has no slot yet.
export default function CarList({ slots, cars, unplaced, selected, onSelect, onEditRow, editable, emptyText, onClose }: CarListProps) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/\s+/g, "");
    return slots
      .flatMap((s) => {
        const here = cars.filter((c) => c.slotId === s.id).sort((a, b) => (a.row.bay ?? 0) - (b.row.bay ?? 0));
        return here.length ? here.map((car) => ({ s, car, key: car.key })) : [{ s, car: null as LotCar | null, key: s.id }];
      })
      .filter(({ s, car }) => !term || `${s.number}${s.id}${car?.row.plate ?? ""}${car?.row.ownerName ?? ""}`.toLowerCase().replace(/\s+/g, "").includes(term));
  }, [slots, cars, q]);

  return (
    <div className="flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white/96 shadow-theme-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <div className="relative flex-1">
          <SearchGlyph className="pointer-events-none absolute inset-s-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาทะเบียน ชื่อ หรือเลขช่อง" aria-label="ค้นหารถ" className="app-input h-9 ps-8 text-theme-sm" />
        </div>
        <IconButton label="ปิดรายการ" onClick={onClose}><XMarkGlyph /></IconButton>
      </div>
      <ul className="custom-scrollbar flex-1 overflow-y-auto py-1">
        {unplaced.length > 0 && !q && (
          <li className="px-3 pt-2 pb-1">
            <p className="mb-1 text-theme-xs font-medium text-warning-800 dark:text-warning-400">ยังไม่ระบุช่อง ({unplaced.length})</p>
            <ul>
              {unplaced.map((r) => (
                <li key={r.id}>
                  <button
                    disabled={!editable}
                    onClick={() => onEditRow(r)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-start text-theme-sm hover:bg-gray-50 disabled:hover:bg-transparent dark:hover:bg-white/5"
                  >
                    <span className="truncate">{r.ownerName}</span>
                    <span className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{r.plate || "ไม่มีทะเบียน"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
        {rows.map(({ s, car, key }) => (
          <li key={key}>
            <button
              onClick={() => onSelect(key)}
              aria-current={selected === key ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-theme-sm hover:bg-gray-50 dark:hover:bg-white/5",
                selected === key && "bg-brand-25 dark:bg-brand-500/10",
              )}
            >
              <span className="w-6 shrink-0 text-end text-theme-xs text-gray-500 tabular-nums dark:text-gray-400">{s.number}</span>
              {car ? (
                <>
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[car.tone])} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{car.row.plate || "ไม่มีทะเบียน"}</span>
                    <span className="text-gray-500 dark:text-gray-400"> · {car.row.ownerName}</span>
                  </span>
                  <span className="shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{toneLabel[car.tone]}</span>
                </>
              ) : (
                <span className="flex-1 text-gray-500 dark:text-gray-400">{emptyText?.(s.id) ?? "ว่าง"}</span>
              )}
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">ไม่พบรถที่ตรงกับคำค้น</li>}
      </ul>
    </div>
  );
}
