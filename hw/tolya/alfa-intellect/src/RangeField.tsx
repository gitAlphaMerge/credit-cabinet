import { useId, useState } from "react";
import { NumericInput } from "./NumericInput";
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
  inputMax = max,
  clampInput = true,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  inputMax?: number;
  clampInput?: boolean;
}) {
  const id = useId(),
    [raw, setRaw] = useState<string | null>(null),
    [error, setError] = useState("");
  const format = (n: number) => n.toLocaleString("ru-RU"),
    clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="range-field">
      <label htmlFor={id}>{label}</label>
      <div className="range-number">
        <NumericInput
          unit=""
          decimals={0}
          id={id}
          aria-describedby={id + "-hint"}
          aria-invalid={!!error}
          value={raw ?? value}
          onValueChange={(digits) => {
            setRaw(digits);
            const n = Number(digits);
            if (digits && n >= min && n <= inputMax) {
              onChange(n);
              setError("");
            } else
              setError(
                `Введите число от ${format(min)} до ${format(inputMax)}.`,
              );
          }}
          onBlur={() => {
            if (raw !== null) {
              if (
                !clampInput &&
                (!raw || Number(raw) < min || Number(raw) > inputMax)
              )
                return;
              onChange(Math.max(min, Math.min(inputMax, Number(raw))));
              setRaw(null);
              setError("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && error) {
              e.preventDefault();
              if (!clampInput) return;
              onChange(clamp(Number(raw)));
              setRaw(null);
              setError("");
            }
          }}
        />
        <span>{suffix}</span>
      </div>
      <input
        aria-label={label + " — ползунок"}
        type="range"
        min={min}
        max={max}
        step="any"
        value={clamp(value)}
        aria-valuetext={format(value) + " " + suffix}
        onKeyDown={(e) => {
          if (
            ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(e.key)
          ) {
            e.preventDefault();
            setRaw(null);
            setError("");
            onChange(
              clamp(
                value +
                  (["ArrowLeft", "ArrowDown"].includes(e.key) ? -step : step),
              ),
            );
          }
        }}
        onChange={(e) => {
          setRaw(null);
          setError("");
          onChange(
            clamp(
              min + Math.round((Number(e.target.value) - min) / step) * step,
            ),
          );
        }}
        style={
          {
            "--range-progress":
              ((clamp(value) - min) / (max - min)) * 100 + "%",
          } as React.CSSProperties
        }
      />
      <div className="range-labels">
        <span>
          {format(min)} {suffix}
        </span>
        <span>
          {format(max)} {suffix}
        </span>
      </div>
      <small id={id + "-hint"}>
        {error ||
          hint ||
          `Шаг ползунка: ${format(step)} ${suffix}. Точное число можно ввести вручную.`}
      </small>
    </div>
  );
}
