import { useEffect, useRef, useState } from "react";
import { PanelLeftClose, Plus, Search, Pencil, X } from "lucide-react";
import { IconButton } from "./ui";
import { filterChats } from "./chat-ui";
import { useWorkspace } from "./context";
import type { Chat } from "../shared/types";
export function ChatHistory({
  drawer,
  activeId,
  onNew,
  onRename,
}: {
  drawer: boolean;
  activeId: string;
  onNew: () => void;
  onRename: (chat: Chat) => void;
}) {
  const w = useWorkspace(),
    root = useRef<HTMLElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (searchOpen && w.historyOpen) input.current?.focus();
  }, [searchOpen, w.historyOpen]);
  useEffect(() => {
    if (!w.historyOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    if (drawer)
      root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [drawer, w.historyOpen]);
  const chats = filterChats(w.state.chats, search);
  return (
    <aside
      ref={root}
      className="chat-history"
      inert={!w.historyOpen ? true : undefined}
      aria-hidden={!w.historyOpen}
      role={drawer && w.historyOpen ? "dialog" : undefined}
      aria-modal={drawer && w.historyOpen ? true : undefined}
      aria-label="История диалогов"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          w.setHistoryOpen(false);
        }
        if (drawer && e.key === "Tab") {
          const nodes = Array.from(
              root.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input",
              ) || [],
            ),
            first = nodes[0],
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
      <div className="history-toolbar">
        <button className="history-new" disabled={!!w.sending} onClick={onNew}>
          <Plus size={18} />
          <span>Новый диалог</span>
        </button>
        <IconButton
          label="Поиск по истории"
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearch("");
          }}
        >
          <Search size={17} />
        </IconButton>
        <IconButton
          label="Скрыть историю"
          onClick={() => w.setHistoryOpen(false)}
        >
          <PanelLeftClose size={18} />
        </IconButton>
      </div>
      {(searchOpen || search) && (
        <div className="history-search-row">
          <Search size={15} />
          <input
            ref={input}
            className="chat-search"
            aria-label="Поиск диалогов"
            placeholder="Найти диалог…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <IconButton
              label="Очистить поиск"
              onClick={() => {
                setSearch("");
                input.current?.focus();
              }}
            >
              <X size={13} />
            </IconButton>
          )}
        </div>
      )}
      <span className="history-caption">Ваши диалоги</span>
      <div className="history-list">
        {chats.map((chat) => (
          <div
            className={"history-item " + (chat.id === activeId ? "active" : "")}
            key={chat.id}
          >
            <button
              className="history-select"
              title={chat.title}
              aria-current={chat.id === activeId ? "true" : undefined}
              onClick={() => {
                w.setActiveChatId(chat.id);
                if (drawer) w.setHistoryOpen(false);
              }}
            >
              <span>{chat.title}</span>
              {chat.selectionId && <small>Связан с подбором</small>}
            </button>
            <IconButton
              className="history-rename"
              label={"Переименовать диалог: " + chat.title}
              onClick={() => onRename(chat)}
            >
              <Pencil size={13} />
            </IconButton>
          </div>
        ))}
        {!chats.length && (
          <p className="history-no-results">
            {search
              ? "Нет диалогов по этому запросу"
              : "Здесь появятся ваши диалоги"}
          </p>
        )}
      </div>
    </aside>
  );
}
