export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export interface BangkokDate {
  year: number; // Buddhist era
  month: number; // 1..12
  day: number;
}

/** Current date in Asia/Bangkok, with the year in the Buddhist era. */
export function bangkokToday(now: Date = new Date()): BangkokDate {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year") + 543, month: get("month"), day: get("day") };
}

/** Whole days between two Bangkok calendar dates (b - a). */
export function daysBetween(a: BangkokDate, b: BangkokDate) {
  const ms = (d: BangkokDate) => Date.UTC(d.year - 543, d.month - 1, d.day);
  return Math.round((ms(b) - ms(a)) / 86400000);
}

export const formatBaht = (satang: number, opts: { sign?: boolean } = {}) => {
  const v = satang / 100;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (v < 0) return `−${s}`;
  return opts.sign && v > 0 ? `+${s}` : s;
};

/** "1,200" or "1200.50" typed by a person -> satang, or null when empty/invalid. */
export function parseBaht(input: string): number | null | "invalid" {
  const t = input.replace(/[,\s฿]/g, "").trim();
  if (t === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return "invalid";
  return Math.round(Number(t) * 100);
}

// ------------------------------------------------------------ Thai date & time
// The whole system speaks Asia/Bangkok time and shows Buddhist-era dates in full:
//   "วันที่ 1 มกราคม 2569 เวลา 14.00 น."

export const TZ = "Asia/Bangkok";

export interface BangkokClock extends BangkokDate {
  hour: number;
  minute: number;
}

const clockFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Wall-clock date and time in Thailand for an instant. */
export function bangkokClock(d: Date | string | number = new Date()): BangkokClock {
  const parts = clockFmt.formatToParts(new Date(d));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year") + 543, month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

const two = (n: number) => String(n).padStart(2, "0");

/** "1 มกราคม 2569" */
export const formatThaiDate = (d: Date | string | number) => {
  const c = bangkokClock(d);
  return `${c.day} ${THAI_MONTHS[c.month - 1]} ${c.year}`;
};
/** "14.00 น." */
export const formatThaiTime = (d: Date | string | number) => {
  const c = bangkokClock(d);
  return `${two(c.hour)}.${two(c.minute)} น.`;
};
/** "วันที่ 1 มกราคม 2569 เวลา 14.00 น." */
export const formatThaiDateTime = (d: Date | string | number) => `วันที่ ${formatThaiDate(d)} เวลา ${formatThaiTime(d)}`;

/** A calendar date typed as ISO "2026-01-01" (Gregorian) -> "1 มกราคม 2569". */
export const formatIsoThai = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
};

/** "08:00" -> minutes after midnight (null when not a valid HH:MM). */
export function parseClock(v: unknown): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
/** minutes after midnight -> "08.00 น." */
export const formatClockMinutes = (min: number) => `${two(Math.floor(min / 60))}.${two(min % 60)} น.`;
export const minutesToHHMM = (min: number) => `${two(Math.floor(min / 60))}:${two(min % 60)}`;

/** Days in a month of a Buddhist-era year. */
export const daysInMonth = (yearBE: number, month: number) => new Date(Date.UTC(yearBE - 543, month, 0)).getUTCDate();
