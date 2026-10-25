import { useId, type CSSProperties } from "react";
import { ranges } from "../shared/mvp2";

/** Seven amount bands retain the existing onboarding/API contract. */
export function OnboardingAmount({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    unknown = value === "Не знаю";
  const bands = ranges.filter((x) => x !== "Не знаю");
  const selected = bands.indexOf(value),
    index = selected < 0 ? (unknown ? 3 : 0) : selected;
  const choose = (position: string) => onChange(bands[Number(position)]);
  return (
    <div className="field mvp-amount">
      <label htmlFor={id}>Какая сумма необходима?</label>
      <output htmlFor={id} aria-live="polite" className="mvp-amount-value">
        {value || "Выберите сумму"}
      </output>
      <input
        id={id}
        type="range"
        className="mvp-range"
        min={0}
        max={bands.length - 1}
        step={1}
        value={index}
        disabled={unknown}
        aria-valuetext={value || "Сумма не выбрана"}
        aria-describedby={`${id}-hint`}
        style={
          {
            "--mvp-range-progress": `${(index / (bands.length - 1)) * 100}%`,
          } as CSSProperties
        }
        onChange={(e) => choose(e.currentTarget.value)}
        onPointerUp={(e) => choose(e.currentTarget.value)}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
            ].includes(e.key)
          )
            choose(e.currentTarget.value);
        }}
      />
      <div className="mvp-range-bounds" aria-hidden="true">
        <span>До 300 тыс. ₽</span>
        <span>Более 7 млн ₽</span>
      </div>
      <small id={`${id}-hint`}>
        Выберите примерный диапазон. Точную сумму укажете в заявке.
      </small>
      <label className="mvp-check">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => onChange(e.target.checked ? "Не знаю" : bands[3])}
        />
        Пока не знаю сумму
      </label>
    </div>
  );
}
