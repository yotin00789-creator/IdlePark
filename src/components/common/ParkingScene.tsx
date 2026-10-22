import { cn } from "@/utils";
import { useCallback, useEffect, useRef, useState } from "react";

// A small looping parking-lot scene, seen from above: cars drive in from the right and park, wait,
// back out and leave; others just drive past. The timing is random, so no two minutes look the same.
//
// Cars never touch: the upper lane (everything that turns into or out of a bay, plus cars passing to the
// left) and the lower lane (cars passing to the right) are each used by ONE car at a time. A car waits
// off-screen until its lane is free, so there is no overtaking, no crossing and no one reversing into traffic.

const BAY_W = 60; // distance between bays
const BAY_Y = 36; // a parked car's centre
const LANE_IN = 96; // lane that drives left (entering, leaving)
const LANE_OUT = 130; // lane that drives right
const H = 156;

const BODIES = ["fill-gold-400", "fill-gray-100", "fill-gray-400", "fill-error-400", "fill-success-400", "fill-gold-200"] as const;

type Pose = { x: number; y: number; r: number };
const tf = (p: Pose) => `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg)`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs jobs one after another: the next one starts only when the previous has fully finished. */
class Lane {
  private tail: Promise<unknown> = Promise.resolve();
  run(job: () => Promise<void>) {
    const p = this.tail.then(job, job);
    this.tail = p.then(() => wait(450), () => wait(450)); // a short breather between cars
    return p;
  }
}

interface Spec {
  id: number;
  body: (typeof BODIES)[number];
  kind: "park" | "pass" | "parked"; // parked = already there when the scene starts
  bay: number;
  dir: 1 | -1; // pass: -1 drives left, 1 drives right
}

interface SceneProps {
  bays?: number;
  className?: string;
}

export default function ParkingScene({ bays = 3, className }: SceneProps) {
  const W = bays * BAY_W + 36;
  const [cars, setCars] = useState<Spec[]>([]);
  const taken = useRef(new Set<number>());
  const seq = useRef(0);
  const moving = useRef(0);
  const [lanes] = useState(() => ({ upper: new Lane(), lower: new Lane() }));

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first: Spec[] = [0, bays - 1].map((bay) => ({ id: ++seq.current, body: BODIES[(bay + 1) % BODIES.length], kind: "parked", bay, dir: -1 }));
    first.forEach((c) => taken.current.add(c.bay));
    setCars(first);
    if (still) return;

    let alive = true;
    const loop = async () => {
      await wait(1800);
      while (alive) {
        const free = Array.from({ length: bays }, (_, i) => i).filter((i) => !taken.current.has(i));
        if (moving.current < 3) {
          const park = free.length > 0 && Math.random() < 0.55;
          const bay = park ? free[Math.floor(Math.random() * free.length)] : 0;
          if (park) taken.current.add(bay);
          moving.current++;
          const spec: Spec = { id: ++seq.current, body: BODIES[Math.floor(Math.random() * BODIES.length)], kind: park ? "park" : "pass", bay, dir: Math.random() < 0.5 ? -1 : 1 };
          setCars((l) => [...l, spec]);
        }
        await wait(rand(2200, 4800));
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [bays]);

  const done = useCallback((id: number, bay: number | null, wasMoving: boolean) => {
    if (bay != null) taken.current.delete(bay);
    if (wasMoving) moving.current = Math.max(0, moving.current - 1);
    setCars((l) => l.filter((c) => c.id !== id));
  }, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("block w-full select-none", className)} role="img" aria-label="ภาพเคลื่อนไหวรถเข้าออกที่จอด" overflow="hidden">
      {/* bays */}
      {Array.from({ length: bays }, (_, i) => {
        const x = 18 + i * BAY_W;
        return <path key={i} d={`M${x} 64V8H${x + 46}V64`} className="fill-none stroke-gold-400/70" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="7 6" />;
      })}
      {/* lanes */}
      <path d={`M4 ${(LANE_IN + LANE_OUT) / 2}H${W - 4}`} className="fill-none stroke-gold-400/45" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="16 10" />
      {cars.map((c) => (
        <Vehicle key={c.id} spec={c} W={W} lanes={lanes} onDone={done} />
      ))}
    </svg>
  );
}

