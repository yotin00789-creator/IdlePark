import type { AppData } from "@/lib/dataStore";
import { monthShort } from "@/lib/format";
import { slotStays, type SlotStay } from "@/lib/slotHistory";
import { cn } from "@/utils";
import { useMemo, useState } from "react";
import { vehicleLabel } from "../../../shared/lot";

const period = (s: SlotStay) => {
  const a = `${monthShort(s.from.month)} ${s.from.year}`;
  const b = `${monthShort(s.to.month)} ${s.to.year}`;
  return a === b ? a : `${a} – ${b}`;
};

/** The renters this slot had before the current one, newest first. */
export default function SlotHistory({ data, slotId }: { data: AppData; slotId: string }) {
  const previous = useMemo(() => slotStays(data, slotId).filter((s) => !s.current), [data, slotId]);
  const [all, setAll] = useState(false);
  const shown = all ? previous : previous.slice(0, 4);
  return (
    <section aria-label="ผู้เช่าก่อนหน้า">
      <h3 className="mb-1.5 flex items-baseline justify-between text-theme-xs font-medium text-gray-500 dark:text-gray-400">
        <span>ผู้เช่าก่อนหน้า{previous.length ? ` (${previous.length})` : ""}</span>
      </h3>
      {previous.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-theme-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          ยังไม่มีประวัติผู้เช่าก่อนหน้า ระบบเริ่มจดตามช่องที่ระบุในสมุดรายรับของแต่ละปี
        </p>
      ) : (
        <ol className="relative space-y-3 ps-4 before:absolute before:inset-y-1.5 before:start-[3px] before:w-px before:bg-gray-200 dark:before:bg-gray-700">
          {shown.map((s, i) => (
            <li key={`${s.key}-${s.from.year}-${s.from.month}`} className="relative">
              <span aria-hidden className={cn("absolute -start-4 top-1.5 size-[7px] rounded-full", i === 0 ? "bg-gold-500" : "bg-gray-300 dark:bg-gray-600")} />
              <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                {s.ownerName}
                {s.plate && <span className="ms-1.5 font-normal text-gray-600 dark:text-gray-300">{s.plate}</span>}
              </p>
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                {period(s)}{s.vehicleType ? ` · ${vehicleLabel(s.vehicleType)}` : ""}{s.ended ? " · เลิกเช่า" : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      {previous.length > 4 && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 text-theme-xs font-medium text-link">{all ? "แสดงน้อยลง" : `ดูทั้งหมด ${previous.length} ราย`}</button>
      )}
    </section>
  );
}
