// Sends mail through SMTP (Gmail). Without SMTP credentials it writes the HTML
// to .data/outbox so emails can be previewed locally. It never throws.
import { mkdir, writeFile } from "node:fs/promises";
import type { Email } from "./emailTemplates.js";

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailResult {
  ok: boolean;
  mode: "smtp" | "outbox" | "none";
  error?: string;
  file?: string;
}

export const sent: { to: string; subject: string; html: string; at: Date; attachments?: Attachment[] }[] = []; // for tests

export const smtpConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendMail(to: string | string[], email: Email, attachments: Attachment[] = []): Promise<MailResult> {
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) return { ok: false, mode: "none", error: "ไม่มีผู้รับ" };

  if (smtpConfigured()) {
    try {
      const nodemailer = await import("nodemailer");
      const user = process.env.SMTP_USER!;
      const transport = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: (process.env.SMTP_SECURE ?? "true") !== "false",
        auth: { user, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM || `"${process.env.APP_NAME || "IdlePark"}" <${user}>`,
        to: recipients.join(", "),
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments,
      });
      return { ok: true, mode: "smtp" };
    } catch (e) {
      return { ok: false, mode: "smtp", error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return { ok: false, mode: "none", error: "ยังไม่ได้ตั้งค่า SMTP_USER / SMTP_PASS" };
  }
  for (const r of recipients) sent.push({ to: r, subject: email.subject, html: email.html, at: new Date(), attachments });
  if (process.env.NODE_ENV === "test") return { ok: true, mode: "outbox" };
  try {
    await mkdir(".data/outbox", { recursive: true });
    const file = `.data/outbox/${Date.now()}-${recipients[0].replace(/[^a-z0-9@.]/gi, "_")}.html`;
    await writeFile(file, email.html);
    for (const a of attachments) await writeFile(file.replace(/\.html$/, `-${a.filename.replace(/[^\w.\u0E00-\u0E7F-]/g, "_")}`), a.content);
    return { ok: true, mode: "outbox", file };
  } catch (e) {
    return { ok: false, mode: "outbox", error: e instanceof Error ? e.message : String(e) };
  }
}
