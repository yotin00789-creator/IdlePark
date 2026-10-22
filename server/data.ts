// Loads the whole ledger as plain data. It is small (a few hundred rows), so the
// web app receives all years at once and recalculates everything locally and instantly.
import type { Queryable } from "./db.js";
import type { CalcOverride, ItemKind, LedgerRow, Money, PayMethod, SavingsData, YearData } from "../shared/types.js";
import { ITEM_KINDS } from "../shared/types.js";

const blank = (): Money[] => Array.from({ length: 12 }, () => null);
const blankMethods = (): (PayMethod | null)[] => Array.from({ length: 12 }, () => null);
const blankAccounts = (): (number | null)[] => Array.from({ length: 12 }, () => null);

export const rowFromDb = (r: Record<string, any>, payments: Money[] = blank(), methods: (PayMethod | null)[] = blankMethods(), accounts: (number | null)[] = blankAccounts()): LedgerRow => ({
  id: r.id,
  year: r.year,
  sortOrder: r.sort_order,
  customerId: r.customer_id,
  ownerName: r.owner_name,
  plate: r.plate,
  plateProvince: r.plate_province ?? "",
  slotId: r.slot_id ?? null,
  vehicleType: r.vehicle_type ?? null,
  carColor: r.car_color ?? null,
  bay: r.bay ?? null,
  dueDay: r.due_day ?? null,
  zoneId: r.zone_id,
  kind: r.kind,
  bulkCount: r.bulk_count,
  sourceRow: r.source_row,
  monthlyFee: r.monthly_fee,
  feeChanges: Array.isArray(r.fee_changes) ? r.fee_changes : [],
  paidThroughYear: r.paid_through_year,
  paidThroughMonth: r.paid_through_month,
  startMonth: r.start_month,
  endMonth: r.end_month,
  note: r.note,
  needsReview: r.needs_review,
  isActive: r.is_active,
  payments,
  payMethods: methods,
  payAccounts: accounts,
});

export async function loadYears(q: Queryable, extraYears: number[] = []): Promise<YearData[]> {
  const [rows, pays, items, overrides] = await Promise.all([
    q.query("select * from ledger_rows order by year, sort_order, id"),
    q.query("select row_id, month, amount, method, account_id from payments"),
    q.query("select year, month, kind, amount from year_items"),
    q.query("select * from calc_overrides order by year, month, field"),
  ]);
  const byRow = new Map<number, Money[]>();
  const methodsByRow = new Map<number, (PayMethod | null)[]>();
  const accountsByRow = new Map<number, (number | null)[]>();
  for (const p of pays) {
    const arr = byRow.get(p.row_id) ?? blank();
    arr[p.month - 1] = p.amount;
    byRow.set(p.row_id, arr);
    const ms = methodsByRow.get(p.row_id) ?? blankMethods();
    if (p.amount != null) ms[p.month - 1] = p.method;
    methodsByRow.set(p.row_id, ms);
    const as = accountsByRow.get(p.row_id) ?? blankAccounts();
    if (p.amount != null) as[p.month - 1] = p.account_id;
    accountsByRow.set(p.row_id, as);
  }
  const years = new Map<number, YearData>();
  const ensure = (year: number) => {
    let y = years.get(year);
    if (!y) {
      y = {
        year,
        rows: [],
        items: { to_father: blank(), pay_aunt: blank(), total_expense: blank(), collect: blank() },
        overrides: [],
      };
      years.set(year, y);
    }
    return y;
  };
  for (const r of rows) ensure(r.year).rows.push(rowFromDb(r, byRow.get(r.id) ?? blank(), methodsByRow.get(r.id), accountsByRow.get(r.id)));
  for (const i of items) {
    if (ITEM_KINDS.includes(i.kind as ItemKind)) ensure(i.year).items[i.kind as ItemKind][i.month - 1] = i.amount;
  }
  for (const o of overrides) {
    ensure(o.year).overrides.push({
      id: o.id,
      year: o.year,
      month: o.month,
      field: o.field,
      mode: o.mode,
      value: o.value ?? {},
      note: o.note,
    } satisfies CalcOverride);
  }
  for (const y of extraYears) ensure(y);
  return [...years.values()].sort((a, b) => a.year - b.year);
}

export async function loadSavings(q: Queryable) {
  const [days, items, notes] = await Promise.all([
    q.query("select year, month, day, amount from savings_days"),
    q.query("select year, month, kind, amount from savings_items"),
    q.query("select year, label, amount from year_notes where scope = 'savings' order by id"),
  ]);
  const map = new Map<number, SavingsData>();
  const ensure = (year: number) => {
    let s = map.get(year);
    if (!s) {
      s = {
        year,
        days: Array.from({ length: 12 }, () => Array(31).fill(null)),
        expense: blank(),
        card: blank(),
      };
      map.set(year, s);
    }
    return s;
  };
  for (const d of days) ensure(d.year).days[d.month - 1][d.day - 1] = d.amount;
  for (const i of items) ensure(i.year)[i.kind as "expense" | "card"][i.month - 1] = i.amount;
  return {
    savings: [...map.values()].sort((a, b) => a.year - b.year),
    notes: notes.map((n) => ({ year: n.year as number, label: n.label as string, amount: n.amount as number | null })),
  };
}
