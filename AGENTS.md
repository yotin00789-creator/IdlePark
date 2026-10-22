# AGENTS.md — สมุดบัญชีที่จอดรถ

> ระบบบัญชีที่จอดรถรายเดือนสำหรับครอบครัว · Vite + React 19 + Tailwind v4 (TailAdmin tokens) · Vercel Functions + PostgreSQL

อ่าน `PRODUCT.md` (ผู้ใช้/เป้าหมาย) และ `DESIGN.md` (ระบบดีไซน์) ก่อนแก้ UI และใช้ skill `impeccable` (ติดตั้งใน `.claude/skills/impeccable`) กับงานหน้าจอทุกครั้ง
ก่อนส่งงานหน้าจอให้รัน `.claude/skills/impeccable/scripts/impeccable detect --json <ไฟล์ที่แก้>`

## โครงสร้าง

```
shared/        calc.ts = สูตรทั้งหมด (ฟังก์ชันล้วน) · types.ts · thai.ts (วันที่ พ.ศ., จัดรูปแบบเงิน) · lot.ts (ช่องจอด 26 ช่อง + คลัง K01, ประเภทรถ, ช่องจอดมอเตอร์ไซค์)
server/        API ไม่พึ่งเฟรมเวิร์ก (Web Request/Response): http.ts (router, session, CSRF), routes/*, db.ts, migrations.ts,
               crypto.ts (scrypt, AES-GCM, TOTP), mail.ts, emailTemplates.ts, reminders.ts, export.ts, seed/* (อ่าน .xlsx)
api/index.ts   จุดเข้า Vercel (ใช้ server-dist/handler.mjs ที่ `npm run build` บันเดิลไว้)
src/           หน้าเว็บ: pages/app/* (หน้าหลัก), pages/AuthPages/*, components/app/* (UI พื้นฐานของระบบนี้),
               components/ledger|dashboard|header, lib/ (api, dataStore, session, toast, format, formulas), layout/, icons/ui-*.svg
public/3d/     โมเดลที่จอดรถ (lot.glb, cars/*.glb, slots.json) จาก 3d-model/ · โค้ดฉาก three.js อยู่ src/components/lot3d/LotScene.ts
tests/         vitest: calc เทียบ Excel · API · reminders · export · ช่องจอด 3 มิติ
scripts/       seed.ts, reset-demo.ts, build-api.mjs
```

## กฎสำคัญ

