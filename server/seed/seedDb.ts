// Imports the parsed workbook into the database. Real data is read from the .xlsx
// at seed time only — nothing from the file is kept in the repository.
import { bangkokToday } from "../../shared/thai.js";
import { encrypt } from "../crypto.js";
import type { Db, Queryable } from "../db.js";
import { DEFAULT_SETTINGS, setSetting } from "../settings.js";
import type { ParsedWorkbook } from "./parseWorkbook.js";
import { compareWithExcel, DEFAULT_FEE } from "./verify.js";

export interface SeedReport {
  skipped: boolean;
  years: number;
  rows: number;
  filledCells: number;
  needsReview: { year: number; sourceRow: number; amount: number }[];
  overrides: number;
  savingsYears: number;
  accounts: number;
  checked: number;
  diffs: { where: string; expected: number | null; actual: number }[];
  knownErrors: string[];
  bankFigures: ParsedWorkbook["bankFigures"];
}

async function insertMany(q: Queryable, table: string, cols: string[], rows: unknown[][], chunk = 150) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(",")})`);
    await q.query(`insert into ${table} (${cols.join(",")}) values ${values.join(",")} on conflict do nothing`, params);
  }
}

export async function seedFromWorkbook(
  db: Db,
  wb: ParsedWorkbook,
  opts: { force?: boolean; now?: Date } = {},
): Promise<SeedReport> {
  const already = await db.query("select 1 from settings where key = 'seeded'");
  const report: SeedReport = {
    skipped: false,
    years: wb.years.length,
    rows: wb.years.reduce((n, y) => n + y.rows.length, 0),
    filledCells: wb.years.reduce((n, y) => n + y.rows.reduce((m, r) => m + r.payments.filter((p) => p != null).length, 0), 0),
    needsReview: wb.years.flatMap((y) =>
      y.rows.filter((r) => r.needsReview).map((r) => ({ year: y.year, sourceRow: r.sourceRow, amount: r.payments.reduce<number>((s, p) => s + (p ?? 0), 0) })),
    ),
    overrides: wb.years.reduce((n, y) => n + y.overrides.length, 0),
    savingsYears: wb.savings.length,
    accounts: wb.banks.length,
    checked: 0,
    diffs: [],
    knownErrors: [],
    bankFigures: wb.bankFigures,
  };
  const cmp = compareWithExcel(wb, "legacy");
  report.checked = cmp.checked;
  report.diffs = cmp.diffs;
  report.knownErrors = cmp.errors;

  if (already.length && !opts.force) {
    report.skipped = true;
    return report;
  }

  const current = bangkokToday(opts.now ?? new Date()).year;
  await db.tx(async (q) => {
    if (opts.force) {
      for (const t of ["payments", "ledger_rows", "year_items", "calc_overrides", "savings_days", "savings_items", "year_notes", "bank_accounts", "customers", "zones", "reminder_log", "notifications"]) {
        await q.query(`delete from ${t}`);
      }
      await q.query("delete from settings where key = 'seeded'");
    }
    const [zone] = await q.query("insert into zones (name, description, sort_order) values ('โซนหลัก', 'ที่จอดรถทั้งหมด (เปลี่ยนชื่อ/เพิ่มโซนได้ที่เมนูโซน)', 0) returning id");

    const names = [...new Set(wb.years.flatMap((y) => y.rows.map((r) => r.ownerName)))].filter((n) => n !== "ไม่ระบุชื่อ");
    const customerId = new Map<string, number>();
    for (const name of names) {
      const [c] = await q.query("insert into customers (name) values ($1) returning id", [name]);
      customerId.set(name, c.id);
    }

    for (const y of wb.years) {
      for (const r of y.rows) {
        const [row] = await q.query(
          `insert into ledger_rows (year, sort_order, customer_id, owner_name, plate, zone_id, kind, source_row,
             monthly_fee, paid_through_year, paid_through_month, note, needs_review, is_active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
          [y.year, r.sortOrder, customerId.get(r.ownerName) ?? null, r.ownerName, r.plate, zone.id, r.kind, r.sourceRow, DEFAULT_FEE, r.paidThroughYear, r.paidThroughMonth, r.note, r.needsReview, y.year >= current],
        );
        const pays = r.payments.map((p, i) => (p == null ? null : [row.id, i + 1, p])).filter(Boolean) as unknown[][];
        await insertMany(q, "payments", ["row_id", "month", "amount"], pays);
      }
      const items: unknown[][] = [];
      for (const [kind, arr] of Object.entries(y.items)) {
        arr.forEach((v, i) => v != null && items.push([y.year, i + 1, kind, v]));
      }
      await insertMany(q, "year_items", ["year", "month", "kind", "amount"], items);
      await insertMany(
        q,
        "calc_overrides",
        ["year", "month", "field", "mode", "value", "note"],
        y.overrides.map((o) => [y.year, o.month, o.field, "legacy", JSON.stringify(o.value), o.note]),
      );
    }

    for (const s of wb.savings) {
      const days: unknown[][] = [];
      s.days.forEach((col, m) => col.forEach((v, d) => v != null && days.push([s.year, m + 1, d + 1, v])));
      await insertMany(q, "savings_days", ["year", "month", "day", "amount"], days);
      const items: unknown[][] = [];
      s.expense.forEach((v, m) => v != null && items.push([s.year, m + 1, "expense", v]));
      s.card.forEach((v, m) => v != null && items.push([s.year, m + 1, "card", v]));
      await insertMany(q, "savings_items", ["year", "month", "kind", "amount"], items);
      if (s.note) await q.query("insert into year_notes (scope, year, label, amount) values ('savings', $1, $2, $3)", [s.year, s.note.label, s.note.amount]);
    }

    let order = 0;
    for (const b of wb.banks) {
      await q.query(
        "insert into bank_accounts (bank, number_enc, holder, label, shows, sort_order) values ($1,$2,$3,$4,$5,$6)",
        [b.bank, encrypt(b.number), b.holder, order === 0 ? "บัญชีรับเงินหลัก" : "บัญชีเก็บเงิน", order === 0 ? "net" : "collect", order++],
      );
    }

    await setSetting(q, "monthlyFeeDefault", DEFAULT_SETTINGS.monthlyFeeDefault);
    await setSetting(q, "reminders", DEFAULT_SETTINGS.reminders);
    // What Excel had calculated, kept so the "ตรวจสอบสูตร" page can show the comparison later.
    await setSetting(q, "excelReference", {
      years: wb.years.map((y) => ({ year: y.year, income: y.expected.incomeTotal, net: y.expected.netTotal, cumulative: y.expected.cumulative })),
      savings: wb.savings.map((sv) => ({ year: sv.year, yearRemain: sv.expected.yearRemain })),
      errors: cmp.errors,
    });
    await setSetting(q, "seeded", { at: new Date().toISOString(), years: wb.years.map((y) => y.year) });
  });
  return report;
}
