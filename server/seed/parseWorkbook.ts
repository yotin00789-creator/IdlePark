// Reads the original Excel workbook (including hidden sheets and formulas) into
// plain data. It never writes to the workbook and never changes a formula.
import ExcelJS from "exceljs";
import type { ItemKind, Money, Months } from "../../shared/types.js";

export interface ParsedRow {
  year: number;
  sortOrder: number;
  ownerName: string;
  plate: string;
  kind: "normal" | "excluded";
  sourceRow: number;
  note: string;
  needsReview: boolean;
  paidThroughYear: number | null;
  paidThroughMonth: number | null;
  payments: Months<Money>;
}

export interface ParsedOverride {
  month: number;
  field: "income_rows" | "skip_collect";
  value: { from?: number; to?: number };
  note: string;
}

export interface ParsedYear {
  year: number;
  rows: ParsedRow[];
  items: Record<ItemKind, Months<Money>>;
  overrides: ParsedOverride[];
  // What Excel had cached, so the new calc engine can be compared against it.
  expected: {
    income: Money[];
    incomeTotal: Money;
    net: Money[];
    netTotal: Money;
    itemTotals: Record<ItemKind, Money>;
    cumulative: Money;
    formulaErrors: string[];
  };
}

export interface ParsedSavings {
  year: number;
  days: (number | null)[][]; // [month][day-1]
  expense: Months<Money>;
  card: Months<Money>;
  note: { label: string; amount: number } | null;
  expected: { monthRemain: Money[]; yearRemain: Money; formulaErrors: string[] };
}

export interface ParsedBank {
  bank: string;
  number: string;
  holder: string;
  label: string;
}

export interface ParsedWorkbook {
  years: ParsedYear[];
  savings: ParsedSavings[];
  banks: ParsedBank[];
  bankFigures: { year: number; first: Money; second: Money }[];
  warnings: string[];
}

const toSatang = (v: number) => Math.round(v * 100);
const MONTH_ALIASES: Record<string, number> = {
  มค: 1, กพ: 2, มีค: 3, เมย: 4, พค: 5, มิย: 6, กค: 7, สค: 8, กย: 9, ตค: 10, พย: 11, ธค: 12,
};
const EMPTY_NAMES = new Set(["", "null", "n/a", "ว่าง"]);
const UNKNOWN_NAME = "ไม่ระบุชื่อ";

type Cell = ExcelJS.Cell;

function isSlave(cell: Cell) {
  return cell.isMerged && cell.master.address !== cell.address;
}

function raw(cell: Cell): unknown {
  if (isSlave(cell)) return undefined;
  const v = cell.value as any;
  if (v && typeof v === "object") {
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    if ("formula" in v || "sharedFormula" in v) return v.result;
    if ("result" in v) return v.result;
  }
  return v;
}

const text = (cell: Cell) => {
  const v = raw(cell);
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "object") return "";
  return String(v).trim();
};

const num = (cell: Cell): number | null => {
  const v = raw(cell);
  return typeof v === "number" ? v : null;
};

// ExcelJS translates shared formulas (D32 -> "(D27-D28-D29-D30)") through cell.formula.
const formulaOf = (cell: Cell): string | null => {
  const f = (cell as any).formula as string | undefined;
  return f ? String(f) : null;
};

const cachedMoney = (cell: Cell, errors: string[]): Money => {
  const v = cell.value as any;
  const res = v && typeof v === "object" && "result" in v ? v.result : v;
  const err =
    res && typeof res === "object" && "error" in res
      ? String(res.error)
      : typeof res === "string" && /^#[A-Z/0-9?!]+$/.test(res)
        ? res
        : null;
  if (err) {
    errors.push(`${cell.worksheet.name}!${cell.address} ${err}`);
    return null;
  }
  return typeof res === "number" ? toSatang(res) : null;
};

export function parsePrepaid(note: string): { year: number; month: number } | null {
  const m = /จ่ายถึง\s*([ก-๙.]+?)\s*ปี\s*(\d{2,4})/.exec(note.replace(/\s+/g, " "));
  if (!m) return null;
  const month = MONTH_ALIASES[m[1].replace(/\./g, "")];
  if (!month) return null;
  const y = Number(m[2]);
  return { year: y < 100 ? 2500 + y : y, month };
}

const col = (n: number) => String.fromCharCode(64 + n); // 1 -> A (enough for A..Z)

export async function parseWorkbook(source: string | Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  if (typeof source === "string") await wb.xlsx.readFile(source);
  else await wb.xlsx.load(source as any);

  const years: ParsedYear[] = [];
  const savings: ParsedSavings[] = [];
  const banks = new Map<string, ParsedBank>();
  const bankFigures: ParsedWorkbook["bankFigures"] = [];
  const warnings: string[] = [];

  for (const ws of wb.worksheets) {
    if (/^25\d\d$/.test(ws.name)) {
      const y = parseYearSheet(ws, banks, bankFigures, warnings);
      if (y) years.push(y);
    } else if (/^เงินเก็บพ่อ\d\d$/.test(ws.name)) {
      savings.push(parseSavingsSheet(ws));
    }
  }
  years.sort((a, b) => a.year - b.year);
  savings.sort((a, b) => a.year - b.year);
  return { years, savings, banks: [...banks.values()], bankFigures, warnings };
}

