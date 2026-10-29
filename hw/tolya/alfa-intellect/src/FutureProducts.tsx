import { NavigationLink } from "./NavigationLink";
import { ProductAssembly } from "./ProductAssembly";
import { OmegaMicrophone } from "./OmegaIdentity";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Plus, Pause, Play, Send, Terminal, MessageSquare, Coins } from "lucide-react";
import { Modal } from "./ui";
import { LoadingScreen } from "./LoadingScreen";
import { useReducedMotion } from "./motion";

export const pulseStories = [
  { id: "cabinet", title: "Умный кредитный кабинет: от задачи бизнеса к понятному решению", category: "Продукты", time: "10:40", date: "28 октября 2026", visual: 0 },
  { id: "omega", title: "Альфа и Омега: агент-воркер и агент-оркестратор. Бенчмарки превысили Алису AI и ГигаЧат", category: "Технологии", time: "10:15", date: "28 октября 2026", visual: 1 },
  { id: "million", title: "Количество организаций с Альфа-Банком выросло до 1 миллиона", category: "Бизнес", time: "09:30", date: "28 октября 2026", visual: 2 },
  { id: "cash", title: "От выписки к действию: как увидеть кассовый разрыв заранее", category: "Аналитика", time: "09:00", date: "28 октября 2026", visual: 3 },
];

/** Code-native geometry from the supplied design language, never a stock illustration. */
export function ProductGeometry({ kind = 0 }: { kind?: number }) {
  return <svg className={"product-geometry geometry-" + kind} viewBox="0 0 360 220" aria-hidden="true">
    <rect x="0" y="0" width="360" height="220" rx="18" fill="var(--theme-surface-soft)" />
    <g className="geometry-drift-a" fill="var(--theme-brand)">
      <path d="M44 44h88v88A88 88 0 0 1 44 44" />
      <circle cx="244" cy="88" r="36" fill="none" stroke="var(--theme-brand)" strokeWidth="13" />
      <rect x="153" y="151" width="92" height="13" rx="6.5" />
    </g>
    <g className="geometry-drift-b" fill="var(--theme-ink)">
      <path d="M151 42h48v48z" />
      <circle cx="78" cy="171" r="19" />
      <path d="M276 143h48v48A48 48 0 0 1 276 143" />
    </g>
    <g fill="var(--theme-red)" opacity=".22"><circle cx="174" cy="113" r="20"/><rect x="285" y="33" width="13" height="48" rx="6.5"/></g>
  </svg>;
}

/** Headlines are explicitly mock editorial scenarios, not claims about the bank. */
export function PulseWidgets({ onTeam }: { onTeam: () => void }) {
  const [active, setActive] = useState(0), [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (paused || reduced) return;
    const timer = setInterval(() => { if (!document.hidden) setActive(value => (value + 1) % pulseStories.length); }, 5600);
    return () => clearInterval(timer);
  }, [paused, reduced]);
  const story = pulseStories[active];
  return <article className="future-pulse" data-paused={paused || reduced}>
    <header className="future-card-heading"><div><span className="future-label">ДЕМО · В АКТИВНОЙ РАЗРАБОТКЕ</span><h3>Пульс</h3></div><button className="icon-button" aria-label={paused ? "Продолжить анимацию новостей" : "Приостановить анимацию новостей"} onClick={() => setPaused(!paused)}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button></header>
    <div className="pulse-story" key={story.id} data-paused={paused || reduced}>
      <ProductAssembly variant="pulse" paused={paused || reduced} controls={false}/>
      <div className="pulse-story-meta"><span>Демо · {story.category}</span><time dateTime={"2026-10-28T" + story.time + ":00+03:00"}>{story.date} · {story.time} МСК</time></div>
      <h4>{story.title}</h4>
    </div>
    <div className="pulse-ticker" aria-label="Заголовки Пульса">{pulseStories.map((item, index) => <button key={item.id} aria-pressed={active === index} onClick={() => setActive(index)}><ProductGeometry kind={item.visual}/><span className="pulse-mini-copy"><b>{item.title}</b><time>{item.date} · {item.time}</time></span></button>)}</div>
    <p className="future-disclosure">Демонстрационная лента. Заголовки, сравнение моделей, цифры и даты показаны как сценарии интерфейса, не как подтверждённые новости.</p>
    <button className="future-link" onClick={onTeam}>К команде продукта <ArrowUpRight size={16}/></button>
  </article>;
}

