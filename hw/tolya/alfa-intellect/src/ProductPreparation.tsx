import { ThemeToggle } from "./ThemeToggle";
import { PaletteToggle } from "./PaletteToggle";
import { Brand } from "./ui";
import { RestartJourney } from "./RestartJourney";
import { CreditMotion } from "./CreditMotion";
const steps = [
  "Проверяем ответы о вашей задаче",
  "Сохраняем запрос и подбираем продукт",
  "Открываем персональную рекомендацию",
];
/** Progress follows validation, backend recommendation and state restoration; no timer. */
export function ProductPreparation({ stage }: { stage: number }) {
  return (
    <div className="onboarding journey-onboarding">
      <header className="public-header">
        <a href="/" aria-label="На главную">
          <Brand />
        </a>
        <div className="journey-header-tools"><ThemeToggle /><PaletteToggle /><RestartJourney /></div>
      </header>
      <main className="product-preparation" aria-live="polite" aria-busy="true">
        <CreditMotion
          title="Подбираем финансирование для вашего бизнеса"
          variant="selection"
          steps={steps.map((label, index) => ({
            id: String(index),
            label,
            status:
              index < stage ? "done" : index === stage ? "running" : "pending",
          }))}
        />
      </main>
    </div>
  );
}
