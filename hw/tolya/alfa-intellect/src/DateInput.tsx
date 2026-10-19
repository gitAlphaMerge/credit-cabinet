import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { CalendarPicker, calendarCells } from "./CalendarPicker";
import { useAnchoredPosition } from "./ContextHelp";
import { addDays, day, validDate } from "../shared/cabinet";
import { dateCaret, formatDateInput, normalizeDateInput } from "./date-input";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max"
> & {
  value: string;
  onValueChange: (value: string) => void;
  min: string;
  max: string;
};
const months = Array.from({ length: 12 }, (_, month) => ({
  value: month,
  label: new Date(Date.UTC(2026, month, 1)).toLocaleDateString("ru-RU", {
    month: "long",
    timeZone: "UTC",
  }),
}));
const spokenDate = (value: string) =>
  new Date(value + "T00:00:00Z").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** A styled top-layer popover, not a native date control. Its DOM stays inside
 * the form, so the parent modal's focus trap also owns the calendar controls. */
export function DateInput({ value, onValueChange, min, max, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null),
    pending = useRef<number | null>(null),
    pendingDay = useRef<string | null>(null),
    id = useId(),
    [open, setOpen] = useState(false),
    [cursor, setCursor] = useState(day()),
    [month, setMonth] = useState(day().slice(0, 7) + "-01"),
    { panel, position } = useAnchoredPosition(input.current, open);
  const label = props["aria-label"] || "Дата",
    display = formatDateInput(value),
    year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5, 7)) - 1,
    firstYear = Number(min.slice(0, 4)),
    lastYear = Number(max.slice(0, 4));
  const clamp = (date: string) => (date < min ? min : date > max ? max : date);
  const close = () => {
    setOpen(false);
    input.current?.focus({ preventScroll: true });
  };
  const show = () => {
    const initial = clamp(validDate(value) ? value : day());
    setCursor(initial);
    setMonth(initial.slice(0, 7) + "-01");
    setOpen(true);
  };
  const focusDay = (date: string) => {
    if (date === cursor) {
      panel.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    pendingDay.current = date;
    setCursor(date);
    setMonth(date.slice(0, 7) + "-01");
  };
  useLayoutEffect(() => {
    if (!open) return;
    panel.current?.showPopover();
    pendingDay.current = cursor;
  }, [open]);
  useLayoutEffect(() => {
    if (pendingDay.current) {
      panel.current
        ?.querySelector<HTMLButtonElement>(
          `[data-date="${pendingDay.current}"]`,
        )
        ?.focus({ preventScroll: true });
      pendingDay.current = null;
    }
    if (pending.current !== null) {
      input.current?.setSelectionRange(pending.current, pending.current);
      pending.current = null;
    }
  });
  const commit = (raw: string, ordinal: number) => {
    const next = normalizeDateInput(raw);
    if (next === null) return;
    const shown = formatDateInput(next),
      caret = dateCaret(shown, ordinal);
    pending.current = caret;
    onValueChange(next);
    if (input.current) {
      input.current.value = shown;
      input.current.setSelectionRange(caret, caret);
    }
  };
  const chooseMonth = (y: number, m: number) => {
    const target = clamp(day(new Date(Date.UTC(y, m, 1))));
    setMonth(target.slice(0, 7) + "-01");
    setCursor(target);
  };
  const shift = (n: number) => chooseMonth(year, monthIndex + n);
  return (
    <div
      className="date-input"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <input
        {...props}
        ref={input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="ДД.ММ.ГГГГ"
        maxLength={10}
        value={display}
        onChange={(e) =>
          commit(
            e.target.value,
            (
              e.target.value
                .slice(0, e.target.selectionStart ?? 10)
                .match(/\d/g) || []
            ).length,
          )
        }
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            show();
          }
          const el = e.currentTarget,
            p = el.selectionStart ?? 0;
          if (p !== el.selectionEnd) return;
          const index =
            e.key === "Backspace" && el.value[p - 1] === "."
              ? p - 2
              : e.key === "Delete" && el.value[p] === "."
                ? p + 1
                : -1;
          if (index >= 0 && /\d/.test(el.value[index] || "")) {
            e.preventDefault();
            commit(
              el.value.slice(0, index) + el.value.slice(index + 1),
              (
                el.value
                  .slice(0, e.key === "Backspace" ? index : p)
                  .match(/\d/g) || []
              ).length,
            );
          }
        }}
      />
      <button
        type="button"
        className="date-input-trigger"
        aria-label={`Открыть календарь: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault(); // Do not activate the enclosing form label.
          open ? close() : show();
        }}
      >
        <CalendarDays size={18} />
      </button>
      {open && (
        <div
          id={id}
          ref={panel}
          popover="auto"
          role="dialog"
          aria-label={`Выбор даты: ${label}`}
          className="date-input-popup"
          style={position}
          onToggle={(e) => {
            if (e.newState === "closed") setOpen(false);
          }}
          onClick={(e) => e.preventDefault()}
        >
          <header>
            <h3>{label}</h3>
            <button
              type="button"
              aria-label="Закрыть выбор даты"
              onClick={close}
            >
              <X size={17} />
            </button>
          </header>
          <div className="date-input-navigation">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              disabled={month.slice(0, 7) <= min.slice(0, 7)}
              onClick={() => shift(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <CalendarPicker
              label="Месяц"
              value={monthIndex}
              options={months.filter(({ value: m }) => {
                const start = `${year}-${String(m + 1).padStart(2, "0")}`;
                return start >= min.slice(0, 7) && start <= max.slice(0, 7);
              })}
              onChange={(m) => chooseMonth(year, m)}
            />
            <CalendarPicker
              label="Год"
              value={year}
              options={Array.from(
                { length: lastYear - firstYear + 1 },
                (_, i) => ({
                  value: firstYear + i,
                  label: String(firstYear + i),
                }),
              )}
              onChange={(y) => chooseMonth(y, monthIndex)}
            />
            <button
              type="button"
              aria-label="Следующий месяц"
              disabled={month.slice(0, 7) >= max.slice(0, 7)}
              onClick={() => shift(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="date-input-grid" role="group" aria-label="Дни месяца">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((weekday) => (
              <span className="date-input-weekday" key={weekday}>
                {weekday}
              </span>
            ))}
            {calendarCells(month).map((dt, index) =>
              dt ? (
                <button
                  type="button"
                  key={dt}
                  data-date={dt}
                  aria-label={spokenDate(dt)}
                  aria-pressed={value === dt}
                  aria-current={dt === day() ? "date" : undefined}
                  disabled={dt < min || dt > max}
                  tabIndex={dt === cursor ? 0 : -1}
                  onFocus={() => setCursor(dt)}
                  onKeyDown={(e) => {
                    const delta = {
                      ArrowLeft: -1,
                      ArrowRight: 1,
                      ArrowUp: -7,
                      ArrowDown: 7,
                    }[e.key];
                    if (delta !== undefined) {
                      e.preventDefault();
                      focusDay(clamp(addDays(dt, delta)));
                    }
                  }}
                  onClick={() => {
                    onValueChange(dt);
                    close();
                  }}
                >
                  {Number(dt.slice(-2))}
                </button>
              ) : (
                <span key={`blank-${index}`} aria-hidden="true" />
              ),
            )}
          </div>
          <footer>
            <button type="button" onClick={() => focusDay(clamp(day()))}>
              Сегодня
            </button>
            <span>ДД.ММ.ГГГГ</span>
          </footer>
        </div>
      )}
    </div>
  );
}
