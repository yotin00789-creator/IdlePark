import { useTheme } from "@/context/ThemeContext";
import type { ApexOptions } from "apexcharts";
import ReactApexChart from "react-apexcharts";
import type { YearCalc } from "../../../shared/types";

export default function CumulativeChart({ calc }: { calc: YearCalc[] }) {
  const { theme } = useTheme();
  const options: ApexOptions = {
    colors: ["#d9ae00", "#12b76a"],
    chart: { fontFamily: "IBM Plex Sans Thai, sans-serif", toolbar: { show: false }, background: "transparent" },
    theme: { mode: theme === "dark" ? "dark" : "light" },
    plotOptions: { bar: { columnWidth: "42%", borderRadius: 4, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    xaxis: { categories: calc.map((c) => String(c.year)), axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { formatter: (v: number) => `${Math.round(v / 1000)}k` } },
    legend: { position: "top", horizontalAlign: "left", markers: { size: 5 } },
    grid: { borderColor: theme === "dark" ? "#1d2939" : "#f2f4f7" },
    tooltip: { y: { formatter: (v: number) => `฿${Math.round(v).toLocaleString("en-US")}` } },
  };
  return (
    <ReactApexChart
      type="bar"
      height={280}
      options={options}
      series={[
        { name: "รวม(หักแล้ว) ทั้งปี", data: calc.map((c) => c.totals.net / 100) },
        { name: "ยอดคงเหลือสะสม", data: calc.map((c) => c.cumulative / 100) },
      ]}
    />
  );
}
