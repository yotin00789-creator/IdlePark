// Backup: an Excel file with every year of the ledger (real formulas), customers, vehicles with their
// slots, zones and settings, emailed to the people the admin chose (system users or any address).
// It never contains bank account numbers, passwords or MFA secrets.
import ExcelJS from "exceljs";
import { bangkokClock, bangkokToday, formatBaht, formatThaiDateTime, parseClock, THAI_MONTHS, THAI_MONTHS_SHORT } from "../shared/thai.js";
import { feeSteps } from "../shared/calc.js";
import { loadStorage } from "./storage.js";
import { slotLabel, vehicleLabel, isStorageSlot } from "../shared/lot.js";
import { loadSavings, loadYears } from "./data.js";
import type { Db } from "./db.js";
import { backupEmail } from "./emailTemplates.js";
import { buildLedgerWorkbook } from "./export.js";
import { sendMail, type MailResult } from "./mail.js";
import { getSettings, setSetting } from "./settings.js";

export interface BackupSettings {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  weekday: number; // 0 = Sunday … 6 = Saturday (weekly)
  monthDay: number; // 1-28 (monthly)
  time: string; // "HH:MM" Thai time
  userIds: number[]; // system users who receive it
  externalEmails: string[]; // any other address
}

export const DEFAULT_BACKUP: BackupSettings = {
  enabled: false,
  frequency: "weekly",
  weekday: 0,
  monthDay: 1,
  time: "08:00",
  userIds: [],
  externalEmails: [],
};

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 200;

export function sanitizeBackup(input: any): BackupSettings {
  const d = DEFAULT_BACKUP;
  const int = (v: unknown, min: number, max: number, fb: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fb);
  const emails = Array.isArray(input?.externalEmails) ? input.externalEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean) : [];
  const bad = emails.find((e: string) => !isEmail(e));
  if (bad) throw Object.assign(new Error(`อีเมล “${bad}” ไม่ถูกต้อง`), { status: 400 });
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : d.enabled,
    frequency: ["daily", "weekly", "monthly"].includes(input?.frequency) ? input.frequency : d.frequency,
    weekday: int(input?.weekday, 0, 6, d.weekday),
    monthDay: int(input?.monthDay, 1, 28, d.monthDay),
    time: parseClock(input?.time) != null ? String(input.time).trim().padStart(5, "0") : d.time,
    userIds: Array.isArray(input?.userIds) ? [...new Set<number>(input.userIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))].slice(0, 50) : [],
    externalEmails: [...new Set<string>(emails)].slice(0, 10),
  };
}

export async function getBackupSettings(db: Db): Promise<BackupSettings> {
  const [r] = await db.query("select value from settings where key = 'backup'");
  return { ...DEFAULT_BACKUP, ...(r?.value ?? {}) };
}
export const saveBackupSettings = (db: Db, s: BackupSettings) => setSetting(db, "backup", s);

/** The most recent moment this schedule says a backup should have been made, as a Thai date + minutes. */
export function lastScheduledSlot(now: Date, s: BackupSettings): number {
  const c = bangkokClock(now);
  const minutes = parseClock(s.time) ?? 120;
  const dayStart = Date.UTC(c.year - 543, c.month - 1, c.day) - 7 * 3_600_000; // 00:00 Thai time of today, as a UTC instant
  const at = (ms: number) => ms + minutes * 60_000;
  const weekdayNow = new Date(Date.UTC(c.year - 543, c.month - 1, c.day)).getUTCDay();
  let slot: number;
  if (s.frequency === "daily") slot = at(dayStart);
  else if (s.frequency === "weekly") slot = at(dayStart - ((weekdayNow - s.weekday + 7) % 7) * 86_400_000);
  else {
    const thisMonth = at(Date.UTC(c.year - 543, c.month - 1, s.monthDay) - 7 * 3_600_000);
    slot = thisMonth <= now.valueOf() ? thisMonth : at(Date.UTC(c.year - 543, c.month - 2, s.monthDay) - 7 * 3_600_000);
  }
  if (slot > now.valueOf()) slot -= s.frequency === "daily" ? 86_400_000 : s.frequency === "weekly" ? 7 * 86_400_000 : 0;
  return slot;
}

export async function backupRecipients(db: Db, s: BackupSettings) {
  const users = s.userIds.length
    ? await db.query("select email from users where id = any($1::int[]) and is_active and password_hash is not null", [s.userIds])
    : [];
  return [...new Set([...users.map((u) => u.email as string), ...s.externalEmails])];
}

