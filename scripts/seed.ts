// npm run seed -- ./ที่จอดรถ.xlsx [--force]
// Safe to run again: it does nothing once data is loaded unless --force is given.
import { getDb } from "../server/db.js";
import { parseWorkbook } from "../server/seed/parseWorkbook.js";
import { seedFromWorkbook } from "../server/seed/seedDb.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
if (!file) {
  console.error("ใช้: npm run seed -- ./ไฟล์.xlsx [--force]");
  process.exit(1);
}

const wb = await parseWorkbook(file);
const db = await getDb();
const r = await seedFromWorkbook(db, wb, { force });

console.log(r.skipped ? "มีข้อมูลอยู่แล้ว ไม่ได้นำเข้าซ้ำ (ใช้ --force เพื่อล้างแล้วนำเข้าใหม่)" : "นำเข้าสำเร็จ");
console.log(`ปี: ${r.years} · แถวผู้เช่า: ${r.rows} · ช่องที่มีค่า: ${r.filledCells} · จุดสูตรไม่สม่ำเสมอ: ${r.overrides} · บัญชี: ${r.accounts} · เงินเก็บพ่อ: ${r.savingsYears} ปี`);
console.log(`แถวที่ต้องตรวจ (ไม่ระบุชื่อ): ${r.needsReview.length}`);
for (const n of r.needsReview) console.log(`  - ปี ${n.year} แถวที่ ${n.sourceRow} รวม ${n.amount / 100} บาท`);
console.log(`เทียบกับค่าที่ Excel คำนวณไว้: ตรวจ ${r.checked} ค่า ความต่าง ${r.diffs.length}`);
for (const d of r.diffs) console.log(`  ! ${d.where}: Excel ${d.expected} / ระบบ ${d.actual}`);
if (r.knownErrors.length) console.log(`เซลล์ที่เป็น error ในไฟล์เดิม (ระบบคำนวณให้ใหม่): ${r.knownErrors.join(", ")}`);
await db.close();
process.exit(r.diffs.length ? 2 : 0);
