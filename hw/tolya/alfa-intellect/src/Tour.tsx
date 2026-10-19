import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Badge, Button } from "./ui";
export const tourSteps = [
  [
    "summary",
    "Ваше финансирование",
    "Здесь собраны сумма кредита, остаток основного долга и прогресс погашения.",
  ],
  [
    "payment",
    "Платежи и график",
    "Проверьте ближайшую дату и состав платежа, откройте календарь. Постоянный график показывает, как изменяется основной долг.",
  ],
  [
    "forecast",
    "Денежный поток и коэффициенты",
    "Смотрите поток, прогноз готовности к платежу и четыре финансовых показателя. Формулы и источники раскрываются по значку информации.",
  ],
  [
    "recommendations",
    "Рекомендации и уведомления",
    "Внизу собраны важные сигналы расчётов, а в колокольчике — события всего приложения. Они проверяются при входе и обновлении данных.",
  ],
  [
    "chat-panel",
    "ИИ-агент",
    "Обсудите расчёт с агентом и прикрепите документы в поле ввода. Панель можно скрыть, развернуть и изменить её ширину.",
  ],
  [
    "financing",
    "Подбор финансирования",
    "Сформулируйте цель нового запроса, рассчитайте параметры и сравните варианты. Действующие обязательства остаются в кредитном кабинете.",
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
    [extras, setExtras] = useState<DOMRect[]>([]),
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
    const extraKeys: Record<number, string[]> = {
      1: ["schedule"],
      2: ["metrics"],
      3: ["notifications"],
      4: ["composer", "discuss"],
    };
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
      setExtras(
        (extraKeys[step] || []).flatMap((key) => {
          const el = document.querySelector(`[data-tour="${key}"]`),
            b = el?.getBoundingClientRect();
          return b && b.width && b.bottom > 0 && b.top < innerHeight ? [b] : [];
        }),
      );
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
        top:
          innerWidth <= 1000
            ? innerHeight - height - 16
            : Math.max(80, Math.min(top, innerHeight - height - 12)),
      });
    };
    const timer = setTimeout(() => {
      document
        .querySelector(`[data-tour="${tourSteps[step][0]}"]`)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
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
      <svg
        className="guided-shade"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <mask id="tour-holes">
            <rect width="100%" height="100%" fill="white" />
            {[rect, ...extras]
              .filter((r): r is DOMRect => !!r)
              .map((r, i) => (
                <rect
                  key={i}
                  x={Math.max(4, r.left - 4)}
                  y={Math.max(r.top < 64 ? 4 : 65, r.top - 4)}
                  width={r.width + 8}
                  height={Math.max(
                    0,
                    Math.min(
                      innerWidth <= 1000 ? position.top - 12 : innerHeight - 8,
                      r.bottom + 4,
                    ) - Math.max(r.top < 64 ? 4 : 65, r.top - 4),
                  )}
                  rx="14"
                  fill="black"
                />
              ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="#17203446"
          mask="url(#tour-holes)"
        />
      </svg>
      {[rect, ...extras]
        .filter((r): r is DOMRect => !!r)
        .map((r, i) => {
          const top = Math.max(r.top < 64 ? 4 : 65, r.top - 4),
            bottom = Math.min(
              innerHeight - 8,
              innerWidth <= 1000 ? position.top - 12 : innerHeight - 8,
              r.bottom + 4,
            );
          return bottom > top ? (
            <div
              key={i}
              className={"guided-highlight " + (i ? "guided-extra" : "")}
              style={{
                top,
                left: Math.max(4, r.left - 4),
                width: Math.min(innerWidth - r.left, r.width + 8),
                height: bottom - top,
              }}
            />
          ) : null;
        })}
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
