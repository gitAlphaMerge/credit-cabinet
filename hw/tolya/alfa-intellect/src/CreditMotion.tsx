import { Check, Sparkles, ShieldCheck, PenLine } from "lucide-react";
import { LivePattern } from "./LivePattern";
import { useTransitionProgress } from "./motion";
export type CreditStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "waiting-data";
};

export const transitionSteps = {
  selection: [
    "Смотрим выписку",
    "Считаем поток",
    "Сверяем с условиями 6 продуктов",
    "Готовим варианты",
  ],
  review: [
    "Проверяем документы",
    "Считаем готовность",
    "Сверяем стоп-факторы",
    "Формируем решение",
  ],
} as const;

export function transitionStepStates(
  kind: "selection" | "review",
  completed: number,
  reduced: boolean,
): CreditStep[] {
  return transitionSteps[kind].map((label, index) => ({
    id: String(index),
    label,
    status: reduced
      ? "pending"
      : index < completed
        ? "done"
        : index === completed
          ? "running"
          : "pending",
  }));
}

export function CreditTransition({
  kind,
  ready,
  onFinish,
  error,
}: {
  kind: "selection" | "review";
  ready: boolean;
  onFinish: () => void;
  error?: string;
}) {
  const { completed, reduced } = useTransitionProgress(ready && !error, onFinish);
  if (error) return null;
  return (
    <section
      className="credit-transition"
      aria-busy={!ready}
      data-reduced-motion={reduced}
    >
      <div className="credit-transition-pattern" aria-hidden="true">
        <LivePattern showCaption={false} />
      </div>
      <CreditMotion
        title={kind === "selection" ? "Подбираем варианты" : "Банк рассматривает"}
        variant={kind}
        steps={transitionStepStates(kind, completed, reduced)}
        staticDisplay={reduced}
      />
    </section>
  );
}

/** MVP 1 sphere/orbits, driven by actual work. No clock or invented percentage. */
export function CreditMotion({
  title,
  steps,
  variant = "review",
  staticDisplay = false,
}: {
  title: string;
  steps: CreditStep[];
  variant?: "selection" | "review" | "signature";
  staticDisplay?: boolean;
}) {
  const done = steps.filter((s) => s.status === "done").length;
  const active =
    done < steps.length &&
    !steps.some((s) => s.status === "error" || s.status === "waiting-data");
  const current =
    steps.find((s) => s.status === "running") ??
    steps.find((s) => s.status === "error" || s.status === "waiting-data");
  const Icon =
    variant === "selection"
      ? Sparkles
      : variant === "signature"
        ? PenLine
        : ShieldCheck;
  return (
    <div
      className={"credit-motion credit-motion-" + variant}
      data-running={active && !staticDisplay}
    >
      <div className="credit-motion-visual" aria-hidden="true">
        <div className="preparation-orbit">
          <i />
          <i />
          <i />
        </div>
        <div className="preparation-sphere">
          <div className="credit-motion-wave">
            <i />
            <i />
          </div>
          <span className="sphere-shine" />
          <div className="sphere-number">
            <Icon size={42} strokeWidth={1.4} />
            <strong>
              {done}
              <small> / {steps.length}</small>
            </strong>
            <span>этапов завершено</span>
          </div>
        </div>
      </div>
      {variant === "selection" ? <h1>{title}</h1> : <h2>{title}</h2>}
      <p className="credit-motion-status" role="status">
        {current?.label ??
          (done === steps.length ? "Готово" : "Готовим проверку")}
      </p>
      <ol className="credit-motion-stages" aria-label="Этапы обработки">
        {steps.map((s) => (
          <li
            key={s.id}
            className={s.status}
            aria-current={s.status === "running" ? "step" : undefined}
          >
            <span className="credit-step-mark" aria-hidden="true">
              {s.status === "done" ? <Check size={16} /> : <i />}
            </span>
            <div>
              <strong>{s.label}</strong>
              <small>
                {
                  {
                    pending: "Ожидает",
                    running: "Выполняется",
                    done: "Готово",
                    error: "Не удалось завершить",
                    "waiting-data": "Нужны сведения",
                  }[s.status]
                }
              </small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
