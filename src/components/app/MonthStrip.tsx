import { monthStatus, type CellStatus } from "../../../shared/calc";
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
  row: Pick<LedgerRow, "monthlyFee" | "feeChanges" | "slotId" | "startMonth">;
  year: number;
  today: { year: number; month: number };
  className?: string;
}

// 12 small cells, one per month: green paid, amber partial, red zero, gray empty.
export default function MonthStrip({ payments, row, year, today, className }: MonthStripProps) {
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
