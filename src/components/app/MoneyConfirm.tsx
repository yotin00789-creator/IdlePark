import Button from "@/components/app/Button";
import Sheet from "@/components/app/Sheet";
import { answerConfirm, useConfirm } from "@/lib/confirm";

// Mounted once in the layout. Lists what is about to be saved and asks for a plain confirmation.
export default function MoneyConfirm() {
  const req = useConfirm();
  if (!req) return null;
  return (
    <Sheet
      open
      onClose={() => answerConfirm(false)}
      title="ยืนยันการทำรายการ"
      description={req.lines.length > 1 ? `บันทึกการเปลี่ยนแปลง ${req.lines.length} รายการ` : "บันทึกการเปลี่ยนแปลงนี้"}
      footer={
        <>
          <Button variant="outline" onClick={() => answerConfirm(false)}>ยกเลิก</Button>
          <Button onClick={() => answerConfirm(true)} autoFocus>ยืนยัน</Button>
        </>
      }
    >
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {req.lines.slice(0, 12).map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-3 text-theme-sm">
            <span className="min-w-0 text-gray-700 dark:text-gray-300">{l.label}</span>
            <span className="num shrink-0 text-gray-500 dark:text-gray-400">
              {l.before} <span aria-hidden>→</span> <span className="sr-only">เปลี่ยนเป็น</span>
              <b className="font-semibold text-gray-900 dark:text-white">{l.after}</b> บาท
            </span>
          </li>
        ))}
        {req.lines.length > 12 && <li className="px-3.5 py-2.5 text-theme-xs text-gray-500">และอีก {req.lines.length - 12} รายการ</li>}
      </ul>
    </Sheet>
  );
}
