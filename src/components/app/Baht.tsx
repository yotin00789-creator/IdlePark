import { formatBaht } from "@/lib/format";
import { cn } from "@/utils";

interface BahtProps {
  value: number | null | undefined; // satang
  className?: string;
  sign?: boolean;
  dash?: boolean; // show an em dash for empty
  signColor?: boolean; // red when negative, green when positive
}

// Money: tabular figures, right-aligned by the parent, negative numbers carry a real minus sign.
export default function Baht({ value, className, sign, dash = true, signColor }: BahtProps) {
  if (value == null) return <span className={cn("num text-gray-500 dark:text-gray-400", className)}>{dash ? "—" : "0"}</span>;
  return (
    <span
      className={cn(
        "num",
        signColor && (value < 0 ? "text-error-600 dark:text-error-500" : value > 0 ? "text-success-600 dark:text-success-500" : ""),
        value < 0 && !signColor && "text-error-600 dark:text-error-500",
        className,
      )}
    >
      {formatBaht(value, { sign })}
    </span>
  );
}
