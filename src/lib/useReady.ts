import { useEffect, useState } from "react";
import { reducedMotion } from "./motion";

/** false on the first paint, true a moment later: lets a width or height transition from empty to full. */
export function useReady() {
  const [ready, setReady] = useState(reducedMotion());
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}
