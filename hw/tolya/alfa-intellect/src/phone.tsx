import { useRef } from "react";
export function nationalPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (
    value.trim().startsWith("+") ||
    (digits.length > 10 && /^[78]/.test(digits))
  )
    digits = digits.slice(1);
  return digits.slice(0, 10);
}
export function formatPhone(value: string) {
  const n = nationalPhone(value);
  if (!n) return value ? "+7" : "";
  return (
    "+7 (" +
    n.slice(0, 3) +
    (n.length >= 3 ? ") " : "") +
    n.slice(3, 6) +
    (n.length > 6 ? "-" + n.slice(6, 8) : "") +
    (n.length > 8 ? "-" + n.slice(8, 10) : "")
  );
}
export function normalizePhone(value: string) {
  const n = nationalPhone(value);
  return n.length === 10 ? "+7" + n : "";
}
export function PhoneInput({
  value,
  onChange,
  onBlur,
  invalid = false,
  errorId,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  errorId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  function update(raw: string, digitsBefore: number) {
    const next = formatPhone(raw);
    onChange(next);
    requestAnimationFrame(() => {
      let count = 0,
        pos = next.length;
      for (let i = 0; i < next.length; i++) {
        if (/\d/.test(next[i])) count++;
        if (count >= digitsBefore) {
          pos = i + 1;
          break;
        }
      }
      input.current?.setSelectionRange(pos, pos);
    });
  }
  return (
    <input
      ref={input}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      aria-label="Номер телефона"
      aria-invalid={invalid}
      aria-describedby={errorId}
      placeholder="+7 (999) 123-45-67"
      value={value}
      onBlur={onBlur}
      onChange={(e) => {
        const raw = e.target.value,
          caret = e.target.selectionStart ?? raw.length;
        let count = raw.slice(0, caret).replace(/\D/g, "").length;
        if (!raw.startsWith("+") && raw.replace(/\D/g, "").length <= 10)
          count++;
        update(raw, count);
      }}
      onKeyDown={(e) => {
        if (
          !["Backspace", "Delete"].includes(e.key) ||
          e.currentTarget.selectionStart !== e.currentTarget.selectionEnd
        )
          return;
        const position = e.currentTarget.selectionStart ?? 0;
        let at = e.key === "Backspace" ? position - 1 : position;
        while (at >= 2 && at < value.length && !/\d/.test(value[at]))
          at += e.key === "Backspace" ? -1 : 1;
        if (at >= 2 && at < value.length) {
          e.preventDefault();
          const raw = value.slice(0, at) + value.slice(at + 1),
            count = value
              .slice(0, e.key === "Backspace" ? at : position)
              .replace(/\D/g, "").length;
          update(raw, count);
        } else if (e.key === "Backspace" && position <= 3) {
          e.preventDefault();
          onChange("");
        }
      }}
    />
  );
}
