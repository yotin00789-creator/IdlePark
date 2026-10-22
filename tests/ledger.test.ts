import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { calcAll } from "../shared/calc.js";
import { getDb } from "../server/db.js";
import { sent } from "../server/mail.js";
import { planReminders, runReminders } from "../server/reminders.js";
import { parseWorkbook } from "../server/seed/parseWorkbook.js";
import { seedFromWorkbook } from "../server/seed/seedDb.js";
import { Client, acceptInvite, freshApp, setupAdmin } from "./helpers.js";

const XLSX = process.env.SEED_XLSX ?? "ที่จอดรถ (1).xlsx";
const NOW = new Date("2026-10-22T09:00:00+07:00"); // พ.ศ. 2569, ตุลาคม

describe.skipIf(!existsSync(XLSX))("ledger API on the real workbook", () => {
  let admin: Client;
  let editor: Client;
  let viewer: Client;
  let data: any;
  let bankNumber = ""; // read from the workbook at run time; never written into the repo

  beforeAll(async () => {
    const db = await freshApp();
    const wb = await parseWorkbook(XLSX);
    bankNumber = wb.banks[0].number;
    const report = await seedFromWorkbook(db, wb, { now: NOW });
    expect(report.diffs).toEqual([]);
    admin = await setupAdmin();
    for (const [role, email] of [["editor", "ed@example.com"], ["viewer", "vw@example.com"]] as const) {
      await admin.post("/users", { email, firstName: role, role });
      const c = new Client();
      await acceptInvite(c, email);
      if (role === "editor") editor = c;
      else viewer = c;
    }
    data = (await admin.get("/data")).json;
  });

  it("seeding twice does not duplicate anything", async () => {
    const db = await getDb();
    const before = await db.query("select count(*)::int as n from ledger_rows");
    const wb = await parseWorkbook(XLSX);
    const again = await seedFromWorkbook(db, wb, { now: NOW });
    expect(again.skipped).toBe(true);
    expect((await db.query("select count(*)::int as n from ledger_rows"))[0].n).toBe(before[0].n);
  });

  it("returns data that calculates to the Excel reference table", () => {
    const all = calcAll(data.years);
    const baht = (n: number) => n / 100;
    expect(all.filter((c) => c.year <= 2570).map((c) => [c.year, baht(c.totals.income), baht(c.totals.net), baht(c.cumulative)])).toEqual([
      [2565, 136500, 6765, 6765],
      [2566, 284200, -2194, 4571],
      [2567, 243100, 5429, 10000],
      [2568, 278200, -5500, 4500],
      [2569, 222050, 8100, 12600],
      [2570, 0, 0, 12600],
    ]);
    expect(data.today.year).toBe(new Date().getFullYear() + 543);
    expect(data.accounts).toHaveLength(2);
    expect(JSON.stringify(data.accounts)).not.toContain(bankNumber); // numbers are masked in /data
  });

  it("editing one payment recalculates this year and every later year, and is audited", async () => {
    const y69 = data.years.find((y: any) => y.year === 2569);
    const row = y69.rows.find((r: any) => r.ownerName === "นา");
    const before = calcAll(data.years);
    const r = await admin.put("/ledger/payments", { changes: [{ rowId: row.id, month: 10, amount: 120000 }] });
    expect(r.json.changed).toBe(1);
    data = (await admin.get("/data")).json;
    const after = calcAll(data.years);
    const b69 = before.find((c) => c.year === 2569)!;
    const a69 = after.find((c) => c.year === 2569)!;
    expect(a69.totals.net - b69.totals.net).toBe(120000);
    expect(after.find((c) => c.year === 2570)!.cumulative - before.find((c) => c.year === 2570)!.cumulative).toBe(120000);
    expect(after.find((c) => c.year === 2568)!.cumulative).toBe(before.find((c) => c.year === 2568)!.cumulative);

    const noop = await admin.put("/ledger/payments", { changes: [{ rowId: row.id, month: 10, amount: 120000 }] });
    expect(noop.json.changed).toBe(0);

    const log = (await admin.get("/audit?action=payment.update")).json.entries[0];
    expect(log.userEmail).toBe("owner@example.com");
    expect(log.summary).toContain("นา");
    expect(log.summary).toContain("ตุลาคม 2569");
    expect(log.before).toEqual({ amount: null });
    expect(log.after).toEqual({ amount: 120000 });
    expect(log.method).toBe("PUT");
    expect(log.path).toBe("/api/ledger/payments");
  });

  it("validates input and enforces roles", async () => {
    const row = data.years.find((y: any) => y.year === 2569).rows[0];
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: row.id, month: 13, amount: 1 }] })).status).toBe(400);
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: row.id, month: 1, amount: 1.5 }] })).status).toBe(400);
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: 999999, month: 1, amount: 100 }] })).status).toBe(404);
    expect((await viewer.put("/ledger/payments", { changes: [{ rowId: row.id, month: 1, amount: 0 }] })).status).toBe(403);
    expect((await viewer.get("/data")).status).toBe(200);
    expect((await editor.put("/ledger/payments", { changes: [{ rowId: row.id, month: 1, amount: row.payments[0] }] })).status).toBe(200);
  });

  it("adds a customer with vehicles; renaming flows to every year; zone rename is instant", async () => {
    const r = await editor.post("/customers", { name: "ลูกค้าใหม่", phone: "081-111-1111", email: "new@example.com", vehicles: [{ plate: "9กก 999" }, { plate: "8ขข 888", monthlyFee: 100000 }] });
    expect(r.status).toBe(200);
    expect(r.json.rows).toHaveLength(2);
    expect(r.json.rows[1].monthlyFee).toBe(100000);
    expect((await editor.post("/customers", { name: "ลูกค้าใหม่" })).status).toBe(409);
    await editor.patch(`/customers/${r.json.customer.id}`, { name: "ลูกค้าใหม่ (แก้ชื่อ)" });
    const d = (await admin.get("/data")).json;
    const rows = d.years.flatMap((y: any) => y.rows).filter((x: any) => x.customerId === r.json.customer.id);
    expect(rows.map((x: any) => x.ownerName)).toEqual(["ลูกค้าใหม่ (แก้ชื่อ)", "ลูกค้าใหม่ (แก้ชื่อ)"]);

    const z = d.zones[0];
    await editor.patch(`/zones/${z.id}`, { name: "ลานหน้าบ้าน" });
    expect((await admin.get("/data")).json.zones[0].name).toBe("ลานหน้าบ้าน");
    const nz = await editor.post("/zones", { name: "โซน B", capacity: 10 });
    const del = await editor.del(`/zones/${nz.json.id}`);
    expect(del.status).toBe(200);
    expect((await admin.get("/audit?action=zone")).json.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("copies the previous year's tenants and refuses to overwrite", async () => {
    const ok = await editor.post("/ledger/years/2571/copy-previous");
    expect(ok.status).toBe(200);
    expect(ok.json.copied).toBeGreaterThan(15);
    expect((await editor.post("/ledger/years/2571/copy-previous")).status).toBe(409);
    expect((await editor.post("/ledger/years/2590/copy-previous")).status).toBe(404);
    const d = (await admin.get("/data")).json.years.find((y: any) => y.year === 2571);
    expect(d.rows.every((r: any) => r.payments.every((p: any) => p === null))).toBe(true);
  });

  it("account numbers are revealed only to editors/admins and every reveal is audited", async () => {
    const id = data.accounts[0].id;
    const r = await editor.get(`/accounts/${id}/reveal`);
    expect(r.json.number).toBe(bankNumber);
    expect((await viewer.get(`/accounts/${id}/reveal`)).status).toBe(403);
    expect((await admin.get("/audit?action=account.reveal")).json.entries).toHaveLength(1);
  });

  it("formula audit: switching overrides to standard changes totals and is audited", async () => {
    const legacyEnd = calcAll(data.years).filter((c) => c.year === 2570)[0].cumulative;
    const r = await admin.post("/overrides/mode", { mode: "standard" });
    expect(r.json.changed).toBeGreaterThan(5);
    const d2 = (await admin.get("/data")).json;
    const standardEnd = calcAll(d2.years).filter((c) => c.year === 2570)[0].cumulative;
    expect(legacyEnd - standardEnd).toBe(240000);
    expect((await editor.post("/overrides/mode", { mode: "legacy" })).status).toBe(403);
    await admin.post("/overrides/mode", { mode: "legacy" });
    expect(calcAll((await admin.get("/data")).json.years).filter((c) => c.year === 2570)[0].cumulative).toBe(legacyEnd);
  });
});

describe.skipIf(!existsSync(XLSX))("unpaid reminders", () => {
  let admin: Client;
  let db: Awaited<ReturnType<typeof getDb>>;

  const setReminders = (patch: object) =>
    admin.put("/settings", { reminders: { enabled: true, dueDay: 5, firstAfterDays: 0, intervalDays: 3, maxRounds: 3, lookbackMonths: 0, recipients: "admins", email: true, bell: true, ...patch } });
  const day = (d: number) => new Date(`2026-10-${String(d).padStart(2, "0")}T09:00:00+07:00`);

  beforeAll(async () => {
    db = await freshApp();
    await seedFromWorkbook(db, await parseWorkbook(XLSX), { now: NOW });
    admin = await setupAdmin();
  });

  it("finds who has not paid this month (from the real ledger)", async () => {
    await setReminders({});
    const plan = await planReminders(db, NOW, (await import("../server/settings.js")).DEFAULT_SETTINGS.reminders);
    expect(plan.unpaidCount).toBeGreaterThan(0);
    const owners = plan.groups[0].items.map((i) => i.owner);
    expect(owners).toEqual(expect.arrayContaining(["นา", "นุ้ย", "เฟิร์น"]));
    expect(owners).not.toContain("เกม"); // excluded row
  });

  it("follows the schedule: due day, then every N days, up to max rounds", async () => {
    sent.length = 0;
    await db.query("delete from reminder_log");
    const calls: [number, boolean][] = [];
    for (const d of [3, 5, 6, 7, 8, 9, 11, 14, 17]) {
      const r = await runReminders(db, { now: day(d) });
      calls.push([d, !r.skipped]);
    }
    // due day 5 is still on time; the first reminder is the day AFTER (6), then every 3 days (9, then the
    // first run on/after the 12th = 14), max 3 rounds, nothing after
    expect(calls.filter(([, s]) => s).map(([d]) => d)).toEqual([6, 9, 14]);
    expect(sent.filter((m) => m.subject.includes("ค้างชำระ"))).toHaveLength(3);
    const rounds = await db.query("select round from reminder_log order by round");
    expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  });

  it("emails admins an HTML message with every detail, and rings the bell", async () => {
    const mail = sent.at(-1)!;
    expect(mail.to).toBe("owner@example.com");
    expect(mail.html).toContain("ผู้เช่า / ทะเบียน");
    expect(mail.html).toContain("นุ้ย");
    expect(mail.html).toContain("วฬ 1800");
    expect(mail.html).toContain("แจ้งครั้งที่ 3");
    expect(mail.html).toContain("ระบบจะแจ้งซ้ำทุก 3 วัน");
    const bell = (await admin.get("/notifications")).json;
    const overdue = bell.items.filter((i: any) => i.kind === "overdue");
    expect(overdue).toHaveLength(3);
    expect(overdue[0].link).toBe("/ledger/2569");
  });

  it("stops by itself once the admin records the payments", async () => {
    await db.query("delete from reminder_log");
    await setReminders({ maxRounds: 0 }); // keep reminding until resolved
    expect((await runReminders(db, { now: day(6) })).groupsSent).toBe(1);
    const data = (await admin.get("/data")).json;
    const y = data.years.find((x: any) => x.year === 2569);
    const changes = y.rows
      .filter((r: any) => r.kind !== "excluded" && r.isActive && (r.payments[9] ?? 0) < r.monthlyFee && !(r.paidThroughYear))
      .map((r: any) => ({ rowId: r.id, month: 10, amount: r.monthlyFee }));
    expect(changes.length).toBeGreaterThan(0);
    await admin.put("/ledger/payments", { changes });
    const after = await runReminders(db, { now: day(30) });
    expect(after.skipped).toBe("ไม่มีผู้ค้างชำระ");
  });

  it("can look back at earlier months, and 'prepaid until' rows are not nagged", async () => {
    await db.query("delete from reminder_log");
    const y = (await admin.get("/data")).json.years.find((x: any) => x.year === 2569);
    const target = y.rows.find((r: any) => r.ownerName === "เฟิร์น");
    await admin.put("/ledger/payments", { changes: [{ rowId: target.id, month: 9, amount: null }, { rowId: target.id, month: 10, amount: null }] });
    await setReminders({ lookbackMonths: 2, maxRounds: 0 });
    let plan = await planReminders(db, day(22), { ...(await (await import("../server/settings.js")).getSettings(db)).reminders });
    expect(plan.groups.map((g) => g.month)).toEqual([9, 10]);
    await admin.patch(`/ledger/rows/${target.id}`, { paidThroughYear: 2569, paidThroughMonth: 10 });
    plan = await planReminders(db, day(22), { ...(await (await import("../server/settings.js")).getSettings(db)).reminders });
    expect(plan.groups.flatMap((g) => g.items.map((i) => i.owner))).not.toContain("เฟิร์น");
  });

  it("a disabled schedule sends nothing; the cron route needs the secret in production mode", async () => {
    await setReminders({ enabled: false });
    expect((await runReminders(db, { now: day(22) })).skipped).toBe("ปิดการแจ้งเตือนอยู่");
    process.env.CRON_SECRET = "s3cret-s3cret-s3cret";
    const anon = new Client();
    expect((await anon.get("/cron/reminders")).status).toBe(401);
    const ok = await anon.req("GET", "/cron/reminders", undefined, { authorization: "Bearer s3cret-s3cret-s3cret" });
    expect(ok.status).toBe(200);
    delete process.env.CRON_SECRET;
  });

  it("settings are validated and clamped", async () => {
    const r = await setReminders({ dueDay: 99, intervalDays: 0, maxRounds: -5, lookbackMonths: 99 });
    expect(r.json.settings.reminders).toMatchObject({ dueDay: 31, intervalDays: 1, maxRounds: 0, lookbackMonths: 11 });
    const t = await setReminders({ sendTime: "7:5" });
    expect(t.json.settings.reminders.sendTime).toBe("08:00"); // invalid -> default
    expect((await setReminders({ sendTime: "09:30" })).json.settings.reminders.sendTime).toBe("09:30");
    await setReminders({}); // restore
  });

  const makeUnpaid = async (n: number) => {
    const rows = (await admin.get("/data")).json.years.find((x: any) => x.year === 2569).rows
      .filter((r: any) => r.isActive && r.kind === "normal" && !r.paidThroughYear).slice(0, n);
    await admin.put("/ledger/payments", { changes: rows.map((r: any) => ({ rowId: r.id, month: 10, amount: null })) });
    return rows;
  };

  it("sends only at the configured Thai time of day (default 08:00)", async () => {
    await makeUnpaid(3);
    await db.query("delete from reminder_log");
    await setReminders({ maxRounds: 0, sendTime: "08:00" });
    const at = (h: number, m: number) => new Date(`2026-10-06T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`);
    expect((await runReminders(db, { now: at(7, 59) })).skipped).toBe("ยังไม่ถึงรอบแจ้งเตือน");
    expect((await runReminders(db, { now: at(8, 0) })).groupsSent).toBeGreaterThan(0);
    await db.query("delete from reminder_log");
    await setReminders({ maxRounds: 0, sendTime: "21:30" });
    expect((await runReminders(db, { now: at(21, 29) })).skipped).toBeTruthy();
    expect((await runReminders(db, { now: at(21, 31) })).groupsSent).toBeGreaterThan(0);
    await setReminders({ maxRounds: 3, sendTime: "08:00" });
  });

  it("every vehicle can pay on its own day; a paid vehicle is never mentioned", async () => {
    await makeUnpaid(4);
    await db.query("delete from reminder_log");
    await setReminders({ maxRounds: 0, lookbackMonths: 0, dueDay: 5 });
    const rows = (await admin.get("/data")).json.years.find((x: any) => x.year === 2569).rows;
    const unpaid = rows.filter((r: any) => r.isActive && r.kind === "normal" && (r.payments[9] ?? 0) < r.monthlyFee && !r.paidThroughYear);
    expect(unpaid.length).toBeGreaterThan(1);
    const [a, b] = unpaid;
    expect((await admin.patch(`/ledger/rows/${a.id}`, { dueDay: 20 })).json.row.dueDay).toBe(20);
    expect((await admin.patch(`/ledger/rows/${b.id}`, { dueDay: 99 })).status).toBe(400);
    const plan = await planReminders(db, day(10), (await (await import("../server/settings.js")).getSettings(db)).reminders);
    const g20 = plan.groups.find((g) => g.dueDay === 20)!;
    const g5 = plan.groups.find((g) => g.dueDay === 5)!;
    expect(g20.items.map((i) => `${i.owner}|${i.plate}`)).toEqual([`${a.ownerName}|${a.plate}`]);
    expect(g20.action).toBe("wait"); // 20th has not passed on the 10th
    expect(g5.action).toBe("send");
    expect(g5.items.map((i) => `${i.owner}|${i.plate}`)).not.toContain(`${a.ownerName}|${a.plate}`);
    const after20 = await planReminders(db, new Date("2026-10-21T09:00:00+07:00"), (await (await import("../server/settings.js")).getSettings(db)).reminders);
    expect(after20.groups.find((g) => g.dueDay === 20)!.action).toBe("send");
    // pay it: it drops out of every group
    await admin.put("/ledger/payments", { changes: [{ rowId: a.id, month: 10, amount: a.monthlyFee }] });
    const paid = await planReminders(db, new Date("2026-10-21T09:00:00+07:00"), (await (await import("../server/settings.js")).getSettings(db)).reminders);
    expect(paid.groups.flatMap((g) => g.items.map((i) => `${i.owner}|${i.plate}`))).not.toContain(`${a.ownerName}|${a.plate}`);
  });

  it("the sync button gives all of a customer's vehicles the same due day, or resets them", async () => {
    const cu = await admin.post("/customers", { name: "ลูกค้าหลายคัน", year: 2569, vehicles: [{ plate: "1ก 1", dueDay: 3 }, { plate: "2ข 2", dueDay: 17 }] });
    expect(cu.status).toBe(200);
    expect(cu.json.rows.map((r: any) => r.dueDay)).toEqual([3, 17]);
    const id = cu.json.customer.id;
    expect((await admin.post(`/customers/${id}/sync-due-day`, { dueDay: 10, year: 2569 })).json.changed).toBe(2);
    let rows = (await admin.get("/data")).json.years.find((x: any) => x.year === 2569).rows.filter((r: any) => r.customerId === id);
    expect(rows.map((r: any) => r.dueDay)).toEqual([10, 10]);
    expect((await admin.post(`/customers/${id}/sync-due-day`, { dueDay: null, year: 2569 })).json.changed).toBe(2);
    rows = (await admin.get("/data")).json.years.find((x: any) => x.year === 2569).rows.filter((r: any) => r.customerId === id);
    expect(rows.every((r: any) => r.dueDay === null)).toBe(true);
    expect((await admin.post(`/customers/${id}/sync-due-day`, { dueDay: 40 })).status).toBe(400);
    expect((await admin.post("/ledger/due-day/reset", { year: 2569 })).status).toBe(200);
  });

  it("email failures never lose the alert: the bell still rings and the failure is logged", async () => {
    await db.query("delete from reminder_log");
    await db.query("delete from notifications");
    await setReminders({ enabled: true, maxRounds: 0, lookbackMonths: 0 });
    // make SMTP "configured" but unreachable
    process.env.SMTP_USER = "x@gmail.com";
    process.env.SMTP_PASS = "bad";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1";
    const target = (await admin.get("/data")).json.years.find((x: any) => x.year === 2569).rows.find((r: any) => r.ownerName === "นุ้ย");
    await admin.put("/ledger/payments", { changes: [{ rowId: target.id, month: 10, amount: null }] });
    const r = await runReminders(db, { now: day(22) });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    expect(r.mail?.ok).toBe(false);
    expect(r.notified).toBeGreaterThan(0);
    const log = await db.query("select delivered from reminder_log order by id desc limit 1");
    expect(log[0].delivered).toBe(false); // will be retried on the next run
  });
});
