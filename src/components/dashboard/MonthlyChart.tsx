import { useTheme } from "@/context/ThemeContext";
import { monthShort } from "@/lib/format";
import type { ApexOptions } from "apexcharts";
import ReactApexChart from "react-apexcharts";
import type { YearCalc } from "../../../shared/types";

const baht = (v: number) => `฿${Math.round(v / 100).toLocaleString("en-US")}`;

export default function MonthlyChart({ calc, upTo }: { calc: YearCalc; upTo: number }) {
  const { theme } = useTheme();
  const months = Array.from({ length: Math.max(1, Math.min(12, upTo)) }, (_, i) => i);
  const out = (i: number) => {
    const m = calc.months[i];
    return m.toFather + m.payAunt + m.totalExpense + (m.legacyNoCollect ? 0 : m.collect);
  };
  const options: ApexOptions = {
    colors: ["#f2c200", "#6b675f", "#12b76a"],
    chart: { fontFamily: "IBM Plex Sans Thai, sans-serif", toolbar: { show: false }, zoom: { enabled: false }, background: "transparent" },
    theme: { mode: theme === "dark" ? "dark" : "light" },
    plotOptions: { bar: { columnWidth: "44%", borderRadius: 4, borderRadiusApplication: "end" } },
    stroke: { width: [0, 0, 2.5], curve: "smooth" },
    dataLabels: { enabled: false },
    xaxis: { categories: months.map((i) => monthShort(i + 1)), axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { formatter: (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))) } },
    legend: { position: "top", horizontalAlign: "left", markers: { size: 5 } },
    grid: { borderColor: theme === "dark" ? "#1d2939" : "#f2f4f7", yaxis: { lines: { show: true } } },
    tooltip: { y: { formatter: (v: number) => baht(v * 100) } },
  };
  return (
    <ReactApexChart
      type="line"
      height={290}
      options={options}
      series={[
        { name: "รายรับ", type: "column", data: months.map((i) => calc.months[i].income / 100) },
        { name: "รายจ่ายรวม", type: "column", data: months.map((i) => out(i) / 100) },
        { name: "รวม(หักแล้ว)", type: "line", data: months.map((i) => calc.months[i].net / 100) },
      ]}
    />
  );
}
