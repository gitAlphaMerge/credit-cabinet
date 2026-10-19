import { useEffect, useRef, useState } from "react";
import {
  Bell,
  X,
  Check,
  CalendarDays,
  FileText,
  CircleAlert,
  ArrowRight,
} from "lucide-react";
import { useWorkspace } from "./context";
import { IconButton } from "./ui";
export function NotificationCenter() {
  const w = useWorkspace(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLDivElement>(null);
  const notices = w.state.notifications.filter((n) => n.active !== false),
    unread = notices.filter((n) => !n.read).length;
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
        if (!root.current?.contains(e.target as Node)) setOpen(false);
      },
      escape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.querySelector("button")?.focus();
        }
      };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function mark(id?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await w.act("/notifications/read", id ? { id } : {});
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notification-center" ref={root} data-tour="notifications">
      <div ref={trigger}>
        <IconButton
          label={"Уведомления"}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(!open)}
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="nc-count" aria-label={unread + " непрочитанных"}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </IconButton>
      </div>
      {open && (
        <section
          className="nc-panel"
          role="dialog"
          aria-label="Центр уведомлений"
        >
          <header>
            <div>
              <h2>Уведомления</h2>
              <small>
                {unread ? unread + " непрочитанных" : "Всё прочитано"}
              </small>
            </div>
            <IconButton
              label="Закрыть уведомления"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </IconButton>
          </header>
          <div className="nc-toolbar">
            <small>Обновляются при входе и изменении данных</small>
            <button disabled={busy || !unread} onClick={() => void mark()}>
              Прочитать все
            </button>
          </div>
          <div className="nc-list">
            {notices.length ? (
              notices.map((n) => {
                const Icon =
                  n.type === "payment"
                    ? CalendarDays
                    : n.type === "risk"
                      ? CircleAlert
                      : n.type === "data"
                        ? FileText
                        : Check;
                return (
                  <article className={n.read ? "" : "unread"} key={n.id}>
                    <span className={"nc-icon " + (n.type || "result")}>
                      <Icon size={17} />
                    </span>
                    <div>
                      <h3>{n.title}</h3>
                      <p>{n.body}</p>
                      <time>
                        {new Date(n.createdAt).toLocaleString("ru-RU", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                      <div className="nc-actions">
                        <button
                          disabled={busy}
                          onClick={async () => {
                            await mark(n.id);
                            setOpen(false);
                            w.go(
                              "/" +
                                (n.href === "cabinet"
                                  ? "cabinet-v2"
                                  : n.href.replace(/^\//, "")),
                            );
                          }}
                        >
                          Открыть
                          <ArrowRight size={13} />
                        </button>
                        {!n.read && (
                          <button
                            disabled={busy}
                            aria-label={"Отметить прочитанным: " + n.title}
                            onClick={() => void mark(n.id)}
                          >
                            Прочитано
                            <Check size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="nc-empty">
                <Bell size={26} />
                <h3>Пока тихо</h3>
                <p>
                  Здесь появятся события по платежам, документам и расчётам —
                  когда для них есть данные.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
