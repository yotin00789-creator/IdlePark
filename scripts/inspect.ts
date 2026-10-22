import { parseWorkbook } from "../server/seed/parseWorkbook.js";
const wb = await parseWorkbook(process.argv[2]);
for (const y of wb.years) {
  console.log(y.year, "rows", y.rows.length, "overrides", y.overrides.map((o) => `${o.month}:${o.field}`).join(","), "errors", y.expected.formulaErrors.join(";"));
}
console.log(wb.warnings, wb.banks.length, wb.savings.map((s) => s.year));
