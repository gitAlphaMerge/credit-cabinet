import { Check, Sparkles, ShieldCheck, PenLine } from "lucide-react";
export type CreditStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "waiting-data";
};

/** MVP 1 sphere/orbits, driven by actual work. No clock or invented percentage. */
export function CreditMotion({
  title,
  steps,
  variant = "review",
}: {
  title: string;
  steps: CreditStep[];
  variant?: "selection" | "review" | "signature";
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
      data-running={active}
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
