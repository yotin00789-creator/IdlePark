import type { Zone } from "@/lib/dataStore";
import { cn } from "@/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { slotLabel } from "../../../shared/lot";
import { LotScene, type SlotsFile } from "./LotScene";

interface SlotPicker3DProps {
  zones: Zone[]; // all zones, to colour the slots that already belong somewhere
  zoneId: number | null; // the zone being edited (null = a new one)
  selected: string[];
  disabled?: boolean;
  onToggle: (slotId: string) => void;
  holders?: Record<string, string>; // slot -> who rents it, for the hover note
}

const GOLD: [number, number] = [0xf2c200, 0.72];
const FREE: [number, number] = [0x94a3b8, 0.22];
const OTHER: [number, number] = [0x64748b, 0.4];
const PRIVATE: [number, number] = [0x7a5af8, 0.45];
const CLOSED: [number, number] = [0x475467, 0.6];

const KEY = [
  { cls: "bg-gold-400", text: "อยู่ในโซนนี้ (เลือกแล้ว)" },
  { cls: "bg-slate-500", text: "อยู่โซนอื่น (กดเพื่อย้ายมา)" },
  { cls: "bg-violet-500", text: "Private" },
  { cls: "bg-gray-700", text: "ปิดใช้งาน" },
  { cls: "bg-slate-300", text: "ยังไม่อยู่โซนไหน" },
] as const;

/** The lot in 3D, so the slots of a zone are picked by clicking them on the map. */
export default function SlotPicker3D({ zones, zoneId, selected, disabled, onToggle, holders }: SlotPicker3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const scene = useRef<LotScene | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"top" | "iso">("top");
  const toggle = useRef(onToggle);
  const live = useRef({ zones, zoneId, selected, holders, disabled });
  useEffect(() => {
    toggle.current = onToggle;
    live.current = { zones, zoneId, selected, holders, disabled };
  });

  // slot -> colour: mine in gold, other zones muted, private violet, closed dark, free pale
  const colours = useMemo(() => {
    const map: Record<string, [number, number]> = {};
    for (const z of zones) {
      if (z.id === zoneId) continue;
      for (const id of z.slotIds) map[id] = !z.isActive ? CLOSED : z.access === "private" ? PRIVATE : OTHER;
    }
    return map;
  }, [zones, zoneId]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ctl = new AbortController();
    let s: LotScene | null = null;
    fetch("/3d/slots.json", { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SlotsFile>) : Promise.reject(new Error("โหลดข้อมูลผังไม่สำเร็จ"))))
      .then((layout) => {
        if (ctl.signal.aborted) return;
        s = new LotScene(
          el,
          layout,
          {
            onPick: (id) => {
              const slot = id.split("#")[0];
              if (!live.current.disabled) toggle.current(slot);
            },
            onHover: (id, cx, cy) => {
              const t = tip.current;
              const box = el.getBoundingClientRect();
              if (!t) return;
              if (!id) return void (t.hidden = true);
              const slot = id.split("#")[0];
              const z = live.current.zones.find((x) => x.slotIds.includes(slot) && x.id !== live.current.zoneId);
              const mine = live.current.selected.includes(slot);
              const who = live.current.holders?.[slot];
              t.textContent = `${slotLabel(slot)} · ${mine ? "ในโซนนี้" : z ? `โซน ${z.name}` : "ยังไม่อยู่โซนไหน"}${who ? ` · ${who}` : ""}`;
              t.style.left = `${Math.min(cx - box.left + 12, box.width - 170)}px`;
              t.style.top = `${cy - box.top + 12}px`;
              t.hidden = false;
            },
            onLabel: () => {},
            onReady: () => {
              setReady(true);
              s?.setOverview("top", false);
            },
            onError: (m) => setError(m),
          },
          "/3d",
          { cars: false },
        );
        scene.current = s;
        void s.load();
      })
      .catch((e) => !ctl.signal.aborted && setError(e instanceof Error ? e.message : "เปิด 3 มิติไม่ได้"));
    return () => {
      ctl.abort();
      scene.current = null;
      s?.dispose();
    };
  }, []);

  // repaint whenever the choice or the other zones change
  useEffect(() => {
    const s = scene.current;
    if (!s || !ready) return;
    const map: Record<string, [number, number]> = { ...colours };
    s.setPadOverride({ ...allFree(s), ...map, ...Object.fromEntries(selected.map((id) => [id, GOLD])) });
  }, [ready, colours, selected]);

  useEffect(() => {
    if (ready) scene.current?.setOverview(view, true);
  }, [view, ready]);

  if (error) {
    return <p className="rounded-lg bg-gray-50 px-3 py-3 text-theme-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">เปิดภาพ 3 มิติไม่ได้ ({error}) เลือกช่องจากปุ่มด้านล่างแทนได้</p>;
  }
  return (
    <div>
      <div className="relative h-80 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:h-96 dark:border-gray-700 dark:bg-gray-800">
        <div ref={host} className="absolute inset-0" />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-theme-sm text-gray-500 dark:text-gray-400">กำลังโหลดผังที่จอด…</p>}
        <div ref={tip} hidden className="pointer-events-none absolute z-10 max-w-52 rounded-md bg-gray-900/90 px-2 py-1 text-theme-xs text-white" />
        <div className="absolute start-2 top-2 inline-flex rounded-lg bg-white/90 p-0.5 shadow-theme-xs backdrop-blur dark:bg-gray-900/90" role="group" aria-label="มุมมอง">
          {(["top", "iso"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-7 rounded-md px-2.5 text-theme-xs font-medium", view === v ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-300")}>
              {v === "top" ? "มุมบน" : "มุมเฉียง"}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-theme-xs text-gray-500 dark:text-gray-400">
        {KEY.map((k) => (
          <li key={k.text} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", k.cls)} aria-hidden />{k.text}</li>
        ))}
      </ul>
    </div>
  );
}

// every slot starts pale; zones and the choice paint over it
const allFree = (s: LotScene): Record<string, [number, number]> => Object.fromEntries(s.slotIds().map((id) => [id, FREE]));
