import { animate, reducedMotion } from "@/lib/motion";
import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  format?: (v: number) => string; // how the number is written (money, %, "3 คัน"...)
  className?: string;
  delay?: number;
  duration?: number;
}

const whole = (v: number) => String(Math.round(v));

/**
 * A number that runs up from 0 to its real value when it first appears, and from the old value to the new one when it
 * changes. It writes the text straight into the element (no re-render per frame), so a table full of them stays smooth.
 */
export default function CountUp({ value, format = whole, className, delay = 150, duration = 1100 }: CountUpProps) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null); // what is on screen now (null = nothing yet: start at 0)
  const fmt = useRef(format);
  useEffect(() => {
    fmt.current = format;
  });
  const [initial] = useState(() => format(reducedMotion() ? value : 0));

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const from = shown.current ?? 0;
    if (reducedMotion() || from === value) {
      node.textContent = fmt.current(value);
      shown.current = value;
      return;
    }
    const stop = animate(
      (p) => {
        const v = from + (value - from) * p;
        shown.current = p === 1 ? value : v;
        node.textContent = fmt.current(p === 1 ? value : v);
      },
      { delay: shown.current == null ? delay : 0, duration },
    );
    return stop;
  }, [value, delay, duration]);

  return <span ref={el} className={className}>{initial}</span>;
}
