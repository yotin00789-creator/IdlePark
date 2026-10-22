import { audit } from "../audit.js";
import { HttpError, route } from "../http.js";
import { planReminders, runReminders, isoDate } from "../reminders.js";
import { getSettings } from "../settings.js";
import { smtpConfigured } from "../mail.js";
import { backupFilename, buildBackup, getBackupSettings, runBackup, sanitizeBackup, saveBackupSettings } from "../backup.js";
import { dbInfo } from "../db.js";
import { buildReport, parseRange } from "../report.js";

// ----------------------------------------------------------- notifications

route("GET", "/notifications", "user", async (c) => {
  const rows = await c.db.query(
    `select n.id, n.kind, n.title, n.body, n.link, n.severity, n.created_at,
            (r.user_id is not null) as read
       from notifications n
       left join notification_reads r on r.notification_id = n.id and r.user_id = $1
      order by n.created_at desc, n.id desc limit 40`,
    [c.user!.id],
  );
  const [{ n }] = await c.db.query<{ n: number }>(
    `select count(*)::int as n from notifications n
      where not exists (select 1 from notification_reads r where r.notification_id = n.id and r.user_id = $1)`,
    [c.user!.id],
  );
  return {
    unread: n,
    items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, severity: r.severity, createdAt: r.created_at, read: r.read })),
  };
});

route("POST", "/notifications/read", "user", async (c) => {
  const b = await c.json();
  if (b.all) {
    await c.db.query(
      `insert into notification_reads (notification_id, user_id)
       select id, $1 from notifications on conflict do nothing`,
      [c.user!.id],
    );
  } else if (Array.isArray(b.ids) && b.ids.length) {
    await c.db.query(
      `insert into notification_reads (notification_id, user_id)
       select id, $1 from notifications where id = any($2::int[]) on conflict do nothing`,
      [c.user!.id, b.ids.map(Number)],
    );
  }
  return { ok: true };
});

// ---------------------------------------------------------------- reminders

route("GET", "/reminders/status", ["admin", "editor"], async (c) => {
  const settings = await getSettings(c.db);
  const plan = await planReminders(c.db, new Date(), settings.reminders);
  const logs = await c.db.query(
    "select year, month, round, sent_at, unpaid_count, recipients, delivered, detail from reminder_log order by sent_at desc, id desc limit 30",
  );
  return {
    smtpConfigured: smtpConfigured(),
    cronConfigured: Boolean(process.env.CRON_SECRET) || !process.env.VERCEL,
    today: plan.today,
    groups: plan.groups.map((g) => ({
      year: g.year,
      month: g.month,
      dueDay: g.dueDay,
      count: g.items.length,
      due: g.items.reduce((s, i) => s + i.due, 0),
      action: g.action,
      reason: g.reason,
      rounds: g.rounds,
      nextDate: g.nextDate ? isoDate(g.nextDate) : null,
      startDate: isoDate(g.startDate),
    })),
    logs: logs.map((l) => ({ year: l.year, month: l.month, round: l.round, sentAt: l.sent_at, count: l.unpaid_count, recipients: l.recipients, delivered: l.delivered, detail: l.detail })),
  };
});

route("POST", "/reminders/run", ["admin"], async (c) => {
  const b = await c.json().catch(() => ({}));
  const r = await runReminders(c.db, { force: Boolean((b as any).force) });
  await audit(c, {
    action: "reminder.run",
    entity: "reminder",
    summary: `สั่งส่งแจ้งเตือนค้างชำระ${(b as any).force ? " (ส่งทันที)" : ""}: ${r.summary}`,
    after: { groupsSent: r.groupsSent, unpaidItems: r.unpaidItems, recipients: r.recipients, mail: r.mail },
    status: r.mail && !r.mail.ok ? "failed" : "ok",
  });
  return r;
});

