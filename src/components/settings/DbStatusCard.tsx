import Badge from "@/components/ui/badge/Badge";
import Card from "@/components/app/Card";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useEffect, useState } from "react";

interface Info {
  kind: "postgres" | "pglite" | "memory";
  durable: boolean;
  location: string;
  note: string;
  counts: Record<string, number>;
  lastWriteAt: string | null;
  migrations: number;
}
const LABEL: Record<string, string> = {
  users: "ผู้ใช้", customers: "ลูกค้า", zones: "โซน", ledger_rows: "แถวสมุดรายรับ (รถ/ผู้เช่า)", payments: "ยอดชำระรายเดือน", year_items: "ให้พ่อ/จ่ายป้า/ค่าใช้จ่าย",
  savings_days: "เงินเก็บพ่อรายวัน", bank_accounts: "บัญชีรับเงิน", audit_log: "ประวัติการใช้งาน", notifications: "การแจ้งเตือน", backup_log: "ประวัติสำรองข้อมูล",
};

// Proof that everything is kept in the database: where it is stored and how many records each page's data has.
export default function DbStatusCard() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => void api.get<Info>("/system/db").then(setInfo).catch(() => {}), 0);
    return () => window.clearTimeout(t);
  }, []);
  if (!info) return null;
  return (
    <Card title="ฐานข้อมูล" description="ทุกหน้าอ่านและเขียนข้อมูลชุดเดียวกันนี้" actions={<Badge size="sm" color={info.durable ? "success" : "error"}>{info.durable ? "เก็บถาวร" : "ไม่ถาวร"}</Badge>}>
      <dl className="space-y-1 text-theme-sm">
        <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">ที่เก็บ</dt><dd className="min-w-0 truncate text-end text-gray-800 dark:text-white/90">{info.location}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">ชนิด</dt><dd className="text-end text-gray-800 dark:text-white/90">{info.note}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">บันทึกล่าสุด</dt><dd className="text-end text-gray-800 dark:text-white/90">{info.lastWriteAt ? formatDateTime(info.lastWriteAt) : "—"}</dd></div>
      </dl>
      {!info.durable && <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-theme-xs text-error-700 dark:bg-error-500/10 dark:text-error-400">โหมดนี้ข้อมูลจะหายเมื่อปิดโปรแกรม ตั้งค่า DATABASE_URL เพื่อเก็บถาวร</p>}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-theme-xs dark:border-gray-800">
        {Object.entries(info.counts).map(([k, n]) => (
          <li key={k} className="flex justify-between gap-2"><span className="truncate text-gray-500 dark:text-gray-400">{LABEL[k] ?? k}</span><span className="num font-medium text-gray-800 dark:text-white/90">{n.toLocaleString("en-US")}</span></li>
        ))}
      </ul>
    </Card>
  );
}
