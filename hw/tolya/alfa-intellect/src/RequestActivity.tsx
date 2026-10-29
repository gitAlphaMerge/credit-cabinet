import { useEffect, useRef, useState } from "react";
import { LoadingScreen } from "./LoadingScreen";
/** One shared indicator also catches actions that previously had only disabled buttons. */
export function RequestActivity() {
  const requests = useRef(new Map<number, string>());
  const [view, setView] = useState<{label: string; state: "running" | "done" | "error"} | null>(null);
  useEffect(() => {
    let reveal: ReturnType<typeof setTimeout> | undefined, hide: ReturnType<typeof setTimeout> | undefined;
    let shownAt = 0;
    const hasAnotherLoader = () => Array.from(document.querySelectorAll(".push-loading")).some(node => !node.closest(".request-activity"));
    const show = () => {shownAt = Date.now(); setView({label: [...requests.current.values()].at(-1) ?? "Готовим результат", state: "running"});};
    const start = (event: Event) => {
      const {id, label} = (event as CustomEvent).detail;
      const wasEmpty = !requests.current.size;
      requests.current.set(id, label);
      clearTimeout(hide);
      if (wasEmpty) {clearTimeout(reveal); reveal = setTimeout(() => {if (!hasAnotherLoader()) show();}, 120);}
    };
    const end = (event: Event) => {
      const {id, ok} = (event as CustomEvent).detail;
      if (!requests.current.delete(id)) return;
      if (requests.current.size) return;
      clearTimeout(reveal);
      if (!shownAt && hasAnotherLoader()) return;
      if (!shownAt) {shownAt = Date.now();}
      setView({label: ok ? "Готово" : "Не удалось завершить действие", state: ok ? "done" : "error"});
      hide = setTimeout(() => {shownAt = 0; setView(null);}, Math.max(420, 720 - (Date.now() - shownAt)));
    };
    window.addEventListener("alfa-request-start", start); window.addEventListener("alfa-request-end", end);
    return () => {clearTimeout(reveal); clearTimeout(hide); requests.current.clear(); window.removeEventListener("alfa-request-start", start); window.removeEventListener("alfa-request-end", end);};
  }, []);
  if (!view) return null;
  return <aside className="request-activity" aria-label="Состояние действия"><LoadingScreen compact title={view.label} message={view.state === "running" ? "Пуш занимается вашей задачей" : view.state === "done" ? "Результат сохранён" : "Проверьте сообщение на экране"} steps={[{id: "request", label: view.label, status: view.state}]}/></aside>;
}
