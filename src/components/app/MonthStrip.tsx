import { isYearly, monthStatus, yearlyStatus, type CellStatus } from "../../../shared/calc";
import type { LedgerRow, Money } from "../../../shared/types";
import { monthShort } from "@/lib/format";
import { STATUS_LABEL } from "@/components/ledger/status";
import { cn } from "@/utils";

const TONE: Record<CellStatus, string> = {
  full: "bg-success-500",
  partial: "bg-warning-500",
  zero: "bg-error-500",
  empty: "bg-gray-300 dark:bg-gray-600",
  future: "bg-gray-100 dark:bg-gray-800",
};
interface MonthStripProps {
  payments: Money[];
  row: Pick<LedgerRow, "monthlyFee" | "feeChanges" | "slotId" | "startMonth" | "billing">;
  year: number;
  today: { year: number; month: number };
  className?: string;
}

// 12 small cells, one per month: green paid, amber partial, red zero, gray empty.
export default function MonthStrip({ payments, row, year, today, className }: MonthStripProps) {
  if (isYearly(row)) {
    // a yearly renter is one long bar: green when the year's rent is paid, red when it is owed
    const st = yearlyStatus({ ...row, payments, year }, today);
    return (
      <div className={cn("flex items-center gap-2", className)} role="img" aria-label={`ชำระปีละครั้ง: ${STATUS_LABEL[st]}`}>
        <span className={cn("h-1.5 flex-1 rounded-full", st === "empty" ? "bg-error-500" : TONE[st])} />
        <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">รายปี</span>
      </div>
    );
  }
  return (
    <div className={cn("flex gap-0.5", className)} role="img" aria-label="สถานะการชำระ 12 เดือน">
      {payments.map((p, i) => {
        const future = year > today.year || (year === today.year && i + 1 > today.month);
        const st = monthStatus(row, i + 1, p, future);
        return <span key={i} title={`${monthShort(i + 1)}: ${STATUS_LABEL[st]}`} className={cn("h-1.5 flex-1 rounded-full", TONE[st])} />;
      })}
    </div>
  );
}