export async function buildBackup(db: Db) {
  await loadStorage(db);
  const years = await loadYears(db, [bangkokToday().year]);
  const { workbook: wb } = await buildLedgerWorkbook(years);
  const head = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const customers = await db.query("select * from customers order by name");
  const wc = wb.addWorksheet("ลูกค้า");
  wc.columns = [{ header: "ชื่อ", width: 26 }, { header: "เบอร์โทร", width: 16 }, { header: "อีเมล", width: 28 }, { header: "สถานะ", width: 12 }, { header: "หมายเหตุ", width: 30 }];
  for (const c of customers) wc.addRow([c.name, c.phone, c.email, c.is_active ? "ยังเช่าอยู่" : "เลิกเช่า", c.note]);
  head(wc);

  const zones = await db.query("select * from zones order by sort_order, id");
  const zoneName = new Map(zones.map((z) => [z.id as number, z.name as string]));
  const wv = wb.addWorksheet("รถและช่องจอด");
  wv.columns = [
    { header: "ปี (พ.ศ.)", width: 10 }, { header: "ชื่อลูกค้า", width: 24 }, { header: "ทะเบียน", width: 14 }, { header: "จังหวัด", width: 16 },
    { header: "ประเภท", width: 16 }, { header: "สี", width: 10 }, { header: "ช่องจอด", width: 16 }, { header: "โซน", width: 18 },
    { header: "จ่ายค่าเช่า", width: 14 }, { header: "ค่าเช่าเริ่มปี (บาท)", width: 16 }, { header: "ประวัติราคาในปี", width: 28 }, { header: "นัดชำระทุกวันที่", width: 14 }, { header: "เริ่มเดือน", width: 12 }, { header: "สิ้นสุดเดือน", width: 12 }, { header: "สถานะ", width: 12 },
  ];
  let vehicles = 0;
  const today = bangkokToday();
  for (const y of years) {
    for (const r of y.rows) {
      if (r.kind === "excluded") continue;
      if (y.year === today.year && r.isActive) vehicles++;
      wv.addRow([
        y.year, r.ownerName, r.plate, r.plateProvince, isStorageSlot(r.slotId) ? "คลังเก็บของ" : r.vehicleType ? vehicleLabel(r.vehicleType) : "",
        r.carColor ?? "", r.slotId ? slotLabel(r.slotId) : "", r.zoneId != null ? (zoneName.get(r.zoneId) ?? "") : "",
        r.isOwner ? "เจ้าของ (ไม่คิดเงิน)" : r.billing === "yearly" ? "รายปี" : "รายเดือน", r.monthlyFee / 100, feeSteps(r).map((s) => `${s.from === 1 ? "เริ่มปี" : "ตั้งแต่ " + THAI_MONTHS_SHORT[s.from - 1]} ${s.fee / 100}`).join(" → "), r.dueDay ?? "ค่าเริ่มต้น", THAI_MONTHS[r.startMonth - 1], r.endMonth ? THAI_MONTHS[r.endMonth - 1] : "", r.isActive ? "ใช้งาน" : "เลิกเช่า",
      ]);
    }
  }
  head(wv);

  const wp = wb.addWorksheet("การรับเงิน");
  wp.columns = [
    { header: "ปี (พ.ศ.)", width: 10 }, { header: "ชื่อลูกค้า", width: 24 }, { header: "ทะเบียน", width: 14 }, { header: "เดือน", width: 12 },
    { header: "จำนวนเงิน (บาท)", width: 16 }, { header: "รับด้วย", width: 14 }, { header: "บัญชีที่รับโอน", width: 26 }, { header: "บันทึกเมื่อ", width: 28 },
  ];
  const pays = await db.query(
    `select r.year, r.owner_name, r.plate, p.month, p.amount, p.method, p.updated_at, b.bank, b.label
       from payments p join ledger_rows r on r.id = p.row_id left join bank_accounts b on b.id = p.account_id
      where p.amount is not null and p.amount > 0 order by r.year, p.month, r.owner_name`,
  );
  for (const x of pays) wp.addRow([x.year, x.owner_name, x.plate, THAI_MONTHS[x.month - 1], x.amount / 100, x.method === "transfer" ? "โอนเข้าบัญชี" : "เงินสด", x.method === "transfer" && x.bank ? `${x.bank} ${x.label}` : "", formatThaiDateTime(x.updated_at)]);
  head(wp);

  const wz = wb.addWorksheet("โซนที่จอด");
  wz.columns = [{ header: "โซน", width: 22 }, { header: "ชนิด", width: 14 }, { header: "สถานะ", width: 14 }, { header: "ช่องจอด", width: 40 }, { header: "จอดมอเตอร์ไซค์ได้ (คัน)", width: 22 }, { header: "รายละเอียด", width: 30 }];
  for (const z of zones) wz.addRow([z.name, z.access === "private" ? "ส่วนตัว" : "ทั่วไป", z.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน", (z.slot_ids as string[]).map(slotLabel).join(", "), z.moto_capacity || "", z.description]);
  head(wz);

  const { savings } = await loadSavings(db);
  if (savings.length) {
    const ws = wb.addWorksheet("เงินเก็บพ่อ");
    ws.columns = [{ header: "ปี (พ.ศ.)", width: 10 }, { header: "เดือน", width: 12 }, { header: "รวมที่เก็บ (บาท)", width: 18 }, { header: "ค่าใช้จ่าย (บาท)", width: 18 }, { header: "บัตร (บาท)", width: 14 }];
    for (const sv of savings) {
      for (let m = 0; m < 12; m++) {
        const total = sv.days[m].reduce<number>((n, v) => n + (v ?? 0), 0);
        if (total || sv.expense[m] || sv.card[m]) ws.addRow([sv.year, THAI_MONTHS_SHORT[m], total / 100, (sv.expense[m] ?? 0) / 100, (sv.card[m] ?? 0) / 100]);
      }
    }
    head(ws);
  }

  const st = await getSettings(db);
  const wset = wb.addWorksheet("ตั้งค่า");
  wset.columns = [{ header: "รายการ", width: 36 }, { header: "ค่า", width: 30 }];
  const r = st.reminders;
  for (const row of [
    ["ค่าเช่าเริ่มต้น (บาท)", formatBaht(st.monthlyFeeDefault)], ["วันนัดชำระเริ่มต้น", `วันที่ ${r.dueDay}`], ["เวลาส่งอีเมลแจ้งเตือน", `${r.sendTime} น.`],
    ["แจ้งซ้ำทุก (วัน)", r.intervalDays], ["จำนวนครั้งสูงสุด", r.maxRounds || "จนกว่าจะชำระ"], ["ย้อนหลัง (เดือน)", r.lookbackMonths],
  ]) wset.addRow(row);
  head(wset);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { buf, years: years.map((y) => y.year), customers: customers.length, vehicles };
}

export const backupFilename = (now: Date) => {
  const c = bangkokClock(now);
  return `backup-สมุดบัญชีที่จอดรถ-${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}.xlsx`;
};

export interface BackupResult {
  ok: boolean;
  skipped?: string;
  recipients: string[];
  mail?: MailResult;
  sizeBytes: number;
}

/** Build the file and mail it. `force` ignores the schedule (the "back up now" button). */
export async function runBackup(db: Db, opts: { now?: Date; force?: boolean; by?: string; kind?: "auto" | "manual" } = {}): Promise<BackupResult> {
  const now = opts.now ?? new Date();
  const kind = opts.kind ?? (opts.force ? "manual" : "auto");
  const s = await getBackupSettings(db);
  const none = (skipped: string): BackupResult => ({ ok: false, skipped, recipients: [], sizeBytes: 0 });
  if (!opts.force) {
    if (!s.enabled) return none("ปิดการสำรองข้อมูลอัตโนมัติอยู่");
    const slot = lastScheduledSlot(now, s);
    const [last] = await db.query("select max(at) as at from backup_log where kind = 'auto' and ok");
    if (last?.at && new Date(last.at).valueOf() >= slot) return none("รอบนี้สำรองไปแล้ว");
  }
  const recipients = await backupRecipients(db, s);
  if (!recipients.length) {
    if (kind === "auto") await db.query("insert into backup_log (kind, ok, detail, at) values ('auto', false, $1, $2)", ["ยังไม่ได้เลือกผู้รับ", now.toISOString()]);
    return none("ยังไม่ได้เลือกผู้รับอีเมล");
  }
  const file = await buildBackup(db);
  const filename = backupFilename(now);
  const mail = await sendMail(
    recipients,
    backupEmail({ when: formatThaiDateTime(now), sizeKb: Math.ceil(file.buf.length / 1024), years: file.years, customers: file.customers, vehicles: file.vehicles, by: opts.by ?? (kind === "auto" ? "ระบบอัตโนมัติ" : "ผู้ดูแล"), filename }),
    [{ filename, content: file.buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
  );
  await db.query("insert into backup_log (kind, ok, recipients, size_bytes, detail, at) values ($1,$2,$3,$4,$5,$6)", [
    kind, mail.ok, recipients.join(", "), file.buf.length, mail.ok ? mail.mode : (mail.error ?? ""), now.toISOString(),
  ]);
  return { ok: mail.ok, recipients, mail, sizeBytes: file.buf.length };
}
