import { cn } from "@/utils";
import { useEffect, useRef, useState } from "react";

export interface ChartSeries {
  name: string;
  type: "bar" | "line";
  data: number[];
  fill: string; // tailwind fill-* class (bars, line dots)
  stroke: string; // tailwind stroke-* class (line)
  dot: string; // tailwind bg-* class (legend / tooltip swatch)
}

interface ComboChartProps {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  format: (v: number) => string; // tooltip value
  axis?: (v: number) => string; // y-axis label
  label: string;
}

const PAD = { top: 10, right: 12, bottom: 26, left: 44 };

/** The 4–5 round numbers that frame the data (always includes 0). */
function niceTicks(min: number, max: number, count = 5): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = hi - lo || 1;
  const rough = span / (count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const out: number[] = [];
  const top = Math.ceil(hi / step - 1e-9) * step; // the top tick is at or above the largest value
  for (let v = Math.floor(lo / step) * step; v <= top + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Bars and lines on one scale. Light on purpose: plain SVG, no chart library. */
export default function ComboChart({ categories, series, height = 280, format, axis, label }: ComboChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.data);
  const ticks = niceTicks(Math.min(...all, 0), Math.max(...all, 0));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const n = categories.length;
  const band = plotW / n;
  const bars = series.filter((s) => s.type === "bar");
  const groupW = Math.min(band * 0.7, 36 * Math.max(1, bars.length));
  const barW = bars.length ? groupW / bars.length - 2 : 0;
  const cx = (i: number) => PAD.left + band * i + band / 2;
  const axisFmt = axis ?? ((v: number) => String(v));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - PAD.left) / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div ref={box} className="relative">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-theme-sm text-gray-600 dark:text-gray-400">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", s.dot)} aria-hidden />{s.name}</li>
        ))}
      </ul>
      <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-gray-300 dark:stroke-gray-600" : "stroke-gray-100 dark:stroke-gray-800"} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-500 text-[11px] dark:fill-gray-400">{axisFmt(t)}</text>
          </g>
        ))}
        {categories.map((c, i) => (
          <text key={c + i} x={cx(i)} y={height - 8} textAnchor="middle" className="fill-gray-500 text-[11px] dark:fill-gray-400">{c}</text>
        ))}
        {hover != null && <rect x={PAD.left + band * hover} y={PAD.top} width={band} height={plotH} className="fill-gray-900/4 dark:fill-white/5" />}
        {bars.map((s, k) =>
          s.data.map((v, i) => {
            const x0 = cx(i) - groupW / 2 + k * (barW + 2);
            const top = Math.min(y(v), y(0));
            const h = Math.max(1, Math.abs(y(v) - y(0)));
            return <rect key={i} x={x0} y={top} width={Math.max(2, barW)} height={h} rx={Math.min(4, barW / 2)} className={s.fill} />;
          }),
        )}
        {series.filter((s) => s.type === "line").map((s) => (
          <g key={s.name}>
            <path d={s.data.map((v, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className={s.stroke} />
            {s.data.map((v, i) => (hover === i || n <= 2 ? <circle key={i} cx={cx(i)} cy={y(v)} r={4} className={cn(s.fill, "stroke-white dark:stroke-gray-900")} strokeWidth={2} /> : null))}
          </g>
        ))}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-8 z-10 min-w-36 rounded-lg border border-gray-200 bg-white px-3 py-2 text-theme-xs shadow-theme-lg dark:border-gray-700 dark:bg-gray-900"
          style={{ left: Math.min(Math.max(cx(hover) + 12, 8), width - 160) }}
        >
          <p className="mb-1 font-semibold text-gray-800 dark:text-white/90">{categories[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-3 text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", s.dot)} aria-hidden />{s.name}</span>
              <span className="num font-medium text-gray-800 dark:text-white/90">{format(s.data[hover])}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