function Vehicle({ spec, W, lanes, onDone }: { spec: Spec; W: number; lanes: { upper: Lane; lower: Lane }; onDone: (id: number, bay: number | null, wasMoving: boolean) => void }) {
  const el = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = el.current;
    if (!g) return;
    let alive = true;
    const running: Animation[] = [];
    const go = async (from: Pose, to: Pose, ms: number, easing = "ease-in-out") => {
      if (!alive) return;
      const a = g.animate([{ transform: tf(from) }, { transform: tf(to) }], { duration: ms, easing, fill: "forwards" });
      running.push(a);
      await a.finished.catch(() => undefined);
    };
    const bx = 41 + spec.bay * BAY_W; // centre of the bay
    const park: Pose = { x: bx, y: BAY_Y, r: 270 };
    const apron: Pose = { x: bx, y: 82, r: 270 };

    const run = async () => {
      if (spec.kind === "pass") {
        const left = spec.dir === -1;
        const y = left ? LANE_IN : LANE_OUT;
        const a: Pose = { x: left ? W + 30 : -30, y, r: left ? 180 : 0 };
        const b: Pose = { x: left ? -30 : W + 30, y, r: a.r };
        g.style.transform = tf(a);
        await (left ? lanes.upper : lanes.lower).run(async () => {
          if (alive) await go(a, b, 3600, "linear");
        });
        if (alive) onDone(spec.id, null, true);
        return;
      }
      if (spec.kind === "park") {
        const start: Pose = { x: W + 30, y: LANE_IN, r: 180 };
        const before: Pose = { x: bx + 34, y: LANE_IN, r: 180 };
        g.style.transform = tf(start);
        // the upper lane is ours until the car sits in its bay
        await lanes.upper.run(async () => {
          if (!alive) return;
          await go(start, before, 2200, "cubic-bezier(0.2, 0.6, 0.3, 1)");
          await go(before, park, 1300);
        });
        if (alive) onDone(-1, null, true); // parked: no longer "moving", the scene may bring other cars
      } else {
        g.style.transform = tf(park);
      }
      await wait(rand(4000, 9000));
      if (!alive) return;
      // leaving: wait for the upper lane, back out, turn left, drive off; nobody else is on that lane meanwhile
      await lanes.upper.run(async () => {
        if (!alive) return;
        const turn: Pose = { x: bx - 36, y: LANE_IN, r: 180 };
        await go(park, apron, 900, "ease-in");
        await go(apron, turn, 1000);
        await go(turn, { x: -30, y: LANE_IN, r: 180 }, 2200, "ease-in");
      });
      if (alive) onDone(spec.id, spec.bay, false);
    };
    void run();
    return () => {
      alive = false;
      running.forEach((a) => a.cancel());
    };
  }, [spec, W, lanes, onDone]);

  return (
    <g ref={el} style={{ transform: tf({ x: -60, y: -60, r: 0 }) }}>
      <rect x={-20} y={-10} width={40} height={20} rx={6} className={spec.body} />
      <rect x={-8} y={-7.5} width={14} height={15} rx={3} className="fill-gray-950/70" />
      <rect x={8} y={-7} width={5} height={14} rx={1.8} className="fill-gray-950/55" />
      <rect x={17.5} y={-8.5} width={3} height={4.5} rx={1.5} className="fill-gold-100" />
      <rect x={17.5} y={4} width={3} height={4.5} rx={1.5} className="fill-gold-100" />
      <rect x={-20.5} y={-8.5} width={2.5} height={4.5} rx={1.2} className="fill-error-500" />
      <rect x={-20.5} y={4} width={2.5} height={4.5} rx={1.2} className="fill-error-500" />
    </g>
  );
}