function parseYearSheet(
  ws: ExcelJS.Worksheet,
  banks: Map<string, ParsedBank>,
  bankFigures: ParsedWorkbook["bankFigures"],
  warnings: string[],
): ParsedYear | null {
  const year = Number(ws.name);
  // Locate the summary rows by their label in column A.
  const labelRow: Record<string, number> = {};
  for (let r = 3; r <= 60; r++) {
    const t = text(ws.getCell(r, 1));
    if (["รวม", "ให้พ่อ", "จ่ายป้า", "ค่าใช้จ่ายรวม", "เก็บเงิน", "รวม(หักแล้ว)"].includes(t) && !(t in labelRow)) {
      labelRow[t] = r;
    }
  }
  const incomeRow = labelRow["รวม"];
  const netRow = labelRow["รวม(หักแล้ว)"];
  if (!incomeRow || !netRow) {
    warnings.push(`${ws.name}: summary rows not found`);
    return null;
  }

  // Text that spans a merged block (e.g. "จ่ายถึง กพ ปี 66") belongs to every row of the block.
  const blockNotes = new Map<number, string>();
  for (const range of Object.values((ws as any)._merges ?? {}) as any[]) {
    const { top, left, bottom, right } = range.model ?? range;
    if (left >= 3 && right <= 14 && top >= 3 && top < incomeRow) {
      const t = text(ws.getCell(top, left));
      if (t && !/^\d/.test(t)) {
        for (let r = top; r <= bottom; r++) blockNotes.set(r, t);
      }
    }
  }

  const rows: ParsedRow[] = [];
  for (let r = 3; r < incomeRow; r++) {
    const rawName = text(ws.getCell(r, 1));
    const plate = text(ws.getCell(r, 2));
    const payments: Months<Money> = Array.from({ length: 12 }, () => null);
    let hasData = false;
    const notes: string[] = [];
    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, 3 + m);
      const v = num(cell);
      if (v != null) {
        payments[m] = toSatang(v);
        hasData = true;
      } else {
        const t = text(cell);
        if (t && t.toLowerCase() !== "null") notes.push(t.replace(/\s+/g, " "));
      }
    }
    const blockNote = blockNotes.get(r);
    if (blockNote) notes.push(blockNote.replace(/\s+/g, " "));
    const excluded = text(ws.getCell(r, 15)) === "ไม่รวม";

    const nameIsEmpty = EMPTY_NAMES.has(rawName.toLowerCase());
    if (nameIsEmpty && !hasData && !plate && !notes.length) continue; // blank slot
    const note = [...new Set(notes)].join(" · ");
    const paid = parsePrepaid(note);
    rows.push({
      year,
      sortOrder: rows.length,
      ownerName: nameIsEmpty ? UNKNOWN_NAME : rawName,
      plate,
      kind: excluded ? "excluded" : "normal",
      sourceRow: r,
      note,
      needsReview: nameIsEmpty && hasData,
      paidThroughYear: paid?.year ?? null,
      paidThroughMonth: paid?.month ?? null,
      payments,
    });
  }

  const readItem = (label: string): Months<Money> =>
    Array.from({ length: 12 }, (_, m) => {
      const r = labelRow[label];
      if (!r) return null;
      const v = num(ws.getCell(r, 3 + m));
      return v == null ? null : toSatang(v);
    });
  const items = {
    to_father: readItem("ให้พ่อ"),
    pay_aunt: readItem("จ่ายป้า"),
    total_expense: readItem("ค่าใช้จ่ายรวม"),
    collect: readItem("เก็บเงิน"),
  } satisfies Record<ItemKind, Months<Money>>;

  // Derive where the original formulas differ from the standard rule, straight from the formula text.
  const overrides: ParsedOverride[] = [];
  const errors: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const f = formulaOf(ws.getCell(incomeRow, 2 + m));
    const rng = f ? /SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/i.exec(f) : null;
    if (rng) {
      const from = Number(rng[1]);
      const to = Number(rng[2]);
      const included = rows.filter((r) => r.sourceRow >= from && r.sourceRow <= to);
      const includedIds = new Set(included.map((r) => r.sourceRow));
      // Rows whose treatment differs from the standard rule (count everything except "ไม่รวม").
      const extra = included.filter((r) => r.kind === "excluded");
      const missing = rows.filter((r) => r.kind !== "excluded" && !includedIds.has(r.sourceRow));
      // Only a difference when one of those rows actually holds a figure in this month.
      const touches = [...extra, ...missing].some((r) => r.payments[m - 1] != null);
      if (touches) {
        const bits = [`Excel ใช้ ${f}`];
        if (extra.length) bits.push(`นับแถว “ไม่รวม” (${[...new Set(extra.map((r) => r.ownerName))].join(", ")})`);
        if (missing.length) bits.push(`ไม่นับแถวที่ ${missing.map((r) => r.sourceRow).join(", ")} ของชีต`);
        overrides.push({ month: m, field: "income_rows", value: { from, to }, note: bits.join(" · ") });
      }
    } else if (f) {
      warnings.push(`${ws.name}!${col(2 + m)}${incomeRow}: unexpected income formula ${f}`);
    }
    const nf = formulaOf(ws.getCell(netRow, 2 + m));
    if (nf) {
      const terms = nf.replace(/[()=\s]/g, "").split("-").length;
      if (terms === 4) {
        overrides.push({
          month: m,
          field: "skip_collect",
          value: {},
          note: `Excel ใช้ ${nf} (ไม่หัก “เก็บเงิน”)`,
        });
      }
    }
  }

  // Cached results for later comparison.
  const income = Array.from({ length: 12 }, (_, i) => cachedMoney(ws.getCell(incomeRow, 3 + i), errors));
  const net = Array.from({ length: 12 }, (_, i) => cachedMoney(ws.getCell(netRow, 3 + i), errors));
  const itemTotals = {
    to_father: cachedMoney(ws.getCell(labelRow["ให้พ่อ"], 15), errors),
    pay_aunt: cachedMoney(ws.getCell(labelRow["จ่ายป้า"], 15), errors),
    total_expense: cachedMoney(ws.getCell(labelRow["ค่าใช้จ่ายรวม"], 15), errors),
    collect: cachedMoney(ws.getCell(labelRow["เก็บเงิน"], 15), errors),
  };

  // Running balance cell ("ยอดคงเหลือทั้งหมด"): a SUM formula in column P.
  let cumulative: Money = null;
  for (let r = 1; r <= 60; r++) {
    const c = ws.getCell(r, 16);
    const f = formulaOf(c);
    if (f && /SUM\(/i.test(f)) {
      cumulative = cachedMoney(c, errors);
      break;
    }
  }

  // Bank account boxes + the figures printed next to them (column S).
  const figures: Money[] = [];
  for (let r = 1; r <= 20; r++) {
    const t = text(ws.getCell(r, 16));
    const m = /เลขที่บัญชี\s*(\S+)\s*\n?\s*([\d-]+)\s*\n?\s*(.*)/.exec(
      String(ws.getCell(r, 16).value ?? ""),
    );
    if (t && m) {
      const key = m[2];
      if (!banks.has(key)) {
        banks.set(key, { bank: m[1], number: key, holder: m[3].trim(), label: "" });
      }
      figures.push(cachedMoney(ws.getCell(r, 19), errors));
    }
  }
  bankFigures.push({ year, first: figures[0] ?? null, second: figures[1] ?? null });

  return {
    year,
    rows,
    items,
    overrides,
    expected: {
      income,
      incomeTotal: cachedMoney(ws.getCell(incomeRow, 15), errors),
      net,
      netTotal: cachedMoney(ws.getCell(netRow, 15), errors),
      itemTotals,
      cumulative,
      formulaErrors: errors,
    },
  };
}

