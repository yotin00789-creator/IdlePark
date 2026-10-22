// How money is being received right now (cash, or a transfer into a chosen account). The ledger uses it for
// every amount typed or pasted into the grid, and the quick "paid" dialog starts from it. Remembered per browser.
import { useSyncExternalStore } from "react";
import type { PayMethod } from "../../shared/types";

export interface PayMode {
  method: PayMethod;
  accountId: number | null;
}

const KEY = "idlepark.payMode";
const read = (): PayMode => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && (v.method === "cash" || v.method === "transfer")) return { method: v.method, accountId: typeof v.accountId === "number" ? v.accountId : null };
  } catch {
    /* private window: use the default */
  }
  return { method: "cash", accountId: null };
};

let mode: PayMode = read();
const listeners = new Set<() => void>();

export const payMode = {
  get: () => mode,
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  set(next: PayMode) {
    mode = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not remembered: fine */
    }
    listeners.forEach((l) => l());
  },
};

export const usePayMode = () => useSyncExternalStore(payMode.subscribe, payMode.get);

/** The fields to send with an amount, for the current mode (a transfer names the account, if the family has one). */
export const modeFields = (accounts: { id: number }[]): { method: PayMethod; accountId: number | null } => {
  const m = payMode.get();
  if (m.method === "cash") return { method: "cash", accountId: null };
  return { method: "transfer", accountId: accounts.some((a) => a.id === m.accountId) ? m.accountId : (accounts[0]?.id ?? null) };
};
