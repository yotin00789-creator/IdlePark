import type { YearCalc } from "../../../shared/types";
import ComboChart from "./ComboChart";

export default function CumulativeChart({ calc }: { calc: YearCalc[] }) {
  return (
    <ComboChart
      label="รวม(หักแล้ว) ทั้งปี และยอดคงเหลือสะสม"
      categories={calc.map((c) => String(c.year))}
      height={280}
      format={(v) => `฿${Math.round(v).toLocaleString("en-US")}`}
      axis={(v) => `${Math.round(v / 1000)}k`}
      series={[
        { name: "รวม(หักแล้ว) ทั้งปี", type: "bar", data: calc.map((c) => c.totals.net / 100), fill: "fill-gold-500", stroke: "", dot: "bg-gold-500" },
        { name: "ยอดคงเหลือสะสม", type: "bar", data: calc.map((c) => c.cumulative / 100), fill: "fill-success-500", stroke: "", dot: "bg-success-500" },
      ]}
    />
  );
}
