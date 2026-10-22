import Baht from "@/components/app/Baht";
import Card from "@/components/app/Card";
import EditableCell from "@/components/app/EditableCell";
import PageHeader from "@/components/app/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import { calcSavings, calcSavingsTotal } from "../../../shared/calc";
import { confirmMoney } from "@/lib/confirm";
import { saveSavingsDays, saveSavingsItems, useCalc, type DayChange, type SavingsItemChange } from "@/lib/dataStore";
import { formatBaht, monthName, monthShort, parseBaht } from "@/lib/format";
import { canEdit, useAuth } from "@/lib/session";
import { cn } from "@/utils";
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router";
import type { SavingsData } from "../../../shared/types";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function Savings() {
  const model = useCalc();
  const { user } = useAuth();
  const { year: param } = useParams();
  const editable = canEdit(user);
  const years = useMemo(() => {
    if (!model) return [];
    const set = new Set(model.savings.map((s) => s.data.year));
    set.add(model.data.today.year);
    return [...set].sort((a, b) => a - b);
  }, [model]);
  if (!model) return null;
  const year = Number(param);
  if (!param) return <Navigate to={`/savings/${model.savings.at(-1)?.data.year ?? years.at(-1)}`} replace />;

  const data: SavingsData = model.savings.find((s) => s.data.year === year)?.data ?? {
    year,
    days: Array.from({ length: 12 }, () => Array(31).fill(null)),
    expense: Array(12).fill(null),
    card: Array(12).fill(null),
  };
  const c = calcSavings(data);
  const note = model.data.savingsNotes.find((n) => n.year === year);
  const th = "app-th sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-end dark:border-gray-800 dark:bg-gray-900";
  const cell = "border-b border-gray-100 p-0 dark:border-gray-800";

  const show = (v: number | null) => (v == null ? "ว่าง" : formatBaht(v));
  const askDays = (days: DayChange[]) =>
    confirmMoney(days.map((d) => ({ label: `เงินเก็บ · วันที่ ${d.day} ${monthName(d.month)} ${d.year}`, before: show(data.days[d.month - 1][d.day - 1]), after: show(d.amount) })));

  const paste = (r0: number, c0: number, matrix: string[][]) => {
    const days: DayChange[] = [];
    matrix.forEach((line, i) => line.forEach((txt, j) => {
      const day = r0 + i + 1;
      const month = c0 + j + 1;
      if (day > 31 || month > 12) return;
      const v = parseBaht(txt);
      if (v === "invalid") return;
      if (v !== data.days[month - 1][day - 1]) days.push({ year, month, day, amount: v });
    }));
    if (days.length) {
      void askDays(days).then((ok) => ok && saveSavingsDays(days));
    }
  };

  const itemRow = (kind: "expense" | "card", label: string, r: number) => (
    <tr>
      <td className={cn(cell, "sticky start-0 z-10 bg-white px-3 py-2 text-theme-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300")}>{label}</td>
      {MONTHS.map((m) => (
        <td key={m} className={cell}>
          <EditableCell grid="sv-items" r={r} c={m - 1} value={data[kind][m - 1]} editable={editable} label={`${label} ${monthShort(m)}`} onCommit={(v) => { const ch: SavingsItemChange[] = [{ year, month: m, kind, amount: v }]; void confirmMoney([{ label: `${label} · ${monthName(m)} ${year}`, before: show(data[kind][m - 1]), after: show(v) }]).then((ok) => ok && saveSavingsItems(ch)); }} />
        </td>
      ))}
    </tr>
  );

  return (
    <>
      <PageMeta title={`เงินเก็บพ่อ ปี ${year} | IdlePark`} description="บันทึกเงินเก็บรายวัน ค่าใช้จ่าย และค่าบัตร" />
      <PageHeader title="เงินเก็บพ่อ" description="รายวัน × เดือน · ยอดเหลือ = รวม − ค่าใช้จ่าย − ค่าบัตร" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="เลือกปี" className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/5">
          {years.map((y) => (
            <Link key={y} to={`/savings/${y}`} aria-current={y === year ? "page" : undefined} className={cn("num rounded-md px-3 py-1.5 text-theme-sm font-medium", y === year ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500")}>{y}</Link>
          ))}
          {editable && !years.includes(Math.max(...years) + 1) && <Link to={`/savings/${Math.max(...years) + 1}`} className="rounded-md px-3 py-1.5 text-theme-sm text-gray-500 hover:text-link-hover">+ ปี {Math.max(...years) + 1}</Link>}
        </nav>
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">ยอดเหลือปี {year}: <Baht value={c.yearRemain} signColor className="font-semibold" /> · รวมทุกปี: <Baht value={calcSavingsTotal(model.savings.map((s) => s.data))} signColor className="font-semibold" /> บาท</p>
      </div>
      {note && (
        <p className="mb-4 rounded-lg bg-warning-50 px-4 py-3 text-theme-sm text-warning-800 dark:bg-warning-500/10 dark:text-warning-400">
          ในไฟล์เดิมมีช่อง “{note.label}” <Baht value={note.amount} className="font-semibold" /> บาท เป็นตัวเลขเฉย ๆ ไม่มีสูตร ระบบเก็บไว้เป็นหมายเหตุและไม่นำไปคำนวณ — ถ้าต้องการให้หักจากยอดเหลือ แจ้งผู้พัฒนาได้
        </p>
      )}
      <Card bodyClassName="p-0">
        <div className="custom-scrollbar max-h-[calc(100dvh-16rem)] overflow-auto">
          <table className="w-max min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={cn(th, "sticky start-0 z-20 w-20 text-start")}>วันที่</th>
                {MONTHS.map((m) => <th key={m} className={cn(th, "w-22 min-w-22")}>{monthShort(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 31 }, (_, d) => (
                <tr key={d}>
                  <td className={cn(cell, "num sticky start-0 z-10 bg-white px-3 py-1.5 text-theme-xs text-gray-500 dark:bg-gray-900")}>{d + 1}</td>
                  {MONTHS.map((m) => (
                    <td key={m} className={cell}>
                      <EditableCell grid="sv-days" r={d} c={m - 1} value={data.days[m - 1][d]} editable={editable} label={`วันที่ ${d + 1} ${monthShort(m)}`} onPasteMatrix={paste} onCommit={(v) => void confirmMoney([{ label: `เงินเก็บ · วันที่ ${d + 1} ${monthName(m)} ${year}`, before: show(data.days[m - 1][d]), after: show(v) }]).then((ok) => ok && saveSavingsDays([{ year, month: m, day: d + 1, amount: v }]))} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold dark:bg-white/3">
                <td className={cn(cell, "sticky start-0 z-10 bg-gray-50 px-3 py-2.5 text-theme-sm dark:bg-gray-800")}>รวม</td>
                {MONTHS.map((m) => <td key={m} className={cn(cell, "px-3 py-2.5 text-end text-theme-sm")}><Baht value={c.monthTotal[m - 1]} dash={false} /></td>)}
              </tr>
              {itemRow("expense", "ค่าใช้จ่าย", 0)}
              {itemRow("card", "ค่าบัตร", 1)}
              <tr className="bg-gray-50 font-semibold dark:bg-white/3">
                <td className={cn(cell, "sticky start-0 z-10 bg-gray-50 px-3 py-2.5 text-theme-sm dark:bg-gray-800")}>ยอดเหลือ</td>
                {MONTHS.map((m) => <td key={m} className={cn(cell, "px-3 py-2.5 text-end text-theme-sm")}><Baht value={c.monthRemain[m - 1]} signColor dash={false} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
