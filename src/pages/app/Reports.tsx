import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import { SelectField } from "@/components/app/Field";
import PageHeader from "@/components/app/PageHeader";
import ThaiDateField from "@/components/app/ThaiDateField";
import PageMeta from "@/components/common/PageMeta";
import { DownloadGlyph } from "@/icons";
import { useData } from "@/lib/dataStore";
import { bangkokClock, formatIsoThai, THAI_MONTHS } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { useRef, useState } from "react";

type Mode = "months" | "days";
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function Reports() {
  const now = bangkokClock();
  const { data } = useData();
  const years = data?.years.map((y) => y.year) ?? [];
  const [mode, setMode] = useState<Mode>("months");
  const [fromM, setFromM] = useState(1);
  const [fromY, setFromY] = useState(now.year);
  const [toM, setToM] = useState(now.month);
  const [toY, setToY] = useState(now.year);
  const [fromD, setFromD] = useState(iso(now.year - 543, now.month, 1));
  const [toD, setToD] = useState(iso(now.year - 543, now.month, now.day));
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  const yearOptions = years.length ? years : [now.year];
  const preset = (kind: "month" | "3m" | "year" | "lastyear") => {
    setMode("months");
    if (kind === "month") { setFromM(now.month); setFromY(now.year); setToM(now.month); setToY(now.year); }
    if (kind === "3m") { const s = now.month - 2; setFromM(s > 0 ? s : s + 12); setFromY(s > 0 ? now.year : now.year - 1); setToM(now.month); setToY(now.year); }
    if (kind === "year") { setFromM(1); setFromY(now.year); setToM(12); setToY(now.year); }
    if (kind === "lastyear") { setFromM(1); setFromY(now.year - 1); setToM(12); setToY(now.year - 1); }
  };
  const dayPreset = (kind: "today" | "7d" | "month") => {
    setMode("days");
    const g = now.year - 543;
    const today = new Date(Date.UTC(g, now.month - 1, now.day));
    const back = (n: number) => { const t = new Date(today.valueOf() - n * 86_400_000); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
    if (kind === "today") { setFromD(back(0)); setToD(back(0)); }
    if (kind === "7d") { setFromD(back(6)); setToD(back(0)); }
    if (kind === "month") { setFromD(iso(g, now.month, 1)); setToD(back(0)); }
  };

  const query = () => {
    if (mode === "months") {
      if (fromY * 12 + fromM > toY * 12 + toM) throw new Error("เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด");
      return `mode=months&from=${fromY}-${fromM}&to=${toY}-${toM}`;
    }
    if (!fromD || !toD) throw new Error("กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบ");
    if (fromD > toD) throw new Error("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
    return `mode=days&from=${fromD}&to=${toD}`;
  };

  const generate = async () => {
    setError(null);
    let q: string;
    try { q = query(); } catch (e) { setError((e as Error).message); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/report?${q}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "สร้างรายงานไม่สำเร็จ");
      const text = await res.text();
      setHtml(text);
      setTitle(mode === "months" ? `รายงานรายรับ ${THAI_MONTHS[fromM - 1]} ${fromY} ถึง ${THAI_MONTHS[toM - 1]} ${toY}` : `รายงานรับเงิน ${formatIsoThai(fromD)} ถึง ${formatIsoThai(toD)}`);
      toast.success("สร้างรายงานแล้ว", "ตรวจดูด้านล่าง แล้วกด “บันทึกเป็น PDF”");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const printPdf = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    const old = document.title;
    document.title = title; // the browser proposes this as the PDF file name
    w.document.title = title;
    w.focus();
    w.print();
    window.setTimeout(() => { document.title = old; }, 1500);
  };

  const monthSel = (value: number, set: (n: number) => void, label: string) => (
    <SelectField label={label} value={value} onChange={(e) => set(Number(e.target.value))}>
      {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
    </SelectField>
  );
  const yearSel = (value: number, set: (n: number) => void, label: string) => (
    <SelectField label={label} value={value} onChange={(e) => set(Number(e.target.value))}>
      {[...new Set([...yearOptions, value])].sort().map((y) => <option key={y} value={y}>{y}</option>)}
    </SelectField>
  );
  const chip = "h-8 rounded-full border border-gray-200 px-3 text-theme-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5";

  return (
    <>
      <PageMeta title="รายงาน PDF | IdlePark" description="สร้างรายงานสรุปเป็นแบบฟอร์ม พิมพ์หรือบันทึกเป็น PDF" />
      <PageHeader title="รายงาน PDF" description="เลือกช่วงเวลา สร้างรายงานแบบฟอร์มธุรกิจ แล้วบันทึกเป็น PDF" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card title="เลือกช่วงเวลา">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/5" role="tablist" aria-label="รูปแบบช่วงเวลา">
              {([["months", "ตามเดือน"], ["days", "ตามวันที่"]] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={cn("h-9 rounded-md text-theme-sm font-medium", mode === id ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-600 dark:text-gray-400")}>{label}</button>
              ))}
            </div>

            {mode === "months" ? (
              <>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">{monthSel(fromM, setFromM, "ตั้งแต่เดือน")}{yearSel(fromY, setFromY, "ปี พ.ศ.")}</div>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">{monthSel(toM, setToM, "ถึงเดือน")}{yearSel(toY, setToY, "ปี พ.ศ.")}</div>
                <div className="flex flex-wrap gap-1.5"><button className={chip} onClick={() => preset("month")}>เดือนนี้</button><button className={chip} onClick={() => preset("3m")}>3 เดือนล่าสุด</button><button className={chip} onClick={() => preset("year")}>ทั้งปีนี้</button><button className={chip} onClick={() => preset("lastyear")}>ทั้งปีที่แล้ว</button></div>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">ได้สรุปรายรับ-รายจ่ายรายเดือน ยอดสะสม รายการค้างชำระ และตารางการชำระรายคัน</p>
              </>
            ) : (
              <>
                <ThaiDateField label="ตั้งแต่วันที่" value={fromD} onChange={setFromD} />
                <ThaiDateField label="ถึงวันที่" value={toD} onChange={setToD} />
                <div className="flex flex-wrap gap-1.5"><button className={chip} onClick={() => dayPreset("today")}>วันนี้</button><button className={chip} onClick={() => dayPreset("7d")}>7 วันล่าสุด</button><button className={chip} onClick={() => dayPreset("month")}>ตั้งแต่ต้นเดือน</button></div>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">ได้รายการรับเงินที่บันทึกในช่วงวันนั้น แยกรายวัน พร้อมผู้บันทึกและยอดรวม</p>
              </>
            )}

            {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={generate}>สร้างรายงาน</Button>
              <Button variant="outline" icon={<DownloadGlyph />} disabled={!html} onClick={printPdf}>บันทึกเป็น PDF</Button>
            </div>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">กด “บันทึกเป็น PDF” แล้วเลือกปลายทาง “บันทึกเป็น PDF” (Save as PDF) ในหน้าต่างพิมพ์ ปิดตัวเลือก “ส่วนหัวและส่วนท้าย” เพื่อให้หน้าสะอาด</p>
          </div>
        </Card>

        <Card bodyClassName="p-0" className="min-h-96">
          {html ? (
            <iframe ref={frame} title={title} srcDoc={html} className="h-[78vh] w-full bg-gray-200 dark:bg-gray-800" />
          ) : (
            <div className="grid h-96 place-items-center px-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">เลือกช่วงเวลาแล้วกด “สร้างรายงาน” ตัวอย่างจะแสดงที่นี่</div>
          )}
        </Card>
      </div>
    </>
  );
}
