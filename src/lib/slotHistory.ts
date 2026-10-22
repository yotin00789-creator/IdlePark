// Who rented a slot before: read from the ledger of every year (a row keeps its slot), joined
// into one stay when the same person continues from one year to the next.
import type { AppData } from "./dataStore";
import type { LedgerRow } from "../../shared/types";

export interface SlotStay {
  key: string;
  ownerName: string;
  plate: string;
  vehicleType: string | null;
  customerId: number | null;
  from: { year: number; month: number };
  to: { year: number; month: number };
  current: boolean; // still renting this month
  ended: boolean; // stopped (switched off, or an end month passed)
}

const ym = (y: number, m: number) => y * 12 + (m - 1);
const parts = (v: number) => ({ year: Math.floor(v / 12), month: (v % 12) + 1 });

/** Last month a row counted as rented: its end month, else the last month with money, else the year end. */
function lastMonth(r: LedgerRow, today: { year: number; month: number }): number {
  if (r.endMonth) return ym(r.year, r.endMonth);
  if (r.isActive) return r.year < today.year ? ym(r.year, 12) : ym(r.year, Math.max(today.month, r.startMonth));
  const paid = r.payments.reduce<number>((last, p, i) => (p != null && p > 0 ? i + 1 : last), 0);
  return ym(r.year, Math.max(paid, r.startMonth));
}

export function slotStays(data: AppData, slotId: string): SlotStay[] {
  const { today } = data;
  const rows: LedgerRow[] = [];
  for (const y of data.years) for (const r of y.rows) if (r.slotId === slotId && r.kind !== "excluded") rows.push(r);
  rows.sort((a, b) => a.year - b.year || a.startMonth - b.startMonth || a.id - b.id);

  const stays: SlotStay[] = [];
  for (const r of rows) {
    const who = r.customerId != null ? `c${r.customerId}` : `n${r.ownerName}|${r.plate}`;
    const start = ym(r.year, r.startMonth);
    const end = Math.max(start, lastMonth(r, today));
    const rentingNow = r.isActive && r.year === today.year && r.startMonth <= today.month && (r.endMonth == null || r.endMonth >= today.month);
    const prev = stays.findLast((s) => s.key === who && ym(s.to.year, s.to.month) + 1 >= start && !s.ended);
    if (prev) {
      if (end > ym(prev.to.year, prev.to.month)) prev.to = parts(end);
      prev.current ||= rentingNow;
      prev.ended = !r.isActive || r.endMonth != null;
      prev.plate = r.plate || prev.plate;
      prev.vehicleType = r.vehicleType ?? prev.vehicleType;
      continue;
    }
    stays.push({
      key: who, ownerName: r.ownerName, plate: r.plate, vehicleType: r.vehicleType, customerId: r.customerId,
      from: parts(start), to: parts(end), current: rentingNow, ended: !r.isActive || r.endMonth != null,
    });
  }
  return stays.reverse(); // newest first
}