// Called by Vercel Cron (vercel.json, hourly) or any external scheduler. Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Each tick does whatever is due: unpaid reminders (at their configured time) and the scheduled backup.
async function cronTick(c: import("../http.js").Ctx) {
  const secret = process.env.CRON_SECRET;
  const prod = process.env.VERCEL || process.env.NODE_ENV === "production";
  if (secret ? c.req.headers.get("authorization") !== `Bearer ${secret}` : prod) {
    throw new HttpError(401, "ไม่ได้รับอนุญาต");
  }
  const system = { id: null, email: "system", name: "ระบบอัตโนมัติ", role: "system" };
  const r = await runReminders(c.db);
  if (!r.skipped || r.groupsSent) {
    await audit(c, {
      action: "reminder.cron",
      entity: "reminder",
      summary: `ระบบอัตโนมัติรันแจ้งเตือน: ${r.summary}`,
      after: { groupsSent: r.groupsSent, unpaidItems: r.unpaidItems, recipients: r.recipients, mail: r.mail },
      status: r.mail && !r.mail.ok ? "failed" : "ok",
      actor: system,
    });
  }
  const b = await runBackup(c.db, { kind: "auto" });
  if (!b.skipped) {
    await audit(c, {
      action: "backup.auto",
      entity: "backup",
      summary: `ระบบสำรองข้อมูลอัตโนมัติ: ${b.ok ? `ส่งถึง ${b.recipients.length} ที่อยู่` : `ไม่สำเร็จ (${b.mail?.error ?? ""})`}`,
      after: { recipients: b.recipients, sizeBytes: b.sizeBytes },
      status: b.ok ? "ok" : "failed",
      actor: system,
    });
  }
  return { ...r, backup: b };
}
route("GET", "/cron/reminders", "public", cronTick);
route("GET", "/cron/tick", "public", cronTick);

// ------------------------------------------------------------------- backup

route("GET", "/backup/status", ["admin"], async (c) => {
  const [settings, logs, users] = await Promise.all([
    getBackupSettings(c.db),
    c.db.query("select id, at, kind, ok, recipients, size_bytes, detail from backup_log order by at desc, id desc limit 15"),
    c.db.query("select id, email, first_name, last_name, role from users where is_active and password_hash is not null order by first_name"),
  ]);
  return {
    settings,
    smtpConfigured: smtpConfigured(),
    users: users.map((u) => ({ id: u.id, email: u.email, name: `${u.first_name} ${u.last_name}`.trim(), role: u.role })),
    logs: logs.map((l) => ({ id: l.id, at: l.at, kind: l.kind, ok: l.ok, recipients: l.recipients, sizeBytes: l.size_bytes, detail: l.detail })),
  };
});

route("PUT", "/backup/settings", ["admin"], async (c) => {
  const b = await c.json();
  const before = await getBackupSettings(c.db);
  let next;
  try {
    next = sanitizeBackup(b);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "ข้อมูลไม่ถูกต้อง");
  }
  if (next.enabled && !next.userIds.length && !next.externalEmails.length) throw new HttpError(400, "เลือกผู้รับอย่างน้อย 1 คน หรือกรอกอีเมลก่อนเปิดการสำรองข้อมูล");
  await saveBackupSettings(c.db, next);
  await audit(c, { action: "backup.settings", entity: "backup", summary: `${next.enabled ? "เปิด" : "ปิด"}การสำรองข้อมูลอัตโนมัติ (${next.frequency}, ${next.time} น., ผู้รับ ${next.userIds.length + next.externalEmails.length} ที่อยู่)`, before, after: next }, c.db);
  return { settings: next };
});

route("POST", "/backup/run", ["admin"], async (c) => {
  const by = `${c.user!.firstName} ${c.user!.lastName}`.trim() || c.user!.email;
  const r = await runBackup(c.db, { force: true, by, kind: "manual" });
  await audit(c, {
    action: "backup.manual",
    entity: "backup",
    summary: r.skipped ? `สำรองข้อมูลไม่สำเร็จ: ${r.skipped}` : `สำรองข้อมูลทันที ส่งถึง ${r.recipients.join(", ")}${r.ok ? "" : ` (ส่งไม่สำเร็จ: ${r.mail?.error ?? ""})`}`,
    after: { recipients: r.recipients, sizeBytes: r.sizeBytes },
    status: r.ok ? "ok" : "failed",
  });
  if (r.skipped) throw new HttpError(400, r.skipped);
  return r;
});

