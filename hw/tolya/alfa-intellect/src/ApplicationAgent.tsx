import { useEffect, useRef, useState } from "react";
import { MessageSquare, ArrowUp } from "lucide-react";
import { api } from "./api";
import { MarkdownText } from "./MarkdownText";
import type { Chat } from "../shared/types";
import type { MvpApplication } from "../shared/mvp2";
const hints = [
  "Помогу найти ИНН, разобраться с полномочиями и согласиями.",
  "Загрузите CSV в анкете слева: по каждому расчётному счёту отдельно. Объясню формат и период выписок.",
  "Помогу сверить кредитные платежи и лизинг с выписками.",
  "Объясню, как указать сезонность и будущие операции отдельно от подтверждённых поступлений.",
  "Помогу уточнить сумму, срок и особенности выбранного продукта.",
];
export function ApplicationAgent({
  application,
  section,
  full = false,
}: {
  application: MvpApplication;
  section: number;
  full?: boolean;
}) {
  const [chat, setChat] = useState<Chat>(),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    messages = useRef<HTMLDivElement>(null),
    path = `/mvp2/applications/${application.id}/chat`;
  useEffect(() => {
    let current = true;
    void api<Chat>(path, { section })
      .then((c) => {
        if (current) setChat(c);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [application.id, section]);
  useEffect(() => {
    messages.current?.scrollTo({
      top: messages.current.scrollHeight,
      behavior: "instant",
    });
  }, [chat?.messages.length, busy]);
  async function send() {
    if (lock.current || !draft.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const text = draft.trim();
    setDraft("");
    try {
      await api(path, { section });
      setChat(await api(path, { text }));
    } catch (e) {
      setError((e as Error).message);
      try {
        setChat(await api(path, { section }));
      } catch {}
      setDraft(text);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className={`application-agent${full ? " application-agent-full" : ""}`}
      aria-label="Контекстный ИИ-агент"
    >
      <header>
        <MessageSquare size={22} />
        <div>
          <h2>ИИ-помощник</h2>
          <small>
            {application.decision
              ? "Обсуждение решения"
              : "В контексте текущего раздела"}
          </small>
        </div>
      </header>
      <div className="application-agent-hint">
        <p>
          {application.decision
            ? "Объясню сохранённое решение и доступные следующие шаги. Изменённые условия требуют нового расчёта."
            : hints[section]}
        </p>
      </div>
      <div
        className="application-agent-messages"
        ref={messages}
        role="log"
        aria-live="polite"
      >
        {!chat?.messages.length && (
          <p className="muted">
            Спросите о заполнении анкеты, документах или условиях. История
            останется в этой заявке.
          </p>
        )}
        {chat?.messages.map((m) => (
          <article className={`application-message ${m.role}`} key={m.id}>
            <small>{m.role === "user" ? "Вы" : "ИИ-помощник"}</small>
            <MarkdownText text={m.text} />
          </article>
        ))}
        {busy && <p role="status">Готовим ответ…</p>}
      </div>
      {error && (
        <p className="mvp-error" role="alert">
          {error}
        </p>
      )}
      <div className="application-agent-prompts">
        {["Что указать в этом разделе?", "Как подготовить выписку CSV?"].map(
          (text) => (
            <button type="button" key={text} onClick={() => setDraft(text)}>
              {text}
            </button>
          ),
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="visually-hidden" htmlFor={`agent-${application.id}`}>
          Сообщение финансовому помощнику
        </label>
        <textarea
          id={`agent-${application.id}`}
          aria-label="Сообщение финансовому помощнику"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1500}
          rows={2}
          placeholder="Задайте вопрос по заявке"
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          aria-label="Отправить сообщение"
          disabled={busy || !chat || !draft.trim()}
        >
          <ArrowUp size={20} />
        </button>
      </form>
      <small>ИИ объясняет данные, но не принимает кредитное решение.</small>
    </section>
  );
}
