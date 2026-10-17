import { useEffect, useRef, useState } from "react";
import {
  History,
  Plus,
  Maximize2,
  Minimize2,
  Paperclip,
  ArrowUp,
  Sparkles,
  MessageSquare,
  ArrowRight,
  Pencil,
  Check,
  AlertTriangle,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, IconButton, Badge, CalculationView, Modal } from "./ui";
import { api } from "./api";
import { MarkdownText } from "./MarkdownText";
export function Chat({
  full = false,
  onHide,
}: {
  full?: boolean;
  onHide?: () => void;
}) {
  const w = useWorkspace(),
    [renaming, setRenaming] = useState(false),
    [search, setSearch] = useState(""),
    [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null),
    historyRef = useRef<HTMLElement>(null),
    newChatLock = useRef(false),
    composerInput = useRef<HTMLTextAreaElement>(null),
    end = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(() => innerWidth <= 760);
  useEffect(() => {
    const query = matchMedia("(max-width:760px)");
    const update = () => {
      setMobile(query.matches);
      if (query.matches) w.setHistoryOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !w.historyOpen) return;
    const previous = document.activeElement as HTMLElement;
    historyRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previous?.focus();
  }, [mobile, w.historyOpen]);
  const chat =
    w.state.chats.find((c) => c.id === w.activeChatId) || w.state.chats[0];
  const busy = !!w.sending,
    sendingText = w.sending?.chatId === chat?.id ? w.sending.text : "";
  useEffect(() => {
    const input = composerInput.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = Math.min(180, input.scrollHeight) + "px";
    }
  }, [w.draft]);
  useEffect(() => {
    if (chat?.messages.length || busy)
      void end.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [chat?.messages.length, busy]);
  async function newChat() {
    if (newChatLock.current || busy) return;
    newChatLock.current = true;
    try {
      const c = await w.act("/chats", {});
      w.setActiveChatId(c.id);
      if (mobile) w.setHistoryOpen(false);
    } catch {
      // act already exposes a user-facing error; keep the current dialogue.
    } finally {
      newChatLock.current = false;
    }
  }
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    await w.sendMessage();
  }
  function prompt(s: string) {
    void w.sendMessage(s);
  }
  return (
    <section className={"chat-shell " + (full ? "expanded" : "")}>
      <header className="chat-header" data-tour="chat-panel">
        {full && (
          <IconButton
            label={w.historyOpen ? "Скрыть историю" : "Открыть историю"}
            onClick={() => w.setHistoryOpen(!w.historyOpen)}
          >
            {w.historyOpen ? (
              <PanelLeftClose size={19} />
            ) : (
              <PanelLeftOpen size={19} />
            )}
          </IconButton>
        )}
        <div className="agent-avatar">
          <Sparkles size={19} />
        </div>
        <div className="chat-header-title">
          <button
            className="unstyled"
            onClick={() => {
              setTitle(chat?.title || "");
              setRenaming(true);
            }}
          >
            <b>
              {chat?.title || "Финансовый помощник"} <Pencil size={11} />
            </b>
          </button>
        </div>
        <IconButton
          disabled={busy}
          label="Новый диалог"
          onClick={() => void newChat()}
        >
          <Plus size={18} />
        </IconButton>
        {!full && (
          <span data-tour="history">
            <IconButton
              label={w.historyOpen ? "Скрыть историю" : "Открыть историю"}
              onClick={() => w.setHistoryOpen(!w.historyOpen)}
            >
              <History size={18} />
            </IconButton>
          </span>
        )}
        {full ? (
          <button
            className="text-button back-to-cabinet"
            onClick={() => {
              w.setChatVisible(true);
              w.go("/cabinet");
            }}
          >
            К кабинету <ArrowRight size={16} />
          </button>
        ) : (
          <>
            <IconButton
              label="Открыть чат отдельной страницей"
              onClick={() => w.go("/chat")}
            >
              <Maximize2 size={18} />
            </IconButton>
            <IconButton label="Скрыть чат" onClick={onHide}>
              <X size={18} />
            </IconButton>
          </>
        )}
      </header>
      <div className="chat-layout">
        {mobile && w.historyOpen && (
          <button
            className="history-scrim"
            aria-label="Закрыть панель истории"
            onClick={() => w.setHistoryOpen(false)}
          />
        )}
        {w.historyOpen && (
          <aside
            ref={historyRef}
            className="chat-history"
            role={mobile ? "dialog" : undefined}
            aria-modal={mobile ? true : undefined}
            aria-label="История диалогов"
            onKeyDown={(e) => {
              if (e.key === "Escape") w.setHistoryOpen(false);
              if (mobile && e.key === "Tab") {
                const nodes = Array.from(
                  historyRef.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input",
                  ) || [],
                );
                const first = nodes[0],
                  last = nodes.at(-1);
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
            <div className="history-drawer-title">
              <b>Диалоги</b>
              <IconButton
                label="Закрыть историю"
                onClick={() => w.setHistoryOpen(false)}
              >
                <X size={18} />
              </IconButton>
            </div>
            <Button secondary disabled={busy} onClick={() => void newChat()}>
              <Plus size={16} /> Новый диалог
            </Button>
            <small className="eyebrow">ИСТОРИЯ ДИАЛОГОВ</small>
            <input
              className="chat-search"
              aria-label="Поиск диалогов"
              placeholder="Найти диалог…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {w.state.chats
              .filter((c) =>
                c.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className={c.id === chat?.id ? "active" : ""}
                  onClick={() => {
                    w.setActiveChatId(c.id);
                    if (mobile) w.setHistoryOpen(false);
                  }}
                >
                  <MessageSquare size={16} />
                  <span>
                    <b>{c.title}</b>
                    <small>
                      {c.selectionId ? "Связан с подбором" : "Обычный диалог"} ·{" "}
                      {c.messages.length} сообщений
                    </small>
                  </span>
                </button>
              ))}
          </aside>
        )}
        <div
          className="chat-main"
          inert={mobile && w.historyOpen ? true : undefined}
        >
          <div className="messages">
            {!chat?.messages.length ? (
              <div className="chat-welcome">
                <span className="welcome-orb">
                  <Sparkles size={30} />
                </span>
                <h3>Чем помочь вашему бизнесу?</h3>
                <p>
                  {w.state.profile.name}. Можем разобрать документы, оценить
                  нагрузку или обсудить сохранённый расчёт.
                </p>
                <div className="starter-prompts">
                  {[
                    "Как оценить кредитную нагрузку?",
                    "Какие документы нужны?",
                    "Объясни мой последний расчёт",
                  ].map((t) => (
                    <button disabled={busy} key={t} onClick={() => prompt(t)}>
                      {t}
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.messages.map((m) => (
                <div key={m.id} className={"message " + m.role}>
                  {m.role === "assistant" && (
                    <div className="message-agent">
                      <Sparkles size={14} />
                    </div>
                  )}
                  <div className="message-body">
                    {m.mode === "demo" && (
                      <Badge>Демо · программный сценарий</Badge>
                    )}
                    <MarkdownText text={m.text} />
                    {m.calculation && (
                      <CalculationView c={m.calculation} />
                    )}{" "}
                    {m.warning && (
                      <div className="alert">
                        <AlertTriangle size={17} />
                        {m.warning}
                      </div>
                    )}
                    {m.proposal && (
                      <div className="proposal">
                        <b>
                          Изменение:{" "}
                          {w.config.fieldNames?.[m.proposal.field] ||
                            m.proposal.field}{" "}
                          → {m.proposal.value.toLocaleString("ru-RU")} ₽
                        </b>
                        <Button
                          secondary
                          onClick={async () => {
                            await w.act("/financials", m.proposal);
                            w.error(
                              "Показатель сохранён с источником «со слов пользователя»",
                            );
                          }}
                        >
                          Подтвердить изменение <Check size={15} />
                        </Button>
                      </div>
                    )}
                    <time>
                      {new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </div>
              ))
            )}
            {busy && sendingText && (
              <div className="message user">
                <div className="message-body">
                  <p>{sendingText}</p>
                  <time>Отправлено · ожидаем ответ</time>
                </div>
              </div>
            )}
            {busy && (
              <div className="message assistant">
                <div className="message-agent">
                  <Sparkles size={14} />
                </div>
                <div className="thinking">
                  <i />
                  <i />
                  <i />
                  <span>Готовим ответ…</span>
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
          <form className="composer" onSubmit={send}>
            <button
              type="button"
              className="finance-chat-cta"
              onClick={() => w.go("/financing")}
            >
              Подобрать финансирование <ArrowRight size={16} />
            </button>
            <div className="composer-row">
              <IconButton
                label="Прикрепить документ"
                type="button"
                disabled={w.uploading}
                onClick={() => input.current?.click()}
              >
                <Paperclip size={19} />
              </IconButton>
              <input
                ref={input}
                hidden
                type="file"
                accept=".csv,.xlsx,.docx,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void w.upload(file);
                  e.target.value = "";
                }}
              />
              <textarea
                ref={composerInput}
                aria-label="Сообщение финансовому помощнику"
                value={w.draft}
                onChange={(e) => w.setDraft(e.target.value)}
                placeholder="Спросите о вашем бизнесе…"
                maxLength={4000}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                className="send-button"
                aria-label="Отправить сообщение"
                disabled={busy || !w.draft.trim()}
              >
                <ArrowUp size={20} />
              </button>
            </div>
            {w.uploading && (
              <small role="status">Извлекаем данные документа…</small>
            )}
          </form>
        </div>
      </div>
      {renaming && (
        <Modal title="Название диалога" onClose={() => setRenaming(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await w.act("/chats/" + chat.id, { title }, "PATCH");
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              aria-label="Название диалога"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="modal-actions">
              <Button>Сохранить</Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
