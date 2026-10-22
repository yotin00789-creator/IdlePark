import { useSyncExternalStore } from "react";

export type ToastTone = "success" | "error" | "info" | "warning";
export interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
  detail?: string;
  ms: number;
}
let items: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const timers = new Map<number, number>();

function push(tone: ToastTone, text: string, detail?: string, key?: string) {
  const ms = tone === "error" ? 7000 : detail ? 5000 : 3800;
  // the same message again replaces the one on screen instead of stacking (rapid cell edits)
  const same = items.find((t) => t.tone === tone && t.text === text && t.detail === detail);
  if (same) dismiss(same.id);
  const id = ++seq;
  items = [...items.slice(-3), { id, tone, text, detail, ms }];
  emit();
  timers.set(id, window.setTimeout(() => dismiss(id), ms));
  void key;
}
export const dismiss = (id: number) => {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  items = items.filter((t) => t.id !== id);
  emit();
};
export const toast = {
  success: (text: string, detail?: string) => push("success", text, detail),
  error: (text: string, detail?: string) => push("error", text, detail),
  info: (text: string, detail?: string) => push("info", text, detail),
  warning: (text: string, detail?: string) => push("warning", text, detail),
};
export const useToasts = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => items,
  );
