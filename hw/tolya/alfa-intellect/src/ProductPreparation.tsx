import { Check, LoaderCircle } from "lucide-react";
import { Brand } from "./ui";
const steps = [
  "Анализируем вашу потребность",
  "Сравниваем условия кредитных продуктов",
  "Подбираем подходящий инструмент",
];
/** Progress follows validation, backend recommendation and state restoration; no timer. */
export function ProductPreparation({ stage }: { stage: number }) {
  return (
    <div className="onboarding journey-onboarding">
      <header className="public-header">
        <Brand />
      </header>
      <main className="product-preparation" aria-live="polite" aria-busy="true">
        <div className="preparation-orbit" aria-hidden="true">
          <LoaderCircle />
        </div>
        <h1>Подбираем финансирование для вашего бизнеса</h1>
        <ol>
          {steps.map((step, index) => (
            <li
              key={step}
              className={
                index < stage ? "done" : index === stage ? "running" : ""
              }
            >
              {index < stage ? (
                <Check size={18} />
              ) : index === stage ? (
                <span className="mvp-spinner" />
              ) : (
                <span className="preparation-dot" />
              )}
              {step}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
