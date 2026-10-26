import { useEffect, useRef, useState } from "react";
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Four visible checks: about 2.4 seconds for a normal request, faster once ready. */
export function useTransitionProgress(ready: boolean, onFinish: () => void) {
  const reduced = useReducedMotion();
  const [completed, setCompleted] = useState(0);
  const finished = useRef(false);
  useEffect(() => {
    if (reduced || completed === 4) return;
    const timer = setTimeout(
      () => setCompleted((value) => Math.min(value + 1, ready ? 4 : 3)),
      ready ? 80 : 600,
    );
    return () => clearTimeout(timer);
  }, [completed, ready, reduced]);
  useEffect(() => {
    if ((!reduced && completed !== 4) || !ready || finished.current) return;
    finished.current = true;
    onFinish();
  }, [completed, onFinish, ready, reduced, finished]);
  return { completed, reduced };
}
