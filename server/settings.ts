import { parseClock } from "../shared/thai.js";
import type { Queryable } from "./db.js";

export interface ReminderSettings {
  enabled: boolean;
  dueDay: number; // default day of month the fee is due (1-31); a vehicle can have its own
  firstAfterDays: number; // extra days to wait after the day following the due day
  sendTime: string; // "HH:MM" Thai time the reminder email goes out
  intervalDays: number; // days between reminders
  maxRounds: number; // 0 = keep reminding until resolved
  lookbackMonths: number; // also remind for this many earlier months of the year
  recipients: "admins" | "admins_editors";
  email: boolean;
  bell: boolean;
}

export interface AppSettings {
  monthlyFeeDefault: number; // satang
  reminders: ReminderSettings;
  menu: { hidden: string[] }; // sidebar entries (their paths) the admin chose to hide for everyone
}

/** Entries that can never be hidden, so the settings page (where they come back) is always reachable. */
export const MENU_LOCKED = ["/settings", "/profile/security"];

export const DEFAULT_SETTINGS: AppSettings = {
  monthlyFeeDefault: 120000,
  reminders: {
    enabled: true,
    dueDay: 5,
    firstAfterDays: 0,
    sendTime: "08:00",
    intervalDays: 3,
    maxRounds: 0,
    lookbackMonths: 2,
    recipients: "admins",
    email: true,
    bell: true,
  },
  menu: { hidden: [] },
};

export async function getSettings(q: Queryable): Promise<AppSettings> {
  const rows = await q.query<{ key: string; value: any }>("select key, value from settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    monthlyFeeDefault: map.monthlyFeeDefault ?? DEFAULT_SETTINGS.monthlyFeeDefault,
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(map.reminders ?? {}) },
    menu: { hidden: sanitizeMenu(map.menu?.hidden) },
  };
}

export async function setSetting(q: Queryable, key: string, value: unknown) {
  await q.query(
    `insert into settings (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}

export function sanitizeReminders(input: any): ReminderSettings {
  const d = DEFAULT_SETTINGS.reminders;
  const int = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : d.enabled,
    dueDay: int(input?.dueDay, 1, 31, d.dueDay),
    firstAfterDays: int(input?.firstAfterDays, 0, 60, d.firstAfterDays),
    sendTime: parseClock(input?.sendTime) != null ? String(input.sendTime).trim().padStart(5, "0") : d.sendTime,
    intervalDays: int(input?.intervalDays, 1, 60, d.intervalDays),
    maxRounds: int(input?.maxRounds, 0, 50, d.maxRounds),
    lookbackMonths: int(input?.lookbackMonths, 0, 11, d.lookbackMonths),
    recipients: input?.recipients === "admins_editors" ? "admins_editors" : "admins",
    email: typeof input?.email === "boolean" ? input.email : d.email,
    bell: typeof input?.bell === "boolean" ? input.bell : d.bell,
  };
}

export function sanitizeMenu(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((p): p is string => typeof p === "string" && /^\/[a-z-]*(\/[a-z-]+)?$/.test(p) && !MENU_LOCKED.includes(p)))];
}
