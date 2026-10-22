// Puts the local database back to "real data only": what the Excel file holds, nothing a test added.
//   npx tsx scripts/reset-real.ts "./ที่จอดรถ (1).xlsx"        (stop `npm run dev` first)
// Kept: users (and their MFA), the reminder / fee settings, and the ordinary zones with their names.
// Removed: rows and edits made while trying things out, 3D slot / vehicle details, private / closed /
// motorcycle test zones, the audit history of those tests. The old folder is copied to .data/backup-* first.
import { cpSync, existsSync } from "node:fs";
import { getDb } from "../server/db.js";
import { parseWorkbook } from "../server/seed/parseWorkbook.js";
import { seedFromWorkbook } from "../server/seed/seedDb.js";
import { setSetting } from "../server/settings.js";

const file = process.argv[2];
if (!file) throw new Error('ใช้: npx tsx scripts/reset-real.ts "./ไฟล์.xlsx"');
if (process.env.DATABASE_URL) throw new Error("สคริปต์นี้ใช้กับฐานข้อมูลในเครื่อง (.data) เท่านั้น ไม่รันกับ DATABASE_URL");
const dir = process.env.PGLITE_DIR ?? ".data/pglite";
if (existsSync(dir)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  cpSync(dir, `.data/backup-${stamp}`, { recursive: true });
  console.log(`สำรองไว้ที่ .data/backup-${stamp}`);
}

const db = await getDb();
const keepSettings = await db.query("select key, value from settings where key in ('reminders','monthlyFeeDefault','backup')");
const keepZones = await db.query("select name, description, default_fee, sort_order from zones where access = 'public' and is_active and moto_capacity = 0 order by sort_order, id");

const report = await seedFromWorkbook(db, await parseWorkbook(file), { force: true });
await db.tx(async (q) => {
  for (const s of keepSettings) await setSetting(q, s.key, s.value);
  // the zones you named (ของป้า, ของพ่อ …) come back without any 3D slots; every renter sits in the first one, as at import
  const [seeded] = await q.query("select id from zones order by id limit 1");
  for (let i = 0; i < keepZones.length; i++) {
    const z = keepZones[i];
    if (i === 0) await q.query("update zones set name=$2, description=$3, default_fee=$4, sort_order=$5 where id=$1", [seeded.id, z.name, z.description, z.default_fee, z.sort_order]);
    else await q.query("insert into zones (name, description, default_fee, sort_order) values ($1,$2,$3,$4)", [z.name, z.description, z.default_fee, z.sort_order]);
  }
  for (const t of ["audit_log", "login_attempts", "notifications", "reminder_log", "backup_log"]) await q.query(`delete from ${t}`);
});
const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from ledger_rows");
const [{ p }] = await db.query<{ p: number }>("select count(*)::int as p from payments");
console.log(`เรียบร้อย: แถวรายรับ ${n} แถว · ช่องชำระ ${p} · ตรวจเทียบ Excel ${report.checked} จุด ต่างกัน ${report.diffs.length} จุด`);
await db.close();
