import { useTheme } from "@/context/ThemeContext";
import type { ApexOptions } from "apexcharts";
import ReactApexChart from "react-apexcharts";

// Donut of how many vehicles have paid this month: green paid, gold part-paid, red not yet.
export default function PayDonut({ full, partial, none }: { full: number; partial: number; none: number }) {
  const { theme } = useTheme();
  const total = full + partial + none;
  const options: ApexOptions = {
    chart: { fontFamily: "IBM Plex Sans Thai, sans-serif", background: "transparent", sparkline: { enabled: true } },
    theme: { mode: theme === "dark" ? "dark" : "light" },
    colors: ["#12b76a", "#f2c200", "#f04438"],
    labels: ["ชำระครบ", "ชำระบางส่วน", "ยังไม่ชำระ"],
    stroke: { width: 0 },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { y: { formatter: (v: number) => `${v} คัน` } },
    plotOptions: {
      pie: {
        donut: {
          size: "74%",
          labels: { show: true, name: { show: true, offsetY: 22, color: theme === "dark" ? "#9b968b" : "#6b675f", fontSize: "13px" }, value: { show: true, offsetY: -14, fontSize: "30px", fontWeight: 600, color: theme === "dark" ? "#ffffff" : "#17191c" }, total: { show: true, label: "ทั้งหมด (คัน)", formatter: () => String(total) } },
        },
      },
    },
  };
  return <ReactApexChart type="donut" height={230} options={options} series={total ? [full, partial, none] : [0, 0, 1]} />;
}
