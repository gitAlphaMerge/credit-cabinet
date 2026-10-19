import { useLayoutEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUp,
  Paperclip,
  FileText,
  Check,
  X,
  LoaderCircle,
} from "lucide-react";
import { IconButton } from "./ui";
import { useWorkspace } from "./context";
import { composerHeight } from "./chat-ui";
export function ChatComposer({ chatId }: { chatId: string }) {
  const w = useWorkspace(),
    input = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  const busy = !!w.sending,
    files = (w.chatFiles || []).filter((f) => f.chatId === chatId);
  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    const resize = () => {
      const mirror = node.cloneNode() as HTMLTextAreaElement;
      mirror.value = w.draft;
      mirror.removeAttribute("aria-label");
      mirror.setAttribute("aria-hidden", "true");
      mirror.tabIndex = -1;
      Object.assign(mirror.style, {
        position: "absolute",
        visibility: "hidden",
        height: "0px",
        minHeight: "0px",
        maxHeight: "none",
        width: node.clientWidth + "px",
        transition: "none",
        pointerEvents: "none",
      });
      node.parentElement!.append(mirror);
      node.style.height = composerHeight(mirror.scrollHeight) + "px";
      mirror.remove();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node.parentElement!);
    return () => observer.disconnect();
  }, [w.draft]);
  return (
    <form
      className="composer"
      data-tour="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!w.uploading) void w.sendMessage();
      }}
    >
      <div className="composer-inner">
        {(files.length > 0 || (w.uploading && w.uploadName)) && (
          <div className="composer-files" aria-label="Документы этого диалога">
            {files.map((file) => {
              const doc = w.state.documents.find((d) => d.id === file.docId);
              return (
                doc && (
                  <div className="composer-file" key={doc.id}>
                    <FileText size={18} />
                    <button
                      type="button"
                      title={doc.name}
                      onClick={() => w.reviewDocument(doc)}
                    >
                      <b>{doc.name}</b>
                      <small>
                        {doc.confirmed
                          ? "Данные подтверждены · в профиле"
                          : "Проверить данные документа"}
                      </small>
                    </button>
                    {doc.confirmed && (
                      <Check size={13} className="file-confirmed" />
                    )}
                    <IconButton
                      type="button"
                      label={"Скрыть плашку " + doc.name}
                      onClick={() => w.dismissChatFile?.(doc.id, chatId)}
                    >
                      <X size={13} />
                    </IconButton>
                  </div>
                )
              );
            })}
            {w.uploading && w.uploadName && (
              <div className="composer-file loading" role="status">
                <LoaderCircle size={17} className="chat-spinner" />
                <span>
                  {w.uploadName}
                  <small>Извлекаем данные…</small>
                </span>
              </div>
            )}
          </div>
        )}
        <div className="composer-row">
          <IconButton
            label="Прикрепить документ"
            type="button"
            disabled={w.uploading || busy}
            onClick={() => input.current?.click()}
          >
            <Paperclip size={20} />
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
            ref={textarea}
            aria-label="Сообщение финансовому помощнику"
            value={w.draft}
            onChange={(e) => w.setDraft(e.target.value)}
            placeholder="Спросите о вашем бизнесе…"
            maxLength={4000}
            rows={1}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                if (!w.uploading) void w.sendMessage();
              }
            }}
          />
          <button
            className="send-button"
            type="submit"
            aria-label="Отправить сообщение"
            disabled={busy || w.uploading || !w.draft.trim()}
          >
            {busy ? (
              <LoaderCircle size={19} className="chat-spinner" />
            ) : (
              <ArrowUp size={20} />
            )}
          </button>
        </div>
        <div className="composer-bottom">
          <button
            type="button"
            className="finance-chat-cta"
            onClick={() => w.go("/financing")}
          >
            Подобрать финансирование <ArrowRight size={13} />
          </button>
          <small>Enter — отправить</small>
        </div>
      </div>
    </form>
  );
}
