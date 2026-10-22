import { useEffect, useState } from "react";

interface VerifyOverlayProps {
  state: "checking" | "ok"; // checking = spinning ring while the server answers; ok = tick, then the car
  onDone: () => void;
}

type Phase = "ring" | "check" | "car" | "boom";

/** Green circle -> tick -> a green sports car drives through it -> onDone. About a second in all. */
export default function VerifyOverlay({ state, onDone }: VerifyOverlayProps) {
  const [phase, setPhase] = useState<Phase>("ring");

  useEffect(() => {
    if (state !== "ok") return;
    const t = [
      window.setTimeout(() => setPhase("check"), 0),
      window.setTimeout(() => setPhase("car"), 300),
      window.setTimeout(() => setPhase("boom"), 300 + 470),
      window.setTimeout(onDone, 300 + 470 + 330),
    ];
    return () => t.forEach(window.clearTimeout);
  }, [state, onDone]);

  const ok = phase !== "ring";
  const hit = phase === "boom";
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-white dark:bg-gray-900" role="status" aria-live="polite">
      <span className="sr-only">{ok ? "ยืนยันแล้ว กำลังเข้าสู่ระบบ" : "กำลังตรวจสอบ"}</span>
      <div className="relative size-28">
        {hit && <span className="vf-ripple absolute inset-0 rounded-full border-2 border-success-500" />}
        <div className={`absolute inset-0 ${hit ? "vf-burst" : ""}`}>
          {!ok ? (
            <span className="vf-pop absolute inset-0 rounded-full border-4 border-success-500/25">
              <span className="vf-spin absolute -inset-1 rounded-full border-4 border-transparent border-t-success-500" />
            </span>
          ) : (
            <span className="vf-pop absolute inset-0 flex items-center justify-center rounded-full bg-success-500 shadow-[0_10px_30px_-8px_var(--color-success-500)]">
              <svg viewBox="0 0 24 24" className="size-14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path className="vf-check text-white" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          )}
        </div>
      </div>
      {(phase === "car" || hit) && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -mt-7 -ms-[13.2rem] w-[9.5rem]">
          <div className={hit ? "vf-through" : "vf-drive"}>
            <SportsCar />
          </div>
        </div>
      )}
    </div>
  );
}

// A low green sports car, side view, nose to the right.
function SportsCar() {
  return (
    <svg viewBox="0 0 160 60" className="w-full" aria-hidden>
      <g className="stroke-success-400" strokeWidth="2.5" strokeLinecap="round" opacity="0.7">
        <path d="M-14 22h-22M-8 32h-30M-12 42h-18" />
      </g>
      <path d="M6 42c0-6 8-9 24-11l20-14c4-3 10-4 16-4h30c8 0 14 3 20 10l22 5c12 2 18 5 18 12v4H6z" className="fill-success-500" />
      <path d="M54 30l12-11h27l13 11z" className="fill-gray-950/75" />
      <path d="M68 19v11M96 19v11" className="stroke-success-500" strokeWidth="2" />
      <rect x="148" y="33" width="9" height="4.5" rx="2" className="fill-gold-200" />
      <rect x="3" y="33" width="5" height="4.5" rx="2" className="fill-error-500" />
      <circle cx="36" cy="46" r="11" className="fill-gray-950" />
      <circle cx="36" cy="46" r="4.5" className="fill-gray-300" />
      <circle cx="122" cy="46" r="11" className="fill-gray-950" />
      <circle cx="122" cy="46" r="4.5" className="fill-gray-300" />
    </svg>
  );
}
