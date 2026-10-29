import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";
export const LOADING_HOLD_MS = 720;
export const TRANSITION_HOLD_MS = 900;
/** Keep the illustration visible after fast work; actual request/error states stay intact. */
export function useMinimumLoading(active: boolean, minimum = LOADING_HOLD_MS) {
  const reduced = useReducedMotion();
  const started = useRef<number | null>(active ? Date.now() : null);
  const [held, setHeld] = useState(active);
  useEffect(() => {
    if (active) {started.current ??= Date.now(); setHeld(true); return;}
    if (started.current === null) return;
    const delay = reduced ? 0 : Math.max(0, minimum - (Date.now() - started.current));
    const timer = setTimeout(() => {started.current = null; setHeld(false);}, delay);
    return () => clearTimeout(timer);
  }, [active, minimum, reduced]);
  return active || held;
}
