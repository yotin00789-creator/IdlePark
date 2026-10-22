import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import CountUp from "@/components/app/CountUp";
import EmptyState from "@/components/app/EmptyState";
import GreetingBanner from "@/components/dashboard/GreetingBanner";
import PageHeader from "@/components/app/PageHeader";
import PlateChip from "@/components/app/PlateChip";
import PageMeta from "@/components/common/PageMeta";
import PayDialog from "@/components/dashboard/PayDialog";
import { useCalc } from "@/lib/dataStore";
import { formatBaht, monthName } from "@/lib/format";
import { canEdit, useAuth } from "@/lib/session";
import { cn } from "@/utils";
import { useReady } from "@/lib/useReady";
import { settleBaht } from "@/lib/motion";
import { Suspense, lazy, useMemo, useState } from "react";
const money = (final: number) => settleBaht(final, (v) => formatBaht(Math.round(v)));
const delay = (n: number) => ({ ["--d" as string]: `${n}ms` });
import { Link } from "react-router";
import { calcSavings, feeFor, findUnpaid, isPrepaid, type Unpaid } from "../../../shared/calc";
import PageLoading from "@/components/app/Skeleton";

const MonthlyChart = lazy(() => import("@/components/dashboard/MonthlyChart"));
const PayDonut = lazy(() => import("@/components/dashboard/PayDonut"));

