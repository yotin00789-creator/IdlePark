import { formatBaht, formatThaiDate, formatThaiDateTime, THAI_MONTHS, THAI_MONTHS_SHORT } from "../../shared/thai";

export { formatBaht, parseBaht, THAI_MONTHS, THAI_MONTHS_SHORT, bangkokToday, bangkokClock, formatThaiDate, formatThaiTime, formatThaiDateTime, formatIsoThai, daysInMonth } from "../../shared/thai";

/** "1,200" or "—" for empty. */
export const bahtOrDash = (v: number | null | undefined) => (v == null ? "—" : formatBaht(v));

/** "วันที่ 1 มกราคม 2569 เวลา 14.00 น." (Thailand time) */
export const formatDateTime = (v: string | Date) => formatThaiDateTime(v);
/** "1 มกราคม 2569" */
export const formatDate = (v: string | Date) => formatThaiDate(v);

export function relativeTime(v: string | Date) {
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 45) return "เมื่อสักครู่";
  if (s < 3600) return `${Math.round(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.round(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} วันที่แล้ว`;
  return formatThaiDate(v);
}

export const monthName = (m: number) => THAI_MONTHS[m - 1];
export const monthShort = (m: number) => THAI_MONTHS_SHORT[m - 1];
