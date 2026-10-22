import { useSyncExternalStore } from "react";
import { api, onUnauthorized } from "./api";

export type Role = "admin" | "editor" | "viewer";
export interface SessionUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  mfaEnabled: boolean;
  avatarVersion: number;
  hasAvatar: boolean;
  lastLoginAt: string | null;
}

export type AuthStatus = "loading" | "setup" | "anon" | "mfa" | "authed";
interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
}

let state: AuthState = { status: "loading", user: null };
const listeners = new Set<() => void>();
const set = (next: AuthState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const auth = {
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  get: () => state,
  async refresh() {
    try {
      const s = await api.get<{ needsSetup: boolean; authenticated: boolean; mfaPending: boolean }>("/auth/state");
      if (s.needsSetup) return set({ status: "setup", user: null });
      if (s.mfaPending) return set({ status: "mfa", user: null });
      if (!s.authenticated) return set({ status: "anon", user: null });
      const me = await api.get<{ user: SessionUser }>("/auth/me");
      set({ status: "authed", user: me.user });
    } catch {
      set({ status: "anon", user: null });
    }
  },
  setUser: (user: SessionUser) => set({ status: "authed", user }),
  setMfaPending: () => set({ status: "mfa", user: null }),
  async signOut() {
    try {
      await api.post("/auth/logout");
    } catch {
      /* already signed out */
    }
    set({ status: "anon", user: null });
  },
};

onUnauthorized(() => {
  if (state.status === "authed") set({ status: "anon", user: null });
});

export const useAuth = () => useSyncExternalStore(auth.subscribe, auth.get);
export const useUser = () => {
  const u = useAuth().user;
  if (!u) throw new Error("useUser outside an authenticated route");
  return u;
};
export const canEdit = (u: SessionUser | null) => u?.role === "admin" || u?.role === "editor";
export const isAdmin = (u: SessionUser | null) => u?.role === "admin";
export const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
export const ROLE_LABEL: Record<Role, string> = { admin: "ผู้ดูแล", editor: "ผู้แก้ไข", viewer: "ดูอย่างเดียว" };
