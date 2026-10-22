// Unpaid-rent reminders. The schedule is data (settings.reminders), not code:
//   each vehicle pays on its own due day (its dueDay, else the default in settings);
//   the first reminder goes out the day AFTER the due day (+ firstAfterDays) at sendTime (Thai time),
//   then every intervalDays, up to maxRounds (0 = until the admin records the payment).
//   A vehicle that has paid is never mentioned.
import { findUnpaid } from "../shared/calc.js";
import { bangkokClock, bangkokToday, daysBetween, daysInMonth, formatBaht, formatIsoThai, formatThaiDateTime, parseClock, THAI_MONTHS, type BangkokDate } from "../shared/thai.js";
import type { Db } from "./db.js";
import { overdueEmail, appUrl } from "./emailTemplates.js";
import { sendMail, type MailResult } from "./mail.js";
import { rowFromDb } from "./data.js";
import { getSettings, type ReminderSettings } from "./settings.js";

export function addDays(d: BangkokDate, n: number): BangkokDate {
  const t = new Date(Date.UTC(d.year - 543, d.month - 1, d.day) + n * 86400000);
  return { year: t.getUTCFullYear() + 543, month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
export const isoDate = (d: BangkokDate) =>
  `${d.year - 543}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
const fromDb = (v: unknown): BangkokDate => bangkokToday(new Date(v as string));

export interface PlannedGroup {
  year: number;
  month: number;
  dueDay: number; // day of the month these vehicles pay on
  items: { owner: string; plate: string; paid: number; due: number; dueDay: number }[];
  startDate: BangkokDate; // first day a reminder may go out
  rounds: number; // delivered so far
  lastSent: BangkokDate | null;
  action: "send" | "wait" | "done";
  reason: string;
  nextDate: BangkokDate | null; // when the next reminder will go out (if waiting)
  round: number; // the round that would be sent now
}

/** The day a vehicle pays in `month`, never past the end of a short month (31 -> 28 in February). */
export const effectiveDueDay = (row: { dueDay: number | null }, s: ReminderSettings, year: number, month: number) =>
  Math.min(row.dueDay ?? s.dueDay, daysInMonth(year, month));

export async function planReminders(db: Db, now: Date, s: ReminderSettings, force = false) {
  const today = bangkokToday(now);
  const rows = await db.query("select * from ledger_rows where year = $1 order by sort_order, id", [today.year]);
  const pays = await db.query(
    "select p.row_id, p.month, p.amount from payments p join ledger_rows r on r.id = p.row_id where r.year = $1",
    [today.year],
  );
  const byRow = new Map<number, (number | null)[]>();
  for (const p of pays) {
    const a = byRow.get(p.row_id) ?? Array(12).fill(null);
    a[p.month - 1] = p.amount;
    byRow.set(p.row_id, a);
  }
  const ledger = rows.map((r) => rowFromDb(r, byRow.get(r.id) ?? Array(12).fill(null)));
  const unpaid = findUnpaid(ledger, today.year, today.month, s.lookbackMonths);
  const logs = await db.query(
    "select year, month, due_day, round, sent_at from reminder_log where year = $1 and delivered order by sent_at",
    [today.year],
  );

  const sendMinutes = parseClock(s.sendTime) ?? 8 * 60;
  const clock = bangkokClock(now);
  const nowMinutes = clock.hour * 60 + clock.minute;

  const groups: PlannedGroup[] = [];
  const keys = new Map<string, { month: number; dueDay: number }>();
  for (const u of unpaid) {
    const dd = effectiveDueDay(u.row, s, today.year, u.month);
    keys.set(`${u.month}:${dd}`, { month: u.month, dueDay: dd });
  }
  for (const { month: m, dueDay: dd } of [...keys.values()].sort((a, b) => a.month - b.month || a.dueDay - b.dueDay)) {
    const mine = unpaid.filter((u) => u.month === m && effectiveDueDay(u.row, s, today.year, m) === dd);
    const startDate = addDays({ year: today.year, month: m, day: dd }, 1 + s.firstAfterDays);
    const sent = logs.filter((l) => l.month === m && (l.due_day as number) === dd);
    const rounds = sent.length ? Math.max(...sent.map((l) => l.round as number)) : 0;
    const last = sent.length ? fromDb(sent[sent.length - 1].sent_at) : null;
    const g: PlannedGroup = {
      year: today.year,
      month: m,
      dueDay: dd,
      items: mine.map((u) => ({ owner: u.row.ownerName, plate: u.row.plate, paid: u.paid, due: u.due, dueDay: dd })),
      startDate,
      rounds,
      lastSent: last,
      action: "wait",
      reason: "",
      nextDate: null,
      round: rounds + 1,
    };
    if (!force && daysBetween(startDate, today) < 0) {
      g.reason = `นัดชำระวันที่ ${dd} · จะแจ้งเตือนเมื่อพ้นกำหนด`;
      g.nextDate = startDate;
    } else if (!force && s.maxRounds > 0 && rounds >= s.maxRounds) {
      g.action = "done";
      g.reason = `แจ้งครบ ${s.maxRounds} ครั้งแล้ว`;
    } else if (!force && last && daysBetween(last, today) < s.intervalDays) {
      g.reason = "รอรอบถัดไป";
      g.nextDate = addDays(last, s.intervalDays);
    } else if (!force && nowMinutes < sendMinutes) {
      g.reason = `รอถึงเวลาส่ง ${String(Math.floor(sendMinutes / 60)).padStart(2, "0")}.${String(sendMinutes % 60).padStart(2, "0")} น.`;
      g.nextDate = today;
    } else {
      g.action = "send";
      g.reason = rounds ? `รอบที่ ${rounds + 1}` : "ครั้งแรก";
    }
    groups.push(g);
  }
  return { today, groups, unpaidCount: unpaid.length };
}

export interface RunResult {
  skipped?: string;
  groupsSent: number;
  unpaidItems: number;
  recipients: string[];
  mail?: MailResult;
  notified: number;
  summary: string;
}

export async function runReminders(db: Db, opts: { now?: Date; force?: boolean } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const settings = await getSettings(db);
  const s = settings.reminders;
  const none = (skipped: string): RunResult => ({ skipped, groupsSent: 0, unpaidItems: 0, recipients: [], notified: 0, summary: skipped });
  if (!s.enabled && !opts.force) return none("ปิดการแจ้งเตือนอยู่");

  const plan = await planReminders(db, now, s, Boolean(opts.force));
  const due = plan.groups.filter((g) => g.action === "send");
  if (!due.length) return none(plan.unpaidCount ? "ยังไม่ถึงรอบแจ้งเตือน" : "ไม่มีผู้ค้างชำระ");

  const roles = s.recipients === "admins_editors" ? ["admin", "editor"] : ["admin"];
  const users = await db.query("select email from users where is_active and password_hash is not null and role = any($1::text[])", [roles]);
  const recipients = users.map((u) => u.email as string);

  const items = due.flatMap((g) => g.items.map((i) => ({ ...i, year: g.year, month: g.month, dueDate: formatIsoThai(`${g.year - 543}-${String(g.month).padStart(2, "0")}-${String(g.dueDay).padStart(2, "0")}`) })));
  let mail: MailResult | undefined;
  if (s.email) {
    mail = recipients.length
      ? await sendMail(
          recipients,
          overdueEmail({
            round: Math.max(...due.map((g) => g.round)),
            items,
            intervalDays: s.intervalDays,
            maxRounds: s.maxRounds,
            link: `${appUrl()}/ledger/${plan.today.year}`,
            asOf: formatThaiDateTime(now),
          }),
        )
      : { ok: false, mode: "none" as const, error: "ไม่มีผู้ดูแลที่ใช้งานได้" };
  }
  const delivered = !s.email || Boolean(mail?.ok);

  let notified = 0;
  for (const g of due) {
    await db.query(
      `insert into reminder_log (year, month, due_day, round, unpaid_count, recipients, delivered, detail, sent_at)
       values ($1,$2,$9,$3,$4,$5,$6,$7,$8)`,
      [g.year, g.month, g.round, g.items.length, recipients.join(", "), delivered, mail ? (mail.ok ? mail.mode : (mail.error ?? "")) : "bell only", now.toISOString(), g.dueDay],
    );
    if (s.bell) {
      const total = g.items.reduce((sum, i) => sum + i.due, 0);
      const names = g.items.slice(0, 4).map((i) => i.owner).join(", ");
      const r = await db.query(
        `insert into notifications (dedupe_key, kind, title, body, link, severity)
         values ($1,'overdue',$2,$3,$4,$5) on conflict (dedupe_key) do nothing returning id`,
        [
          `overdue:${g.year}-${g.month}:${g.dueDay}:${g.round}`,
          `ค้างชำระ ${g.items.length} คัน · ${THAI_MONTHS[g.month - 1]} ${g.year} นัดชำระวันที่ ${g.dueDay} (แจ้งครั้งที่ ${g.round})`,
          `${names}${g.items.length > 4 ? ` และอีก ${g.items.length - 4} คัน` : ""} · รวม ${formatBaht(total)} บาท`,
          `/ledger/${g.year}`,
          g.round >= 3 ? "error" : "warning",
        ],
      );
      notified += r.length;
    }
  }
  if (s.email && mail && !mail.ok) {
    await db.query(
      `insert into notifications (dedupe_key, kind, title, body, link, severity)
       values ($1,'email_failed','ส่งอีเมลแจ้งเตือนไม่สำเร็จ',$2,'/settings','error') on conflict (dedupe_key) do nothing`,
      [`email_failed:${isoDate(plan.today)}`, mail.error ?? "ตรวจสอบการตั้งค่า SMTP"],
    );
  }
  return {
    groupsSent: due.length,
    unpaidItems: items.length,
    recipients,
    mail,
    notified,
    summary: `แจ้ง ${due.length} เดือน (${items.length} รายการ) ${delivered ? "สำเร็จ" : "แต่ส่งอีเมลไม่สำเร็จ"}`,
  };
}
