// Wipes the local .data database back to "just imported from Excel": no users, no audit history.
// Use after trying things out locally:  npx tsx scripts/reset-demo.ts "./ที่จอดรถ (1).xlsx"
import { getDb } from "../server/db.js";
import { parseWorkbook } from "../server/seed/parseWorkbook.js";
import { seedFromWorkbook } from "../server/seed/seedDb.js";

const file = process.argv[2];
if (!file) throw new Error("ใช้: npx tsx scripts/reset-demo.ts ./ไฟล์.xlsx");
if (process.env.DATABASE_URL) throw new Error("สคริปต์นี้ใช้กับฐานข้อมูลในเครื่อง (.data) เท่านั้น ไม่รันกับ DATABASE_URL");
const db = await getDb();
await seedFromWorkbook(db, await parseWorkbook(file), { force: true });
for (const t of ["audit_log", "notifications", "reminder_log", "login_attempts", "sessions", "auth_tokens", "recovery_codes", "users"]) {
  await db.query(`delete from ${t}`);
}
console.log("รีเซ็ตเรียบร้อย: ข้อมูลจาก Excel + ไม่มีผู้ใช้ (เปิดเว็บแล้วสร้างผู้ดูแลที่หน้า /setup)");
await db.close();
