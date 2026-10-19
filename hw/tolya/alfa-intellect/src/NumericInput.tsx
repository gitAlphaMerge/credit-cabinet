import {
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import {
  formatNumericInput,
  normalizeNumericInput,
  numericCaret,
} from "./numeric-input";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  unit?: string;
  decimals?: number;
  signed?: boolean;
  min?: number;
  max?: number;
};
export function NumericInput({
  value,
  onValueChange,
  unit = "₽",
  decimals = 2,
  signed = false,
  min,
  max,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Props) {
  const input = useRef<HTMLInputElement>(null),
    pending = useRef<number | null>(null),
    [focused, setFocused] = useState(false),
    [draft, setDraft] = useState(String(value));
  const raw = focused ? draft : String(value),
    display = formatNumericInput(raw);
  useLayoutEffect(() => {
    if (focused && String(value) !== draft && Number(value) !== Number(draft))
      setDraft(String(value));
  }, [value]);
  useLayoutEffect(() => {
    if (!input.current) return;
    const n = Number(raw);
    input.current.setCustomValidity(
      raw && !Number.isFinite(n)
        ? "Введите число."
        : raw && min !== undefined && n < min
          ? `Минимальное значение — ${formatNumericInput(min)} ${unit}.`
          : raw && max !== undefined && n > max
            ? `Максимальное значение — ${formatNumericInput(max)} ${unit}.`
            : "",
    );
    if (pending.current !== null) {
      input.current.setSelectionRange(pending.current, pending.current);
      pending.current = null;
    }
  });
  const commit = (text: string, ordinal: number) => {
    const next = normalizeNumericInput(text, decimals, signed);
    if (next === null) return;
    const shown = formatNumericInput(next),
      position = numericCaret(shown, ordinal);
    pending.current = position;
    setDraft(next);
    onValueChange(next);
    if (input.current) {
      input.current.value = shown;
      input.current.setSelectionRange(position, position);
    }
  };
  return (
    <div className={"numeric-input" + (unit ? " with-unit" : "")}>
      <input
        {...props}
        ref={input}
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        value={display}
        aria-invalid={
          props["aria-invalid"] ||
          (!!raw &&
            (!Number.isFinite(Number(raw)) ||
              (min !== undefined && Number(raw) < min) ||
              (max !== undefined && Number(raw) > max))) ||
          false
        }
        onFocus={(e) => {
          setDraft(String(value));
          setFocused(true);
          onFocus?.(e);
        }}
        onChange={(e) =>
          commit(
            e.target.value,
            (
              e.target.value
                .slice(0, e.target.selectionStart ?? e.target.value.length)
                .match(/[\d,.-]/g) || []
            ).length,
          )
        }
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          const el = e.currentTarget,
            p = el.selectionStart ?? 0;
          if (p !== el.selectionEnd) return;
          const i =
            e.key === "Backspace" && el.value[p - 1] === " "
              ? p - 2
              : e.key === "Delete" && el.value[p] === " "
                ? p + 1
                : -1;
          if (i >= 0 && /\d/.test(el.value[i] || "")) {
            e.preventDefault();
            const start = e.key === "Backspace" ? i : p,
              ordinal = (el.value.slice(0, start).match(/[\d,.-]/g) || [])
                .length;
            commit(el.value.slice(0, i) + el.value.slice(i + 1), ordinal);
          }
        }}
      />
      {unit && (
        <span className="numeric-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </div>
  );
}
