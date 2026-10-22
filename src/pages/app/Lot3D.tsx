import PageHeader from "@/components/app/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import CarCard from "@/components/lot3d/CarCard";
import CarList from "@/components/lot3d/CarList";
import LotSummary from "@/components/lot3d/LotSummary";
import { LotScene, type SlotsFile, type ViewMode } from "@/components/lot3d/LotScene";
import PlateBadge from "@/components/lot3d/PlateBadge";
import PayDialog from "@/components/dashboard/PayDialog";
import RowSheet from "@/components/ledger/RowSheet";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useData } from "@/lib/dataStore";
import { buildLotCars, emptyLabel, motoBays, toCarInputs, toneLabel, unplacedRows, type LotCar } from "@/lib/lot";
import { useSidebar } from "@/context/SidebarContext";
import { canEdit, useAuth } from "@/lib/session";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import CustomerSheet from "@/components/ledger/CustomerSheet";
import { slotLabel } from "../../../shared/lot";
import type { Customer } from "@/lib/dataStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LedgerRow } from "../../../shared/types";

const LEGEND = [
  { tone: "paid", dot: "bg-success-500" },
  { tone: "pending", dot: "bg-warning-500" },
  { tone: "late", dot: "bg-error-500" },
  { tone: "empty", dot: "bg-gray-400" },
  { tone: "private", dot: "bg-violet-500" },
  { tone: "closed", dot: "bg-gray-700" },
] as const;

const slotOf = (key: string) => key.split("#")[0];

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

