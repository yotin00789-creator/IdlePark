// The page title and description live in the top bar. Each page's PageHeader publishes
// them here and the header shows them (replaces the old search box).
import { useSyncExternalStore } from "react";

interface PageTitle {
  title: string;
  description?: string;
}
let current: PageTitle = { title: "" };
const listeners = new Set<() => void>();

export const pageTitle = {
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  get: () => current,
  set(next: PageTitle) {
    if (next.title === current.title && next.description === current.description) return;
    current = next;
    listeners.forEach((l) => l());
  },
};
export const usePageTitle = () => useSyncExternalStore(pageTitle.subscribe, pageTitle.get);
