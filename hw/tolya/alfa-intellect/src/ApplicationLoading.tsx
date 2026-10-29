import type { CreditStep } from "./CreditMotion";
import { LoadingScreen } from "./LoadingScreen";

/** Server stages are the only source of application progress. */
export function ApplicationLoading({ steps = [] }: { steps?: CreditStep[] }) {
  const progress = steps.map((step) => ({
    ...step,
    label:
      (
        {
          Скоринг: "Финансовая оценка",
          "Комплаенс, антифрод и БКИ": "Проверка компании и кредитной истории",
          "Финансовый анализ CSV": "Анализ выписок",
          Андеррайтинг: "Проверка условий",
          "Маршрутизация решения": "Подготовка результата",
        } as Record<string, string>
      )[step.label] ?? step.label,
  }));
  return <LoadingScreen title="Рассматриваем заявку" message="Заявка отправляется на рассмотрение" steps={progress} />;
}
