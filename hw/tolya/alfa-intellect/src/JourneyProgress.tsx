import { Check } from "lucide-react";
export function JourneyProgress({ current = 0 }: { current?: number }) {
  return (
    <ol className="credit-journey" aria-label="Путь к финансированию">
      {["Подбор", "Данные бизнеса", "Проверка", "Результат"].map(
        (label, index) => (
          <li
            key={label}
            aria-current={index === current ? "step" : undefined}
            className={index < current ? "complete" : ""}
          >
            <span aria-hidden="true">
              {index < current ? <Check size={12} /> : index + 1}
            </span>
            {label}
          </li>
        ),
      )}
    </ol>
  );
}
