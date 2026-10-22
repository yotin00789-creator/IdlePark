// HTML emails in a minimal TailAdmin style on IdlePark colours: warm paper canvas, white card, ink + gold.
// Tables + inline CSS only, so Gmail / Outlook / Apple Mail render the same.
import { THAI_MONTHS, formatBaht, formatThaiDateTime } from "../shared/thai.js";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const C = {
  canvas: "#F4F2EE",
  card: "#FFFFFF",
  border: "#E4E7EC",
  line: "#F2F4F7",
  ink: "#101828",
  body: "#475467",
  muted: "#98A2B3",
  brand: "#111314",
  gold: "#F2C200",
  warn: "#F79009",
  warnBg: "#FFFAEB",
  err: "#F04438",
};
const FONT = "'IBM Plex Sans Thai','Noto Sans Thai','Sukhumvit Set',Tahoma,Arial,sans-serif";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const appName = () => process.env.APP_NAME || "IdlePark";
export const appUrl = () => (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

interface LayoutInput {
  preheader: string;
  heading: string;
  intro?: string;
  body?: string; // trusted HTML built by this file
  button?: { label: string; href: string };
  note?: string;
}

function layout(i: LayoutInput) {
  const button = i.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr><td style="background:${C.brand};border-radius:8px">
         <a href="${esc(i.button.href)}" style="display:inline-block;padding:12px 20px;font:600 14px ${FONT};color:${C.gold};text-decoration:none">${esc(i.button.label)}</a>
       </td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(i.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(i.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 4px 16px;font:600 15px ${FONT};color:${C.ink}">
      <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:7px;background:${C.brand};color:${C.gold};font:800 15px ${FONT};vertical-align:middle">P</span>
      <span style="vertical-align:middle;margin-left:8px;letter-spacing:.14em;font-weight:700">${esc(appName()).toUpperCase()}</span>
      <div style="margin:8px 0 0;height:3px;width:100%;background:repeating-linear-gradient(90deg,${C.gold} 0 9px,transparent 9px 14px)"></div>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:32px">
      <h1 style="margin:0 0 12px;font:600 20px/1.35 ${FONT};color:${C.ink}">${esc(i.heading)}</h1>
      ${i.intro ? `<p style="margin:0 0 4px;font:400 14px/1.7 ${FONT};color:${C.body}">${i.intro}</p>` : ""}
      ${i.body ?? ""}
      ${button}
      ${i.note ? `<p style="margin:20px 0 0;font:400 12px/1.7 ${FONT};color:${C.muted}">${i.note}</p>` : ""}
    </td></tr>
    <tr><td style="padding:16px 4px 0;font:400 12px/1.7 ${FONT};color:${C.muted}">
      อีเมลนี้ส่งอัตโนมัติจาก ${esc(appName())} สำหรับใช้ภายในครอบครัว · ${esc(appUrl().replace(/^https?:\/\//, ""))}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const detailRows = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border:1px solid ${C.line};border-radius:10px">
    ${rows
      .map(
        ([k, v], idx) => `<tr>
      <td style="padding:10px 14px;font:400 13px ${FONT};color:${C.muted};${idx ? `border-top:1px solid ${C.line};` : ""}width:38%">${esc(k)}</td>
      <td style="padding:10px 14px;font:500 13px ${FONT};color:${C.ink};${idx ? `border-top:1px solid ${C.line};` : ""}">${esc(v)}</td></tr>`,
      )
      .join("")}
  </table>`;

export const ROLE_LABEL = { admin: "ผู้ดูแล", editor: "ผู้แก้ไข", viewer: "ดูอย่างเดียว" } as const;

export function inviteEmail(p: { name: string; email: string; role: keyof typeof ROLE_LABEL; inviter: string; tempPassword: string; loginUrl: string; hours: number }): Email {
  const subject = `${p.inviter} เชิญคุณเข้าใช้ ${appName()}`;
  const code = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0"><tr><td align="center" style="background:${C.warnBg};border:1px dashed ${C.gold};border-radius:12px;padding:16px">
      <div style="font:400 12px ${FONT};color:${C.muted};letter-spacing:.04em">รหัสผ่านชั่วคราว</div>
      <div style="margin-top:6px;font:700 26px ${"'SFMono-Regular',Menlo,Consolas,monospace"};letter-spacing:.14em;color:${C.ink}">${esc(p.tempPassword)}</div>
    </td></tr></table>`;
  const html = layout({
    preheader: `รหัสผ่านชั่วคราวสำหรับเข้าใช้งานครั้งแรก (ใช้ได้ ${p.hours} ชั่วโมง)`,
    heading: "คุณได้รับเชิญเข้าใช้งานระบบ",
    intro: `${esc(p.inviter)} เพิ่มคุณเป็นผู้ใช้ของ ${esc(appName())} เปิดหน้าเข้าสู่ระบบ กรอกอีเมลกับรหัสผ่านชั่วคราวด้านล่าง แล้วระบบจะให้คุณตั้งรหัสผ่านใหม่ของตัวเอง`,
    body: code + detailRows([
      ["ชื่อ", p.name || "-"],
      ["อีเมลเข้าสู่ระบบ", p.email],
      ["สิทธิ์", ROLE_LABEL[p.role]],
      ["รหัสชั่วคราวใช้ได้", `ภายใน ${p.hours} ชั่วโมง`],
    ]),
    button: { label: "เปิดหน้าเข้าสู่ระบบ", href: p.loginUrl },
    note: `รหัสนี้ใช้ได้เพื่อเข้าสู่ระบบครั้งแรกเท่านั้น หลังตั้งรหัสผ่านใหม่แล้วรหัสนี้จะใช้ไม่ได้อีก อย่าส่งต่อให้ผู้อื่น<br>ถ้าคุณไม่ได้คาดว่าจะได้รับอีเมลนี้ ไม่ต้องทำอะไร รหัสจะหมดอายุเอง`,
  });
  return { subject, html, text: `${p.inviter} เชิญคุณเข้าใช้ ${appName()}\nเข้าสู่ระบบที่: ${p.loginUrl}\nอีเมล: ${p.email}\nรหัสผ่านชั่วคราว: ${p.tempPassword}\n(ใช้ได้ ${p.hours} ชั่วโมง ระบบจะให้ตั้งรหัสผ่านใหม่หลังเข้าสู่ระบบครั้งแรก)` };
}

export function resetEmail(p: { name: string; link: string; minutes: number }): Email {
  const html = layout({
    preheader: "ลิงก์ตั้งรหัสผ่านใหม่",
    heading: "ตั้งรหัสผ่านใหม่",
    intro: `สวัสดี ${esc(p.name || "")} มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ ${p.minutes} นาที และใช้ได้ครั้งเดียว`,
    button: { label: "ตั้งรหัสผ่านใหม่", href: p.link },
    note: `ถ้าคุณไม่ได้ขอ ให้เพิกเฉยอีเมลนี้ รหัสผ่านเดิมยังใช้ได้ตามปกติ<br><span style="word-break:break-all;color:${C.body}">${esc(p.link)}</span>`,
  });
  return { subject: `ตั้งรหัสผ่านใหม่ — ${appName()}`, html, text: `ตั้งรหัสผ่านใหม่: ${p.link} (ใช้ได้ ${p.minutes} นาที)` };
}

export interface OverdueItem {
  owner: string;
  plate: string;
  year: number;
  month: number;
  paid: number; // satang
  due: number; // satang
  dueDate?: string; // "5 ตุลาคม 2569"
}

export function overdueEmail(p: {
  round: number;
  items: OverdueItem[];
  intervalDays: number;
  maxRounds: number;
  link: string;
  asOf: string;
}): Email {
  const total = p.items.reduce((s, i) => s + i.due, 0);
  const people = new Set(p.items.map((i) => `${i.owner}|${i.plate}`)).size;
  const rows = p.items
    .map(
      (i, idx) => `<tr>
      <td style="padding:10px 12px;${idx ? `border-top:1px solid ${C.line};` : ""}font:500 13px ${FONT};color:${C.ink}">${esc(i.owner)}<br><span style="font-weight:400;color:${C.muted}">${esc(i.plate || "—")}</span></td>
      <td style="padding:10px 12px;${idx ? `border-top:1px solid ${C.line};` : ""}font:400 13px ${FONT};color:${C.body};white-space:nowrap">${THAI_MONTHS[i.month - 1]} ${i.year}${i.dueDate ? `<br><span style="color:${C.muted}">นัดชำระ ${esc(i.dueDate)}</span>` : ""}</td>
      <td align="right" style="padding:10px 12px;${idx ? `border-top:1px solid ${C.line};` : ""}font:600 13px ${FONT};color:${C.err};white-space:nowrap">${formatBaht(i.due)}${i.paid > 0 ? `<br><span style="font-weight:400;color:${C.muted}">จ่ายแล้ว ${formatBaht(i.paid)}</span>` : ""}</td></tr>`,
    )
    .join("");
  const repeat = p.maxRounds > 0 ? `แจ้งสูงสุด ${p.maxRounds} ครั้ง` : "แจ้งต่อเนื่อง";
  const html = layout({
    preheader: `ค้างชำระ ${people} คัน รวม ${formatBaht(total)} บาท`,
    heading: `ยังไม่ได้รับเงิน ${people} คัน รวม ${formatBaht(total)} บาท`,
    intro: `พ้นกำหนดชำระค่าที่จอดรถแล้ว (ข้อมูล ณ ${esc(p.asOf)}) · แจ้งครั้งที่ ${p.round}`,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border:1px solid ${C.line};border-radius:10px">
        <tr style="background:${C.canvas}">
          <th align="left" style="padding:9px 12px;font:500 12px ${FONT};color:${C.muted}">ผู้เช่า / ทะเบียน</th>
          <th align="left" style="padding:9px 12px;font:500 12px ${FONT};color:${C.muted}">เดือน</th>
          <th align="right" style="padding:9px 12px;font:500 12px ${FONT};color:${C.muted}">ค้าง (บาท)</th></tr>
        ${rows}
        <tr><td colspan="2" style="padding:12px;border-top:1px solid ${C.border};font:600 13px ${FONT};color:${C.ink}">รวมทั้งหมด</td>
            <td align="right" style="padding:12px;border-top:1px solid ${C.border};font:700 14px ${FONT};color:${C.ink}">${formatBaht(total)}</td></tr>
      </table>
      <p style="margin:16px 0 0;padding:10px 14px;background:${C.warnBg};border-radius:8px;font:400 12px/1.7 ${FONT};color:#B54708">
        ระบบจะแจ้งซ้ำทุก ${p.intervalDays} วัน (${repeat}) จนกว่าจะบันทึกการชำระเงินในสมุดรายรับ</p>`,
    button: { label: "เปิดสมุดรายรับเพื่อบันทึกการชำระ", href: p.link },
  });
  const text = [
    `ยังไม่ได้รับเงิน ${people} คัน รวม ${formatBaht(total)} บาท (แจ้งครั้งที่ ${p.round})`,
    ...p.items.map((i) => `- ${i.owner} ${i.plate} ${THAI_MONTHS[i.month - 1]} ${i.year}: ค้าง ${formatBaht(i.due)}`),
    `เปิดระบบ: ${p.link}`,
  ].join("\n");
  return { subject: `[แจ้งเตือน] ค้างชำระ ${people} คัน รวม ${formatBaht(total)} บาท`, html, text };
}

export function testEmail(p: { to: string; by: string }): Email {
  const html = layout({
    preheader: "ทดสอบการส่งอีเมลผ่าน SMTP",
    heading: "ส่งอีเมลทดสอบสำเร็จ",
    intro: "ถ้าคุณเห็นอีเมลนี้ แปลว่าการตั้งค่า SMTP (Gmail) ใช้งานได้ ระบบจะใช้ช่องทางนี้ส่งคำเชิญผู้ใช้และการแจ้งเตือนค้างชำระ",
    body: detailRows([
      ["ส่งถึง", p.to],
      ["สั่งโดย", p.by],
      ["ส่งเมื่อ", formatThaiDateTime(new Date())],
    ]),
  });
  return { subject: `ทดสอบอีเมล — ${appName()}`, html, text: "ส่งอีเมลทดสอบสำเร็จ" };
}

export function backupEmail(p: { when: string; sizeKb: number; years: number[]; customers: number; vehicles: number; by: string; filename: string }): Email {
  const html = layout({
    preheader: "ไฟล์สำรองข้อมูล Excel แนบมากับอีเมลนี้",
    heading: "สำรองข้อมูลสมุดบัญชีที่จอดรถ",
    intro: "แนบไฟล์ Excel ที่มีข้อมูลทุกปี ลูกค้า รถ และโซน ณ เวลาที่สำรอง เก็บไว้ในที่ปลอดภัย เพราะมีข้อมูลส่วนตัวของผู้เช่า",
    body: detailRows([
      ["สำรองเมื่อ", p.when],
      ["สั่งโดย", p.by],
      ["ปีที่รวมอยู่", p.years.join(", ") || "—"],
      ["ลูกค้า / รถ", `${p.customers} ราย / ${p.vehicles} คัน`],
      ["ไฟล์แนบ", `${p.filename} (${p.sizeKb.toLocaleString("en-US")} KB)`],
    ]),
    note: "ไฟล์นี้ไม่มีเลขบัญชีธนาคารเต็ม รหัสผ่าน หรือรหัส MFA",
  });
  return { subject: `สำรองข้อมูล ${appName()} — ${p.when}`, html, text: `สำรองข้อมูลสมุดบัญชีที่จอดรถ ${p.when} แนบไฟล์ ${p.filename}` };
}
