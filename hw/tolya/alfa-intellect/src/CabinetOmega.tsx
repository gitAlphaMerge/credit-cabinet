import { useEffect, useRef, useState } from "react";
import { Chat } from "./Chat";
import { useWorkspace, type Workspace } from "./context";
import { visibleError } from "./application-client";
import { OmegaMark, OmegaMicrophone } from "./OmegaIdentity";

/** Create a fresh conversation without navigating away or sending the draft automatically. */
export async function createCabinetConversation(w: Pick<Workspace, "act" | "setActiveChatId" | "setHistoryOpen">) {
  const chat = await w.act("/chats", {});
  if (!chat?.id) throw new Error("Не удалось открыть новый диалог. Попробуйте ещё раз.");
  w.setActiveChatId(chat.id);
  w.setHistoryOpen(false);
  return chat.id as string;
}

/** The business overview keeps its own scroll and URL while Omega is open. */
export function CabinetOmega() {
  const w = useWorkspace();
  const [open, setOpen] = useState(false), [opening, setOpening] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), panel = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
    panel.current?.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus({preventScroll:true});
  }, [open]);
  async function start() {
    if (lock.current || w.sending) return;
    lock.current = true; setOpening(true); setError("");
    try { await createCabinetConversation(w); setOpen(true); }
    catch (e) { setError(visibleError(e)); }
    finally { lock.current = false; setOpening(false); }
  }
  if (open) return <div className="cabinet-omega-panel" ref={panel} aria-label="Омега в кабинете бизнеса"><Chat onHide={() => {setOpen(false);requestAnimationFrame(()=>opener.current?.focus());}}/></div>;
  return <div className="cabinet-omega-entry"><form className="omega-dock" aria-label="Быстрый вопрос агенту Омега" onSubmit={event => {event.preventDefault();void start();}}>
    <div className="omega-dock-heading"><OmegaMark size={28}/><div><strong>Агент Омега</strong><small>Новый диалог прямо в кабинете бизнеса</small></div></div>
    <input aria-label="Черновик вопроса агенту Омега" placeholder="Что происходит с деньгами бизнеса?" value={w.draft} onChange={event => w.setDraft(event.target.value)} maxLength={4000} disabled={opening}/>
    <OmegaMicrophone disabled={opening || !!w.sending} onText={text => w.setDraft([w.draft,text].filter(Boolean).join(" ").slice(0,4000))}/>
    <button ref={opener} type="submit" className="omega-open" disabled={opening || !!w.sending} aria-busy={opening}>{opening ? "Открываем…" : "Открыть чат →"}</button>
  </form>{error && <p className="cabinet-omega-error" role="alert">{error}</p>}</div>;
}
