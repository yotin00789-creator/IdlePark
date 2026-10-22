import Baht from "@/components/app/Baht";

const unit = "text-theme-xs font-normal text-gray-500 dark:text-gray-400";

/** "1,200 /เดือน" and, when there is a yearly fee (the storage shed), "+ 3,000 /ปี" under it: nothing is averaged or hidden. */
export default function RentTotal({ monthly, yearly, className }: { monthly: number; yearly: number; className?: string }) {
  const showMonthly = monthly > 0 || yearly === 0;
  return (
    <span className={className}>
      {showMonthly && <span className="block"><Baht value={monthly} dash={false} /> <span className={unit}>/เดือน</span></span>}
      {yearly > 0 && (
        <span className={showMonthly ? "block text-theme-sm" : "block"}>
          {showMonthly && <span className="text-gray-500 dark:text-gray-400">+ </span>}
          <Baht value={yearly} dash={false} /> <span className={unit}>/ปี</span>
        </span>
      )}
    </span>
  );
}
