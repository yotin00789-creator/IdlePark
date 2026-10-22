import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import ConfirmDialog from "@/components/app/ConfirmDialog";
import PageHeader from "@/components/app/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useCalc } from "@/lib/dataStore";
import { monthName } from "@/lib/format";
import { isAdmin, useAuth } from "@/lib/session";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { useEffect, useMemo, useState } from "react";
import { calcAll, calcSavingsTotal, calcYear } from "../../../shared/calc";
import type { CalcOverride, YearData } from "../../../shared/types";

interface Reference {
  years: { year: number; income: number | null; net: number | null; cumulative: number | null }[];
  savings: { year: number; yearRemain: number | null }[];
  errors: string[];
}

const withMode = (y: YearData, pick: (o: CalcOverride) => "legacy" | "standard"): YearData => ({ ...y, overrides: y.overrides.map((o) => ({ ...o, mode: pick(o) })) });

export default function FormulaAudit() {
  const model = useCalc();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [ref, setRef] = useState<Reference | null>(null);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [confirmAll, setConfirmAll] = useState<"standard" | "legacy" | null>(null);

  useEffect(() => {
    api.get<{ reference: Reference | null }>("/reference").then((r) => setRef(r.reference)).catch(() => {});
  }, []);

  const analysis = useMemo(() => {
    if (!model) return null;
    const years = model.data.years;
    const asFile = calcAll(years.map((y) => withMode(y, () => "legacy")));
    const standard = calcAll(years.map((y) => withMode(y, () => "standard")));
    const current = model.calc;
    const items = years.flatMap((y) =>
      y.overrides.map((o) => {
        const base = calcYear(withMode(y, () => "standard")).months[o.month - 1].net;
        const only = calcYear(withMode(y, (x) => (x.id === o.id ? "legacy" : "standard"))).months[o.month - 1].net;
        return { o, effect: only - base };
      }),
    );
    return { asFile, standard, current, items };
  }, [model]);

  if (!model || !analysis) return null;
  const { asFile, standard, items } = analysis;
  const endFile = asFile.at(-1)?.cumulative ?? 0;
  const endStd = standard.at(-1)?.cumulative ?? 0;
  const diffs = items.filter((i) => i.effect !== 0);
  const zero = items.filter((i) => i.effect === 0);
  const standardCount = items.filter((i) => i.o.mode === "standard").length;

  const setMode = async (ids: number[] | null, mode: "legacy" | "standard") => {
    setBusy(ids?.[0] ?? "all");
    try {
      await api.post("/overrides/mode", { ids, mode });
      await dataStore.load(true);
      toast.success(mode === "standard" ? "เปลี่ยนเป็นสูตรมาตรฐานแล้ว" : "กลับเป็นสูตรตามไฟล์เดิมแล้ว");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirmAll(null);
    }
  };

  const row = ({ o, effect }: (typeof items)[number]) => (
    <li key={o.id} className="flex items-start gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{monthName(o.month)} {o.year} · {o.field === "income_rows" ? "ช่วงที่รวมยอดต่างจากมาตรฐาน" : "ไม่หักช่อง “เก็บเงิน”"}</p>
        <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{o.note}</p>
      </div>
      <div className="w-24 shrink-0 text-end">
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">ผลต่อยอด</p>
        <p className="text-theme-sm font-semibold">{effect === 0 ? <span className="text-gray-500 dark:text-gray-400">ไม่มีผล</span> : <Baht value={effect} sign signColor />}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          role="switch"
          aria-checked={o.mode === "standard"}
          aria-label={`${monthName(o.month)} ${o.year}: ใช้สูตรมาตรฐาน`}
          disabled={!admin || busy !== null}
          onClick={() => setMode([o.id], o.mode === "standard" ? "legacy" : "standard")}
          className={cn("relative h-6 w-10 rounded-full transition-colors disabled:opacity-60", o.mode === "standard" ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-all", o.mode === "standard" ? "inset-s-[1.125rem]" : "inset-s-0.5")} />
        </button>
        <span className="text-[11px] text-gray-500">{o.mode === "standard" ? "มาตรฐาน" : "ตามไฟล์เดิม"}</span>
      </div>
    </li>
  );

  return (
    <>
      <PageMeta title="ตรวจสอบสูตร | IdlePark" description="จุดที่สูตรใน Excel ไม่สม่ำเสมอ และผลต่อยอด" />
      <PageHeader
        title="ตรวจสอบสูตร"
        description="ระบบคงสูตรตามไฟล์ Excel เดิมเป็นค่าเริ่มต้น จุดที่สูตรไม่สม่ำเสมอ สลับเป็นสูตรมาตรฐานได้ทีละจุด"
        actions={admin && (standardCount < items.length ? <Button variant="outline" onClick={() => setConfirmAll("standard")}>ใช้มาตรฐานทั้งหมด</Button> : null)}
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="app-card px-5 py-4"><p className="text-theme-xs text-gray-500">ยอดสะสมล่าสุด ตามไฟล์เดิม</p><p className="mt-1 text-lg font-semibold"><Baht value={endFile} dash={false} /></p></div>
        <div className="app-card px-5 py-4"><p className="text-theme-xs text-gray-500">ยอดสะสมล่าสุด สูตรมาตรฐาน</p><p className="mt-1 text-lg font-semibold"><Baht value={endStd} dash={false} /></p></div>
        <div className="app-card px-5 py-4"><p className="text-theme-xs text-gray-500">ผลต่างจากความไม่สม่ำเสมอ</p><p className="mt-1 text-lg font-semibold"><Baht value={endFile - endStd} sign signColor dash={false} /></p></div>
      </div>

      <Card className="mb-4" title="จุดที่สูตรต่างจากมาตรฐาน" description={`${diffs.length} จุดที่มีผลต่อยอด · ${zero.length} จุดที่ยังไม่มีผล (ค่าเป็น 0 หรือว่าง)`} bodyClassName="p-0">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">{diffs.map(row)}</ul>
        {zero.length > 0 && (
          <details className="border-t border-gray-100 dark:border-gray-800">
            <summary className="cursor-pointer px-5 py-3 text-theme-sm text-gray-600 dark:text-gray-400">แสดง {zero.length} จุดที่ไม่มีผลต่อยอดในขณะนี้</summary>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">{zero.map(row)}</ul>
          </details>
        )}
      </Card>

      <Card title="เทียบกับค่าที่ Excel คำนวณไว้" description="ระบบคำนวณแบบ “ตามไฟล์เดิม” ทุกจุด แล้วเทียบกับตัวเลขที่เก็บไว้ตอนนำเข้าไฟล์ ถ้ามีการแก้ยอดหลังนำเข้า ตัวเลขจะต่างกันได้ตามปกติ" bodyClassName="p-0">
        {!ref ? <p className="px-5 pb-5 text-theme-sm text-gray-500">ไม่มีค่าอ้างอิงจาก Excel (ฐานข้อมูลนี้ไม่ได้นำเข้าจากไฟล์)</p> : (
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full min-w-3xl text-end">
              <thead><tr className="border-y border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3">
                <th className="app-th text-start">ปี</th><th className="app-th text-end">รวมทั้งปี Excel</th><th className="app-th text-end">ระบบ</th><th className="app-th text-end">ยอดสะสม Excel</th><th className="app-th text-end">ระบบ (ตามไฟล์เดิม)</th><th className="app-th text-end">ระบบ (มาตรฐาน)</th><th className="app-th text-end">ต่างจาก Excel</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {ref.years.map((r) => {
                  const f = asFile.find((c) => c.year === r.year);
                  const s = standard.find((c) => c.year === r.year);
                  const d = (f?.cumulative ?? 0) - (r.cumulative ?? f?.cumulative ?? 0) + (f?.totals.income ?? 0) - (r.income ?? f?.totals.income ?? 0);
                  return (
                    <tr key={r.year}>
                      <td className="app-td num text-start">{r.year}</td>
                      <td className="app-td"><Baht value={r.income} /></td><td className="app-td"><Baht value={f?.totals.income} /></td>
                      <td className="app-td"><Baht value={r.cumulative} signColor /></td><td className="app-td"><Baht value={f?.cumulative} signColor /></td><td className="app-td"><Baht value={s?.cumulative} signColor /></td>
                      <td className={cn("app-td font-medium", d === 0 ? "text-success-600" : "text-warning-600")}>{d === 0 ? "ตรงกัน" : <Baht value={d} sign />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="space-y-1 px-5 py-4 text-theme-xs text-gray-500 dark:text-gray-400">
              {ref.savings.map((s) => {
                const mine = model.savings.find((x) => x.data.year === s.year);
                return <p key={s.year}>เงินเก็บพ่อ ปี {s.year}: Excel <Baht value={s.yearRemain} /> · ระบบ <Baht value={mine?.calc.yearRemain} /></p>;
              })}
              <p>เงินเก็บพ่อรวมทุกปี (ระบบคำนวณ): <Baht value={calcSavingsTotal(model.savings.map((s) => s.data))} className="font-medium" /> บาท</p>
              {ref.errors.length > 0 && <p className="text-warning-700 dark:text-warning-400">เซลล์ที่แสดง error ในไฟล์เดิม ({ref.errors.join(", ")}) ระบบคำนวณค่าที่ถูกต้องให้แทนแล้ว</p>}
            </div>
          </div>
        )}
      </Card>
      <ConfirmDialog open={confirmAll !== null} tone="primary" title="ใช้สูตรมาตรฐานทั้งหมด?" body={`ทุกจุดจะเปลี่ยนเป็นสูตรมาตรฐาน ยอดสะสมล่าสุดจะเปลี่ยนเป็น ${endStd / 100} บาท (เดิม ${endFile / 100} บาท) สลับกลับได้ทุกเมื่อ และบันทึกในประวัติการใช้งาน`} confirmLabel="ใช้มาตรฐานทั้งหมด" busy={busy === "all"} onConfirm={() => setMode(null, "standard")} onClose={() => setConfirmAll(null)} />
    </>
  );
}
