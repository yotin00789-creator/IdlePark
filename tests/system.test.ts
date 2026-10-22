import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { bangkokClock, bangkokToday, formatThaiDate, formatThaiDateTime, formatThaiTime, formatIsoThai, parseClock } from "../shared/thai.js";
import { lastScheduledSlot, sanitizeBackup } from "../server/backup.js";
import { sent } from "../server/mail.js";
import { Client, PASSWORD, acceptInvite, freshApp, setupAdmin } from "./helpers.js";

describe("Thai date and time", () => {
  it("shows Buddhist-era dates in full and times as 14.00 น. in Thailand time", () => {
    const d = new Date("2026-01-01T07:00:00Z"); // 14:00 in Bangkok
    expect(formatThaiDate(d)).toBe("1 มกราคม 2569");
    expect(formatThaiTime(d)).toBe("14.00 น.");
    expect(formatThaiDateTime(d)).toBe("วันที่ 1 มกราคม 2569 เวลา 14.00 น.");
    // just after midnight UTC is already the next morning in Thailand
    expect(formatThaiDateTime(new Date("2026-12-31T20:05:00Z"))).toBe("วันที่ 1 มกราคม 2570 เวลา 03.05 น.");
    expect(bangkokClock(new Date("2026-03-05T17:30:00Z"))).toMatchObject({ year: 2569, month: 3, day: 6, hour: 0, minute: 30 });
    expect(formatIsoThai("2026-10-05")).toBe("5 ตุลาคม 2569");
    expect(parseClock("08:00")).toBe(480);
    expect(parseClock("24:00")).toBeNull();
  });
});

describe("backup schedule", () => {
  const th = (iso: string) => new Date(`${iso}+07:00`);
  const base: any = { enabled: true, frequency: "daily", weekday: 0, monthDay: 1, time: "02:00", userIds: [], externalEmails: [] };
  it("finds the last moment a backup was due", () => {
    expect(lastScheduledSlot(th("2026-10-22T09:00:00"), { ...base })).toBe(th("2026-10-22T02:00:00").valueOf());
    expect(lastScheduledSlot(th("2026-10-22T01:00:00"), { ...base })).toBe(th("2026-10-21T02:00:00").valueOf());
    // weekly on Sunday (22 Oct 2026 is a Thursday): last Sunday was the 18th
    expect(lastScheduledSlot(th("2026-10-22T09:00:00"), { ...base, frequency: "weekly", weekday: 0 })).toBe(th("2026-10-18T02:00:00").valueOf());
    // monthly on the 1st: this month's 1st has passed; on the 1st before 02:00 it is still last month's
    expect(lastScheduledSlot(th("2026-10-22T09:00:00"), { ...base, frequency: "monthly", monthDay: 1 })).toBe(th("2026-10-01T02:00:00").valueOf());
    expect(lastScheduledSlot(th("2026-10-01T01:00:00"), { ...base, frequency: "monthly", monthDay: 1 })).toBe(th("2026-09-01T02:00:00").valueOf());
  });
  it("validates e-mail addresses and clamps the settings", () => {
    expect(() => sanitizeBackup({ externalEmails: ["nope"] })).toThrow();
    const s = sanitizeBackup({ enabled: true, frequency: "weird", monthDay: 99, time: "9:5", externalEmails: ["A@B.co", "a@b.co"], userIds: [1, 1, "x"] });
    expect(s).toMatchObject({ frequency: "weekly", monthDay: 28, time: "08:00", externalEmails: ["a@b.co"], userIds: [1] });
  });
});

