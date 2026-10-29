import { LoadingScreen } from "./LoadingScreen";
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
      <header><Brand /><span className="preparation-header-note">ВАШЕ НОВОЕ РАБОЧЕЕ ПРОСТРАНСТВО</span></header>
      <LoadingScreen
        title={error ? "Осталось открыть кабинет" : preparationStages[stage]}
        message="Ваш профиль сохранён. Пуш готовит рабочее пространство."
        steps={preparationStages.map((label, i) => ({id: String(i), label, status: progress === 100 || i < stage ? "done" : i === stage ? "running" : "pending"}))}
      >
        {error ? <div className="preparation-error"><p role="alert">{error}</p><Button onClick={() => void open()}><RotateCcw size={16} /> Повторить открытие</Button></div>
          : progress < 100 ? <button className="text-button" onClick={() => void open()}>Перейти сразу <ArrowRight size={15} /></button>
          : <p role="status">Открываем кабинет…</p>}
      </LoadingScreen>
      <footer>Финансы с ясной перспективой</footer>
    </main>
  );
}
