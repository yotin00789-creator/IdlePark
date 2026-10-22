import Baht from "@/components/app/Baht";
import type { AppData } from "@/lib/dataStore";
import { monthName } from "@/lib/format";
import { rentedRows, slotStatus, toneLabel, type LotCar } from "@/lib/lot";
import { cn } from "@/utils";
import { useMemo } from "react";
import { feeFor, isPrepaid } from "../../../shared/calc";
import { slotLabel } from "../../../shared/lot";
import type { LedgerRow } from "../../../shared/types";
import type { SlotDef } from "./LotScene";

const DOT = { paid: "bg-success-500", pending: "bg-warning-500", late: "bg-error-500", empty: "bg-gray-400" } as const;

interface LotSummaryProps {
  data: AppData;
  cars: LotCar[];
  slots: SlotDef[];
  unplaced: LedgerRow[];
  onSelect: (slotId: string) => void;
  onOpenList: () => void;
}

// What the map means this month, at a glance: how much is collected, who has not paid.
export default function LotSummary({ data, cars, slots, unplaced, onSelect, onOpenList }: LotSummaryProps) {
  const { year, month } = data.today;
  const stats = useMemo(() => {
    const eligible = rentedRows(data).filter((r) => feeFor(r, month) > 0 && !isPrepaid(r, year, month));
    const expected = eligible.reduce((n, r) => n + feeFor(r, month), 0);
    const collected = eligible.reduce((n, r) => n + Math.min(r.payments[month - 1] ?? 0, feeFor(r, month)), 0);
    const count = { paid: 0, pending: 0, late: 0 };
    for (const c of cars) count[c.tone]++;
    const owing = cars
      .filter((c) => c.tone !== "paid")
      .map((c) => ({ c, due: c.unpaid.reduce((n, u) => n + u.due, 0) }))
      .sort((a, b) => Number(b.c.tone === "late") - Number(a.c.tone === "late") || b.due - a.due);
    const taken = new Set(cars.map((c) => c.slotId));
    const emptySlots = slots.filter((s) => !taken.has(s.id)).map((s) => slotStatus(data.zones, s.id).status);
    const vacant = emptySlots.filter((x) => x === "free").length;
    const reserved = emptySlots.filter((x) => x === "private").length;
    const closed = emptySlots.filter((x) => x === "closed").length;
    return { expected, collected, count, owing, vacant, reserved, closed };
  }, [data, cars, slots, year, month]);
  const pct = stats.expected ? Math.min(100, Math.round((stats.collected / stats.expected) * 100)) : 0;

  const tiles = [
    { tone: "paid", n: stats.count.paid },
    { tone: "pending", n: stats.count.pending },
    { tone: "late", n: stats.count.late },
    { tone: "empty", n: stats.vacant },
  ] as const;

  return (
    <aside aria-label="สรุปสถานะที่จอด" className="custom-scrollbar flex max-h-full flex-col gap-4 overflow-y-auto rounded-xl border border-gray-200 bg-white/96 p-4 text-gray-800 shadow-theme-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 dark:text-white/90">
      <div>
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">ค่าเช่าเดือน{monthName(month)} {year}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <Baht value={stats.collected} dash={false} className="text-2xl font-semibold" />
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">จาก <Baht value={stats.expected} dash={false} /> บาท</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="เก็บค่าเช่าได้แล้ว">
          <div className="h-full rounded-full bg-success-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">เก็บได้แล้ว {pct}%</p>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <li key={t.tone} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
            <span className="flex items-center gap-1.5 text-theme-xs text-gray-600 dark:text-gray-400">
              <span className={cn("size-2 rounded-full", DOT[t.tone])} aria-hidden />
              {toneLabel[t.tone]}
            </span>
            <span className="text-xl font-semibold tabular-nums">{t.n}</span>
            <span className="ms-1 text-theme-xs text-gray-500 dark:text-gray-400">{t.tone === "empty" ? "ช่อง" : "คัน"}</span>
          </li>
        ))}
      </ul>
      {(stats.reserved > 0 || stats.closed > 0) && (
        <p className="-mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
          ไม่นับเป็นที่ว่าง:{stats.reserved > 0 && <> <span className="inline-block size-2 rounded-full bg-violet-500 align-middle" aria-hidden /> Private {stats.reserved} ช่อง</>}{stats.closed > 0 && <> <span className="inline-block size-2 rounded-full bg-gray-700 align-middle dark:bg-gray-400" aria-hidden /> ปิดใช้งาน {stats.closed} ช่อง</>}
        </p>
      )}

      <div>
        <h2 className="mb-1.5 text-theme-sm font-semibold">ยังไม่ได้จ่าย</h2>
        {stats.owing.length === 0 ? (
          <p className="rounded-lg bg-success-50 px-3 py-2.5 text-theme-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
            {cars.length ? "ทุกคันในผังจ่ายครบแล้ว" : "ยังไม่มีรถในผัง"}
          </p>
        ) : (
          <ul className="-mx-1 divide-y divide-gray-100 dark:divide-gray-800">
            {stats.owing.map(({ c, due }) => (
              <li key={c.slotId}>
                <button onClick={() => onSelect(c.slotId)} className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-start hover:bg-gray-50 dark:hover:bg-white/5">
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[c.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-theme-sm font-medium">{c.row.plate || "ไม่มีทะเบียน"}</span>
                    <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{slotLabel(c.slotId)} · {c.row.ownerName}</span>
                  </span>
                  <span className="shrink-0 text-end">
                    <Baht value={due} dash={false} className="block text-theme-sm" />
                    <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{toneLabel[c.tone]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {unplaced.length > 0 && (
        <button onClick={onOpenList} className="rounded-lg bg-warning-50 px-3 py-2.5 text-start text-theme-sm text-warning-800 hover:bg-warning-100 dark:bg-warning-500/10 dark:text-warning-400">
          มี {unplaced.length} คันที่ยังไม่ระบุช่อง · กดเพื่อดูรายการ
        </button>
      )}
    </aside>
  );
}