describe("backup, report, database status, cron, 2FA QR", () => {
  let admin: Client;
  let rowId: number;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
    const c = await admin.post("/customers", { name: "ลูกค้ารายงาน", year: 2569, vehicles: [{ plate: "9กก 9", slotId: "N01", vehicleType: "sedan", plateProvince: "นนทบุรี" }] });
    rowId = c.json.rows[0].id;
    await admin.put("/ledger/payments", { changes: [{ rowId, month: 1, amount: 120000 }, { rowId, month: 2, amount: 120000 }] });
    await admin.put("/ledger/items", { changes: [{ year: 2569, month: 2, kind: "to_father", amount: 500000 }] });
  });

  it("the report is a printable Thai HTML form for a month range", async () => {
    const r = await admin.get("/report?mode=months&from=2569-1&to=2569-3");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(r.text).toContain("รายงานสรุปรายรับค่าเช่าที่จอดรถ");
    expect(r.text).toContain("มกราคม 2569");
    expect(r.text).toContain("มีนาคม 2569");
    expect(r.text).toContain("ลูกค้ารายงาน");
    expect(r.text).toContain("5,000"); // the bigger gift to father is just a number in the report
    expect(r.text).toMatch(/เวลา \d\d\.\d\d น\./);
    expect(r.text).toContain("ผู้จัดทำ");
  });

  it("the report covers a date range and rejects bad ranges", async () => {
    const day = await admin.get(`/report?mode=days&from=2020-01-01&to=2099-12-31`);
    expect(day.status).toBe(400); // more than a year
    const t = bangkokToday(); // the report counts days in Thai time (a UTC date is wrong between midnight and 07:00)
    const today = `${t.year - 543}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
    const ok = await admin.get(`/report?mode=days&from=${today}&to=${today}`);
    expect(ok.status).toBe(200);
    expect(ok.text).toContain("รายงานการรับเงินรายวัน");
    expect(ok.text).toContain("ลูกค้ารายงาน"); // payments were recorded just now (Thai time)
    expect((await admin.get("/report?mode=months&from=2569-5&to=2569-2")).status).toBe(400);
    expect((await admin.get("/report?mode=days&from=2026-10-10&to=2026-10-01")).status).toBe(400);
    expect((await admin.get("/report?mode=months&from=x&to=y")).status).toBe(400);
  });

  it("only admins set up backups; invalid input is refused; the file has formulas and no bank numbers", async () => {
    await admin.post("/users", { email: "ed@example.com", firstName: "ผู้แก้", role: "editor" });
    const ed = new Client();
    await acceptInvite(ed, "ed@example.com");
    expect((await ed.get("/backup/status")).status).toBe(403);
    expect((await ed.post("/backup/run")).status).toBe(403);

    expect((await admin.put("/backup/settings", { enabled: true, userIds: [], externalEmails: [] })).status).toBe(400); // nobody to send to
    expect((await admin.put("/backup/settings", { enabled: false, externalEmails: ["not-an-email"] })).status).toBe(400);
    const st = (await admin.get("/backup/status")).json;
    const edUser = st.users.find((u: any) => u.email === "ed@example.com");
    expect((await admin.put("/backup/settings", { enabled: true, frequency: "daily", time: "03:30", userIds: [edUser.id], externalEmails: ["family@example.org"] })).status).toBe(200);

    sent.length = 0;
    const run = await admin.post("/backup/run");
    expect(run.status).toBe(200);
    expect(run.json.recipients.sort()).toEqual(["ed@example.com", "family@example.org"]);
    const mails = sent.filter((m) => m.subject.includes("สำรองข้อมูล"));
    expect(mails.map((m) => m.to).sort()).toEqual(["ed@example.com", "family@example.org"]);
    const att = mails[0].attachments![0];
    expect(att.filename).toMatch(/^backup-.*\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(att.content as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(["2569", "ลูกค้า", "รถและช่องจอด", "โซนที่จอด", "ตั้งค่า"]));
    const ledger = wb.getWorksheet("2569")!;
    expect(JSON.stringify(ledger.getRow(2).values)).toContain("SUM(C2:N2)");
    expect(JSON.stringify(wb.getWorksheet("รถและช่องจอด")!.getSheetValues())).toContain("9กก 9");
    expect(JSON.stringify(wb.worksheets.map((w) => w.getSheetValues()))).not.toMatch(/\d{3}-\d-\d{5}-\d/); // no bank numbers
    expect(att.content.length).toBeGreaterThan(2000);
    const log = (await admin.get("/backup/status")).json.logs[0];
    expect(log).toMatchObject({ kind: "manual", ok: true });
    const dl = await admin.get("/backup/download");
    expect(dl.status).toBe(200);
  });

  it("the cron tick runs the scheduled backup once per slot and is protected by the secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const none = await admin.req("GET", "/cron/tick");
    expect(none.status).toBe(401);
    const { runBackup } = await import("../server/backup.js");
    const { getDb } = await import("../server/db.js");
    const db = await getDb();
    await db.query("delete from backup_log");
    const at = new Date("2026-10-22T09:00:00+07:00");
    sent.length = 0;
    const first = await runBackup(db, { now: at, kind: "auto" });
    expect(first.ok).toBe(true);
    expect((await runBackup(db, { now: new Date("2026-10-22T10:00:00+07:00"), kind: "auto" })).skipped).toBe("รอบนี้สำรองไปแล้ว");
    expect((await runBackup(db, { now: new Date("2026-10-23T04:00:00+07:00"), kind: "auto" })).ok).toBe(true); // next day's slot
    await admin.put("/backup/settings", { enabled: false });
    expect((await runBackup(db, { now: new Date("2026-10-24T04:00:00+07:00"), kind: "auto" })).skipped).toContain("ปิด");
    delete process.env.CRON_SECRET;
  });

  it("shows where data is stored and how much of it the pages hold", async () => {
    const r = await admin.get("/system/db");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ kind: "memory", durable: false });
    expect(r.json.counts.ledger_rows).toBeGreaterThanOrEqual(1);
    expect(r.json.counts.payments).toBe(2);
    expect(r.json.counts.customers).toBe(1);
  });

  it("2FA setup returns the otpauth link and a QR image", async () => {
    const r = await admin.post("/profile/mfa/start", { password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.json.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(r.json.qr).toMatch(/^data:image\/png;base64,/);
    expect(r.json.secret.replace(/\s/g, "")).toMatch(/^[A-Z2-7]{16,}$/);
  });
});
