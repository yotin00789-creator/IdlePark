// The printable business report. It is built as a standalone HTML page (A4, with print styles) that the
// browser turns into a PDF ("Save as PDF"), so Thai text and the layout are exactly what you see.
import { calcAll } from "../shared/calc.js";
import { currentFee, feeFor, findUnpaid, isPrepaid } from "../shared/calc.js";
import { slotLabel } from "../shared/lot.js";
import { bangkokClock, formatBaht, formatIsoThai, formatThaiDate, formatThaiDateTime, formatThaiTime, THAI_MONTHS, THAI_MONTHS_SHORT } from "../shared/thai.js";
import type { YearCalc } from "../shared/types.js";
import { loadYears } from "./data.js";
import type { Db } from "./db.js";
import { appName, esc } from "./emailTemplates.js";

export type ReportRange =
  | { mode: "months"; from: { year: number; month: number }; to: { year: number; month: number } }
  | { mode: "days"; from: string; to: string }; // ISO dates (Gregorian) "2026-10-01"

const money = (v: number) => formatBaht(v);
const monthLabel = (y: number, m: number) => `${THAI_MONTHS[m - 1]} ${y}`;
const idx = (y: number, m: number) => y * 12 + (m - 1);

export class ReportError extends Error {}

export function parseRange(q: URLSearchParams): ReportRange {
  const mode = q.get("mode") === "days" ? "days" : "months";
  if (mode === "days") {
    const from = q.get("from") ?? "";
    const to = q.get("to") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new ReportError("กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด");
    if (from > to) throw new ReportError("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) throw new ReportError("เลือกช่วงวันที่ได้ไม่เกิน 1 ปี");
    return { mode, from, to };
  }
  const part = (v: string | null) => {
    const m = /^(\d{4})-(\d{1,2})$/.exec(v ?? "");
    const year = m ? Number(m[1]) : 0;
    const month = m ? Number(m[2]) : 0;
    if (year < 2500 || year > 2700 || month < 1 || month > 12) throw new ReportError("กรุณาเลือกเดือนและปีเริ่มต้น/สิ้นสุดให้ถูกต้อง");
    return { year, month };
  };
  const from = part(q.get("from"));
  const to = part(q.get("to"));
  if (idx(from.year, from.month) > idx(to.year, to.month)) throw new ReportError("เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด");
  if (idx(to.year, to.month) - idx(from.year, from.month) > 59) throw new ReportError("เลือกช่วงเดือนได้ไม่เกิน 60 เดือน");
  return { mode, from, to };
}

const CSS = `
@font-face{font-family:"Plex";font-weight:400;src:url(/fonts/ibm-plex-sans-thai-thai-400-normal.woff2) format("woff2");unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
@font-face{font-family:"Plex";font-weight:600;src:url(/fonts/ibm-plex-sans-thai-thai-600-normal.woff2) format("woff2");unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
@font-face{font-family:"Plex";font-weight:700;src:url(/fonts/ibm-plex-sans-thai-thai-700-normal.woff2) format("woff2");unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC}
@font-face{font-family:"Plex";font-weight:400;src:url(/fonts/ibm-plex-sans-thai-latin-400-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2212}
@font-face{font-family:"Plex";font-weight:600;src:url(/fonts/ibm-plex-sans-thai-latin-600-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2212}
@font-face{font-family:"Plex";font-weight:700;src:url(/fonts/ibm-plex-sans-thai-latin-700-normal.woff2) format("woff2");unicode-range:U+0000-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2212}
:root{--ink:#101828;--body:#344054;--muted:#667085;--line:#E4E7EC;--soft:#F6F4F0;--brand:#111314;--gold:#F2C200;--brand-soft:#FFF7C2;--ok:#039855;--err:#D92D20}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#EAECF0;font:400 11px/1.55 "Plex","Noto Sans Thai",Tahoma,sans-serif;color:var(--body)}
.sheet{width:210mm;min-height:297mm;margin:10mm auto;background:#fff;padding:14mm 14mm 16mm;position:relative;box-shadow:0 1px 4px rgba(16,24,40,.12)}
.sheet.land{width:297mm;min-height:210mm;padding:12mm 12mm 14mm}
@page{size:A4;margin:0}
@page land{size:A4 landscape;margin:0}
.land{page:land}
@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;break-after:page}.sheet:last-child{break-after:auto}.noprint{display:none!important}}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--brand);padding-bottom:10px;position:relative}
.top::after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:3px;background:repeating-linear-gradient(90deg,var(--gold) 0 10px,transparent 10px 16px)}
.org{display:flex;gap:10px;align-items:center}
.logo{width:34px;height:34px;border-radius:8px;background:var(--brand);color:var(--gold);font:700 18px/34px "Plex",sans-serif;text-align:center}
.org b{display:block;font-size:14px;color:var(--ink)}
.org span{font-size:10px;color:var(--muted)}
.doc{text-align:right;font-size:10px;color:var(--muted)}
.doc b{color:var(--ink);font-weight:600}
h1{margin:14px 0 2px;font:700 19px/1.3 "Plex",sans-serif;color:var(--ink)}
.period{margin:0 0 12px;font-size:12px;color:var(--muted)}
.period b{color:var(--ink);font-weight:600}
h2{margin:16px 0 6px;padding-left:8px;border-left:3px solid var(--gold);font:600 12.5px/1.3 "Plex",sans-serif;color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 4px}
.kpi{border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--soft)}
.kpi small{display:block;color:var(--muted);font-size:9.5px}
.kpi strong{display:block;margin-top:1px;font:700 15px/1.3 "Plex",sans-serif;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi.main{background:var(--brand-soft);border-color:#F2C200}
.kpi.main strong{color:#111314}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{background:var(--soft);color:var(--muted);font-weight:600;font-size:9.5px;text-align:right;padding:5px 6px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:4px 6px;border-bottom:1px solid #F2F4F7;text-align:right;white-space:nowrap}
th.l,td.l{text-align:left}
td.l{white-space:normal}
tr.sub td{background:var(--soft);font-weight:600;color:var(--ink)}
tr.total td{border-top:1.5px solid var(--ink);border-bottom:1.5px solid var(--ink);font-weight:700;color:var(--ink);background:#fff}
tr{break-inside:avoid}
thead{display:table-header-group}
.neg{color:var(--err)}.pos{color:var(--ok)}.dim{color:#98A2B3}
.mx td,.mx th{padding:3px 4px;font-size:9.5px}
.mx td.v{font-size:9.5px}
.mx .z{color:var(--err);font-weight:600}
.mx .p{background:#FFFAEB}
.note{margin:6px 0 0;color:var(--muted);font-size:9.5px}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px;break-inside:avoid}
.sign div{text-align:center;font-size:10px;color:var(--muted)}
.sign i{display:block;border-bottom:1px solid var(--ink);height:34px;margin-bottom:4px}
.foot{position:absolute;left:14mm;right:14mm;bottom:8mm;display:flex;justify-content:space-between;color:#98A2B3;font-size:9px;border-top:1px solid var(--line);padding-top:4px}
.sheet.land .foot{left:12mm;right:12mm}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;justify-content:center;padding:8px;background:#101828;color:#fff;font-size:12px}
.bar button{font:600 12px "Plex",sans-serif;border:0;border-radius:6px;padding:6px 14px;background:var(--brand);color:var(--gold);cursor:pointer}
`;

interface Meta {
  refNo: string;
  now: Date;
  by: string;
}

function head(meta: Meta, title: string, period: string) {
  return `<header class="top"><div class="org"><div class="logo">P</div><div><b style="letter-spacing:.14em">${esc(appName()).toUpperCase()}</b><span>ระบบบริหารที่จอดรถรายเดือน</span></div></div>
  <div class="doc">เลขที่เอกสาร <b>${esc(meta.refNo)}</b><br>ออกเมื่อ ${esc(formatThaiDateTime(meta.now))}<br>จัดทำโดย ${esc(meta.by)}</div></header>
  <h1>${esc(title)}</h1><p class="period">${period}</p>`;
}
const foot = (meta: Meta, page: string) => `<div class="foot"><span>${esc(appName())} · ${esc(meta.refNo)}</span><span>${esc(page)}</span></div>`;

const cls = (v: number) => (v < 0 ? "neg" : "");

interface MonthLine {
  year: number;
  month: number;
  income: number;
  toFather: number;
  payAunt: number;
  totalExpense: number;
  collect: number;
  net: number;
  cumulative: number;
}

function monthLines(calc: YearCalc[], r: Extract<ReportRange, { mode: "months" }>): MonthLine[] {
  const out: MonthLine[] = [];
  for (const y of calc) {
    let run = y.cumulativeStart;
    y.months.forEach((m, i) => {
      run += m.net;
      const at = idx(y.year, i + 1);
      if (at >= idx(r.from.year, r.from.month) && at <= idx(r.to.year, r.to.month)) out.push({ year: y.year, month: i + 1, ...m, cumulative: run });
    });
  }
  return out;
}

export async function monthsReport(db: Db, r: Extract<ReportRange, { mode: "months" }>, meta: Meta): Promise<string> {
  const years = await loadYears(db);
  const calc = calcAll(years);
  const lines = monthLines(calc, r);
  const have = new Set(lines.map((l) => l.year));
  const sum = (k: keyof MonthLine) => lines.reduce((n, l) => n + (l[k] as number), 0);
  const end = lines.at(-1);
  // how the rent arrived in these months: cash, or a transfer (per bank account)
  const bank = new Map((await db.query("select id, bank, label from bank_accounts")).map((a) => [a.id as number, `${a.bank} · ${a.label}`]));
  let cash = 0;
  let transfer = 0;
  const perAccount = new Map<string, number>();
  for (const y of years) {
    for (const row of y.rows) {
      if (row.kind === "excluded") continue;
      row.payments.forEach((v, i) => {
        const at = idx(y.year, i + 1);
        if (v == null || v <= 0 || at < idx(r.from.year, r.from.month) || at > idx(r.to.year, r.to.month)) return;
        if (row.payMethods[i] === "transfer") {
          transfer += v;
          const name = row.payAccounts[i] != null ? (bank.get(row.payAccounts[i]!) ?? "บัญชีที่ถูกลบ") : "ไม่ระบุบัญชี";
          perAccount.set(name, (perAccount.get(name) ?? 0) + v);
        } else cash += v;
      });
    }
  }
  const methodLine = `<p class="note">ช่องทางรับค่าเช่าในช่วงนี้: เงินสด <b>${money(cash)}</b> บาท · โอนเข้าบัญชี <b>${money(transfer)}</b> บาท${perAccount.size ? ` (${[...perAccount].map(([n, v]) => `${esc(n)} ${money(v)}`).join(", ")})` : ""}</p>`;
  const period = `ช่วงเดือน <b>${esc(monthLabel(r.from.year, r.from.month))}</b> ถึง <b>${esc(monthLabel(r.to.year, r.to.month))}</b> (${lines.length} เดือน)`;

  let pages = "";
  let pageNo = 0;
  const pageLabel = () => `หน้า ${++pageNo}`;

  // ---- page 1: summary
  const monthRows = lines
    .map((l) => `<tr><td class="l">${esc(monthLabel(l.year, l.month))}</td><td>${money(l.income)}</td><td>${money(l.toFather)}</td><td>${money(l.payAunt)}</td><td>${money(l.totalExpense)}</td><td>${money(l.collect)}</td><td class="${cls(l.net)}">${money(l.net)}</td><td class="${cls(l.cumulative)}">${money(l.cumulative)}</td></tr>`)
    .join("");
  const unpaidMonth = end && idx(end.year, end.month) <= idx(bangkokClock(meta.now).year, bangkokClock(meta.now).month) ? end : null;
  const unpaidRows = unpaidMonth
    ? findUnpaid(years.find((y) => y.year === unpaidMonth.year)?.rows ?? [], unpaidMonth.year, unpaidMonth.month, 0).filter((u) => u.month === unpaidMonth.month)
    : [];
  const unpaidTable = unpaidMonth
    ? unpaidRows.length
      ? `<table><thead><tr><th class="l">ผู้เช่า</th><th class="l">ทะเบียน / ช่อง</th><th>ค่าเช่า</th><th>จ่ายแล้ว</th><th>ค้างชำระ</th></tr></thead><tbody>${unpaidRows
          .map((u) => `<tr><td class="l">${esc(u.row.ownerName)}</td><td class="l">${esc(u.row.plate || "—")}${u.row.slotId ? ` · ${esc(slotLabel(u.row.slotId))}` : ""}</td><td>${money(feeFor(u.row, unpaidMonth.month))}</td><td>${money(u.paid)}</td><td class="neg">${money(u.due)}</td></tr>`)
          .join("")}<tr class="total"><td class="l" colspan="4">รวมค้างชำระ ${unpaidRows.length} คัน</td><td class="neg">${money(unpaidRows.reduce((n, u) => n + u.due, 0))}</td></tr></tbody></table>`
      : `<p class="note">ไม่มีผู้ค้างชำระในเดือน${esc(monthLabel(unpaidMonth.year, unpaidMonth.month))}</p>`
    : "";

  pages += `<section class="sheet">${head(meta, "รายงานสรุปรายรับค่าเช่าที่จอดรถ", period)}
  <div class="kpis">
    <div class="kpi"><small>รายรับรวม</small><strong>${money(sum("income"))}</strong></div>
    <div class="kpi"><small>ค่าใช้จ่ายทั้งหมด</small><strong>${money(sum("toFather") + sum("payAunt") + sum("totalExpense"))}</strong></div>
    <div class="kpi"><small>เก็บเงิน</small><strong>${money(sum("collect"))}</strong></div>
    <div class="kpi main"><small>รวม(หักแล้ว) ในช่วงนี้</small><strong>${money(sum("net"))}</strong></div>
  </div>
  <p class="note">ยอดสะสมคงเหลือ ณ สิ้น${end ? esc(monthLabel(end.year, end.month)) : ""}: <b>${end ? money(end.cumulative) : "—"}</b> บาท</p>
  ${methodLine}
  <h2>สรุปรายเดือน (บาท)</h2>
  <table><thead><tr><th class="l">เดือน</th><th>รายรับ</th><th>ให้พ่อ</th><th>จ่ายป้า</th><th>ค่าใช้จ่ายรวม</th><th>เก็บเงิน</th><th>รวม(หักแล้ว)</th><th>สะสม</th></tr></thead>
  <tbody>${monthRows}<tr class="total"><td class="l">รวมทั้งช่วง</td><td>${money(sum("income"))}</td><td>${money(sum("toFather"))}</td><td>${money(sum("payAunt"))}</td><td>${money(sum("totalExpense"))}</td><td>${money(sum("collect"))}</td><td class="${cls(sum("net"))}">${money(sum("net"))}</td><td class="${cls(end?.cumulative ?? 0)}">${end ? money(end.cumulative) : "—"}</td></tr></tbody></table>
  ${unpaidMonth ? `<h2>รายการค้างชำระ เดือน${esc(monthLabel(unpaidMonth.year, unpaidMonth.month))}</h2>${unpaidTable}` : ""}
  <div class="sign"><div><i></i>ผู้จัดทำ<br>วันที่ ${esc(formatThaiDate(meta.now))}</div><div><i></i>ผู้ตรวจสอบ</div><div><i></i>ผู้อนุมัติ</div></div>
  ${foot(meta, pageLabel())}</section>`;

  // ---- landscape matrices: one per year, up to 12 month-columns
  for (const y of years.filter((x) => have.has(x.year))) {
    const cols = lines.filter((l) => l.year === y.year).map((l) => l.month);
    if (!cols.length) continue;
    const rows = y.rows
      .filter((row) => row.kind !== "excluded")
      .filter((row) => cols.some((m) => (row.payments[m - 1] ?? 0) > 0) || (row.isActive && cols.some((m) => m >= row.startMonth && (row.endMonth == null || m <= row.endMonth))))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const colTotals = cols.map((m) => rows.reduce((n, row) => n + (row.payments[m - 1] ?? 0), 0));
    const body = rows
      .map((row) => {
        const cells = cols
          .map((m) => {
            const v = row.payments[m - 1];
            const inTerm = m >= row.startMonth && (row.endMonth == null || m <= row.endMonth);
            if (v == null) return `<td class="v dim">${inTerm && isPrepaid(row, y.year, m) ? "จ่ายล่วงหน้า" : "—"}</td>`;
            return `<td class="v ${v <= 0 ? "z" : v < feeFor(row, m) ? "p" : ""}">${money(v)}</td>`;
          })
          .join("");
        const total = cols.reduce((n, m) => n + (row.payments[m - 1] ?? 0), 0);
        return `<tr><td class="l">${esc(row.ownerName)}</td><td class="l">${esc(row.plate || "—")}</td><td class="l">${row.slotId ? esc(slotLabel(row.slotId)) : "—"}</td><td>${money(currentFee(row, { year: y.year, month: cols.at(-1)! }))}${row.feeChanges.length ? "*" : ""}</td>${cells}<td><b>${money(total)}</b></td></tr>`;
      })
      .join("");
    pages += `<section class="sheet land">${head(meta, `รายละเอียดการชำระรายคัน ปี ${y.year}`, `เดือน ${esc(THAI_MONTHS[cols[0] - 1])}${cols.length > 1 ? ` ถึง ${esc(THAI_MONTHS[cols.at(-1)! - 1])}` : ""} ${y.year} · ${rows.length} รายการ · หน่วย: บาท`)}
    <table class="mx"><thead><tr><th class="l">ชื่อ</th><th class="l">ทะเบียน</th><th class="l">ช่อง</th><th>ค่าเช่า</th>${cols.map((m) => `<th>${esc(THAI_MONTHS_SHORT[m - 1])}</th>`).join("")}<th>รวม</th></tr></thead>
    <tbody>${body}<tr class="total"><td class="l" colspan="4">รวม</td>${colTotals.map((v) => `<td>${money(v)}</td>`).join("")}<td>${money(colTotals.reduce((a, b) => a + b, 0))}</td></tr></tbody></table>
    <p class="note">สีแดง = ชำระ 0 บาท · พื้นเหลือง = ชำระบางส่วน · “—” = ยังไม่มีข้อมูล</p>
    ${foot(meta, pageLabel())}</section>`;
  }
  return shell(`รายงานรายรับ ${monthLabel(r.from.year, r.from.month)} ถึง ${monthLabel(r.to.year, r.to.month)}`, pages);
}

export async function daysReport(db: Db, r: Extract<ReportRange, { mode: "days" }>, meta: Meta): Promise<string> {
  const rows = await db.query(
    `select p.amount, p.month, p.method, p.updated_at, b.bank as bank, b.label as bank_label, r.year, r.owner_name, r.plate, r.slot_id, r.monthly_fee, r.vehicle_type,
            coalesce(nullif(trim(u.first_name || ' ' || u.last_name), ''), '—') as by
       from payments p
       join ledger_rows r on r.id = p.row_id
       left join users u on u.id = p.updated_by
       left join bank_accounts b on b.id = p.account_id
      where p.amount is not null and p.amount > 0
        and p.updated_at >= $1::timestamptz and p.updated_at < ($2::timestamptz + interval '1 day')
      order by p.updated_at, r.owner_name`,
    [`${r.from}T00:00:00+07:00`, `${r.to}T00:00:00+07:00`],
  );
  const byDay = new Map<string, typeof rows>();
  for (const x of rows) {
    const c = bangkokClock(x.updated_at);
    const key = `${c.year - 543}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
    byDay.set(key, [...(byDay.get(key) ?? []), x]);
  }
  const total = rows.reduce((n, x) => n + (x.amount as number), 0);
  const cashTotal = rows.filter((x) => x.method !== "transfer").reduce((n, x) => n + (x.amount as number), 0);
  const how = (x: (typeof rows)[number]) => (x.method === "transfer" ? `โอน${x.bank ? ` ${x.bank}` : ""}` : "เงินสด");
  const period = `ช่วงวันที่ <b>${esc(formatIsoThai(r.from))}</b> ถึง <b>${esc(formatIsoThai(r.to))}</b> · ${byDay.size} วันที่มีรายการ`;
  const body = [...byDay.entries()]
    .map(([day, list]) => {
      const sub = list.reduce((n, x) => n + (x.amount as number), 0);
      return `<tr class="sub"><td class="l" colspan="6">${esc(formatIsoThai(day))} · ${list.length} รายการ</td><td>${money(sub)}</td></tr>${list
        .map((x) => `<tr><td class="l">${esc(formatThaiTime(x.updated_at))}</td><td class="l">${esc(x.owner_name)}</td><td class="l">${esc(x.plate || "—")}${x.slot_id ? ` · ${esc(slotLabel(x.slot_id))}` : ""}</td><td class="l">${esc(THAI_MONTHS[(x.month as number) - 1])} ${x.year}</td><td class="l">${esc(x.by)}</td><td class="l">${esc(how(x))}</td><td>${money(x.amount as number)}</td></tr>`)
        .join("")}`;
    })
    .join("");
  const pages = `<section class="sheet">${head(meta, "รายงานการรับเงินรายวัน", period)}
  <div class="kpis"><div class="kpi main"><small>รับเงินรวมในช่วงนี้ (บาท)</small><strong>${money(total)}</strong></div><div class="kpi"><small>จำนวนรายการ</small><strong>${rows.length}</strong></div><div class="kpi"><small>เงินสด</small><strong>${money(cashTotal)}</strong></div><div class="kpi"><small>โอนเข้าบัญชี</small><strong>${money(total - cashTotal)}</strong></div></div>
  <h2>รายการรับเงิน (บาท)</h2>
  ${rows.length ? `<table><thead><tr><th class="l">เวลา</th><th class="l">ผู้เช่า</th><th class="l">ทะเบียน / ช่อง</th><th class="l">งวดเดือน</th><th class="l">ผู้บันทึก</th><th class="l">รับด้วย</th><th>จำนวนเงิน</th></tr></thead><tbody>${body}<tr class="total"><td class="l" colspan="6">รวมทั้งหมด</td><td>${money(total)}</td></tr></tbody></table>` : `<p class="note">ไม่มีรายการรับเงินที่บันทึกในช่วงวันที่นี้</p>`}
  <p class="note">นับตามวัน-เวลาที่บันทึกยอดในระบบ (เวลาประเทศไทย) รายการที่นำเข้าจากไฟล์ Excel จะมีวันที่เป็นวันที่นำเข้า</p>
  <div class="sign"><div><i></i>ผู้จัดทำ<br>วันที่ ${esc(formatThaiDate(meta.now))}</div><div><i></i>ผู้ตรวจสอบ</div><div><i></i>ผู้อนุมัติ</div></div>
  ${foot(meta, "หน้า 1")}</section>`;
  return shell(`รายงานรับเงิน ${formatIsoThai(r.from)} ถึง ${formatIsoThai(r.to)}`, pages);
}

function shell(title: string, body: string) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

export async function buildReport(db: Db, range: ReportRange, by: string, now = new Date()): Promise<string> {
  const c = bangkokClock(now);
  const meta: Meta = { now, by, refNo: `RPT-${c.year}${String(c.month).padStart(2, "0")}${String(c.day).padStart(2, "0")}-${String(c.hour).padStart(2, "0")}${String(c.minute).padStart(2, "0")}` };
  return range.mode === "months" ? monthsReport(db, range, meta) : daysReport(db, range, meta);
}

