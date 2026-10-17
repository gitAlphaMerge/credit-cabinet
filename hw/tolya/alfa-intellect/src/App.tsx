import { useEffect, useState, useRef } from "react";
import {
  Bell,
  HelpCircle,
  LogOut,
  Building2,
  ArrowRight,
  Check,
  Menu,
  MessageSquare,
  WalletCards,
} from "lucide-react";
import { api, money } from "./api";
import { Brand, Button, IconButton, Modal, Badge } from "./ui";
import { Landing } from "./Landing";
import { Onboarding } from "./Onboarding";
import { WorkspaceContext } from "./context";
import { WorkspaceView } from "./WorkspaceView";
import { Tour } from "./Tour";
import { DemoPage } from "./DemoPage";
import { Chat } from "./Chat";
import { ProfilePage } from "./Profile";
import { Financing } from "./Financing";
import type { AppState, Doc } from "../shared/types";
import {
  readFinancingDraft,
  writeFinancingDraft,
  clearFinancingDraft,
  type FinancingDraft,
} from "./financing-draft";
export function App() {
  const [path, setPath] = useState(location.pathname),
    [state, setState] = useState<AppState | null>(null),
    [config, setConfig] = useState<any>({}),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(""),
    [activeChatId, setActiveChatId] = useState(""),
    [draft, setDraft] = useState(""),
    [historyOpen, setHistoryOpen] = useState(location.pathname === "/chat"),
    [pending, setPending] = useState<Doc | null>(null),
    [uploading, setUploading] = useState(false),
    [bell, setBell] = useState(false),
    [tour, setTour] = useState(-1),
    [mobileNav, setMobileNav] = useState(false);
  const [contactOpen, setContactOpen] = useState(false),
    [contactPhone, setContactPhone] = useState(""),
    [contactNote, setContactNote] = useState(""),
    [contactSent, setContactSent] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [sending, setSending] = useState<{
    chatId: string;
    text: string;
  } | null>(null);
  const sendingLock = useRef(false),
    chatPageVisited = useRef(false);
  const [tourPreview, setTourPreview] = useState<AppState>();
  const financingOwner = useRef<string | null>(null);
  const [financingDraft, setFinancingDraft] = useState<FinancingDraft>({});
  const [financingDraftStored, setFinancingDraftStored] = useState(false);
  function restoreFinancingDraft(owner: string | null) {
    financingOwner.current = owner;
    try {
      setFinancingDraft(owner ? readFinancingDraft(sessionStorage, owner) : {});
    } catch {
      setFinancingDraft({});
    }
    setFinancingDraftStored(false);
  }
  function cacheFinancingDraft(value: FinancingDraft) {
    setFinancingDraft(value);
    let saved = false;
    try {
      if (financingOwner.current)
        saved = writeFinancingDraft(
          sessionStorage,
          financingOwner.current,
          value,
        );
    } catch {
      // Accessing sessionStorage itself can throw in restricted browsers.
    }
    setFinancingDraftStored(saved);
  }
  useEffect(() => {
    if (tour < 0) {
      setTourPreview(undefined);
      return;
    }
    if (tourPreview) return;
    let current = true;
    api<AppState>("/public-demo?kind=ooo")
      .then((s) => {
        if (current) setTourPreview(s);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [tour >= 0, tourPreview]);
  function go(p: string) {
    history.pushState({}, "", p);
    setPath(p);
    setMobileNav(false);
    if (p === "/chat" && !chatPageVisited.current) {
      setHistoryOpen(true);
      chatPageVisited.current = true;
    }
    window.scrollTo(0, 0);
  }
  async function refresh() {
    const s = await api<AppState>("/state");
    setState(s);
    setActiveChatId((id) =>
      s.chats.some((c) => c.id === id) ? id : s.chats[0]?.id || "",
    );
  }
  async function act(p: string, body?: unknown, method?: string) {
    try {
      const r = await api(p, body, method);
      await refresh();
      return r;
    } catch (e) {
      setToast((e as Error).message);
      throw e;
    }
  }
  async function onAuth() {
    const c = await api("/config");
    setConfig(c);
    restoreFinancingDraft(c.workspaceId);
    setDraft("");
    setHistoryOpen(false);
    setChatVisible(true);
    await refresh();
    go("/cabinet");
  }
  async function signOut() {
    try {
      await api("/auth/logout", {});
      if (financingOwner.current) {
        try {
          clearFinancingDraft(sessionStorage, financingOwner.current);
        } catch {}
      }
      restoreFinancingDraft(null);
      setDraft("");
      setActiveChatId("");
      setHistoryOpen(false);
      setTour(-1);
      setTourPreview(undefined);
      setState(null);
      go("/");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function sendMessage(provided?: string) {
    const text = (provided ?? draft).trim(),
      chatId = activeChatId || state?.chats[0]?.id;
    if (!text || !chatId || sendingLock.current) return;
    sendingLock.current = true;
    setSending({ chatId, text });
    setDraft("");
    try {
      await api("/chats/" + chatId + "/messages", { text });
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      sendingLock.current = false;
      setSending(null);
    }
  }
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    addEventListener("popstate", pop);
    api("/config")
      .then(async (c) => {
        setConfig(c);
        if (c.authenticated) {
          const s = await api("/state");
          restoreFinancingDraft(c.workspaceId);
          setState(s);
          setActiveChatId(s.chats[0]?.id || "");
        }
      })
      .catch((e) => setToast(e.message))
      .finally(() => setLoading(false));
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (state && !state.preferences.tourDone && path === "/cabinet") setTour(0);
  }, [state?.preferences.tourDone, path]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 7000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function upload(file: File, category?: string) {
    setUploading(true);
    try {
      const f = new FormData();
      f.append("file", file);
      if (category) f.append("category", category);
      const d = await api<Doc>("/documents", f);
      setPending(d);
      await refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <Brand />
        <span className="spinner" />
        <p>Открываем ваш финансовый контекст…</p>
      </div>
    );
  const publicPage =
    path === "/" ||
    path === "/demo" ||
    path === "/login" ||
    path === "/onboarding";
  const page = path.split("/")[1] || "cabinet";
  const rendered = publicPage ? (
    path === "/" ? (
      <Landing go={go} />
    ) : path === "/demo" ? (
      <DemoPage go={go} />
    ) : (
      <Onboarding
        key={path}
        go={go}
        login={path === "/login"}
        onAuth={onAuth}
      />
    )
  ) : !state ? (
    <Onboarding login go={go} onAuth={onAuth} />
  ) : (
    <WorkspaceContext.Provider
      value={{
        state,
        config,
        go,
        refresh,
        act,
        error: setToast,
        activeChatId,
        setActiveChatId,
        draft,
        setDraft,
        historyOpen,
        setHistoryOpen,
        upload,
        uploading,
        reviewDocument: setPending,
        financingDraft,
        financingDraftStored,
        cacheFinancingDraft,
        chatVisible,
        setChatVisible,
        setSplit: (split) =>
          setState((s) =>
            s ? { ...s, preferences: { ...s.preferences, split } } : s,
          ),
        sendMessage,
        sending,
      }}
    >
      <div className={"workspace app-shell page-" + page}>
        <header className="app-header">
          <button onClick={() => go("/cabinet")} className="unstyled">
            <Brand />
          </button>
          <nav className={mobileNav ? "open" : ""}>
            {[
              ["cabinet", "Кредитный кабинет"],
              ["chat", "Чат"],
              ["financing", "Подбор финансирования"],
            ].map(([p, label]) => (
              <button
                data-tour={p}
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => go("/" + p)}
              >
                {label}
              </button>
            ))}
            <button
              className="mobile-nav-action"
              onClick={() => void signOut()}
            >
              Выйти из аккаунта
            </button>
          </nav>
          <div className="header-tools">
            <button
              data-tour="profile"
              className={
                "company-button " + (page === "profile" ? "active" : "")
              }
              onClick={() => go("/profile")}
            >
              <Building2 size={17} />
              <span>{state.profile.name}</span>
              <span>⌄</span>
            </button>
            <div className="bell-wrap">
              <IconButton label="Уведомления" onClick={() => setBell(!bell)}>
                <Bell size={20} />
                {state.notifications.some((n) => !n.read) && (
                  <i className="notification-dot" />
                )}
              </IconButton>
              {bell && (
                <div className="notification-panel">
                  <div className="panel-title">
                    <b>Уведомления</b>
                    <button
                      className="text-button"
                      onClick={() => void act("/notifications/read", {})}
                    >
                      Прочитать все
                    </button>
                  </div>
                  {state.notifications.length ? (
                    state.notifications.map((n) => (
                      <button
                        key={n.id}
                        className={n.read ? "notice" : "notice unread"}
                        onClick={() => {
                          void act("/notifications/read", { id: n.id });
                          go("/" + n.href);
                          setBell(false);
                        }}
                      >
                        <span className="icon-tile red">
                          <Bell size={16} />
                        </span>
                        <span>
                          <b>{n.title}</b>
                          <small>{n.body}</small>
                          <time>
                            {new Date(n.createdAt).toLocaleDateString("ru-RU")}
                          </time>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="small-empty">
                      <Bell size={24} />
                      <p>Пока тихо</p>
                      <small>
                        Здесь появятся события по вашим документам и
                        сохранённому графику.
                      </small>
                    </div>
                  )}
                </div>
              )}
            </div>
            <IconButton
              label="Обучение"
              onClick={() => {
                go("/cabinet");
                setTour(0);
              }}
            >
              <HelpCircle size={20} />
            </IconButton>
            <IconButton label="Выйти" onClick={() => void signOut()}>
              <LogOut size={19} />
            </IconButton>
            <IconButton
              className="mobile-menu"
              label="Меню"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </IconButton>
          </div>
        </header>
        {page === "profile" ? (
          <ProfilePage />
        ) : page === "financing" ? (
          <Financing />
        ) : page === "chat" ? (
          <div className="full-chat">
            <Chat full />
          </div>
        ) : (
          <WorkspaceView
            tour={tour}
            preview={tour >= 0 ? tourPreview : undefined}
          />
        )}
        <footer className="workspace-footer">
          <span>Альфа-Интеллект</span>
          <button
            className="text-button"
            onClick={() => {
              setContactSent(false);
              setContactOpen(true);
            }}
          >
            Обратиться к сотруднику <ArrowRight size={12} />
          </button>
          <span>Решение о финансировании принимает банк</span>
        </footer>
      </div>
    </WorkspaceContext.Provider>
  );
  return (
    <>
      {rendered}
      {contactOpen && (
        <Modal
          title="Обратиться к сотруднику"
          onClose={() => setContactOpen(false)}
        >
          <Badge tone="red">Демонстрационное обращение</Badge>
          {contactSent ? (
            <div className="success-state">
              <Check size={24} />
              <h3>Обращение сохранено</h3>
              <p>
                Это локальный пример передачи человеку. Сотруднику банка ничего
                не отправлено.
              </p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await act("/consultations", {
                  phone: contactPhone,
                  note: contactNote,
                });
                setContactSent(true);
              }}
            >
              <p className="fine-print">
                Вы можете обратиться на любом этапе. В MVP сохраняется только
                локальная запись.
              </p>
              <label className="field">
                <span>Контактный телефон</span>
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  placeholder="+7 999 123-45-67"
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </label>
              <label className="field" style={{ marginTop: 18 }}>
                <span>Что хотите обсудить?</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                />
              </label>
              <label className="checkbox-row">
                <input required type="checkbox" />Я понимаю, что это
                демонстрационное локальное обращение.
              </label>
              <Button>
                Сохранить обращение <ArrowRight size={16} />
              </Button>
            </form>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button onClick={() => setToast("")}>×</button>
        </div>
      )}
      {pending && (
        <Modal
          title="Проверьте извлечённые данные"
          onClose={() => setPending(null)}
          wide
        >
          <Badge tone="red">Требуется ваше подтверждение</Badge>
          <p>
            <b>{pending.name}</b> · {pending.period} · {pending.currency}
          </p>
          <p className="muted">
            Проверьте показатели и единицы измерения. До подтверждения документ
            не участвует в анализе.
          </p>
          <div className="extracted-fields">
            {Object.entries(pending.fields).map(([k, v]) => (
              <div key={k}>
                <span>{config.fieldNames?.[k] || k}</span>
                <b>{typeof v === "number" ? v.toLocaleString("ru-RU") : v}</b>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <Button secondary onClick={() => setPending(null)}>
              Проверить позже
            </Button>
            <Button
              onClick={async () => {
                await act("/documents/" + pending.id + "/confirm", {});
                setPending(null);
                setToast("Документ подтверждён и доступен в профиле и чате");
              }}
            >
              Подтвердить и сохранить <Check size={16} />
            </Button>
          </div>
        </Modal>
      )}
      {tour >= 0 && state && !publicPage && (
        <Tour
          step={tour}
          setStep={setTour}
          finish={async () => {
            await act("/preferences", { tourDone: true }, "PATCH");
            setTour(-1);
            setTourPreview(undefined);
          }}
        />
      )}
    </>
  );
}
