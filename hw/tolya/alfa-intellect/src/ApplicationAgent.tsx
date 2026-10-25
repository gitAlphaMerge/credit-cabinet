import { useEffect, useRef, useState } from "react";
import { MessageSquare, ArrowUp, RotateCw } from "lucide-react";
import { api } from "./api";
import { MarkdownText } from "./MarkdownText";
import type { Chat } from "../shared/types";
import type { MvpApplication } from "../shared/mvp2";
import { helpForSection, applicationHelp } from "../shared/application-help";
const hints = [
  "Помогу найти ИНН, разобраться с полномочиями и согласиями.",
  "Добавьте CSV в разделе «Финансы»: по каждому расчётному счёту отдельно. Объясню формат и период выписок.",
  "Помогу сверить кредитные платежи и лизинг с выписками.",
  "Объясню, как указать сезонность и будущие операции отдельно от подтверждённых поступлений.",
  "Помогу уточнить сумму, срок и особенности выбранного продукта.",
];
export function ApplicationAgent({
  application,
  section,
  full = false,
  validationFields = [],
  activeField = "",
}: {
  application: MvpApplication;
  section: number;
  full?: boolean;
  validationFields?: string[];
  activeField?: string;
}) {
  const [chat, setChat] = useState<Chat>(),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState<{
      text: string;
      id?: string;
      promptId?: string;
    } | null>(null);
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
        if (current)
          setError(
            "Не удалось загрузить переписку. Анкету можно продолжить заполнять.",
          );
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
  useEffect(() => {
    const element = messages.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let wasVisible = false;
    const observer = new ResizeObserver(([entry]) => {
      const visible =
        entry.contentRect.width > 0 && entry.contentRect.height > 0;
      if (visible && !wasVisible)
        element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
      wasVisible = visible;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const { applicationId, promptId } = (event as CustomEvent).detail;
      if (applicationId !== application.id) return;
      const help = applicationHelp.find((x) => x.id === promptId);
      if (help) void send({ text: help.question, promptId });
    };
    window.addEventListener("application-reference-question", handler);
    return () =>
      window.removeEventListener("application-reference-question", handler);
  }, [application.id, section, chat]);
  async function send(previous?: {
    text: string;
    id?: string;
    promptId?: string;
  }) {
    const text = previous?.text ?? draft.trim();
    if (lock.current || !text) return;
    lock.current = true;
    setBusy(true);
    setError("");
    if (!previous) setDraft("");
    setRetry(null);
    try {
      await api(path, { section, activeField, validationFields });
      setChat(
        await api(
          path,
          previous?.id
            ? {
                retryMessageId: previous.id,
                promptId: previous.promptId,
                section,
                activeField,
                validationFields,
              }
            : {
                text,
                promptId: previous?.promptId,
                section,
                activeField,
                validationFields,
              },
        ),
      );
    } catch (e) {
      setError(
        "Сейчас помощник не может ответить. Вы можете продолжить заполнение анкеты.",
      );
      try {
        const saved = await api<Chat>(path, { section });
        setChat(saved);
        const last = saved.messages.at(-1);
        if (last?.role === "user" && last.text === text) {
          setRetry({ text, id: last.id, promptId: previous?.promptId });
          setError(
            "Вопрос сохранён. Помощник сейчас недоступен — попробуйте ещё раз позже.",
          );
        } else if (last?.role === "assistant") setError("");
        else setRetry({ text, promptId: previous?.promptId });
      } catch {
        setRetry({ text, promptId: previous?.promptId });
      }
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
              : [
                  "Компания",
                  "Финансы",
                  "Обязательства",
                  "Особенности",
                  "Финансирование",
                ][section]}
          </small>
        </div>
      </header>
      <div
        className="application-agent-messages"
        ref={messages}
        role="log"
        aria-live="polite"
      >
        {!chat?.messages.length && (
          <div className="agent-welcome">
            <span className="agent-reference-label">Помощь по разделу</span>
            <p>
              {application.decision
                ? "Объясню сохранённое решение и доступные следующие шаги. Изменённые условия требуют нового расчёта."
                : hints[section]}
            </p>
            <small>
              Выберите подсказку, чтобы разобраться с заполнением, или напишите
              свой вопрос по заявке.
            </small>
          </div>
        )}
        {chat?.messages.map((m) => (
          <article className={`application-message ${m.role}`} key={m.id}>
            <small>
              {m.role === "user"
                ? "Вы"
                : m.mode === "application-reference"
                  ? "Справочное пояснение"
                  : "ИИ-помощник"}
            </small>
            <MarkdownText text={m.text} />
          </article>
        ))}
        {busy && (
          <p className="agent-typing" role="status">
            <i />
            <i />
            <i />
            <span className="visually-hidden">Готовим ответ…</span>
          </p>
        )}
      </div>
      {error && (
        <div className="agent-unavailable" role="status">
          <small>{error}</small>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              retry
                ? void send(retry)
                : void api<Chat>(path, { section })
                    .then((c) => {
                      setChat(c);
                      setError("");
                    })
                    .catch(() => {})
            }
          >
            <RotateCw size={13} />
            Повторить
          </button>
        </div>
      )}
      <div className="application-agent-prompts">
        {helpForSection(
          section,
          application.decision,
          validationFields.length > 0,
        ).map((prompt) => (
          <button
            type="button"
            key={prompt.id}
            disabled={busy || !chat}
            onClick={() =>
              void send({ text: prompt.question, promptId: prompt.id })
            }
          >
            {prompt.label}
          </button>
        ))}
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