route("GET", "/backup/download", ["admin"], async (c) => {
  const file = await buildBackup(c.db);
  await audit(c, { action: "backup.download", entity: "backup", summary: "ดาวน์โหลดไฟล์สำรองข้อมูล Excel" });
  return new Response(new Uint8Array(file.buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(backupFilename(new Date()))}`,
      "cache-control": "no-store",
    },
  });
});

// ----------------------------------------------------------------- database

route("GET", "/system/db", ["admin"], async (c) => info(c));
async function info(c: import("../http.js").Ctx) {
  const tables = ["users", "customers", "zones", "ledger_rows", "payments", "year_items", "savings_days", "bank_accounts", "audit_log", "notifications", "backup_log"];
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = (await c.db.query<{ n: number }>(`select count(*)::int as n from ${t}`))[0].n;
  const [last] = await c.db.query("select max(at) as at from audit_log");
  return { ...dbInfo(), counts, lastWriteAt: last?.at ?? null, migrations: (await c.db.query("select count(*)::int as n from schema_migrations"))[0].n };
}

// --------------------------------------------------------------------- audit

route("GET", "/audit", ["admin"], async (c) => {
  const p = c.url.searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  const q = p.get("q")?.trim();
  if (q) add("(summary ilike ? or user_email ilike ? or entity_id ilike ?)", `%${q.replace(/[%_]/g, "")}%`);
  if (p.get("action")) add("action like ?", `${p.get("action")!.replace(/[%_]/g, "")}%`);
  if (p.get("user")) add("user_email = ?", p.get("user"));
  if (p.get("status")) add("status = ?", p.get("status"));
  if (p.get("from")) add("at >= ?::timestamptz", `${p.get("from")}T00:00:00+07:00`);
  if (p.get("to")) add("at < (?::timestamptz + interval '1 day')", `${p.get("to")}T00:00:00+07:00`);
  if (p.get("before")) add("id < ?::int", Number(p.get("before")));
  const limit = Math.min(100, Math.max(1, Number(p.get("limit")) || 50));
  const rows = await c.db.query(
    `select id, at, user_id, user_email, user_name, role, action, entity, entity_id, summary, before, after, ip, user_agent, method, path, status
       from audit_log ${where.length ? `where ${where.join(" and ")}` : ""}
      order by id desc limit ${limit + 1}`,
    params,
  );
  const users = await c.db.query("select distinct user_email from audit_log where user_email <> '' order by user_email");
  // a delete can be undone while it holds a snapshot and the thing is still gone
  const gone = async (action: string, table: string) => {
    const ids = rows.filter((r) => r.action === action && r.before?.snapshot).map((r) => Number(r.entity_id)).filter(Number.isInteger);
    if (!ids.length) return new Set<number>();
    const back = await c.db.query(`select id from ${table} where id = any($1::int[])`, [ids]);
    return new Set(ids.filter((i) => !back.some((b) => b.id === i)));
  };
  const goneBy: Record<string, Set<number>> = {
    "row.delete": await gone("row.delete", "ledger_rows"),
    "zone.delete": await gone("zone.delete", "zones"),
    "customer.delete": await gone("customer.delete", "customers"),
  };
  return {
    entries: rows.slice(0, limit).map((r) => ({
      restorable: Boolean(r.before?.snapshot && goneBy[r.action]?.has(Number(r.entity_id)) && r.status === "ok"),
      id: r.id, at: r.at, userId: r.user_id, userEmail: r.user_email, userName: r.user_name, role: r.role,
      action: r.action, entity: r.entity, entityId: r.entity_id, summary: r.summary, before: r.before?.snapshot ? { ...r.before, snapshot: undefined } : r.before, after: r.after,
      ip: r.ip, userAgent: r.user_agent, method: r.method, path: r.path, status: r.status,
    })),
    hasMore: rows.length > limit,
    users: users.map((u) => u.user_email as string),
  };
});

// ------------------------------------------------------------------- report

route("GET", "/report", "user", async (c) => {
  let range;
  try {
    range = parseRange(c.url.searchParams);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "ช่วงเวลาไม่ถูกต้อง");
  }
  const by = `${c.user!.firstName} ${c.user!.lastName}`.trim() || c.user!.email;
  const html = await buildReport(c.db, range, by);
  await audit(c, {
    action: "report.generate",
    entity: "report",
    summary: `สร้างรายงาน ${range.mode === "months" ? `เดือน ${range.from.month}/${range.from.year} ถึง ${range.to.month}/${range.to.year}` : `วันที่ ${range.from} ถึง ${range.to}`}`,
    after: range,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
});
