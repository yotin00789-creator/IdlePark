import ParkingScene from "@/components/common/ParkingScene";
import { MoonGlyph, SunGlyph, ArrowRightGlyph } from "@/icons";
import { bangkokClock, formatBaht, formatThaiDate, formatThaiTime } from "@/lib/format";
import CountUp from "@/components/app/CountUp";
import { settleBaht } from "@/lib/motion";
import { useUser } from "@/lib/session";
import { useEffect, useState } from "react";
import { Link } from "react-router";

interface Period {
  id: "morning" | "noon" | "evening" | "night";
  text: string;
  hint: string;
  night: boolean;
}

/** Thai greeting by Thailand time: เช้า 05–11, กลางวัน 11–16, เย็น 16–19, กลางคืน 19–05. */
export function periodFor(hour: number): Period {
  if (hour >= 5 && hour < 11) return { id: "morning", text: "สวัสดีตอนเช้า", hint: "เริ่มวันใหม่ ตรวจดูยอดที่เก็บได้ และดูว่าใครยังไม่ได้จ่ายค่าเช่า", night: false };
  if (hour >= 11 && hour < 16) return { id: "noon", text: "สวัสดีตอนกลางวัน", hint: "ดูสรุปตัวเงินล่าสุด และติดตามคนที่ยังไม่ได้จ่ายค่าเช่า", night: false };
  if (hour >= 16 && hour < 19) return { id: "evening", text: "สวัสดีตอนเย็น", hint: "สรุปยอดของวันนี้ก่อนพักผ่อน บันทึกยอดที่ได้รับให้ครบ", night: false };
  return { id: "night", text: "สวัสดีตอนกลางคืน", hint: "พักผ่อนให้เพียงพอ ข้อมูลทั้งหมดถูกบันทึกไว้แล้ว", night: true };
}

interface HeroProps {
  years: number[];
  year: number;
  onYear: (y: number) => void;
  unpaidCount: number;
  unpaidTotal: number; // satang
  showUnpaid: boolean;
  monthLabel: string;
}

// The dashboard's opening card: greeting by time of day inside a slowly rotating gold frame,
// the year picker, this month's open amount, and the way into the ledger.
export default function GreetingBanner({ years, year, onYear, unpaidCount, unpaidTotal, showUnpaid, monthLabel }: HeroProps) {
  const user = useUser();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const p = periodFor(bangkokClock(now).hour);
  const Icon = p.night ? MoonGlyph : SunGlyph;

  return (
    <section aria-label={p.text} className={`greet greet-hero greet-${p.id} rise h-full`}>
      <div className="greet-inner relative flex h-full min-h-60 flex-col justify-between gap-5 overflow-hidden p-5 text-white md:p-7">
        <ParkingScene bays={3} className="pointer-events-none absolute end-3 bottom-3 hidden w-[17rem] max-w-[44%] md:block xl:w-[21rem]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-x-2.5 text-xl leading-tight font-semibold md:text-2xl">
              {p.text}{user.firstName ? ` ${user.firstName}` : ""}
              <Icon className="size-6 shrink-0 text-gold-400" />
            </h2>
            <p className="mt-2 max-w-md text-theme-sm leading-relaxed text-gray-300">{p.hint}</p>
          </div>
          <label className="shrink-0">
            <span className="sr-only">เลือกปี</span>
            <select aria-label="เลือกปี" value={year} onChange={(e) => onYear(Number(e.target.value))} className="h-10 cursor-pointer rounded-lg border border-white/20 bg-white/10 px-3 pe-8 text-theme-sm font-medium text-white backdrop-blur focus:border-gold-400 focus:outline-hidden [&>option]:text-gray-900">
              {years.map((x) => <option key={x} value={x}>ปี {x}</option>)}
            </select>
          </label>
        </div>

        <div className="relative flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="space-y-3">
            {showUnpaid && (
              <p className="text-theme-sm text-gray-300">
                ยังไม่ได้เก็บเดือน{monthLabel}{" "}
                <CountUp className="num text-lg font-semibold text-white" value={unpaidCount} /> คัน
                {unpaidCount > 0 && <> · <CountUp className="num font-semibold text-gold-300" value={unpaidTotal} format={settleBaht(unpaidTotal, (v) => formatBaht(Math.round(v)))} /> บาท</>}
              </p>
            )}
            <Link to="/ledger" className="inline-flex h-11 items-center gap-2 rounded-lg bg-gold-400 px-5 text-theme-sm font-semibold text-gray-950 transition hover:bg-gold-300">
              เปิดสมุดรายรับ <ArrowRightGlyph className="size-4" />
            </Link>
          </div>
          <div className="ms-auto text-end md:me-[min(50%,23rem)]">
            <p className="num text-xl leading-tight font-semibold md:text-2xl">{formatThaiTime(now)}</p>
            <p className="text-theme-xs text-gray-300">วันที่ {formatThaiDate(now)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
