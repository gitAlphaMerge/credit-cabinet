import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Maximize2,
  Minimize2,
  Sparkles,
  Pencil,
  Check,
  AlertTriangle,
  X,
  PanelLeftOpen,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, IconButton, Badge, CalculationView, Modal } from "./ui";
import { MarkdownText } from "./MarkdownText";
import { ChatComposer } from "./ChatComposer";
import { ChatHistory } from "./ChatHistory";
import { STARTER_PROMPTS } from "./chat-ui";
import { useReducedMotion } from "./motion";
import type { Chat as ChatModel } from "../shared/types";
export function Chat({
  full = false,
  onHide,
}: {
  full?: boolean;
  onHide?: () => void;
}) {
  const w = useWorkspace(),
    reduced = useReducedMotion();
  const [renameId, setRenameId] = useState<string | null>(null),
    [title, setTitle] = useState("");
  const [mobile, setMobile] = useState(() => innerWidth <= 760);
  const [confirmingFunding, setConfirmingFunding] = useState(false);
  const root = useRef<HTMLElement>(null),
    messages = useRef<HTMLDivElement>(null),
    newChatLock = useRef(false),
    lastChat = useRef("");
  const drawer = mobile || !full,
    chat =
      w.state.chats.find((c) => c.id === w.activeChatId) || w.state.chats[0];
  const busy = !!w.sending,
    sendingText = w.sending?.chatId === chat?.id ? w.sending.text : "";
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
    const node = messages.current;
    if (!node) return;
    const changed = lastChat.current !== chat?.id;
    lastChat.current = chat?.id || "";
    node.scrollTo({
      top: node.scrollHeight,
      behavior: changed || reduced ? "instant" : "smooth",
    });
  }, [chat?.id, chat?.messages.length, busy, reduced]);
  useEffect(() => {
    if (!w.historyOpen)
      root.current
        ?.querySelector<HTMLButtonElement>(".history-toggle")
        ?.focus({ preventScroll: true });
  }, [w.historyOpen]);
  async function newChat() {
    if (newChatLock.current || busy) return;
    newChatLock.current = true;
    try {
      const c = await w.act("/chats", {});
      w.setActiveChatId(c.id);
      if (drawer) w.setHistoryOpen(false);
    } catch {
      /* Workspace exposes the request error without losing the current dialog. */
    } finally {
      newChatLock.current = false;
    }
  }
  function rename(c: ChatModel) {
    setTitle(c.title);
    setRenameId(c.id);
  }
  return (
    <section
      ref={root}
      className={
        "chat-shell chat-v3 " +
        (full ? "expanded" : "") +
        (w.historyOpen ? " history-open" : "")
      }
      data-drawer={drawer}
      aria-label="Финансовый помощник"
    >
      <div className="chat-layout">
        {drawer && w.historyOpen && (
          <button
            className="history-scrim"
            aria-label="Закрыть панель истории"
            onClick={() => w.setHistoryOpen(false)}
          />
        )}
        <ChatHistory
          drawer={drawer}
          activeId={chat?.id || ""}
          onNew={() => void newChat()}
          onRename={rename}
        />
        <div
          className="chat-main"
          inert={drawer && w.historyOpen ? true : undefined}
        >
          <header className="chat-header" data-tour="chat-panel">
            <IconButton
              className="history-toggle"
              label="Открыть историю"
              aria-expanded={w.historyOpen}
              onClick={() => w.setHistoryOpen(!w.historyOpen)}
            >
              <PanelLeftOpen size={19} />
            </IconButton>
            <div className="chat-header-title">
              <button
                className="unstyled"
                aria-label={
                  "Переименовать текущий диалог: " +
                  (chat?.title || "Новый диалог")
                }
                onClick={() => {
                  if (chat) rename(chat);
                }}
              >
                <b>{chat?.title || "Новый диалог"}</b>
                <Pencil size={12} />
              </button>
            </div>
            <div className="chat-header-actions">
              <IconButton
                className="header-new-chat"
                disabled={busy}
                label="Новый диалог"
                onClick={() => void newChat()}
              >
                <Plus size={19} />
              </IconButton>
              <IconButton
                label={
                  full ? "Совмещённый режим" : "Открыть чат отдельной страницей"
                }
                onClick={() => {
                  if (full) {
                    w.setHistoryOpen(false);
                    w.setChatVisible(true);
                    w.go(w.cabinetPath || "/cabinet");
                  } else w.go("/chat");
                }}
              >
                {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </IconButton>
              {!full && (
                <IconButton label="Скрыть чат" onClick={onHide}>
                  <X size={18} />
                </IconButton>
              )}
            </div>
          </header>
          {chat?.selectionId && (
            <div className="chat-funding-context">
              <span>
                Подбор финансирования · версия{" "}
                {
                  w.state.selections.find((s) => s.id === chat.selectionId)
                    ?.version
                }
              </span>
              <button
                className="text-button"
                onClick={() => {
                  w.cacheFinancingDraft({
                    ...w.financingDraft,
                    tab: "new",
                    selected: chat.selectionId,
                  });
                  w.go("/financing");
                }}
              >
                Открыть подбор →
              </button>
            </div>
          )}
          <div
            className={
              "messages " + (!chat?.messages.length && !busy ? "is-empty" : "")
            }
            ref={messages}
          >
            <div className="chat-thread" key={chat?.id || "empty"}>
              {!chat?.messages.length && !busy ? (
                <div className="chat-welcome">
                  <span className="welcome-orb">
                    <Sparkles size={25} strokeWidth={1.6} />
                  </span>
                  <h1>Чем помочь вашему бизнесу?</h1>
                  <p>
                    Разберём документы, оценим нагрузку и обсудим ваш расчёт.
                  </p>
                  <div className="starter-prompts">
                    {STARTER_PROMPTS.map((t) => (
                      <button
                        disabled={busy}
                        key={t}
                        onClick={() => void w.sendMessage(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chat?.messages.map((m) => (
                  <article
                    key={m.id}
                    className={"message " + m.role}
                    aria-label={
                      m.role === "assistant"
                        ? "Ответ помощника"
                        : "Ваше сообщение"
                    }
                  >
                    {m.role === "assistant" && (
                      <div className="message-agent" aria-hidden="true">
                        <Sparkles size={17} strokeWidth={1.6} />
                      </div>
                    )}
                    <div className="message-body">
                      {m.mode === "demo" && (
                        <Badge>Демо · программный сценарий</Badge>
                      )}
                      <MarkdownText text={m.text} />
                      {m.calculation && <CalculationView c={m.calculation} />}
                      {m.warning && (
                        <div className="chat-finance-warning">
                          <AlertTriangle size={16} />
                          <p>{m.warning}</p>
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
                      {m.fundingProposal && (
                        <div className="proposal">
                          <p>
                            Пересчитать и сохранить новую версию этого подбора?
                          </p>
                          <Button
                            secondary
                            disabled={
                              confirmingFunding ||
                              w.state.selections.find(
                                (s) => s.id === m.fundingProposal!.selectionId,
                              )?.version !== m.fundingProposal.expectedVersion
                            }
                            onClick={async () => {
                              const p = m.fundingProposal!,
                                selection = w.state.selections.find(
                                  (s) => s.id === p.selectionId,
                                );
                              if (!selection?.input) return;
                              setConfirmingFunding(true);
                              try {
                                const {
                                  selectionId,
                                  expectedVersion,
                                  ...changes
                                } = p;
                                await w.act("/selections", {
                                  engine: "mvp-2",
                                  parentId: selectionId,
                                  expectedVersion,
                                  input: { ...selection.input, ...changes },
                                });
                                w.error("Новая версия подбора сохранена");
                              } catch {
                              } finally {
                                setConfirmingFunding(false);
                              }
                            }}
                          >
                            Подтвердить пересчёт <Check size={15} />
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
                  </article>
                ))
              )}
              {busy && sendingText && (
                <article className="message user pending">
                  <div className="message-body">
                    <p>{sendingText}</p>
                    <time>Отправлено · ожидаем ответ</time>
                  </div>
                </article>
              )}
              {busy && (
                <div className="message assistant">
                  <div className="message-agent">
                    <Sparkles size={17} />
                  </div>
                  <div className="thinking" role="status">
                    <span className="chat-spinner" />
                    <span>Готовим ответ…</span>
                  </div>
                </div>
              )}
              {!!chat?.messages.length &&
                !busy &&
                chat.messages.at(-1)?.role === "assistant" && (
                  <div
                    className="context-prompts"
                    aria-label="Продолжить обсуждение"
                  >
                    {STARTER_PROMPTS.slice(1).map((t) => (
                      <button key={t} onClick={() => void w.sendMessage(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
          <ChatComposer chatId={chat?.id || ""} />
        </div>
      </div>
      {renameId && (
        <Modal title="Название диалога" onClose={() => setRenameId(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              try {
                await w.act(
                  "/chats/" + renameId,
                  { title: title.trim() },
                  "PATCH",
                );
                setRenameId(null);
              } catch {}
            }}
          >
            <input
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
