import { useId, type CSSProperties } from "react";
import { catalogAmount } from "../shared/mvp2";
import { NumericInput } from "./NumericInput";
import { money } from "./api";

export function OnboardingAmount({
  value,
  unknown = false,
  onChange,
}: {
  value: number | null;
  unknown?: boolean;
  onChange: (value: number | null, unknown: boolean) => void;
}) {
  const id = useId();
  const position = Math.min(
    catalogAmount.max,
    Math.max(catalogAmount.min, value ?? catalogAmount.min),
  );
  const invalid =
    value !== null && (value < catalogAmount.min || value > catalogAmount.max);
  return (
    <div className="field mvp-amount">
      <label htmlFor={id}>Какая сумма необходима?</label>
      <NumericInput
        id={id}
        aria-label="Какая сумма необходима?"
        value={value ?? ""}
        decimals={0}
        disabled={unknown}
        min={catalogAmount.min}
        max={catalogAmount.max}
        placeholder="Введите сумму"
        aria-describedby={id + "-hint"}
        onValueChange={(v) => onChange(v === "" ? null : Number(v), false)}
      />
      <input
        type="range"
        aria-label="Сумма финансирования — ползунок"
        className="mvp-range"
        min={catalogAmount.min}
        max={catalogAmount.max}
        step={
          value !== null &&
          (value - catalogAmount.min) % catalogAmount.step !== 0
            ? 1
            : catalogAmount.step
        }
        value={position}
        disabled={unknown}
        aria-valuetext={value === null ? "Сумма не выбрана" : money(value)}
        style={
          {
            "--mvp-range-progress": `${((position - catalogAmount.min) / (catalogAmount.max - catalogAmount.min)) * 100}%`,
          } as CSSProperties
        }
        onChange={(e) =>
          onChange(
            Math.min(
              catalogAmount.max,
              Math.max(
                catalogAmount.min,
                Math.round(Number(e.currentTarget.value) / catalogAmount.step) *
                  catalogAmount.step,
              ),
            ),
            false,
          )
        }
        onPointerUp={(e) =>
          onChange(
            Math.min(
              catalogAmount.max,
              Math.max(
                catalogAmount.min,
                Math.round(Number(e.currentTarget.value) / catalogAmount.step) *
                  catalogAmount.step,
              ),
            ),
            false,
          )
        }
        onKeyDown={(e) => {
          const delta = {
            ArrowLeft: -catalogAmount.step,
            ArrowDown: -catalogAmount.step,
            ArrowRight: catalogAmount.step,
            ArrowUp: catalogAmount.step,
          }[e.key];
          if (delta !== undefined || e.key === "Home" || e.key === "End") {
            e.preventDefault();
            onChange(
              e.key === "Home"
                ? catalogAmount.min
                : e.key === "End"
                  ? catalogAmount.max
                  : Math.min(
                      catalogAmount.max,
                      Math.max(catalogAmount.min, position + (delta ?? 0)),
                    ),
              false,
            );
          }
        }}
      />
      <div className="mvp-range-bounds" aria-hidden="true">
        <span>300 000 ₽</span>
        <span>7 000 000 ₽</span>
      </div>
      <small
        id={id + "-hint"}
        className={invalid ? "mvp-error" : ""}
        role={invalid ? "alert" : undefined}
      >
        {invalid
          ? "Выберите сумму от 300 000 до 7 000 000 ₽. Для большей суммы обратитесь к менеджеру."
          : "Укажите точную сумму или переместите ползунок."}
      </small>
      <label className="mvp-check">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => onChange(null, e.target.checked)}
        />
        Пока не знаю сумму
      </label>
    </div>
  );
}
