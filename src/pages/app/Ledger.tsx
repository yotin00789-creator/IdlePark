import { getStorageSlots, slotLabel } from "../../../shared/lot";
import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import PayMethodPicker from "@/components/app/PayMethodPicker";
import PageHeader from "@/components/app/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import LedgerCards from "@/components/ledger/LedgerCards";
import LedgerTable from "@/components/ledger/LedgerTable";
import EndedTenants from "@/components/ledger/EndedTenants";
import MonthSummaryCard from "@/components/ledger/MonthSummaryCard";
import RowSheet from "@/components/ledger/RowSheet";
import { CELL_TONE, STATUS_LABEL } from "@/components/ledger/status";
import { DownloadGlyph, PlusGlyph, SearchGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useCalc } from "@/lib/dataStore";
import { payMode, usePayMode } from "@/lib/payMode";
import { canEdit, useAuth } from "@/lib/session";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { currentFee, feeFor, isPrepaid, isYearly, yearlyStatus, type CellStatus } from "../../../shared/calc";
import { THAI_MONTHS } from "../../../shared/thai";
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
  // on a phone the cards are the default; "ตาราง" gives the same grid as the desktop, every cell editable
  const [phoneGrid, setPhoneGrid] = useState(() => {
    try {
      return localStorage.getItem("idlepark.ledgerView") === "grid";
    } catch {
      return false;
    }
  });
  const pickView = (grid: boolean) => {
    setPhoneGrid(grid);
    try {
      localStorage.setItem("idlepark.ledgerView", grid ? "grid" : "cards");
    } catch {
      /* not remembered */
    }
  };
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
        if (r.kind === "excluded" || !r.isActive) return false;
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

  // same name side by side, in alphabetical order (Thai collation), then by plate; rows that are not counted stay at the end
  const byName = (a: LedgerRow, b: LedgerRow) => a.ownerName.localeCompare(b.ownerName, "th") || a.plate.localeCompare(b.plate, "th") || a.id - b.id;
  const live = rows.filter((r) => r.isActive); // tenants who left are listed apart, under the ledger
  const ended = rows.filter((r) => !r.isActive).sort(byName);
  const ordered = [...live.filter((r) => r.kind !== "excluded").sort(byName), ...live.filter((r) => r.kind === "excluded").sort(byName)];
  const sheds = getStorageSlots().map((id) => ({ id, row: (yd?.rows ?? []).find((r) => r.slotId === id && r.isActive && r.kind !== "excluded") }));
  const defaultMonth = year === today.year ? today.month : year < today.year ? 12 : 1;

  return (
    <>
      <PageMeta title={`สมุดรายรับ ปี ${year} | IdlePark`} description="บันทึกยอดที่เก็บได้รายคันรายเดือน" />
      <PageHeader title="สมุดรายรับรายเดือน" description="แตะที่ช่องเพื่อแก้ไข ยอดรวมและยอดสะสมของทุกปีจะอัปเดตทันที" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="เลือกปี"
          value={year}
          disabled={busy}
          onChange={(e) => (e.target.value === "new" ? void addYear() : navigate(`/ledger/${e.target.value}${q ? `?q=${encodeURIComponent(q)}` : ""}`))}
          className="app-input num h-11 w-auto min-w-28 pe-8 font-medium md:h-10"
        >
          {[...years].sort((x, y) => y - x).map((y) => <option key={y} value={y}>ปี {y}{y === today.year ? " (ปัจจุบัน)" : ""}</option>)}
          {editable && <option value="new">+ สร้างปี {maxYear + 1}</option>}
        </select>
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
        <div className="ms-auto flex items-center gap-2">
          <a
            href={`/api/export/ledger?year=${year}`}
            download
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-base font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 md:h-10 md:text-theme-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5 [&_svg]:size-4"
            title="ดาวน์โหลด .xlsx ที่มีสูตร SUM และสูตรหักแล้วจริง"
          >
            <DownloadGlyph /> ส่งออก Excel
          </a>
          {editable && <Button icon={<PlusGlyph />} onClick={() => setSheet({ row: null })}>เพิ่มผู้เช่า</Button>}
        </div>
      </div>

      <div className="app-card mb-3 space-y-1.5 px-4 py-3 text-theme-sm" aria-label="คลังเก็บของ">
        {sheds.map(({ id, row: shed }) => (
          <div key={id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-gray-800 dark:text-white/90">{slotLabel(id)}</span>
            {shed ? (
              <>
                <span className="text-gray-700 dark:text-gray-300">เช่าโดย <b className="font-semibold">{shed.ownerName}</b></span>
                <span className="text-gray-600 dark:text-gray-400">{shed.isOwner ? "เจ้าของ ไม่คิดเงิน" : isYearly(shed) ? <>ปีละครั้ง เดือน{THAI_MONTHS[shed.startMonth - 1]} · <Baht value={feeFor(shed, shed.startMonth)} dash={false} /> บาท</> : <>รายเดือน · <Baht value={currentFee(shed, today)} dash={false} /> บาท/เดือน</>}</span>
                {!shed.isOwner && <span className={cn("rounded-full px-2 py-px text-theme-xs font-medium", yearlyStatus(shed, today) === "full" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500" : yearlyStatus(shed, today) === "future" ? "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300" : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400")}>{yearlyStatus(shed, today) === "full" ? "ชำระแล้ว" : yearlyStatus(shed, today) === "future" ? "ยังไม่ถึงกำหนด" : "ยังไม่ชำระ"}</span>}
              </>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">ว่าง · ยังไม่มีผู้เช่าในปี {year} (เพิ่มผู้เช่าแล้วเลือก “คลังเก็บของ”)</span>
            )}
          </div>
        ))}
      </div>

      <dl className="app-card mb-3 grid grid-cols-3 divide-x divide-gray-200 rtl:divide-x-reverse dark:divide-gray-800">
        <Stat label={`รายรับรวมปี ${year}`} value={<Baht value={calc.totals.income} />} />
        <Stat label="รวม(หักแล้ว) ทั้งปี" value={<Baht value={calc.totals.net} signColor />} />
        <Stat label="ยอดคงเหลือสะสม" value={<Baht value={calc.cumulative} signColor />} />
      </dl>

      {editable && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">ยอดที่พิมพ์ใหม่รับเป็น</span>
          <PayMethodPicker compact value={mode} onChange={payMode.set} accounts={model?.data.accounts ?? []} />
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">ช่องที่มีเงินแล้วใช้วิธีเดิม <span className="hidden md:inline">· กดป้าย “สด/โอน” ที่มุมช่องเพื่อเปลี่ยน</span></span>
        </div>
      )}

      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-theme-xs text-gray-500 dark:text-gray-400" aria-label="คำอธิบายสี">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("inline-block h-4 w-6 rounded-sm border border-gray-200 dark:border-gray-700", CELL_TONE[s].split(" ").filter((c) => c.startsWith("bg-") || c.startsWith("dark:bg-")).join(" "))} />
            {STATUS_LABEL[s]}
          </li>
        ))}
        <li className="hidden md:block">วางข้อมูลจาก Excel / Google Sheets ได้ · คลิกตัวเลขที่คำนวณเพื่อดูสูตร</li>
      </ul>

      <div className="mb-3 flex items-center gap-2 md:hidden">
        <span className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">มุมมอง</span>
        <div role="radiogroup" aria-label="มุมมองสมุดรายรับ" className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/8">
          {([[false, "การ์ด"], [true, "ตาราง (แก้ได้ทุกช่อง)"]] as const).map(([g, label]) => (
            <button key={label} type="button" role="radio" aria-checked={phoneGrid === g} onClick={() => pickView(g)} className={cn("h-9 rounded-md px-3 text-theme-sm font-medium", phoneGrid === g ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-700 dark:text-white" : "text-gray-600 dark:text-gray-400")}>{label}</button>
          ))}
        </div>
      </div>

      <div className={cn("app-card overflow-hidden", phoneGrid ? "block" : "hidden md:block")}>
        <LedgerTable year={yd} calc={calc} today={today} rows={ordered} editable={editable} onEditRow={(row) => setSheet({ row })} />
      </div>
      <div className={phoneGrid ? "hidden" : "md:hidden"}>
        <LedgerCards year={year} today={today} rows={ordered} editable={editable} onEditRow={(row) => setSheet({ row })} />
        <MonthSummaryCard year={yd} calc={calc} initialMonth={defaultMonth} editable={editable} />
      </div>

      <EndedTenants rows={ended} today={today} editable={editable} onEdit={(row) => setSheet({ row })} />

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
