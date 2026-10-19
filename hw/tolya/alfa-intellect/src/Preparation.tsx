import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check, Sparkles, RotateCcw } from "lucide-react";
import { Brand, Button } from "./ui";
import { useReducedMotion } from "./motion";
import { PREPARATION_MS, preparationProgress } from "./preparation-state";
export const preparationStages = [
  "Формируем кабинет под ваш бизнес",
  "Переносим ответы в профиль",
  "Настраиваем рабочее пространство",
  "Готовим первый шаг",
];
export function Preparation({
  onComplete,
  startedAt,
}: {
  onComplete: () => Promise<void>;
  startedAt?: number;
}) {
  const reduced = useReducedMotion(),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const started = useRef(startedAt ?? Date.now());
  const complete = useRef(onComplete),
    opening = useRef(false),
    mounted = useRef(false),
    finished = useRef(false),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  complete.current = onComplete;
  async function open() {
    if (opening.current) return;
    opening.current = true;
    finished.current = true;
    clearInterval(timer.current);
    setProgress(100);
    setError("");
    try {
      await complete.current();
    } catch {
      if (mounted.current)
        setError(
          "Профиль создан, но кабинет не удалось открыть. Проверьте соединение и попробуйте ещё раз.",
        );
    } finally {
      opening.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (finished.current)
      return () => {
        mounted.current = false;
      };
    const duration = reduced ? 800 : PREPARATION_MS;
    timer.current = setInterval(() => {
      const value = preparationProgress(Date.now() - started.current, duration);
      setProgress((previous) => Math.max(previous, value));
      if (value === 100) {
        clearInterval(timer.current);
        void open();
      }
    }, 100);
    return () => {
      mounted.current = false;
      clearInterval(timer.current);
    };
  }, [reduced]);
  const stage = Math.min(
    preparationStages.length - 1,
    Math.floor(progress / 25),
  );
  return (
    <main className="preparation-screen" data-testid="preparation">
      <header>
        <Brand />
        <span className="preparation-header-note">
          ВАШЕ НОВОЕ РАБОЧЕЕ ПРОСТРАНСТВО
        </span>
      </header>
      <div className="preparation-content">
        <div className="preparation-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div
          className="preparation-sphere"
          role="progressbar"
          aria-label="Подготовка кабинета"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          style={{ "--progress": progress + "%" } as CSSProperties}
        >
          <div
            className="sphere-liquid"
            style={{ opacity: progress === 0 ? 0 : 1 }}
          >
            <i />
            <i />
          </div>
          <span className="sphere-shine" aria-hidden="true" />
          <div className="sphere-number">
            <Sparkles size={24} />
            <strong>
              {progress}
              <small>%</small>
            </strong>
          </div>
        </div>
        <div className="preparation-copy">
          <span className="eyebrow">ЗНАКОМСТВО ЗАВЕРШЕНО</span>
          <h1 key={stage} role="status" aria-live="polite">
            {error ? "Осталось открыть кабинет" : preparationStages[stage]}
          </h1>
          <p>
            Ваш профиль уже сохранён. Всё остальное можно уточнить в кабинете.
          </p>
        </div>
        <div className="preparation-stages" aria-label="Этапы подготовки">
          {preparationStages.map((label, i) => (
            <span
              key={label}
              className={
                i < stage || progress === 100
                  ? "done"
                  : i === stage
                    ? "current"
                    : ""
              }
              aria-label={label}
            >
              {i < stage || progress === 100 ? <Check size={12} /> : <i />}
            </span>
          ))}
        </div>
        {error ? (
          <div className="preparation-error">
            <p role="alert">{error}</p>
            <Button onClick={() => void open()}>
              <RotateCcw size={16} /> Повторить открытие
            </Button>
          </div>
        ) : progress < 100 ? (
          <button
            className="text-button preparation-skip"
            onClick={() => void open()}
          >
            Перейти сразу <ArrowRight size={15} />
          </button>
        ) : (
          <p className="preparation-opening" role="status">
            Открываем кабинет…
          </p>
        )}
      </div>
      <footer>Финансы с ясной перспективой</footer>
    </main>
  );
}
