// Types shared by the web app, the API and the tests.
// Money is always an integer number of satang (1 baht = 100 satang); null = "no data".

export type Role = "admin" | "editor" | "viewer";
export type RowKind = "normal" | "excluded" | "bulk";
export type ItemKind = "to_father" | "pay_aunt" | "total_expense" | "collect";
export type FormulaMode = "legacy" | "standard";
export type OverrideField = "income_rows" | "skip_collect";

export const ITEM_KINDS: ItemKind[] = [
  "to_father",
  "pay_aunt",
  "total_expense",
  "collect",
];

export type Money = number | null;
export type Months<T> = T[]; // always length 12, index 0 = January

export interface LedgerRow {
  id: number;
  year: number;
  sortOrder: number;
  customerId: number | null;
  ownerName: string;
  plate: string;
  plateProvince: string;
  slotId: string | null; // 3D lot slot, e.g. "N01"
  vehicleType: string | null;
  carColor: string | null; // #rrggbb
  bay: number | null; // motorcycle bay inside the slot (0-based)
  dueDay: number | null; // day of month this vehicle pays; null = the default in settings
  zoneId: number | null;
  kind: RowKind;
  bulkCount: number;
  sourceRow: number | null; // row number in the original Excel sheet
  isOwner: boolean; // an owner's vehicle: no rent, no reminders, not in the totals
  billing: "monthly" | "yearly"; // pays every month, or once a year in startMonth
  monthlyFee: number; // satang: the price at the start of the year (the whole year's fee for a yearly row)
  feeChanges: FeeChange[]; // price changes within the year, each one from `month` on
  paidThroughYear: number | null;
  paidThroughMonth: number | null;
  startMonth: number; // first month of the tenancy within this year (1..12)
  endMonth: number | null; // last month, when the tenant left mid-year
  note: string;
  needsReview: boolean;
  isActive: boolean;
  payments: Months<Money>;
  payMethods: Months<PayMethod | null>; // how each month's money arrived (null = nothing recorded)
  payAccounts: Months<number | null>; // the bank account of a transfer
}

export type PayMethod = "cash" | "transfer";
export const PAY_METHOD_LABEL: Record<PayMethod, string> = { cash: "เงินสด", transfer: "โอนเข้าบัญชี" };

export interface FeeChange {
  month: number; // 2..12: the new price applies from this month on
  fee: number; // satang
}

export interface CalcOverride {
  id: number;
  year: number;
  month: number; // 1..12
  field: OverrideField;
  mode: FormulaMode;
  // income_rows: { from, to } source-row range the original Excel SUM used
  // skip_collect: {}
  value: { from?: number; to?: number };
  note: string;
}

export interface YearData {
  year: number; // Buddhist era
  rows: LedgerRow[];
  items: Record<ItemKind, Months<Money>>;
  overrides: CalcOverride[];
}

export interface MonthCalc {
  income: number;
  toFather: number;
  payAunt: number;
  totalExpense: number;
  collect: number;
  net: number;
  legacyIncome: boolean; // income computed with an Excel-original range
  legacyNoCollect: boolean; // net computed without subtracting collect
}

export interface YearCalc {
  year: number;
  months: Months<MonthCalc>;
  totals: {
    income: number;
    toFather: number;
    payAunt: number;
    totalExpense: number;
    collect: number;
    net: number;
  };
  cumulativeStart: number;
  cumulative: number; // "ยอดคงเหลือทั้งหมด" at end of the year
}

export interface SavingsData {
  year: number;
  days: Months<(number | null)[]>; // [month][day-1], 31 entries
  expense: Months<Money>;
  card: Months<Money>;
}

export interface SavingsCalc {
  year: number;
  monthTotal: Months<number>;
  monthRemain: Months<number>;
  yearRemain: number;
}
