// "Do you confirm this?" popup for money the family decides freely (e.g. a bigger gift to father this month).
// It never blocks or warns: it only asks the person to confirm what they are about to record.
import { useSyncExternalStore } from "react";

export interface ConfirmLine {
  label: string; // "ให้พ่อ · กันยายน 2569"
  before: string; // "1,200" or "ว่าง"
  after: string;
}
export interface ConfirmRequest {
  id: number;
  lines: ConfirmLine[];
  resolve: (ok: boolean) => void;
}

let current: ConfirmRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Resolves true when the person confirms, false when they cancel. */
export function confirmMoney(lines: ConfirmLine[]): Promise<boolean> {
  if (!lines.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    current?.resolve(false); // a newer request replaces an unanswered one
    current = { id: ++seq, lines, resolve };
    emit();
  });
}
export function answerConfirm(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}
export const useConfirm = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