function parseSavingsSheet(ws: ExcelJS.Worksheet): ParsedSavings {
  const year = 2500 + Number(/(\d\d)$/.exec(ws.name)![1]);
  const days: (number | null)[][] = Array.from({ length: 12 }, () => Array(31).fill(null));
  const expense: Months<Money> = Array(12).fill(null);
  const card: Months<Money> = Array(12).fill(null);
  const errors: string[] = [];
  for (let m = 0; m < 12; m++) {
    for (let d = 0; d < 31; d++) {
      const v = num(ws.getCell(2 + d, 2 + m));
      days[m][d] = v == null ? null : toSatang(v);
    }
    const e = num(ws.getCell(34, 2 + m));
    const c = num(ws.getCell(35, 2 + m));
    expense[m] = e == null ? null : toSatang(e);
    card[m] = c == null ? null : toSatang(c);
  }
  cachedMoney(ws.getCell(36, 15), errors); // O36: cross-sheet total that is broken in the file
  const noteLabel = text(ws.getCell(33, 16));
  const noteAmount = num(ws.getCell(34, 16));
  return {
    year,
    days,
    expense,
    card,
    note: noteLabel && noteAmount != null ? { label: noteLabel, amount: toSatang(noteAmount) } : null,
    expected: {
      monthRemain: Array.from({ length: 12 }, (_, m) => cachedMoney(ws.getCell(36, 2 + m), errors)),
      yearRemain: cachedMoney(ws.getCell(36, 14), errors),
      formulaErrors: errors,
    },
  };
}
