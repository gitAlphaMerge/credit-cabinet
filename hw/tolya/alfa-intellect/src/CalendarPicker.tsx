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

export type MeetingSlot = { id: string; at: string; manager: string };

export function meetingDays(slots: MeetingSlot[], now = new Date()) {
  const days = new Map<string, MeetingSlot[]>();
  for (const slot of slots) {
    const date = new Date(slot.at);
    if (date.getTime() <= now.getTime()) continue;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: string) =>
      parts.find((part) => part.type === type)!.value;
    const key = `${value("year")}-${value("month")}-${value("day")}`;
    const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(slot);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);
}

export function meetingLabel(at: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(at).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    ...options,
  });
}

export function meetingIcs(at: string, id: string): string {
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const start = new Date(at);
  const end = new Date(start.getTime() + 30 * 60000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alfa Intellect Demo//Meeting//RU",
    "BEGIN:VEVENT",
    `UID:${id.replace(/[^a-zA-Z0-9-]/g, "")}@alfa-intellect-demo`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "SUMMARY:Звонок с менеджером",
    "DESCRIPTION:Менеджер позвонит в назначенное время. Время МСК.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function MeetingBooking({
  slots,
  meeting,
  busy,
  onBook,
  onCancel,
}: {
  slots: MeetingSlot[];
  meeting?: { slotId: string; at: string; manager: string };
  busy: boolean;
  onBook: (slotId: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState("");
  const [selected, setSelected] = useState("");
  const days = meetingDays(slots);
  const activeDay = days.some(([key]) => key === day) ? day : days[0]?.[0];
  const activeSlots = days.find(([key]) => key === activeDay)?.[1] ?? [];
  const chosen = activeSlots.find((slot) => slot.id === selected);
  if (meeting && !editing)
    return (
      <article className="mvp-account" role="status">
        <h2>
          Менеджер позвонит{" "}
          {meetingLabel(meeting.at, { day: "numeric", month: "long" })} в{" "}
          {meetingLabel(meeting.at, { hour: "2-digit", minute: "2-digit" })} МСК
        </h2>
        <p>Запись сохранена в заявке.</p>
        <div className="mvp-actions">
          <button
            type="button"
            disabled={busy}
            aria-label="Перенести звонок с менеджером"
            onClick={() => setEditing(true)}
          >
            Перенести
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label="Отменить звонок с менеджером"
            onClick={() => void onCancel()}
          >
            Отменить
          </button>
          <button
            type="button"
            aria-label="Добавить звонок в календарь"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([meetingIcs(meeting.at, meeting.slotId)], {
                  type: "text/calendar;charset=utf-8",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "zvonok-s-menedzherom.ics";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Добавить в календарь
          </button>
        </div>
      </article>
    );
  return (
    <div>
      <p>Выберите день и время звонка. Время указано по Москве, МСК.</p>
      <div
        aria-label="День звонка"
        style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 0" }}
      >
        {days.map(([key]) => (
          <button
            key={key}
            type="button"
            aria-label={`Выбрать ${meetingLabel(`${key}T12:00:00+03:00`, { weekday: "long", day: "numeric", month: "long" })}`}
            aria-pressed={activeDay === key}
            onClick={() => {
              setDay(key);
              setSelected("");
            }}
            style={{
              borderRadius: 999,
              border: 0,
              padding: "10px 16px",
              background: activeDay === key ? "#d6e8fc" : "#f3f4f5",
              color: "#0b0b0c",
              cursor: "pointer",
            }}
          >
            {meetingLabel(`${key}T12:00:00+03:00`, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label="Время звонка, МСК"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
          gap: 8,
          margin: "16px 0",
        }}
      >
        {activeSlots.map((slot) => (
          <button
            key={slot.id}
            type="button"
            aria-label={`Выбрать ${meetingLabel(slot.at, { hour: "2-digit", minute: "2-digit" })} МСК`}
            aria-pressed={selected === slot.id}
            onClick={() => setSelected(slot.id)}
            style={{
              borderRadius: 12,
              border: 0,
              padding: "12px",
              background: selected === slot.id ? "#ef3124" : "#f3f4f5",
              color: selected === slot.id ? "#fff" : "#0b0b0c",
              cursor: "pointer",
            }}
          >
            {meetingLabel(slot.at, { hour: "2-digit", minute: "2-digit" })}
          </button>
        ))}
      </div>
      {!days.length && <p>Свободных слотов пока нет. Попробуйте позже.</p>}
      <button
        type="button"
        disabled={!chosen || busy}
        aria-label={
          chosen
            ? `Записаться на ${meetingLabel(chosen.at, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} МСК`
            : "Выберите время звонка"
        }
        onClick={() =>
          chosen && void onBook(chosen.id).then(() => setEditing(false))
        }
        style={{
          background: "#ef3124",
          color: "#fff",
          border: 0,
          borderRadius: 12,
          padding: "12px 20px",
          cursor: "pointer",
        }}
      >
        {chosen
          ? `Записаться на ${meetingLabel(chosen.at, { day: "numeric", month: "long" })}, ${meetingLabel(chosen.at, { hour: "2-digit", minute: "2-digit" })} МСК`
          : "Выберите время"}
      </button>
      {meeting && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Оставить текущую запись"
        >
          Оставить текущую запись
        </button>
      )}
    </div>
  );
}