/** The requested model interface is a labelled prototype, with no silent LLM calls. */
export function OmegaPreview({ mode, onMode, onTeam }: { mode: "omega" | "code"; onMode: (mode: "omega" | "code") => void; onTeam: () => void }) {
  const [draft, setDraft] = useState(""), [opening, setOpening] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function send() {
    if (!draft.trim() || opening) return;
    setOpening(true);
    timer.current = setTimeout(onTeam, 700);
  }
  return <div className="omega-workspace">
    <aside className="omega-sidebar"><span className="omega-wordmark">Ω</span><b>Омега</b><span className="future-status">В активной разработке</span><button onClick={() => setDraft("")}><Plus size={16}/>Новая задача</button><small>РАБОЧЕЕ ПРОСТРАНСТВО</small><button aria-pressed={mode === "omega"} onClick={() => onMode("omega")}><MessageSquare size={16}/>Омега</button><button aria-pressed={mode === "code"} onClick={() => onMode("code")}><Terminal size={16}/>Омега Код</button><p>Альфа выполняет отдельные задачи. Омега связывает их в один процесс.</p><button className="future-link" onClick={onTeam}>Команда продукта <ArrowUpRight size={16}/></button></aside>
    <div className="omega-main"><header><b>{mode === "code" ? "Омега Код" : "Омега"}</b><span>Превью интерфейса</span></header>
      {opening ? <LoadingScreen title="Открываем команду Омеги" message="Покажем, кто создаёт продукт"/> : <>
        <div className="omega-welcome"><span className="omega-emblem" aria-hidden="true">{mode === "code" ? "{ Ω }" : "Ω"}</span><h3>{mode === "code" ? "От идеи к работающему коду" : "Что разберём вместе?"}</h3><p>{mode === "code" ? "Рабочее пространство для кода, инструментов и проверки результата." : "Финансовая модель, сценарии бизнеса и задачи, которым нужен контекст."}</p></div>
        {mode === "code" && <div className="omega-code-sample"><div><i/><i/><i/><span>workspace / analysis.py</span></div><pre><code>{'# Пример будущего рабочего пространства\nclass BusinessScenario:\n    def explain(self, evidence):\n        return evidence.summary()'}</code></pre><small>Макет. Код и инструменты здесь не исполняются.</small></div>}
        <div className="omega-suggestions">{(mode === "code" ? ["Разобрать модель денежного потока", "Подготовить тесты сценариев", "Объяснить расчёт"] : ["Разобрать финансовую модель", "Сравнить сценарии бизнеса", "Подготовить план действий"]).map(prompt => <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}<ArrowUpRight size={14}/></button>)}</div>
        <form className="omega-composer" onSubmit={event => {event.preventDefault(); send();}}><label className="visually-hidden" htmlFor="omega-prompt">Запрос к Омеге</label><textarea id="omega-prompt" value={draft} onChange={event => setDraft(event.target.value)} placeholder={mode === "code" ? "Опишите, что хотите собрать…" : "Какую задачу разберём?"} rows={2} maxLength={2000} onKeyDown={event => {if(event.key === "Enter" && !event.shiftKey) {event.preventDefault(); if (draft.trim()) event.currentTarget.form?.requestSubmit();}}}/><div><span>Превью · запрос не отправляется модели</span><OmegaMicrophone disabled={opening} onText={text => setDraft(value => [value,text].filter(Boolean).join(" ").slice(0,2000))}/><button type="submit" className="button" disabled={!draft.trim()} aria-label="Отправить запрос и открыть команду продукта"><Send size={17}/></button></div></form>
        <p className="future-disclosure">После отправки откроется «О продукте», раздел с именами команды. Это демонстрационный экран системы в разработке.</p>
      </>}
    </div>
  </div>;
}

export function FutureProducts({ go }: { go: (path: string) => void }) {
  const [preview, setPreview] = useState<"omega" | null>(null), [mode, setMode] = useState<"omega" | "code">("omega");
  const team = () => {setPreview(null); go("/about#team");};
  return <section id="roadmap" className="section wrap future-products">
    <header className="future-heading"><div><span className="eyebrow">НОВЫЕ РАЗРАБОТКИ</span><h2>Следующий шаг кабинета</h2></div><p>Создаём инструменты, которые видят бизнес целиком.</p></header>
    <div className="future-layout"><article className="future-omega"><div className="future-card-heading"><span className="future-label">АЛЬФА И ОМЕГА</span><span className="future-status"><i/>В активной разработке</span></div><ProductAssembly/><h3>Одна задача.<br/>Целая команда агентов.</h3><p>Альфа выполняет. Омега координирует: контекст, финансовые модели и длинные задачи бизнеса в одном рабочем пространстве.</p><div className="future-product-modes"><span>Омега</span><span>Омега Код</span></div><button className="button" onClick={() => setPreview("omega")}>Превью агента <ArrowUpRight size={17}/></button><small className="future-disclosure">Показываем интерфейс. Подключение модели и инструментов в разработке.</small></article>
      <PulseWidgets onTeam={team}/>
      <article className="future-cfa"><div className="cfa-art" aria-hidden="true"><Coins/><i/><i/></div><div><span className="future-status">В активной разработке</span><h3>ЦФА для бизнеса</h3><p>Планируемое рабочее пространство эмитента: параметры выпуска, документы и этапы размещения рядом с кредитным кабинетом.</p></div><NavigationLink className="button secondary" to="/cfa" go={go}>Посмотреть концепт <ArrowRight size={16}/></NavigationLink></article>
    </div>
    {preview === "omega" && <Modal wide title={mode === "code" ? "Омега Код" : "Агент Омега"} onClose={() => setPreview(null)}><OmegaPreview mode={mode} onMode={setMode} onTeam={team}/></Modal>}

  </section>;
}
