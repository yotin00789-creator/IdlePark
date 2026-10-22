import type { CellStatus } from "../../../shared/calc";

export const STATUS_LABEL: Record<CellStatus, string> = {
  full: "ชำระครบ",
  partial: "ชำระบางส่วน",
  zero: "ชำระ 0",
  empty: "ยังไม่มีข้อมูล",
  future: "ยังไม่ถึงเดือน",
};

export const CELL_TONE: Record<CellStatus, string> = {
  full: "bg-success-25 text-gray-800 dark:bg-success-500/5 dark:text-gray-200",
  partial: "bg-warning-50 text-warning-800 underline decoration-dotted underline-offset-4 dark:bg-warning-500/10 dark:text-warning-400",
  zero: "bg-error-50 font-semibold text-error-700 dark:bg-error-500/10 dark:text-error-400",
  empty: "text-gray-500 dark:text-gray-400",
  future: "bg-gray-50 text-gray-500 dark:bg-white/2 dark:text-gray-400",
};
