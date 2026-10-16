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
import { Cabinet } from "./Cabinet";
import { Chat } from "./Chat";
import { ProfilePage } from "./Profile";
import { Financing } from "./Financing";
import type { AppState, Doc } from "../shared/types";
export function App() {
  const [path, setPath] = useState(location.pathname),
    [state, setState] = useState<AppState | null>(null),
    [config, setConfig] = useState<any>({}),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(""),
    [activeChatId, setActiveChatId] = useState(""),
    [draft, setDraft] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false),
    [pending, setPending] = useState<Doc | null>(null),
    [uploading, setUploading] = useState(false),
    [bell, setBell] = useState(false),
    [tour, setTour] = useState(-1),
    [mobileNav, setMobileNav] = useState(false);
  const [contactOpen, setContactOpen] = useState(false),
    [contactPhone, setContactPhone] = useState(""),
    [contactNote, setContactNote] = useState(""),
    [contactSent, setContactSent] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const [financingDraft, cacheFinancingDraft] = useState<Record<string, any>>(
    {},
  );
  const [tourRect, setTourRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (tour < 0) return;
    const selectors = [
      "credit",
      "chat-panel",
      "financing",
      "profile",
      "history",
    ];
    const measure = () => {
      const node = document.querySelector(`[data-tour="${selectors[tour]}"]`);
      if (node) setTourRect(node.getBoundingClientRect());
    };
    const timer = setTimeout(measure, 100);
    addEventListener("resize", measure);
    return () => {
      clearTimeout(timer);
      removeEventListener("resize", measure);
    };
  }, [tour, path, loading]);
  function go(p: string) {
    history.pushState({}, "", p);
    setPath(p);
    setMobileNav(false);
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
    cacheFinancingDraft({});
    await refresh();
    go("/cabinet");
  }
  async function demo(kind: string) {
    try {
      await api("/auth/demo", { kind });
      await onAuth();
    } catch (e) {
      setToast((e as Error).message);
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
    path === "/" || path === "/login" || path === "/onboarding";
  const page = path.split("/")[1] || "cabinet";
  const tourData = [
    [
      "Ваш кредитный кабинет",
      "Здесь будет информация о действующем кредите. Сейчас можно начать подбор или явно загрузить демосценарий.",
    ],
    [
      "Чат с финансовым помощником",
      "Обсуждайте задачу и прикрепляйте документы. При отсутствии ключа ИИ действует маркированный деморежим.",
    ],
    [
      "Подбор финансирования",
      "Короткая анкета, проверяемый расчёт, сравнение версий и история запросов.",
    ],
    [
      "Профиль и документы",
      "Нажмите название бизнеса в шапке. Данные из анкеты уже сохранены здесь.",
    ],
    [
      "История диалогов",
      "Кнопка истории работает независимо от разворачивания чата. Диалог не теряется при переходах.",
    ],
  ];
  const rendered = publicPage ? (
    path === "/" ? (
      <Landing go={go} demo={demo} />
    ) : (
      <Onboarding
        key={path}
        go={go}
        login={path === "/login"}
        onAuth={onAuth}
        demo={demo}
      />
    )
  ) : !state ? (
    <Onboarding login go={go} onAuth={onAuth} demo={demo} />
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
        cacheFinancingDraft,
      }}
    >
      <div className="workspace">
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
            <IconButton
              label="Выйти"
              onClick={async () => {
                await api("/auth/logout", {});
                setState(null);
                go("/");
              }}
            >
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
        <div className="demo-ribbon">
          <span className="tiny-red" /> Хакатон · демонстрационный MVP{" "}
          <span>Синтетические условия. Решение о выдаче принимает банк.</span>
        </div>
        {page === "profile" ? (
          <ProfilePage />
        ) : page === "financing" ? (
          <Financing />
        ) : page === "chat" ? (
          <div className="full-chat">
            <Chat full />
          </div>
        ) : (
          <main className="cabinet-page">
            <div className="page-intro">
              <div>
                <span className="eyebrow">ВАШ ФИНАНСОВЫЙ КОНТЕКСТ</span>
                <h1>
                  Бизнес движется вперёд.
                  <br />
                  <span>Финансы — под контролем.</span>
                </h1>
                <p>
                  От первого расчёта до погашения — всё важное в одном месте.
                </p>
              </div>
              <div className="intro-note">
                <span className="icon-tile green">
                  <Check size={19} />
                </span>
                <div>
                  <b>{state.profile.name}</b>
                  <small>
                    {state.profile.sector} ·{" "}
                    {state.profile.stage === "planning"
                      ? "На стадии запуска"
                      : "Действующий бизнес"}
                  </small>
                </div>
              </div>
            </div>
            <div
              ref={splitRef}
              className="split-workspace"
              style={{
                gridTemplateColumns: `minmax(0,${state.preferences.split}fr) 16px minmax(0,${100 - state.preferences.split}fr)`,
              }}
            >
              <div data-tour="credit">
                <Cabinet />
              </div>
              <div
                className="splitter"
                role="separator"
                aria-label="Изменить ширину кабинета и чата"
                aria-orientation="vertical"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1 || !splitRef.current) return;
                  const r = splitRef.current.getBoundingClientRect();
                  const split = Math.max(
                    40,
                    Math.min(75, ((e.clientX - r.left) / r.width) * 100),
                  );
                  setState((s) =>
                    s ? { ...s, preferences: { ...s.preferences, split } } : s,
                  );
                }}
                onPointerUp={() =>
                  void act(
                    "/preferences",
                    { split: state.preferences.split },
                    "PATCH",
                  )
                }
              >
                <span />
                <input
                  aria-label="Доля кредитного кабинета"
                  type="range"
                  min="40"
                  max="75"
                  value={state.preferences.split}
                  onChange={(e) => {
                    const split = Number(e.target.value);
                    setState({
                      ...state,
                      preferences: { ...state.preferences, split },
                    });
                  }}
                  onBlur={() =>
                    void act(
                      "/preferences",
                      { split: state.preferences.split },
                      "PATCH",
                    )
                  }
                />
              </div>
              <div data-tour="chat-panel">
                <Chat />
              </div>
            </div>
          </main>
        )}
        <footer className="workspace-footer">
          <span>Альфа-Интеллект · MVP</span>
          <button
            className="text-button"
            onClick={() => {
              setContactSent(false);
              setContactOpen(true);
            }}
          >
            Обратиться к сотруднику <ArrowRight size={12} />
          </button>
          <span>
            Данные остаются в локальной базе. Используйте тестовые документы.
          </span>
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
      {tour >= 0 && state && (
        <div className="tour-backdrop">
          {tourRect && (
            <div
              className="tour-focus"
              style={{
                top: tourRect.top - 5,
                left: tourRect.left - 5,
                width: tourRect.width + 10,
                height: Math.min(
                  tourRect.height + 10,
                  innerHeight - tourRect.top - 8,
                ),
              }}
            />
          )}
          <div
            className="tour-card"
            role="dialog"
            aria-label="Знакомство с продуктом"
          >
            <div className="tour-step">
              <Badge tone="red">{tour + 1} / 5</Badge>
              <button
                className="text-button"
                onClick={async () => {
                  await act("/preferences", { tourDone: true }, "PATCH");
                  setTour(-1);
                }}
              >
                Пропустить
              </button>
            </div>
            <div className="tour-icon">
              {tour === 1 || tour === 4 ? (
                <MessageSquare size={26} />
              ) : (
                <WalletCards size={26} />
              )}
            </div>
            <h2>{tourData[tour][0]}</h2>
            <p>{tourData[tour][1]}</p>
            <div className="tour-dots">
              {tourData.map((_, i) => (
                <i key={i} className={i === tour ? "active" : ""} />
              ))}
            </div>
            <div className="modal-actions">
              {tour > 0 && (
                <Button secondary onClick={() => setTour(tour - 1)}>
                  Назад
                </Button>
              )}
              <Button
                onClick={async () => {
                  if (tour === 4) {
                    await act("/preferences", { tourDone: true }, "PATCH");
                    setTour(-1);
                  } else setTour(tour + 1);
                }}
              >
                {tour === 4 ? "Готово" : "Далее"} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