- **ตัวเลขทุกตัวมาจาก `shared/calc.ts` เท่านั้น** ห้ามคำนวณซ้ำใน component/route เงินเก็บเป็นจำนวนเต็ม **สตางค์** (null = ว่าง, 0 = จ่าย 0) ห้ามใช้ float
- **ห้ามแก้สูตรเดิมโดยไม่แจ้ง** ความต่างของสูตรเก็บเป็นข้อมูลใน `calc_overrides` (โหมด legacy/standard) เปลี่ยนที่หน้า "ตรวจสอบสูตร"
- ทุกการแก้ข้อมูลใน API ต้องเรียก `audit(c, {...})` (ใคร ทำอะไร ค่าก่อน/หลัง) ใน transaction เดียวกับการแก้
- import ใน `server/` และ `shared/` ต้องลงท้าย `.js` (ให้ bundle/Node resolve ได้)
- ข้อความ UI เป็น **ภาษาไทยอย่างเดียว** เขียนตรงใน component (ไม่ใช้ react-i18next ในหน้าใหม่ — ระบบนี้ใช้ในครอบครัว) คำที่ใช้คงที่: “บันทึก”, “ยังไม่ครบ”, “รวม(หักแล้ว)”
- ไอคอน: ใช้จาก `@/icons` (`*Glyph`) ขนาด 16–18px **ไม่มีกรอบ/พื้นหลังล้อมรอบ** ห้าม inline SVG ใน component
- Tailwind v4 ผ่าน `src/index.css` เท่านั้น ใช้ token (ไม่ hardcode สี) ใช้ logical properties (`ms-*`, `ps-*`, `start-*`, `text-start`) และใส่ `dark:` ทุกจุด
- หน้า `/lot` (ผังที่จอด 3 มิติ): รถหนึ่งคันคือหนึ่งแถวในสมุดรายรับ (`slot_id`, `vehicle_type`, `car_color`, `plate_province`) ช่องหนึ่งมีรถ active ได้คันเดียวในช่วงเดือนที่ซ้อนกัน (API ตอบ 409) ฉากสว่างคงที่ ไม่ผูกกับเวลาจริง กดรถแล้วกล้องไปด้านท้าย/หน้าที่ไม่ติดกำแพงเสมอ
- ชื่อและคำอธิบายหน้าแสดงที่แถบบน (`PageHeader` ส่งค่าผ่าน `lib/pageTitle.ts`) ไม่มีช่องค้นหาในแถบบน
- แบรนด์ **IdlePark** (ดำ+ทอง): ใช้ token `brand` (ink), `gold`, `link`, `on-brand` ห้ามใส่สี hex ใน component; ข้อความบนพื้นปุ่ม brand ใช้ `text-on-brand` ลิงก์ใช้ `text-link`
- วันที่/เวลาแสดงด้วย `formatThaiDate`/`formatThaiDateTime` (shared/thai.ts) เท่านั้น: “วันที่ 1 มกราคม 2569 เวลา 14.00 น.” เวลาไทยทั้งระบบ (ห้ามใช้ `toLocale*`/`<input type=date>`; ใช้ `ThaiDateField`/`TimeField`)
- การวางรถ/มอเตอร์ไซค์ต้องผ่าน `server/placement.ts` (โซนปิด/Private, โซนมอเตอร์ไซค์ + ช่องจอดในโซน, ช่องซ้ำ) และวันนัดชำระรายคันอยู่ที่ `ledger_rows.due_day`
- ลบแถว/โซน/ลูกค้า: ต้องเก็บสำเนาเต็มใน `audit_log.before.snapshot` เพื่อกู้คืนได้ที่หน้าประวัติการใช้งาน (`POST /api/audit/:id/restore`) · เลือกช่องที่อยู่โซนอื่นในหน้าโซน = ย้ายช่องมาโซนนี้ · ประวัติผู้เช่าของช่องคำนวณจากสมุดรายรับทุกปี (`src/lib/slotHistory.ts`)
- ช่องจอดทุกช่องเป็น “ที่จอดรถ” หรือ “คลังเก็บของ” ได้: คลัง = ช่องที่อยู่ในโซนชนิด `storage` (K01 ในโมเดลบ้านเป็นคลังเสมอ) ใช้ `isStorageSlot()` / `getStorageSlots()` จาก `shared/lot.ts` เท่านั้น (ห้ามเทียบกับ "K01" ตรง ๆ) · ตั้งชนิดช่องผ่าน `PUT /api/slots/:id/kind` หรือชนิดโซนในหน้าโซน · 3 มิติวางสำเนาโมเดลคลัง (`LOT_Shed`) ที่ช่องนั้น · คลังเช่าได้ผู้เช่าเดียว ไม่มีรถ จ่ายรายปี
- โซน Private และลูกค้าเจ้าของ = ไม่คิดค่าเช่า ไม่รับชำระ ไม่นับยอด (ใช้ `ledger_rows.is_owner` เดียวกัน) · ย้ายแถวที่มียอดชำระแล้วเข้าโซน Private ไม่ได้ (409)
- สมุดรายรับ: ติ๊ก “ไม่รวมในบัญชี” = `kind = 'excluded'` (ยังกรอกยอดเก็บเงินได้ แต่ไม่นับยอด ไม่แจ้งค้าง) · ปุ่มลบในหน้า 3 มิติคือ “เอาออกจากผัง” (`POST /api/ledger/rows/:id/unplace`) ไม่ลบแถว
- ตัวเลขเงินที่ผู้ใช้ตัดสินใจเอง (ให้พ่อ ฯลฯ) ต้องไม่มี warning ถามยืนยันอย่างเดียวผ่าน `confirmMoney`
- ห้ามติดตั้งแพ็กเกจใหม่โดยไม่ถามผู้ใช้ · ห้ามใส่ข้อมูลจริง (ชื่อ เลขบัญชี) ในโค้ด/รีโป · ห้ามโหลดฟอนต์/สคริปต์จาก CDN
- แก้ API/สูตรแล้วต้องรัน `npm test` (ต้องผ่านทั้งหมด) และ `npm run typecheck && npm run lint`

## คำสั่ง

`npm run dev` · `npm run seed -- ./ไฟล์.xlsx [--force]` · `npm test` · `npm run build` (บันเดิล API + build เว็บ) · `npx tsx scripts/reset-demo.ts ./ไฟล์.xlsx` (ล้างฐานข้อมูลในเครื่อง)
