import {
  useEffect,
  useId,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { MessageSquare, FileText } from "lucide-react";

export const sectionDescriptions = [
  "Найдём сведения по ИНН. Вам останется проверить компанию и подтвердить полномочия.",
  "Проверим поступления и расходы по расчётным счетам. Выписки нужны для оценки доступных условий.",
  "Уточним платежи по действующим кредитам и лизингу — чтобы учесть полную нагрузку.",
  "Расскажите о сезонности и крупных разовых операциях, если они ожидаются.",
  "Проверьте сохранённый запрос и уточните условия, важные для выбранного продукта.",
];
/** One owner for the panel header, single scroll region and persistent action bar. */
export function ApplicationWorkspace({
  title,
  description,
  navigation,
  footer,
  agent,
  children,
  scrollRef,
  screenKey,
}: {
  title: string;
  description: string;
  navigation?: ReactNode;
  footer: ReactNode;
  agent: ReactNode;
  children: ReactNode;
  scrollRef: RefObject<HTMLElement | null>;
  screenKey: string;
}) {
  const [mobilePanel, setMobilePanel] = useState("form"),
    id = useId();
  useEffect(() => setMobilePanel("form"), [screenKey]);
  useEffect(() => {
    const show = () => setMobilePanel("agent");
    window.addEventListener("application-reference-question", show);
    return () =>
      window.removeEventListener("application-reference-question", show);
  }, []);
  return (
    <>
      <div className="workspace-mobile-switch" aria-label="Рабочая область">
        <button
          type="button"
          aria-pressed={mobilePanel === "form"}
          aria-controls={id + "-form"}
          onClick={() => setMobilePanel("form")}
        >
          <FileText size={17} />
          Анкета
        </button>
        <button
          type="button"
          aria-pressed={mobilePanel === "agent"}
          aria-controls={id + "-agent"}
          onClick={() => setMobilePanel("agent")}
        >
          <MessageSquare size={17} />
          Помощник
        </button>
      </div>
      <div
        className="mvp-layout credit-workspace"
        data-mobile-panel={mobilePanel}
      >
        <section
          className="credit-form-panel"
          id={id + "-form"}
          aria-label="Анкета бизнеса"
        >
          {navigation && (
            <nav className="credit-section-nav" aria-label="Разделы анкеты">
              {navigation}
            </nav>
          )}
          <header className="credit-form-header">
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          <section
            className="credit-form-scroll"
            ref={scrollRef}
            aria-label="Поля анкеты"
          >
            {children}
          </section>
          <footer className="credit-form-actions">{footer}</footer>
        </section>
        <aside className="credit-agent-panel" id={id + "-agent"}>
          {agent}
        </aside>
      </div>
    </>
  );
}