export default function Dashboard() {
  const model = useCalc();
  const { user } = useAuth();
  const [year, setYear] = useState<number | null>(null);
  const [pay, setPay] = useState<Unpaid | null>(null);
  const editable = canEdit(user);
  const ready = useReady(); // bars start empty and grow to their share once the page is on screen

  const view = useMemo(() => {
    if (!model) return null;
    const today = model.data.today;
    const y = year ?? today.year;
    const calc = model.byYear.get(y);
    const yd = model.yearData.get(y);
    if (!calc || !yd) return null;
    const prev = model.byYear.get(y - 1);
    const upTo = y < today.year ? 12 : y === today.year ? today.month : 0;
    const prevSame = prev ? prev.months.slice(0, upTo).reduce((n, m) => n + m.income, 0) : null;
    const thisSame = calc.months.slice(0, upTo).reduce((n, m) => n + m.income, 0);
    const lookback = model.data.settings.reminders.lookbackMonths;
    const unpaid = y === today.year ? findUnpaid(yd.rows, y, today.month, lookback).sort((a, b) => a.month - b.month || a.row.ownerName.localeCompare(b.row.ownerName, "th")) : [];
    const thisMonthUnpaid = unpaid.filter((u) => u.month === today.month);

    // how this month is going: expected rent vs money in
    const m = y === today.year ? today.month : 12;
    const eligible = yd.rows.filter((r) => r.isActive && r.kind !== "excluded" && feeFor(r, m) > 0 && m >= r.startMonth && (r.endMonth == null || m <= r.endMonth) && !isPrepaid(r, y, m));
    const expected = eligible.reduce((n, r) => n + feeFor(r, m), 0);
    const collected = eligible.reduce((n, r) => n + Math.min(r.payments[m - 1] ?? 0, feeFor(r, m)), 0);
    const paidFull = eligible.filter((r) => (r.payments[m - 1] ?? 0) >= feeFor(r, m)).length;
    const partial = eligible.filter((r) => (r.payments[m - 1] ?? 0) > 0 && (r.payments[m - 1] ?? 0) < feeFor(r, m)).length;
    return { today, y, calc, yd, prev, upTo, prevSame, thisSame, unpaid, thisMonthUnpaid, m, expected, collected, paidFull, partial, eligible: eligible.length };
  }, [model, year]);

  if (!model || !view) return null;
  const { today, y, calc, yd, prev, prevSame, thisSame, unpaid, thisMonthUnpaid, m, expected, collected, paidFull, partial, eligible } = view;
  const years = model.data.years.map((x) => x.year);
  const yoy = prevSame && prevSame > 0 ? Math.round(((thisSame - prevSame) / prevSame) * 100) : null;
  const unpaidTotal = thisMonthUnpaid.reduce((n, u) => n + u.due, 0);
  const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
  const savingsTotal = model.savingsTotal;
  const latestSavings = model.savings.at(-1);
  const outgoing = [
    { label: "ให้พ่อ", v: calc.totals.toFather },
    { label: "จ่ายป้า", v: calc.totals.payAunt },
    { label: "ค่าใช้จ่ายรวม", v: calc.totals.totalExpense },
    { label: "เก็บเงิน", v: calc.totals.collect },
  ];
  const outMax = Math.max(1, ...outgoing.map((o) => o.v));
  // how the year's income splits: kept (net) and what went out, as shares of income
  const income = Math.max(1, calc.totals.income);
  const parts = [
    { label: "รวม(หักแล้ว)", v: Math.max(0, calc.totals.net), cls: "bg-gold-400" },
    { label: "ให้พ่อ", v: calc.totals.toFather, cls: "bg-gray-900 dark:bg-white" },
    { label: "จ่ายป้า", v: calc.totals.payAunt, cls: "bg-gray-500" },
    { label: "ค่าใช้จ่าย/เก็บเงิน", v: calc.totals.totalExpense + calc.totals.collect, cls: "bg-success-500" },
  ];
  const mixTotal = Math.max(1, parts.reduce((n, x) => n + x.v, 0), income);
  const mix = parts.map((x) => ({ ...x, pct: (x.v / mixTotal) * 100 }));
  const runningBy = calc.months.reduce<number[]>((acc, mm) => [...acc, (acc.at(-1) ?? calc.cumulativeStart) + mm.net], []);

  return (
    <>
      <PageMeta title="แดชบอร์ด | IdlePark" description="สรุปตัวเงินรายรับ รายจ่าย และยอดคงเหลือ" />
      <PageHeader title="แดชบอร์ด" description={`สรุปตัวเงินปี ${y} · ข้อมูล ณ วันที่ ${today.day} ${monthName(today.month)} ${today.year}`} />

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <GreetingBanner
          years={years}
          year={y}
          onYear={setYear}
          showUnpaid={y === today.year}
          unpaidCount={thisMonthUnpaid.length}
          unpaidTotal={unpaidTotal}
          monthLabel={monthName(today.month)}
        />

        <Card title="ภาพรวมตัวเงิน" description={`ปี ${y}`} className="rise" style={delay(80)}>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">ยอดคงเหลือทั้งหมด (สะสม)</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-title-sm font-semibold text-gray-900 dark:text-white">
            <Baht animate value={calc.cumulative} signColor />
            <span className="text-theme-sm font-normal text-gray-500 dark:text-gray-400">บาท</span>
            {yoy != null && <span className={cn("rounded-full px-2 py-0.5 text-theme-xs font-medium", yoy >= 0 ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-500")}>{yoy >= 0 ? "+" : "−"}<CountUp value={Math.abs(yoy)} format={(v) => `${Math.round(v)}%`} /></span>}
          </p>
          <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">สิ้นปีก่อน <Baht animate value={calc.cumulativeStart} /> · ปีนี้ <Baht animate value={calc.totals.net} signColor sign /></p>

          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10" role="img" aria-label="สัดส่วนรายรับที่ใช้ไปกับรายจ่ายแต่ละประเภทและที่เหลือ">
            {mix.map((x, i) => <span key={x.label} className={cn(x.cls, "transition-[width] duration-1000 ease-out")} style={{ width: ready ? `${x.pct}%` : "0%", transitionDelay: `${300 + i * 120}ms` }} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-theme-xs">
            {mix.map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-400"><span className={cn("size-2 shrink-0 rounded-full", x.cls)} />{x.label}</span>
                <Baht animate value={x.v} dash={false} className="font-medium text-gray-800 dark:text-white/90" />
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div><dt className="text-theme-xs text-gray-500 dark:text-gray-400">รายรับปี {y}</dt><dd className="num text-base font-semibold text-gray-900 dark:text-white"><Baht animate value={calc.totals.income} /></dd></div>
            <div><dt className="text-theme-xs text-gray-500 dark:text-gray-400">รวม(หักแล้ว)</dt><dd className="text-base font-semibold text-gray-900 dark:text-white"><Baht animate value={calc.totals.net} signColor /></dd></div>
          </dl>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="รายรับเทียบรายจ่ายรายเดือน" description={`ปี ${y} · เส้นคือรวม(หักแล้ว)`} className="rise" style={delay(160)}>
          <Suspense fallback={<PageLoading />}><MonthlyChart calc={calc} upTo={view.upTo || 12} /></Suspense>
        </Card>
        <Card className="rise" style={delay(240)} title={`สถานะการชำระเดือน${monthName(m)}`} description={y === today.year ? <>เก็บได้ <CountUp value={collected} format={money(collected)} /> จาก <CountUp value={expected} format={money(expected)} /> บาท (<CountUp value={rate} format={(v) => `${Math.round(v)}%`} />)</> : `ปี ${y} เดือนธันวาคม`}>
          <Suspense fallback={<PageLoading />}><PayDonut full={paidFull} partial={partial} none={eligible - paidFull - partial} /></Suspense>
          <ul className="mt-2 space-y-2.5 text-theme-sm">
            {[["ชำระครบ", paidFull, "bg-success-500"], ["ชำระบางส่วน", partial, "bg-gold-400"], ["ยังไม่ชำระ", eligible - paidFull - partial, "bg-error-500"]].map(([label, n, cls]) => (
              <li key={label as string} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300"><span className={cn("h-4 w-1 rounded-full", cls as string)} />{label}</span>
                <span className="num font-semibold text-gray-900 dark:text-white"><CountUp value={n as number} /> คัน</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          className="rise"
          style={delay(320)}
          title={y === today.year ? "ยังไม่ได้เก็บ" : "ยังไม่ได้เก็บ (เฉพาะปีปัจจุบัน)"}
          description={y === today.year ? `เดือน${monthName(today.month)}${model.data.settings.reminders.lookbackMonths ? ` และย้อนหลัง ${model.data.settings.reminders.lookbackMonths} เดือน` : ""}` : undefined}
          bodyClassName="p-0"
          actions={<Link to={`/ledger/${today.year}`} className="text-theme-sm font-medium text-link hover:text-link-hover">เปิดสมุดรายรับ</Link>}
        >
          {unpaid.length === 0 ? (
            <EmptyState title={y === today.year ? "ไม่มีผู้ค้างชำระ" : "เลือกปีปัจจุบันเพื่อดูรายการค้าง"} body={y === today.year ? "ทุกคันจ่ายครบสำหรับเดือนที่ตรวจแล้ว" : undefined} />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {unpaid.map((u) => (
                <li key={`${u.row.id}-${u.month}`} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{u.row.ownerName}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-theme-xs text-gray-500"><PlateChip plate={u.row.plate} /> {monthName(u.month)}{u.paid > 0 && ` · จ่ายแล้ว ${formatBaht(u.paid)}`}</p>
                  </div>
                  <Baht animate value={u.due} className="font-semibold text-error-600" />
                  {editable && <Button size="sm" variant="outline" onClick={() => setPay(u)}>บันทึกว่าชำระแล้ว</Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rise" style={delay(400)} title="รายจ่ายปีนี้แยกประเภท" description={<>รวม <CountUp value={outgoing.reduce((n, o) => n + o.v, 0)} format={money(outgoing.reduce((n, o) => n + o.v, 0))} /> บาท</>}>
          <ul className="space-y-3.5">
            {outgoing.map((o, i) => (
              <li key={o.label}>
                <div className="flex justify-between text-theme-sm"><span className="text-gray-600 dark:text-gray-400">{o.label}</span><Baht animate value={o.v} className="font-medium text-gray-800 dark:text-white/90" /></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-white/10"><div className="h-1.5 rounded-full bg-brand-400 transition-[width] duration-1000 ease-out" style={{ width: ready ? `${(o.v / outMax) * 100}%` : "0%", transitionDelay: `${300 + i * 120}ms` }} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-gray-100 pt-4 text-theme-sm dark:border-gray-800">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">เงินเก็บพ่อ คงเหลือรวม</span><Link to="/savings" className="num font-medium text-link"><CountUp value={savingsTotal} format={money(savingsTotal)} /></Link></div>
            {latestSavings && <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">ล่าสุดปี {latestSavings.data.year}: <CountUp value={calcSavings(latestSavings.data).yearRemain} format={money(calcSavings(latestSavings.data).yearRemain)} /></p>}
          </div>
        </Card>
      </div>

      <Card className="rise" style={delay(480)} title={`สรุปตัวเงินรายเดือน ปี ${y}`} description="ตัวเลขทุกช่องคำนวณจากสมุดรายรับด้วยสูตรเดิมของ Excel" bodyClassName="p-0">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-176 text-end">
            <thead>
              <tr className="border-y border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3">
                <th className="app-th text-start">เดือน</th><th className="app-th text-end">รายรับ</th><th className="app-th text-end">ให้พ่อ</th><th className="app-th text-end">จ่ายป้า</th><th className="app-th text-end">ค่าใช้จ่าย</th><th className="app-th text-end">เก็บเงิน</th><th className="app-th text-end">รวม(หักแล้ว)</th><th className="app-th text-end">ยอดสะสม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {calc.months.map((mm, i) => {
                const future = y === today.year && i + 1 > today.month;
                return (
                  <tr key={i} className={cn(future && "text-gray-500 dark:text-gray-400", y === today.year && i + 1 === today.month && "bg-brand-25 dark:bg-brand-500/5")}>
                    <td className="app-td text-start">{monthName(i + 1)}{mm.legacyIncome || mm.legacyNoCollect ? <span className="ms-2 text-[10px] text-warning-600">สูตรเดิม</span> : null}</td>
                    <td className="app-td"><Baht animate value={mm.income} dash={false} /></td>
                    <td className="app-td"><Baht animate value={mm.toFather} dash={false} /></td>
                    <td className="app-td"><Baht animate value={mm.payAunt} dash={false} /></td>
                    <td className="app-td"><Baht animate value={mm.totalExpense} dash={false} /></td>
                    <td className="app-td"><Baht animate value={mm.collect} dash={false} /></td>
                    <td className="app-td"><Baht animate value={mm.net} signColor dash={false} /></td>
                    <td className="app-td"><Baht animate value={runningBy[i]} signColor dash={false} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900 dark:border-gray-700 dark:bg-white/3 dark:text-white">
                <td className="app-td text-start">รวมทั้งปี</td>
                <td className="app-td"><Baht animate value={calc.totals.income} dash={false} /></td>
                <td className="app-td"><Baht animate value={calc.totals.toFather} dash={false} /></td>
                <td className="app-td"><Baht animate value={calc.totals.payAunt} dash={false} /></td>
                <td className="app-td"><Baht animate value={calc.totals.totalExpense} dash={false} /></td>
                <td className="app-td"><Baht animate value={calc.totals.collect} dash={false} /></td>
                <td className="app-td"><Baht animate value={calc.totals.net} signColor dash={false} /></td>
                <td className="app-td"><Baht animate value={calc.cumulative} signColor dash={false} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      {prev && <p className="mt-3 text-theme-xs text-gray-500 dark:text-gray-400">ยอดสะสมสิ้นปี {prev.year}: {formatBaht(prev.cumulative)} บาท · จำนวนผู้เช่าที่นับในปีนี้ {yd.rows.filter((r) => r.kind !== "excluded").length} แถว</p>}

      <PayDialog target={pay ? { row: pay.row, month: pay.month, paid: pay.paid } : null} onClose={() => setPay(null)} />
    </>
  );
}
