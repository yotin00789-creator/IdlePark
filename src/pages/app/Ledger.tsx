import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import PayMethodPicker from "@/components/app/PayMethodPicker";
import PageHeader from "@/components/app/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import LedgerCards from "@/components/ledger/LedgerCards";
import LedgerTable from "@/components/ledger/LedgerTable";
import RowSheet from "@/components/ledger/RowSheet";
import { CELL_TONE, STATUS_LABEL } from "@/components/ledger/status";
import { DownloadGlyph, PlusGlyph, SearchGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useCalc } from "@/lib/dataStore";
import { monthName } from "@/lib/format";
import { payMode, usePayMode } from "@/lib/payMode";
import { canEdit, useAuth } from "@/lib/session";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { feeFor, isPrepaid, type CellStatus } from "../../../shared/calc";
import type { LedgerRow } from "../../../shared/types";

const LEGEND: CellStatus[] = ["full", "partial", "zero", "empty"];

export default function Ledger() {
  const model = useCalc();
  const mode = usePayMode();
  const { user } = useAuth();
  const { year: yearParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<{ row: LedgerRow | null } | null>(null);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = params.get("q") ?? "";

  const editable = canEdit(user);
  const today = model?.data.today;
  const years = useMemo(() => model?.data.years.map((y) => y.year) ?? [], [model]);
  const year = Number(yearParam);
  const yd = model?.yearData.get(year);
  const calc = model?.byYear.get(year);

  const rows = useMemo(() => {
    if (!yd || !today) return [];
    const term = q.trim().toLowerCase().replace(/\s+/g, "");
    const lastMonth = year < today.year ? 12 : year === today.year ? today.month : 0;
    return yd.rows.filter((r) => {
      if (term && !`${r.ownerName}${r.plate}`.toLowerCase().replace(/\s+/g, "").includes(term)) return false;
      if (incompleteOnly) {
        if (r.kind === "excluded") return false;
        for (let m = Math.max(1, r.startMonth); m <= Math.min(lastMonth, r.endMonth ?? 12); m++) {
          if (isPrepaid(r, year, m)) continue;
          if ((r.payments[m - 1] ?? 0) < feeFor(r, m)) return true;
        }
        return false;
      }
      return true;
    });
  }, [yd, today, q, incompleteOnly, year]);

  if (!model || !today) return null;
  if (!yearParam) return <Navigate to={`/ledger/${today.year}${q ? `?q=${encodeURIComponent(q)}` : ""}`} replace />;
  if (!yd || !calc) {
    return (
      <div className="app-card mx-auto max-w-md p-6 text-center">
        <p className="text-theme-sm text-gray-700 dark:text-gray-300">ยังไม่มีข้อมูลปี {yearParam}</p>
        <Link to={`/ledger/${today.year}`} className="mt-3 inline-block text-theme-sm font-medium text-link">กลับไปปี {today.year}</Link>
      </div>
    );
  }

  const maxYear = Math.max(...years);
  const addYear = async () => {
    setBusy(true);
    try {
      await api.post(`/ledger/years/${maxYear + 1}/copy-previous`);
      await dataStore.load(true);
      toast.success(`สร้างปี ${maxYear + 1} แล้ว (คัดลอกผู้เช่าจากปี ${maxYear})`);
      navigate(`/ledger/${maxYear + 1}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ordered = [...rows.filter((r) => r.kind !== "excluded"), ...rows.filter((r) => r.kind === "excluded")];
  const defaultMonth = year === today.year ? today.month : year < today.year ? 12 : 1;

  return (
    <>
      <PageMeta title={`สมุดรายรับ ปี ${year} | IdlePark`} description="บันทึกยอดที่เก็บได้รายคันรายเดือน" />
      <PageHeader
        title="สมุดรายรับรายเดือน"
        description="แตะที่ช่องเพื่อแก้ไข ยอดรวมและยอดสะสมของทุกปีจะอัปเดตทันที"
        actions={
          <>
            <a
              href={`/api/export/ledger?year=${year}`}
              download
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-base font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 md:h-10 md:text-theme-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5 [&_svg]:size-4"
              title="ดาวน์โหลด .xlsx ที่มีสูตร SUM และสูตรหักแล้วจริง"
            >
              <DownloadGlyph /> ส่งออก Excel
            </a>
            {editable && <Button icon={<PlusGlyph />} onClick={() => setSheet({ row: null })}>เพิ่มผู้เช่า</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="เลือกปี" className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-white/5">
          {years.map((y) => (
            <Link
              key={y}
              to={`/ledger/${y}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
              aria-current={y === year ? "page" : undefined}
              className={cn(
                "num shrink-0 rounded-md px-3 py-1.5 text-theme-sm font-medium whitespace-nowrap",
                y === year ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500 hover:text-gray-800 dark:text-gray-400",
              )}
            >
              {y}
            </Link>
          ))}
          {editable && (
            <button onClick={addYear} disabled={busy} className="shrink-0 rounded-md px-3 py-1.5 text-theme-sm whitespace-nowrap text-gray-500 hover:text-link-hover" title={`สร้างปี ${maxYear + 1} โดยคัดลอกผู้เช่าจากปี ${maxYear}`}>
              + ปี {maxYear + 1}
            </button>
          )}
        </nav>
        <div className="relative min-w-40 flex-1 md:max-w-72">
          <SearchGlyph className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
            placeholder="ค้นหาชื่อหรือทะเบียน"
            aria-label="ค้นหาชื่อหรือทะเบียน"
            className="app-input ps-9"
          />
        </div>
        <button
          onClick={() => setIncompleteOnly((v) => !v)}
          aria-pressed={incompleteOnly}
          className={cn("h-11 rounded-lg border px-3.5 text-theme-sm font-medium md:h-10", incompleteOnly ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400" : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400")}
        >
          ยังไม่ครบ
        </button>
      </div>

      <dl className="app-card mb-3 grid grid-cols-3 divide-x divide-gray-200 rtl:divide-x-reverse dark:divide-gray-800">
        <Stat label={`รายรับรวมปี ${year}`} value={<Baht value={calc.totals.income} />} />
        <Stat label="รวม(หักแล้ว) ทั้งปี" value={<Baht value={calc.totals.net} signColor />} />
        <Stat label="ยอดคงเหลือสะสม" value={<Baht value={calc.cumulative} signColor />} />
      </dl>

      {editable && (
        <div className="mb-3 hidden flex-wrap items-center gap-x-3 gap-y-2 md:flex">
          <span className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">ยอดที่พิมพ์ใหม่รับเป็น</span>
          <PayMethodPicker compact value={mode} onChange={payMode.set} accounts={model?.data.accounts ?? []} />
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">ช่องที่มีเงินแล้วใช้วิธีเดิม · กดป้าย “สด/โอน” ที่มุมช่องเพื่อเปลี่ยน</span>
        </div>
      )}

      <ul className="mb-3 hidden flex-wrap items-center gap-x-4 gap-y-1 text-theme-xs text-gray-500 md:flex dark:text-gray-400" aria-label="คำอธิบายสี">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-4 w-6 rounded-sm border border-gray-200 dark:border-gray-700", CELL_TONE[s].split(" ").filter((c) => c.startsWith("bg-") || c.startsWith("dark:bg-")).join(" "))} />
            {STATUS_LABEL[s]}
          </li>
        ))}
        <li>วางข้อมูลจาก Excel / Google Sheets ได้ · คลิกตัวเลขที่คำนวณเพื่อดูสูตร</li>
      </ul>

      <div className="app-card hidden overflow-hidden md:block">
        <LedgerTable year={yd} calc={calc} today={today} rows={ordered} editable={editable} onEditRow={(row) => setSheet({ row })} />
      </div>
      <div className="md:hidden">
        <LedgerCards year={year} today={today} rows={ordered} editable={editable} onEditRow={(row) => setSheet({ row })} />
        <MobileSummary calc={calc} initialMonth={defaultMonth} />
      </div>

      <RowSheet year={year} row={sheet?.row ?? null} open={Boolean(sheet)} onClose={() => setSheet(null)} canDelete={editable} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5">
      <dt className="truncate text-theme-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 truncate text-base font-semibold text-gray-800 sm:text-lg dark:text-white/90">{value}</dd>
    </div>
  );
}

function MobileSummary({ calc, initialMonth }: { calc: NonNullable<ReturnType<typeof useCalc>>["calc"][number]; initialMonth: number }) {
  const [month, setMonth] = useState(initialMonth);
  const m = calc.months[month - 1];
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <select aria-label="เดือนที่สรุป" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="app-input h-10 w-auto shrink-0 py-0 pe-7 text-theme-sm">
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
        </select>
        <dl className="grid flex-1 grid-cols-2 gap-3 text-end">
          <div><dt className="text-[11px] text-gray-500">รวม</dt><dd className="text-theme-sm font-semibold"><Baht value={m.income} /></dd></div>
          <div><dt className="text-[11px] text-gray-500">รวม(หักแล้ว)</dt><dd className="text-theme-sm font-semibold"><Baht value={m.net} signColor /></dd></div>
        </dl>
      </div>
    </div>
  );
}
