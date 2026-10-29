import { OmegaMark } from "./OmegaIdentity";
import { LoadingScreen } from "./LoadingScreen";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, IconButton, Badge, CalculationView, Modal } from "./ui";
import { MarkdownText } from "./MarkdownText";
import { ChatComposer } from "./ChatComposer";
import { ChatHistory } from "./ChatHistory";
import { STARTER_PROMPTS } from "./chat-ui";
import { useReducedMotion } from "./motion";
import type { Chat as ChatModel } from "../shared/types";

type FeedbackValue = { kind: "message" | "conversation"; message_id?: string | null;
  rating: "up" | "down" | number | null; reasons: string[]; text: string };
const FEEDBACK_REASONS = [
  ["G", "Выдумал или ошибся"], ["L", "Не ответил на мой вопрос"],
  ["M", "Переспросил то, что я уже говорил"], ["P", "Пообещал лишнее или нарушил правила"],
  ["V", "Звучит как робот"], ["F", "Непонятно, что делать дальше"], ["other", "Другое"],
];
function MessageFeedback({ messageId, value, disabled, save, time }: {
  messageId: string; value?: FeedbackValue; disabled: boolean; save: (v: FeedbackValue) => Promise<void>;
  time?: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const current: FeedbackValue = value || {kind:"message",message_id:messageId,rating:null,reasons:[],text:""};
  return <div className="message-feedback" aria-label="Оценка ответа">
    <div className="message-feedback-row">
      {time}
      {(["up","down"] as const).map(rating => <button key={rating} type="button" className="feedback-icon"
        disabled={disabled} aria-label={rating === "up" ? "Хороший ответ" : "Плохой ответ"}
        title={rating === "up" ? "Хороший ответ" : "Плохой ответ"}
        aria-pressed={current.rating === rating} onClick={() => void save({...current,
          rating: current.rating === rating ? null : rating, reasons:[],text:""})}>
        {rating === "up" ? <ThumbsUp size={15} /> : <ThumbsDown size={15} />}</button>)}
    </div>
    {current.rating && <form ref={form} className="proposal feedback-panel" onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      void save({...current,text:String(data.get("text") || "")});
    }}>
      {current.rating === "down" && <div className="feedback-reasons">
        {FEEDBACK_REASONS.map(([code,label]) => <label key={code} className="feedback-reason">
          <input type="checkbox" name="reason" disabled={disabled} checked={current.reasons.includes(code)}
            onChange={() => void save({...current,reasons:current.reasons.includes(code)
              ? current.reasons.filter(c => c !== code) : [...current.reasons,code],
              text: String(new FormData(form.current!).get("text") || "")})} />{label}
        </label>)}
      </div>}
      <label>{current.rating === "up" ? "Что понравилось?" : "Что было не так?"}
        <textarea name="text" maxLength={1000} defaultValue={current.text} key={String(current.rating)}
          style={{width:"100%",boxSizing:"border-box",minHeight:64}} />
      </label>
      <Button disabled={disabled}>Сохранить отзыв</Button>
    </form>}
  </div>;
}
function ConversationFeedback({eligible,done,disabled,save}: {
  eligible:boolean; done:boolean; disabled:boolean; save:(v:FeedbackValue)=>Promise<void>;
}) {
  const [finished,setFinished] = useState(false), [rating,setRating] = useState<number|null>(null);
  if (done) return null;
  if (!eligible && !finished) return <div className="conversation-finish"><button type="button" className="text-button" disabled={disabled}
    onClick={() => setFinished(true)}>Завершить разговор и оценить</button></div>;
  return <form className="proposal conversation-feedback" aria-label="Итог разговора" onSubmit={e => {
    e.preventDefault(); if (rating === null) return;
    void save({kind:"conversation",rating,reasons:[],text:String(new FormData(e.currentTarget).get("text") || "")});
  }}>
    <button type="button" className="text-button" aria-label="Закрыть итоговую карточку" disabled={disabled}
      style={{alignSelf:"flex-end"}} onClick={() => void save({kind:"conversation",rating:null,reasons:[],text:""})}>×</button>
    <p>Насколько вы согласны: ИИ-помощник помог мне легко разобраться с задачей</p>
    <div role="group" aria-label="Оценка от 1 до 7" style={{display:"flex",flexWrap:"wrap",gap:4}}>
      {[1,2,3,4,5,6,7].map(n => <button type="button" key={n} className="text-button"
        style={{minWidth:36,minHeight:44,borderRadius:8,background:rating === n ? "var(--surface-hover, #eee)" : undefined}} aria-pressed={rating === n} disabled={disabled} onClick={() => setRating(n)}>{n}</button>)}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:"var(--text-sm)"}}>
      <span>совсем не согласен</span><span>полностью согласен</span>
    </div>
    <label>Что сделать проще?<textarea name="text" maxLength={1000} style={{width:"100%",boxSizing:"border-box",minHeight:64}} /></label>
    <Button disabled={disabled || rating === null}>Отправить</Button>
  </form>;
}
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
  const [feedback,setFeedback] = useState<FeedbackValue[]>([]), [feedbackLoaded,setFeedbackLoaded] = useState(false),
    [feedbackSaving,setFeedbackSaving] = useState(false);
  const feedbackLock = useRef(false), activeFeedbackChat = useRef(chat?.id);
  activeFeedbackChat.current = chat?.id;
  useEffect(() => {
    let cancelled = false;
    setFeedbackLoaded(false); setFeedback([]);
    if (!chat?.id) return;
    fetch(`/api/chats/${encodeURIComponent(chat.id)}/feedback`).then(async r => {
      if (!r.ok) throw new Error("Не удалось загрузить оценки");
      const rows = await r.json() as FeedbackValue[];
      if (!cancelled) {setFeedback(rows);setFeedbackLoaded(true);}
    }).catch(e => { if (!cancelled) w.error(visibleError(e)); });
    return () => {cancelled = true;};
  },[chat?.id]);
  async function saveFeedback(value: FeedbackValue) {
    if (!chat || feedbackLock.current) return;
    const id = chat.id;
    feedbackLock.current = true; setFeedbackSaving(true);
    try {
      // Send only input fields; GET also includes server timestamps and identifiers.
      const {kind,message_id,rating,reasons,text} = value;
      const response = await fetch(`/api/chats/${encodeURIComponent(id)}/feedback`, {
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,message_id,rating,reasons,text})});
      if (!response.ok) throw new Error("Не удалось сохранить оценку. Попробуйте ещё раз.");
      const rows = await response.json() as FeedbackValue[];
      if (activeFeedbackChat.current === id) setFeedback(rows);
    } catch(e) {w.error(visibleError(e));}
    finally {feedbackLock.current = false;setFeedbackSaving(false);}
  }
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
            <div className="chat-header-title"><span className="omega-label"><OmegaMark size={15}/>Агент Омега</span>
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
                Подбор финансирования
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
                    <OmegaMark size={25} />
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
                        <OmegaMark size={17} />
                      </div>
                    )}
                    <div className="message-body">
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
                      {m.role === "assistant" ? <MessageFeedback messageId={m.id}
                        value={feedback.find(f => f.kind === "message" && f.message_id === m.id)}
                        disabled={!feedbackLoaded || feedbackSaving} save={saveFeedback}
                        time={<time>{new Date(m.createdAt).toLocaleTimeString("ru-RU", {hour: "2-digit", minute: "2-digit"})}</time>} />
                      : <time>
                        {new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>}
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
                    <OmegaMark size={17} />
                  </div>
                  <LoadingScreen compact title="Готовим ответ" message="Пуш разбирается в вашем вопросе" />
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
              {!!chat?.messages.length && !busy && feedbackLoaded && <ConversationFeedback key={chat.id}
                eligible={false}
                done={feedback.some(f => f.kind === "conversation")} disabled={feedbackSaving} save={saveFeedback} />}
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
import { visibleError } from "./application-client";
