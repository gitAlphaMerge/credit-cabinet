import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { LoadingScreen } from "./LoadingScreen";
import "./push-loading.css";
import "./loading-preview.css";
import "./bank-typography.css";
import "./brand-cursor.css";

/** A separate, clearly labelled design surface; it never calls customer APIs. */
function LoadingPreview() {
  const [mode, setMode] = useState("entry");
  const [run, setRun] = useState(0);
  const [dark, setDark] = useState(false);
  const choices: Record<string, [string, string]> = {
    entry: ["Открываем ваш финансовый контекст", "Пуш готовит рабочее пространство"],
    selection: ["Подбираем варианты", "Пуш сверяет сведения о вашем бизнесе"],
    review: ["Рассматриваем заявку", "Пуш проверяет документы"],
    document: ["Загружаем документ", "Пуш готовит документ к просмотру"],
  };
  const steps = mode === "review" ? [
    {id: "docs", label: "Проверка документов", status: "done" as const},
    {id: "flow", label: "Анализ выписок", status: "running" as const},
    {id: "result", label: "Подготовка результата", status: "pending" as const},
  ] : [];
  return <div className="loading-preview-shell" style={{
    "--theme-bg": dark ? "#10141b" : "#f4f6f8",
    "--theme-surface": dark ? "#191f29" : "#ffffff",
    "--theme-ink": dark ? "#edf1f7" : "#171923",
    "--theme-muted": dark ? "#b4bfce" : "#4f5b6c",
    "--theme-line": dark ? "#414d5d" : "#d3d9e1",
  } as CSSProperties}>
    <header><div><b>Пуш</b><span>ЖИВОЙ ДИЗАЙН ЗАГРУЗКИ</span></div><button onClick={() => {setDark(!dark); setRun(run + 1);}}>{dark ? "Светлый фон" : "Тёмный фон"}</button></header>
    <nav aria-label="Экран предпросмотра">{Object.entries(choices).map(([key, [title]]) => <button key={key} aria-pressed={mode === key} onClick={() => {setMode(key); setRun(run + 1);}}>{title}</button>)}</nav>
    <main className={mode === "document" ? "preview-compact" : ""}>
      <LoadingScreen key={run} title={choices[mode][0]} message={choices[mode][1]} steps={steps} compact={mode === "document"} />
    </main>
    <footer><p>Предпросмотр. Узор из исходных SVG: частицы собираются, падают и реагируют на курсор.</p><div className="preview-controls"><button onClick={() => document.querySelector(".push-loading")?.dispatchEvent(new Event("loading-pattern-release"))}>Уронить узор</button><button onClick={() => setRun(run + 1)}>Собрать заново</button></div></footer>
  </div>;
}
createRoot(document.getElementById("root")!).render(<LoadingPreview />);

import "./ui-scale.css";
