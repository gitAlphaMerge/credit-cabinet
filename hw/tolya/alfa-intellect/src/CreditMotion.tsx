import { useTransitionProgress } from "./motion";
import { ApplicationLoading } from "./ApplicationLoading";
import { LoadingScreen } from "./LoadingScreen";
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

export function CreditTransition({ kind, ready, onFinish, error, reviewSteps }: {
  kind: "selection" | "review";
  ready: boolean;
  onFinish: () => void;
  error?: string;
  reviewSteps?: CreditStep[];
}) {
  const { completed, reduced } = useTransitionProgress(ready && !error, onFinish);
  if (error) return null;
  if (kind === "review") return <ApplicationLoading steps={reviewSteps} />;
  return <LoadingScreen title="Подбираем варианты" message="Пуш сверяет сведения о вашем бизнесе" steps={transitionStepStates(kind, completed, reduced)} />;
}

/** Shared Push visual, with the caller's real stages and completion behavior. */
export function CreditMotion({ title, steps, variant = "review", staticDisplay = false }: {
  title: string;
  steps: CreditStep[];
  variant?: "selection" | "review" | "signature";
  staticDisplay?: boolean;
}) {
  return <LoadingScreen title={title} message={variant === "signature" ? "Пуш сохраняет подписанный документ" : "Пуш готовит результат"} steps={steps} staticDisplay={staticDisplay} />;
}
