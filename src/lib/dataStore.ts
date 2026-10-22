// Holds the whole ledger in memory. All totals are computed from it with the shared
// calc engine, so typing a number updates every page instantly; the server call
// happens in the background and a failure rolls the change back.
import { useMemo, useSyncExternalStore } from "react";
import { calcAll, calcSavings } from "../../shared/calc";
import type { ItemKind, LedgerRow, Money, PayMethod, SavingsData, YearCalc, YearData } from "../../shared/types";
import type { BangkokDate } from "../../shared/thai";
import { api, ApiError } from "./api";
import { confirmMoney } from "./confirm";
import { formatBaht, THAI_MONTHS } from "../../shared/thai";
import { toast } from "./toast";

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  note: string;
  isActive: boolean;
}
export interface Zone {
  id: number;
  name: string;
  description: string;
  access: "public" | "private";
  slotIds: string[];
  motoCapacity: number;
  capacity: number | null;
  defaultFee: number | null;
  sortOrder: number;
  isActive: boolean;
}
export interface Account {
  id: number;
  bank: string;
  masked: string;
  holder: string;
  label: string;
  shows: "net" | "collect";
}
export interface ReminderSettings {
  enabled: boolean;
  dueDay: number;
  firstAfterDays: number;
  sendTime: string;
  intervalDays: number;
  maxRounds: number;
  lookbackMonths: number;
  recipients: "admins" | "admins_editors";
  email: boolean;
  bell: boolean;
}
export interface AppData {
  today: BangkokDate;
  years: YearData[];
  savings: SavingsData[];
  savingsNotes: { year: number; label: string; amount: number | null }[];
  customers: Customer[];
  zones: Zone[];
  accounts: Account[];
  settings: { monthlyFeeDefault: number; reminders: ReminderSettings; menu: { hidden: string[] } };
  lastReminderAt: string | null;
}

