import { cn } from "@/utils";

// The one signature element: a licence-plate chip for the car number.
export default function PlateChip({ plate, className }: { plate: string; className?: string }) {
  const t = plate.trim();
  if (!t) return <span className="text-gray-500 dark:text-gray-400">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-gray-300 bg-white px-1.5 py-px text-theme-xs font-semibold tracking-wide whitespace-nowrap text-gray-900 shadow-theme-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white",
        className,
      )}
    >
      {t}
    </span>
  );
}
