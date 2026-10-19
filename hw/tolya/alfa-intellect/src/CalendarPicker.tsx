import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function CalendarPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (n: number) => void;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId();
  useEffect(() => {
    if (open && list.current) {
      const selected = list.current.querySelector<HTMLButtonElement>(
        '[aria-selected="true"]',
      );
      selected?.focus({ preventScroll: true });
      if (selected)
        list.current.scrollTop = Math.max(
          0,
          selected.offsetTop - list.current.clientHeight / 2,
        );
    }
  }, [open]);
  return (
    <div
      className="calendar-picker"
      ref={root}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        className="calendar-picker-trigger"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {options.find((o) => o.value === value)?.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="calendar-picker-menu"
          onKeyDown={(e) => {
            const buttons = Array.from(
                list.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]',
                ) || [],
              ),
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            let next = index;
            if (e.key === "ArrowDown") next = index + 1;
            if (e.key === "ArrowUp") next = index - 1;
            if (e.key === "Home") next = 0;
            if (e.key === "End") next = buttons.length - 1;
            if (next !== index) {
              e.preventDefault();
              buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus({
                preventScroll: true,
              });
              buttons[
                Math.max(0, Math.min(buttons.length - 1, next))
              ]?.scrollIntoView({ block: "nearest" });
            }
          }}
        >
          {options.map((o) => (
            <button
              type="button"
              role="option"
              aria-selected={value === o.value}
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                trigger.current?.focus({ preventScroll: true });
              }}
            >
              {o.label}
              {value === o.value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Six fixed weeks keep navigation controls and details stationary in every month. */
export function calendarCells(month: string): (string | null)[] {
  const d = new Date(month + "T00:00:00Z"),
    offset = (d.getUTCDay() + 6) % 7,
    length = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
  return Array.from({ length: 42 }, (_, i) =>
    i < offset || i >= offset + length
      ? null
      : month.slice(0, 8) + String(i - offset + 1).padStart(2, "0"),
  );
}