export default function Lot3D() {
  const { data } = useData();
  const { user } = useAuth();
  const editable = canEdit(user);
  const { isExpanded, setIsExpanded } = useSidebar();

  // the map wants the width: fold the menu while this page is open, restore it on leaving
  const wasExpanded = useRef(isExpanded);
  useEffect(() => {
    const restore = wasExpanded.current;
    setIsExpanded(false);
    return () => setIsExpanded(restore);
  }, [setIsExpanded]);

  const stage = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const scene = useRef<LotScene | null>(null);

  const [layout, setLayout] = useState<SlotsFile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("iso");
  const [wallsOpen, setWallsOpen] = useState(false);
  const [top, setTop] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [pay, setPay] = useState<{ row: LedgerRow; month: number; paid: number } | null>(null);
  const [customerEdit, setCustomerEdit] = useState<Customer | null>(null);
  const [rowEdit, setRowEdit] = useState<{ row: LedgerRow | null; slot?: string; zoneId?: number } | null>(null);

  const cars = useMemo(() => (data ? buildLotCars(data) : []), [data]);
  const unplaced = useMemo(() => (data ? unplacedRows(data) : []), [data]);
  const carByKey = useMemo(() => new Map(cars.map((c) => [c.key, c])), [cars]);
  const slots = useMemo(() => layout?.slots ?? [], [layout]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const order = useMemo(() => [...cars].sort((a, b) => (slotById.get(a.slotId)?.number ?? 0) - (slotById.get(b.slotId)?.number ?? 0) || (a.row.bay ?? 0) - (b.row.bay ?? 0)), [cars, slotById]);

  // latest values for the scene's event callbacks (the scene is created once)
  const live = useRef({ carByKey, slotById, zones: data?.zones ?? [] });
  useEffect(() => {
    live.current = { carByKey, slotById, zones: data?.zones ?? [] };
  });

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/3d/slots.json", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("โหลดข้อมูลผังไม่สำเร็จ"))))
      .then(setLayout)
      .catch((e) => !ctl.signal.aborted && setError(errorMessage(e)));
    return () => ctl.abort();
  }, []);

  // ---------------------------------------------------------------- selection

  const select = useCallback(
    (id: string | null, mode: ViewMode = "iso") => {
      const s = scene.current;
      if (!s) return;
      setSelected(id);
      setView(mode);
      if (id) {
        s.setSelected(id);
        s.focus(id, mode);
      } else {
        setTop(false);
        s.setOverview("iso");
      }
    },
    [],
  );
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });

  const step = useCallback(
    (d: 1 | -1) => {
      if (!order.length) return;
      const i = order.findIndex((c) => c.key === selected);
      const next = order[i < 0 ? (d > 0 ? 0 : order.length - 1) : (i + d + order.length) % order.length];
      select(next.key);
    },
    [order, selected, select],
  );

  // ------------------------------------------------------------------ scene

  useEffect(() => {
    const host = canvasHost.current;
    if (!layout || !host) return;
    let s: LotScene;
    try {
      s = new LotScene(host, layout, {
        onPick: (id) => selectRef.current(id),
        onHover: (id, cx, cy) => {
          const el = tip.current;
          const box = stage.current?.getBoundingClientRect();
          if (!el || !box) return;
          if (!id) {
            el.hidden = true;
            return;
          }
          const c = live.current.carByKey.get(id);
          const sl = live.current.slotById.get(slotOf(id));
          el.textContent = c
            ? `${slotLabel(c.slotId)} · ${c.row.plate || "ไม่มีทะเบียน"} · ${c.row.ownerName} · ${toneLabel[c.tone]}`
            : `${sl ? slotLabel(sl.id) : id} · ${emptyLabel(live.current.zones, slotOf(id))}`;
          el.style.left = `${cx - box.left + 14}px`;
          el.style.top = `${cy - box.top + 14}px`;
          el.hidden = false;
        },
        onLabel: (p) => {
          const el = label.current;
          if (!el) return;
          if (!p || !p.visible) {
            el.style.opacity = "0";
            return;
          }
          el.style.opacity = "1";
          el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        },
        onReady: () => setReady(true),
        onError: (m) => setError(m),
      });
    } catch {
      const t = window.setTimeout(() => setError("เบราว์เซอร์หรืออุปกรณ์นี้เปิดการแสดงผล 3 มิติ (WebGL) ไม่ได้"), 0);
      return () => window.clearTimeout(t);
    }
    scene.current = s;
    void s.load();
    void document.fonts?.load('700 40px "IBM Plex Sans Thai"').then(() => s.redrawPlates());
    return () => {
      s.dispose();
      scene.current = null;
      setReady(false);
    };
  }, [layout]);

  // zones decide how empty slots look; motorcycle zones get their bay frames
  useEffect(() => {
    scene.current?.setZones(data?.zones.map((z) => ({ slotIds: z.slotIds, access: z.access, isActive: z.isActive })) ?? []);
    scene.current?.setBays(data ? motoBays(data) : []);
  }, [data, ready]);

  // cars follow the ledger
  const inputs = useMemo(() => toCarInputs(cars), [cars]);
  useEffect(() => {
    scene.current?.setCars(inputs);
  }, [inputs, ready]);

  // keep the model clear of the side panel (desktop) or the bottom card (phone)
  useEffect(() => {
    const s = scene.current;
    const box = stage.current?.getBoundingClientRect();
    if (!s || !ready || !box) return;
    if (isDesktop()) s.setInset(-(352 + 24) / 2, 0);
    else s.setInset(0, selected ? -box.height * 0.28 : 0);
  }, [ready, selected]);

  useEffect(() => {
    scene.current?.setWalls(wallsOpen);
  }, [wallsOpen, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "") || document.querySelector('[role="dialog"]')) return;
      if (e.key === "Escape" && selected) select(null);
      else if (e.key === "ArrowRight" && selected) step(1);
      else if (e.key === "ArrowLeft" && selected) step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, select, step]);

  if (!data) return null;
  const selSlot = selected ? (slotById.get(slotOf(selected)) ?? null) : null;
  const selCar: LotCar | null = selected ? (carByKey.get(selected) ?? null) : null;

  const setOverview = (kind: "iso" | "top") => {
    setTop(kind === "top");
    setSelected(null);
    scene.current?.setOverview(kind);
  };

  const assign = async (rowId: number, slotId: string, swap = false) => {
    try {
      const res = await api.patch<{ row: LedgerRow }>(`/ledger/rows/${rowId}`, { slotId, ...(swap ? { swap: true } : {}) });
      dataStore.mergeRow(res.row);
      void dataStore.load(true);
      toast.success(swap ? "สลับรถแล้ว" : "กำหนดช่องแล้ว");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageMeta title="ผังที่จอด 3 มิติ | IdlePark" description="ผังที่จอดรถ 3 มิติ แสดงรถ ทะเบียน และสถานะค่าเช่าของแต่ละช่อง" />
      <PageHeader
        title="ผังที่จอด 3 มิติ"
        description={`มีผู้เช่า ${cars.length} จาก ${slots.length || 27} ช่อง${unplaced.length ? ` · ยังไม่ระบุช่อง ${unplaced.length} คัน` : ""} · คลิกรถหรือช่องเพื่อดูรายละเอียด`}
      />

      <div ref={stage} className="relative h-[calc(100dvh-6.5rem)] min-h-110 overflow-hidden md:h-[calc(100dvh-7.5rem)] rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
        <div ref={canvasHost} className="absolute inset-0" data-lot3d="canvas" />

        {!ready && !error && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-gray-100 dark:bg-gray-900" role="status">
            <div className="text-center text-theme-sm text-gray-600 dark:text-gray-400">
              <span className="mx-auto mb-3 block size-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" aria-hidden />
              กำลังโหลดโมเดลที่จอดรถ…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-gray-100 p-6 dark:bg-gray-900" role="alert">
            <p className="max-w-sm text-center text-theme-sm text-gray-700 dark:text-gray-300">{error}</p>
          </div>
        )}

        {ready && (
          <>
            {/* bottom-left: legend + view controls (the card covers this corner on phones) */}
            <div className={cn("absolute start-3 bottom-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2", selected && "max-md:hidden")}>
              {listOpen && (
                <div className="h-[min(26rem,calc(100dvh-24rem))] w-[min(22rem,calc(100vw-3rem))]">
                  <CarList
                    slots={slots}
                    cars={cars}
                    unplaced={unplaced}
                    selected={selected}
                    editable={editable}
                    emptyText={(id) => emptyLabel(data.zones, id)}
                    onClose={() => setListOpen(false)}
                    onSelect={(id) => {
                      select(id);
                      if (!isDesktop()) setListOpen(false);
                    }}
                    onEditRow={(r) => setRowEdit({ row: r })}
                  />
                </div>
              )}
              <ul className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-white/92 px-3 py-1.5 text-theme-xs text-gray-700 backdrop-blur dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300" aria-label="สีของช่องจอด">
                {LEGEND.map((l) => (
                  <li key={l.tone} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-sm", l.dot)} aria-hidden /> {toneLabel[l.tone]}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="ควบคุมมุมมอง">
                <Chip active={!top && !selected} onClick={() => setOverview("iso")}>มุมเฉียง</Chip>
                <Chip active={top && !selected} onClick={() => setOverview("top")}>มุมบน</Chip>
                <Chip active={wallsOpen} onClick={() => setWallsOpen((v) => !v)}>ผนังโปร่ง</Chip>
                <Chip active={listOpen} onClick={() => setListOpen((v) => !v)}>รายการรถ ({cars.length})</Chip>
              </div>
            </div>

            {/* floating plate over the selected car, so the number reads from any angle */}
            <div ref={label} className="pointer-events-none absolute start-0 top-0 z-10 opacity-0 transition-opacity" aria-hidden>
              {selCar && <PlateBadge plate={selCar.row.plate} province={selCar.row.plateProvince} size="sm" className="shadow-theme-md" />}
            </div>
            <div ref={tip} hidden className="pointer-events-none absolute z-20 max-w-xs rounded-lg bg-gray-900/92 px-2.5 py-1.5 text-theme-xs text-white shadow-theme-md" role="tooltip" />

            {!selSlot && (
              <div className="absolute end-3 top-3 bottom-3 z-10 hidden w-88 md:block">
                <LotSummary data={data} cars={cars} slots={slots} unplaced={unplaced} onSelect={(key) => select(key)} onOpenList={() => setListOpen(true)} />
              </div>
            )}

            {selSlot && (
              <div className="absolute inset-x-0 bottom-0 z-20 max-h-[62%] md:inset-x-auto md:end-3 md:top-3 md:bottom-3 md:max-h-none md:w-88">
                <CarCard
                  slot={selSlot}
                  car={selCar}
                  data={data}
                  editable={editable}
                  unplaced={unplaced}
                  view={view}
                  onClose={() => select(null)}
                  onView={(v) => selected && select(selected, v)}
                  onStep={step}
                  onPay={(c) => c.unpaid[0] && setPay({ row: c.row, month: c.unpaid[0].month, paid: c.unpaid[0].paid })}
                  onEdit={(row) => setRowEdit({ row })}
                  onEditCustomer={setCustomerEdit}
                  onAdd={(slot, zoneId) => setRowEdit({ row: null, slot, zoneId })}
                  onAssign={assign}
                  onSelectKey={(k) => select(k)}
                />
              </div>
            )}
          </>
        )}
      </div>

      {customerEdit && <CustomerSheet state={{ customer: customerEdit }} onClose={() => setCustomerEdit(null)} editable={editable} admin={user?.role === "admin"} />}
      <PayDialog target={pay} onClose={() => setPay(null)} />
      <RowSheet
        year={data.today.year}
        row={rowEdit?.row ?? null}
        open={Boolean(rowEdit)}
        onClose={() => setRowEdit(null)}
        canDelete={editable}
        presetSlot={rowEdit?.slot}
        presetZone={rowEdit?.zoneId}
      />
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-lg border px-3 text-theme-sm font-medium backdrop-blur",
        active
          ? "border-brand-500 bg-brand-500 text-on-brand"
          : "border-gray-200 bg-white/92 text-gray-700 hover:bg-white dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-300 dark:hover:bg-gray-800",
      )}
    >
      {children}
    </button>
  );
}