interface State {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  loadedAt: number;
}
let state: State = { data: null, loading: false, error: null, loadedAt: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let inflight: Promise<void> | null = null;
let pendingWrites = 0;

export const dataStore = {
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  get: () => state,
  async load(force = false) {
    if (inflight) return inflight;
    if (!force && state.data && Date.now() - state.loadedAt < 10_000) return;
    inflight = (async () => {
      if (!state.data) set({ loading: true });
      try {
        const data = await api.get<AppData>("/data");
        // don't clobber optimistic edits that are still being saved
        if (pendingWrites === 0) set({ data, error: null, loading: false, loadedAt: Date.now() });
        else set({ loading: false });
      } catch (e) {
        set({ error: e instanceof ApiError ? e.message : "โหลดข้อมูลไม่สำเร็จ", loading: false });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  /** Put a row the server just returned straight into the store (payments are kept). */
  mergeRow(row: LedgerRow) {
    const d = state.data;
    if (!d) return;
    set({
      data: {
        ...d,
        years: d.years.map((y) =>
          y.year !== row.year
            ? y
            : {
                ...y,
                rows: y.rows.some((r) => r.id === row.id)
                  ? y.rows.map((r) => (r.id === row.id ? { ...r, ...row, payments: r.payments } : r))
                  : [...y.rows, row],
              },
        ),
      },
    });
  },
  reset() {
    set({ data: null, loading: false, error: null, loadedAt: 0 });
  },
  /** Apply an optimistic change, persist it, roll back on failure. */
  async optimistic<T>(apply: (d: AppData) => AppData, save: () => Promise<T>, failMessage = "บันทึกไม่สำเร็จ", successMessage: string | null = "บันทึกแล้ว"): Promise<T | undefined> {
    const before = state.data;
    if (!before) return undefined;
    set({ data: apply(before) });
    pendingWrites++;
    try {
      const out = await save();
      if (successMessage) toast.success(successMessage, "ข้อมูลถูกเก็บในฐานข้อมูลแล้ว");
      return out;
    } catch (e) {
      set({ data: before });
      toast.error(e instanceof ApiError ? e.message : failMessage);
      return undefined;
    } finally {
      pendingWrites--;
      if (pendingWrites === 0) void dataStore.load(true);
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    if (state.data) void dataStore.load();
  });
  window.setInterval(() => {
    if (state.data && document.visibilityState === "visible") void dataStore.load(true);
  }, 60_000);
}

export const useData = () => useSyncExternalStore(dataStore.subscribe, dataStore.get);

/** All yearly calculations, recomputed whenever the data changes. */
export function useCalc() {
  const { data } = useData();
  return useMemo(() => {
    if (!data) return null;
    const calc = calcAll(data.years);
    const byYear = new Map<number, YearCalc>(calc.map((c) => [c.year, c]));
    const yearData = new Map<number, YearData>(data.years.map((y) => [y.year, y]));
    const savings = data.savings.map((s) => ({ data: s, calc: calcSavings(s) }));
    return { data, calc, byYear, yearData, savings, savingsTotal: savings.reduce((n, s) => n + s.calc.yearRemain, 0) };
  }, [data]);
}

// ----------------------------------------------------------- edit helpers

export interface PaymentChange {
  rowId: number;
  month: number;
  amount: Money;
  method?: PayMethod; // omitted = keep how it was paid (new money defaults to cash on the server)
  accountId?: number | null; // for a transfer: which bank account
}

export function savePayments(changes: PaymentChange[]) {
  if (!changes.length) return Promise.resolve(undefined);
  return dataStore.optimistic(
    (d) => ({
      ...d,
      years: d.years.map((y) => {
        const mine = changes.filter((c) => y.rows.some((r) => r.id === c.rowId));
        if (!mine.length) return y;
        return {
          ...y,
          rows: y.rows.map((r) => {
            const rc = mine.filter((c) => c.rowId === r.id);
            if (!rc.length) return r;
            const payments = [...r.payments];
            const payMethods = [...r.payMethods];
            const payAccounts = [...r.payAccounts];
            for (const c of rc) {
              payments[c.month - 1] = c.amount;
              if (c.amount == null) {
                payMethods[c.month - 1] = null;
                payAccounts[c.month - 1] = null;
              } else {
                const method = c.method ?? payMethods[c.month - 1] ?? "cash";
                payMethods[c.month - 1] = method;
                payAccounts[c.month - 1] = method === "transfer" ? (c.method ? (c.accountId ?? null) : payAccounts[c.month - 1]) : null;
              }
            }
            return { ...r, payments, payMethods, payAccounts };
          }),
        };
      }),
    }),
    () => api.put("/ledger/payments", { changes }),
  );
}

const ITEM_NAME: Record<ItemKind, string> = { to_father: "ให้พ่อ", pay_aunt: "จ่ายป้า", total_expense: "ค่าใช้จ่ายรวม", collect: "เก็บเงิน" };
const fmt = (v: Money) => (v == null ? "ว่าง" : formatBaht(v));

/** Ask once, in plain words, before recording these "money out / set aside" figures. */
export async function confirmItemChanges(changes: ItemChange[], years: YearData[]) {
  const lines = changes.map((c) => ({
    label: `${ITEM_NAME[c.kind]} · ${THAI_MONTHS[c.month - 1]} ${c.year}`,
    before: fmt(years.find((y) => y.year === c.year)?.items[c.kind][c.month - 1] ?? null),
    after: fmt(c.amount),
  }));
  return confirmMoney(lines);
}

export interface ItemChange {
  year: number;
  month: number;
  kind: ItemKind;
  amount: Money;
}
export function saveItems(changes: ItemChange[]) {
  if (!changes.length) return Promise.resolve(undefined);
  return dataStore.optimistic(
    (d) => ({
      ...d,
      years: d.years.map((y) => {
        const mine = changes.filter((c) => c.year === y.year);
        if (!mine.length) return y;
        const items = { ...y.items };
        for (const c of mine) {
          const arr = [...items[c.kind]];
          arr[c.month - 1] = c.amount;
          items[c.kind] = arr;
        }
        return { ...y, items };
      }),
    }),
    () => api.put("/ledger/items", { changes }),
  );
}

export interface DayChange {
  year: number;
  month: number;
  day: number;
  amount: Money;
}
export function saveSavingsDays(changes: DayChange[]) {
  if (!changes.length) return Promise.resolve(undefined);
  return dataStore.optimistic(
    (d) => ({
      ...d,
      savings: ensureSavings(d.savings, changes.map((c) => c.year)).map((s) => {
        const mine = changes.filter((c) => c.year === s.year);
        if (!mine.length) return s;
        const days = s.days.map((col) => [...col]);
        for (const c of mine) days[c.month - 1][c.day - 1] = c.amount;
        return { ...s, days };
      }),
    }),
    () => api.put("/savings/days", { changes }),
  );
}

export interface SavingsItemChange {
  year: number;
  month: number;
  kind: "expense" | "card";
  amount: Money;
}
export function saveSavingsItems(changes: SavingsItemChange[]) {
  if (!changes.length) return Promise.resolve(undefined);
  return dataStore.optimistic(
    (d) => ({
      ...d,
      savings: ensureSavings(d.savings, changes.map((c) => c.year)).map((s) => {
        const mine = changes.filter((c) => c.year === s.year);
        if (!mine.length) return s;
        const next = { ...s, expense: [...s.expense], card: [...s.card] };
        for (const c of mine) next[c.kind][c.month - 1] = c.amount;
        return next;
      }),
    }),
    () => api.put("/savings/items", { changes }),
  );
}

function ensureSavings(list: SavingsData[], years: number[]) {
  const out = [...list];
  for (const y of new Set(years)) {
    if (!out.some((s) => s.year === y)) {
      out.push({
        year: y,
        days: Array.from({ length: 12 }, () => Array(31).fill(null)),
        expense: Array(12).fill(null),
        card: Array(12).fill(null),
      });
    }
  }
  return out.sort((a, b) => a.year - b.year);
}
