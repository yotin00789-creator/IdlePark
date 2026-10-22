import { monthShort } from "@/lib/format";
import type { YearCalc } from "../../../shared/types";
import ComboChart from "./ComboChart";

const baht = (v: number) => `฿${Math.round(v).toLocaleString("en-US")}`;
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

export default function MonthlyChart({ calc, upTo }: { calc: YearCalc; upTo: number }) {
  const months = Array.from({ length: Math.max(1, Math.min(12, upTo)) }, (_, i) => i);
  const out = (i: number) => {
    const m = calc.months[i];
    return m.toFather + m.payAunt + m.totalExpense + (m.legacyNoCollect ? 0 : m.collect);
  };
  return (
    <ComboChart
      label="รายรับ รายจ่าย และรวม(หักแล้ว) รายเดือน"
      categories={months.map((i) => monthShort(i + 1))}
      height={290}
      format={baht}
      axis={compact}
      series={[
        { name: "รายรับ", type: "bar", data: months.map((i) => calc.months[i].income / 100), fill: "fill-gold-400", stroke: "", dot: "bg-gold-400" },
        { name: "รายจ่ายรวม", type: "bar", data: months.map((i) => out(i) / 100), fill: "fill-gray-500", stroke: "", dot: "bg-gray-500" },
        { name: "รวม(หักแล้ว)", type: "line", data: months.map((i) => calc.months[i].net / 100), fill: "fill-success-500", stroke: "stroke-success-500", dot: "bg-success-500" },
      ]}
    />
  );
}
