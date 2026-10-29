import { useEffect, useRef, type ReactNode } from "react";
import { Calculator, ClipboardList, Pencil } from "lucide-react";
import { useReducedMotion } from "./motion";
import type { CreditStep } from "./CreditMotion";

/** Particle physics is shared with the original standalone v2 screen. */
function LoadingPattern({ compact }: { compact: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const engineWindow = window as Window & { AlfaLoadingPattern?: { mountLoadingPattern(canvas: HTMLCanvasElement, options: { compact: boolean }): () => void } };
    const mount = () => {
      if (!disposed && canvas.current && engineWindow.AlfaLoadingPattern)
        cleanup = engineWindow.AlfaLoadingPattern.mountLoadingPattern(canvas.current, { compact });
    };
    if (engineWindow.AlfaLoadingPattern) mount();
    else {
      window.addEventListener("alfa-loading-pattern-ready", mount, { once: true });
      if (!document.querySelector("script[data-loading-pattern]")) {
        const script = document.createElement("script");
        script.type = "module";
        script.src = "/v2/loading-pattern.js";
        script.dataset.loadingPattern = "true";
        document.head.append(script);
      }
    }
    return () => { disposed = true; cleanup?.(); window.removeEventListener("alfa-loading-pattern-ready", mount); };
  }, [compact]);
  return <canvas ref={canvas} className="push-loading-pattern" aria-hidden="true" />;
}

/** One loading language: the v2 mascot, truthful progress, and a quiet particle field. */
export function LoadingScreen({
  title = "Пуш уже занимается задачей",
  message = "Готовим всё необходимое",
  steps = [],
  compact = false,
  fullPage = false,
  staticDisplay = false,
  children,
}: {
  title?: string;
  message?: string;
  steps?: CreditStep[];
  compact?: boolean;
  fullPage?: boolean;
  staticDisplay?: boolean;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion() || staticDisplay;
  const done = steps.filter((step) => step.status === "done").length;
  const current = steps.find((step) => ["running", "error", "waiting-data"].includes(step.status));
  const stopped = steps.some((step) => ["error", "waiting-data"].includes(step.status));
  return (
    <section
      className={"push-loading" + (compact ? " push-loading-compact" : "") + (fullPage ? " push-loading-page" : "")}
      aria-busy={!stopped && (!steps.length || done < steps.length)}
      data-reduced-motion={reduced}
      data-running={!reduced && !stopped && (!steps.length || done < steps.length)}
    >
      <LoadingPattern compact={compact} />
      <div className="push-loading-content">
        <div className="push-loading-character" aria-hidden="true">
          <img src="/v2/img/push.png" alt="" width="280" height="280" />
          <span className="push-loading-prop push-loading-clipboard"><ClipboardList /></span>
          <span className="push-loading-prop push-loading-calculator"><Calculator /></span>
          <span className="push-loading-prop push-loading-pencil"><Pencil /></span>
        </div>
        <div className="push-loading-copy">
          {!compact && <span className="push-loading-eyebrow">ПОМОЩНИК АЛЬФА-БИЗНЕСА</span>}
          <h2>{title}</h2>
          <p role="status">{current?.label ?? (steps.length && done === steps.length ? "Готово" : message)}</p>
          {steps.length > 0 ? (
            <>
              <div className="push-loading-progress" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
                {steps.map((step) => <i key={step.id} data-state={step.status} />)}
              </div>
              <span className="push-loading-count"><strong>{done}<small> / {steps.length}</small></strong> этапов завершено</span>
              {!compact && <ol className="push-loading-stages" aria-label="Этапы обработки">
                {steps.map((step) => <li key={step.id} className={step.status} aria-current={step.status === "running" ? "step" : undefined}>
                  <span aria-hidden="true">{step.status === "done" ? "✓" : step.status === "error" ? "!" : "·"}</span>
                  {step.label}
                  {step.status === "waiting-data" && <small>Нужны сведения</small>}
                </li>)}
              </ol>}
            </>
          ) : <span className="push-loading-dots" aria-hidden="true"><i /><i /><i /></span>}
          {children}
        </div>
      </div>
    </section>
  );
}
