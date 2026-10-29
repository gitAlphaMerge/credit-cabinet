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

/** Four visible checks with a short 900 ms minimum; the request controls completion. */
export function useTransitionProgress(ready: boolean, onFinish: () => void) {
  const reduced = useReducedMotion();
  const [completed, setCompleted] = useState(0);
  const finished = useRef(false);
  const transitionStarted = useRef(Date.now());
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
    const delay = reduced ? 0 : Math.max(0, 900 - (Date.now() - transitionStarted.current));
    const timer = setTimeout(() => {finished.current = true; onFinish();}, delay);
    return () => clearTimeout(timer);
  }, [completed, onFinish, ready, reduced, finished]);
  return { completed, reduced };
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const prefersReduced = () =>
  typeof matchMedia !== "undefined" && matchMedia(REDUCED).matches;

/** Один элемент: класс появления ставится только при живой анимации; клики не ждут. */
export function useReveal<T extends Element = HTMLDivElement>() {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (reduced || shown || !node) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setShown(true);
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, shown]);
  return {
    ref,
    reduced,
    className: reduced ? "" : shown ? "ai-reveal ai-in" : "ai-reveal",
  };
}

// Блоки экранов: прямые дети контейнеров и самостоятельные карточки.
const BLOCKS = [
  ".hero > *, .section > *, .how-section > *, .trust-section > *, .benefit-strip > *, .final-cta > *",
  ".onboard-main > *, .onboard-grid > *, .journey-onboarding-progress",
  ".funding-surface > *, .mvp-products > *, .mvp-account, .mvp-notice, .request-summary",
  ".manager-queue > *, .manager-columns > * > *, .manager-memo-block",
  ".panel, .cv-card, .feature-card, .dossier-card, .document-card, .company-card, .forecast-card, .guided-card",
  ".credit-form-panel, .credit-agent-panel, article.message, .starter-prompts > *, .welcome-orb",
].join(", ");
const SKIP = ".live-pattern, .modal, .toast, [data-ai-static]";
const STEP = 50;

/**
 * Все экраны сразу: новые блоки встают в очередь, на входе в экран выезжают каскадом.
 * Вектор смещения сходится к центру: левые блоки чуть слева, правые чуть справа, сумма по горизонтали ноль.
 */
export function useScreenReveal() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined") return;
    const root = document.body;
    const seen = new WeakSet<Element>();
    const show = (el: HTMLElement, order: number) => {
      const box = el.getBoundingClientRect();
      const offset = (box.left + box.width / 2 - innerWidth / 2) / innerWidth;
      el.style.setProperty("--ai-dx", (Math.max(-0.5, Math.min(0.5, offset)) * 24).toFixed(1) + "px");
      el.style.setProperty("--ai-d", Math.min(order, 10) * STEP + "ms");
      el.dataset.aiReveal = "in";

    };
    const observer = new IntersectionObserver((entries) => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        show(entry.target as HTMLElement, order++);
      }
    });
    const scan = (scope: ParentNode) => {
      for (const el of scope.querySelectorAll<HTMLElement>(BLOCKS)) {
        if (seen.has(el) || el.closest(SKIP)) continue;
        seen.add(el);
        if (el.parentElement?.closest('[data-ai-reveal="wait"]'))
          continue;
        el.dataset.aiReveal = "wait";
        observer.observe(el);
      }
    };
    scan(root);
    const mutations = new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement) scan(n.parentElement ?? n);
    });
    mutations.observe(root, { childList: true, subtree: true });
    // Страховка: ничего не остаётся невидимым, если наблюдатель не сработал (фоновая вкладка, печать).
    const rescue = setInterval(() => {
      for (const el of root.querySelectorAll<HTMLElement>('[data-ai-reveal="wait"]')) {
        const box = el.getBoundingClientRect();
        if (box.bottom > 0 && box.top < innerHeight) show(el, 0);
      }
    }, 1200);
    return () => {
      mutations.disconnect();
      observer.disconnect();
      clearInterval(rescue);
      for (const el of root.querySelectorAll<HTMLElement>("[data-ai-reveal]")) el.dataset.aiReveal = "in";
    };
  }, [reduced]);
}
