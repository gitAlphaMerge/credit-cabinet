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

const EASE_OUT = (t: number) => 1 - (1 - t) ** 3;
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
const HEADINGS = "h1, h2";
const SKIP = ".live-pattern, .modal, .toast, [data-ai-static]";
const SUM = /^\d{1,3}(?:[\s  ]\d{3})*[\s  ]?₽$/;
const STEP = 50;

function countUp(node: Text) {
  const final = node.nodeValue ?? "";
  if (!SUM.test(final.trim())) return;
  const target = Number(final.replace(/\D/g, ""));
  const tail = final.slice(final.search(/\d[^\d]*$/) + 1);
  if (!target) return;
  const format = new Intl.NumberFormat("ru-RU");
  const start = performance.now();
  let written = final;
  const frame = (now: number) => {
    // React переписал текст сам: свою анимацию бросаем.
    if (node.nodeValue !== written) return;
    const p = Math.min(1, (now - start) / 600);
    written = p === 1 ? final : format.format(Math.round(target * EASE_OUT(p))) + tail;
    node.nodeValue = written;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function splitWords(heading: HTMLElement) {
  // Безопасно только для заголовка из одной строки: React обновит его целиком через textContent.
  const only = heading.childNodes;
  if (heading.closest("[aria-live], [role=status]")) return;
  if (only.length !== 1 || only[0].nodeType !== Node.TEXT_NODE) return;
  const words = (only[0].nodeValue ?? "").split(/(\s+)/);
  if (words.filter((w) => w.trim()).length < 2) return;
  heading.setAttribute("aria-label", heading.textContent ?? "");
  heading.textContent = "";
  let index = 0;
  for (const word of words) {
    if (!word.trim()) {
      heading.append(word);
      continue;
    }
    const span = document.createElement("span");
    span.className = "ai-word";
    span.setAttribute("aria-hidden", "true");
    span.style.setProperty("--ai-w", String(index++));
    span.textContent = word;
    heading.append(span);
  }
}

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
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode())
        if (!(n.parentElement?.closest("table, input, textarea, select"))) countUp(n as Text);
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
      for (const el of scope.querySelectorAll<HTMLElement>(`${BLOCKS}, ${HEADINGS}`)) {
        if (seen.has(el) || el.closest(SKIP)) continue;
        seen.add(el);
        if (el.matches(HEADINGS)) splitWords(el);
        if (!el.matches(BLOCKS) || el.parentElement?.closest('[data-ai-reveal="wait"]'))
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
