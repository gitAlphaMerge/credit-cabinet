import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Badge, Button } from "./ui";
export const tourSteps = [
  [
    "summary",
    "Кредитная сводка",
    "Здесь собраны сумма кредита, остаток основного долга и прогресс погашения.",
  ],
  [
    "payment",
    "Ближайший платёж",
    "Дата и сумма ближайшего платежа. Основной долг и проценты показаны отдельно, а подробный график доступен рядом.",
  ],
  [
    "forecast",
    "Денежный прогноз",
    "Смотрите ожидаемый остаток после ближайшего платежа. Сравнивайте базовый сценарий со снижением поступлений на 30%.",
  ],
  [
    "chat-panel",
    "Финансовый помощник",
    "Обсуждайте бизнес и прикрепляйте документы. Чат можно скрыть, открыть отдельной страницей или переключить историю независимо.",
  ],
  [
    "financing",
    "Подбор финансирования",
    "Укажите цель, сумму и срок. Сравните варианты финансирования с денежным потоком бизнеса и сохраните подходящий расчёт.",
  ],
  [
    "profile",
    "Мой бизнес",
    "Здесь открывается профиль компании: общие сведения, поиск по ИНН и документы. Эти данные помогают уточнять расчёты и ответы помощника.",
  ],
];
export function Tour({
  step,
  setStep,
  finish,
}: {
  step: number;
  setStep: (n: number) => void;
  finish: () => Promise<void>;
}) {
  const card = useRef<HTMLDivElement>(null),
    [rect, setRect] = useState<DOMRect | null>(null),
    [position, setPosition] = useState({ top: 150, left: 24 }),
    [busy, setBusy] = useState(false);
  const complete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await finish();
    } catch {
      // The workspace reports the error; keep the tour open for retry.
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const measure = () => {
      const node = document.querySelector<HTMLElement>(
        `[data-tour="${tourSteps[step][0]}"]`,
      );
      if (!node || !node.getBoundingClientRect().width) {
        setRect(null);
        return;
      }
      const r = node.getBoundingClientRect();
      setRect(r);
      const width = Math.min(344, innerWidth - 32),
        height = card.current?.offsetHeight || 280;
      let left = r.right + 16,
        top = r.top;
      if (left + width > innerWidth - 16) {
        left = r.left - width - 16;
        if (left < 16) {
          left = Math.min(innerWidth - width - 16, Math.max(16, r.left));
          top = r.bottom + 14;
          if (top + height > innerHeight - 12) top = r.top - height - 14;
        }
      }
      setPosition({
        left: Math.max(16, left),
        top: Math.max(80, Math.min(top, innerHeight - height - 12)),
      });
    };
    const timer = setTimeout(() => {
      document
        .querySelector(`[data-tour="${tourSteps[step][0]}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "instant" });
      measure();
      card.current?.querySelector<HTMLButtonElement>("[data-next]")?.focus();
    }, 100);
    addEventListener("resize", measure);
    addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timer);
      removeEventListener("resize", measure);
      removeEventListener("scroll", measure, true);
    };
  }, [step]);
  return (
    <div
      className="guided-tour"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          void complete();
        }
        if (e.key === "Tab") {
          const buttons = Array.from(
            card.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) || [],
          );
          const first = buttons[0],
            last = buttons.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      {rect && (
        <div
          className="guided-highlight"
          style={{
            top: Math.max(4, rect.top - 4),
            left: rect.left - 4,
            width: rect.width + 8,
            height: Math.min(
              rect.height + 8,
              innerHeight - Math.max(4, rect.top) - 8,
            ),
          }}
        />
      )}
      <div
        ref={card}
        className="guided-card"
        role="dialog"
        aria-modal="true"
        aria-label="Знакомство с продуктом"
        style={position}
      >
        <div className="panel-title">
          <Badge>
            {step + 1} из {tourSteps.length}
          </Badge>
          <button
            disabled={busy}
            className="text-button"
            onClick={() => void complete()}
          >
            Пропустить
          </button>
        </div>
        <h2>{tourSteps[step][1]}</h2>
        <p>{tourSteps[step][2]}</p>
        <div className="guided-actions">
          {step > 0 && (
            <button className="text-button" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={15} /> Назад
            </button>
          )}
          <Button
            disabled={busy}
            data-next
            onClick={() =>
              step === tourSteps.length - 1
                ? void complete()
                : setStep(step + 1)
            }
          >
            {step === tourSteps.length - 1 ? "Завершить" : "Далее"}
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
