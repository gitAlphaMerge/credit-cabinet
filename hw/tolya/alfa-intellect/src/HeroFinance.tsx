import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Sparkles,
  ArrowUpRight,
  Pause,
  Play,
  Check,
  FileCheck2,
  ChartNoAxesCombined,
  WalletCards,
} from "lucide-react";
import { useReducedMotion } from "./motion";
export const heroScenes = [
  {
    title: "От вашей задачи — к решению",
    label: "Подбор финансирования",
    value: "3 000 000",
    unit: "₽",
    detail: "Оборудование для нового этапа роста",
    points: "10,95 45,76 80,82 115,54 150,60 185,31 220,35 260,12",
    stat: "36 месяцев",
    hint: "Сумма и срок в одном расчёте",
  },
  {
    title: "Каждый платёж — под контролем",
    label: "Ежемесячный платёж",
    value: "114 571",
    unit: "₽",
    detail: "Основной долг и проценты — отдельно",
    points: "10,20 45,29 80,33 115,44 150,53 185,69 220,79 260,98",
    stat: "Прозрачный график",
    hint: "От первого до последнего платежа",
  },
  {
    title: "Смотрите на шаг вперёд",
    label: "Свободный поток после платежа",
    value: "+217 500",
    unit: "₽",
    detail: "Пример запаса для ваших планов",
    points: "10,98 45,84 80,88 115,67 150,63 185,41 220,32 260,12",
    stat: "Сценарии рядом",
    hint: "Сравнивайте нагрузку до решения",
  },
];
export function HeroFinance({ pattern }: { pattern?: ReactNode } = {}) {
  const root = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion();
  const [scene, setScene] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    [visible, setVisible] = useState(true),
    [foreground, setForeground] = useState(true);
  const playing = !reduced && !paused && !hovered && visible && foreground;
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    if (root.current) observer.observe(root.current);
    const update = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setScene((s) => (s + 1) % heroScenes.length),
      4800,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const s = heroScenes[scene];
  return (
    <div
      ref={root}
      className={
        "hero-visual finance-theatre" + (pattern ? " with-pattern" : "")
      }
      data-playing={playing}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Анимированный пример возможностей кабинета"
    >
      {pattern ? (
        <div className="finance-pattern">{pattern}</div>
      ) : (
        <>
          <div className="finance-aura" aria-hidden="true" />
          <div className="finance-orbits" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="orbit-satellite">
              <FileCheck2 size={19} />
            </span>
            <span className="orbit-satellite second">
              <WalletCards size={19} />
            </span>
          </div>
          <div className="finance-core" aria-hidden="true">
            <span />
            <Sparkles size={42} strokeWidth={1.5} />
            <i />
          </div>
          <div className="finance-signal" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="finance-live-label">
            <span className="motion-status-dot" /> Данные. Расчёт. Следующий
            шаг.
          </div>
        </>
      )}
      <div
        className="finance-scene-card"
        key={scene}
        aria-live="off"
        data-scene={scene}
      >
        <div className="finance-scene-heading">
          <span>{s.label}</span>
          <ArrowUpRight size={18} />
        </div>
        <strong>
          {s.value} <span>{s.unit}</span>
        </strong>
        <p>{s.detail}</p>
        <svg
          className="finance-sparkline"
          viewBox="0 0 270 115"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="hero-motion-fill" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#ef3124" stopOpacity=".2" />
              <stop offset="1" stopColor="#ef3124" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 65, 100].map((y) => (
            <line
              key={y}
              x1="10"
              x2="260"
              y1={y}
              y2={y}
              stroke="#e8eaf0"
              strokeDasharray="2 5"
            />
          ))}
          <polygon
            points={`10,115 ${s.points} 260,115`}
            fill="url(#hero-motion-fill)"
          />
          <polyline
            points={s.points}
            fill="none"
            stroke="#ef3124"
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
          />
        </svg>
        <div className="finance-scene-foot">
          <span>
            <Check size={13} /> {s.stat}
          </span>
          <span>Пример</span>
        </div>
      </div>
      <div className="finance-insight" key={"insight-" + scene}>
        <span className="icon-tile green">
          <ChartNoAxesCombined size={20} />
        </span>
        <div>
          <b>{s.title}</b>
          <small>{s.hint}</small>
        </div>
      </div>
      <div className="finance-controls" aria-label="Сцены инфографики">
        {heroScenes.map((item, i) => (
          <button
            key={item.label}
            aria-pressed={scene === i}
            className={scene === i ? "active" : ""}
            onClick={() => {
              setScene(i);
              setPaused(true);
            }}
          >
            <span>0{i + 1}</span>
            {["Подбор", "Платежи", "Прогноз"][i]}
          </button>
        ))}
        <button
          className="finance-play"
          aria-label={paused ? "Включить анимацию" : "Приостановить анимацию"}
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
      <p className="finance-example-note">
        Иллюстративные данные · не предложение банка
      </p>
    </div>
  );
}
