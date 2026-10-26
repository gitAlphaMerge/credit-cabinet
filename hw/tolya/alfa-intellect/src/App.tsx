import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  Check,
  Menu,
  MessageSquare,
  Phone,
  WalletCards,
} from "lucide-react";
import { api, money, setApiWorkspace } from "./api";
import { Brand, Button, IconButton, Modal, Badge } from "./ui";
import { Landing } from "./Landing";
import { WorkspaceContext } from "./context";
import { WorkspaceView } from "./WorkspaceView";
import { Chat } from "./Chat";
import { Mvp2, MvpManager } from "./Mvp2";
import { JourneyOnboarding } from "./JourneyOnboarding";
import { DemoPage } from "./DemoPage";
import { LoginScreen } from "./LoginScreen";
import { cabinetRoute } from "./metric-scale";
import { ManagerAccess } from "./manager/ManagerWorkspace";
import { SideRail, SideRailItem } from "./SideRail";
import { RestartJourney } from "./RestartJourney";
import "./restart-journey.css";
import "./application-status.css";
import "./manager/manager.css";
import type { AppState, Doc } from "../shared/types";
import { labelCode, visibleError } from "./application-client";
import {
  readFinancingDraft,
  writeFinancingDraft,
  clearFinancingDraft,
  type FinancingDraft,
} from "./financing-draft";
import { useScreenReveal } from "./motion";
export function App() {
  useScreenReveal();
  const [path, setPath] = useState(() => cabinetRoute(location.pathname)),
    [state, setState] = useState<AppState | null>(null),
    [config, setConfig] = useState<any>({}),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState(""),
    [activeChatId, setActiveChatId] = useState(""),
    [draft, setDraft] = useState(""),
    [historyOpen, setHistoryOpen] = useState(
      location.pathname === "/chat" && innerWidth > 760,
    ),
    [pending, setPending] = useState<Doc | null>(null),
    [uploading, setUploading] = useState(false),
    [bell, setBell] = useState(false),
    [mobileNav, setMobileNav] = useState(false);
  const [contactOpen, setContactOpen] = useState(false),
    [contactPhone, setContactPhone] = useState(""),
    [contactNote, setContactNote] = useState(""),
    [contactSent, setContactSent] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatFiles, setChatFiles] = useState<
      { chatId: string; docId: string }[]
    >([]),
    [uploadName, setUploadName] = useState("");
  const [sending, setSending] = useState<{
    chatId: string;
    text: string;
  } | null>(null);
  const sendingLock = useRef(false),
    chatPageVisited = useRef(false),
    initializing = useRef<Promise<any> | null>(null);
  const cabinetPath = useRef("/cabinet");
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
  function go(p: string) {
    p = cabinetRoute(p);
    history.pushState({}, "", p);
    setPath(p);
    setMobileNav(false);
    if (p === "/chat" && !chatPageVisited.current) {
      setHistoryOpen(innerWidth > 760);
      chatPageVisited.current = true;
    }
    window.scrollTo(0, 0);
  }
  async function refresh() {
    const [s, c] = await Promise.all([api<AppState>("/state"), api("/config")]);
    setConfig(c);
    setApiWorkspace(c.workspaceId ?? null);
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
      if (p !== "/cabinet/facility") setToast(visibleError(e));
      throw e;
    }
  }
  async function onAuth() {
    const c = await api("/config");
    setConfig(c);
    setApiWorkspace(c.workspaceId ?? null);
    restoreFinancingDraft(c.workspaceId);
    setDraft("");
    setHistoryOpen(false);
    setChatVisible(false);
    await refresh();
    go("/financing");
  }
  async function signOut() {
    try {
      await api("/auth/logout", {});
      setApiWorkspace(null);
      if (financingOwner.current) {
        try {
          clearFinancingDraft(sessionStorage, financingOwner.current);
        } catch {}
      }
      restoreFinancingDraft(null);
      setDraft("");
      setActiveChatId("");
      setChatFiles([]);
      setUploadName("");
      setHistoryOpen(false);
      setState(null);
      go("/");
    } catch (e) {
      setToast(visibleError(e));
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
      setToast(visibleError(e));
      await refresh().catch(() => {});
    } finally {
      sendingLock.current = false;
      setSending(null);
    }
  }
  useEffect(() => {
    const pop = () => {
      const p = cabinetRoute(location.pathname);
      if (p !== location.pathname) history.replaceState({}, "", p);
      setPath(p);
    };
    pop();
    addEventListener("popstate", pop);
    if (!initializing.current)
      initializing.current = api("/config").then(async (c) => {
        if (!c.authenticated) {
          await api("/journey/session", {});
          c = await api("/config");
        }
        return c;
      });
    initializing.current
      .then(async (c) => {
        setConfig(c);
        setApiWorkspace(c.workspaceId ?? null);
        if (c.authenticated) {
          const s = await api("/state");
          restoreFinancingDraft(c.workspaceId);
          setState(s);
          setActiveChatId(s.chats[0]?.id || "");
        }
      })
      .catch((e) => setToast(visibleError(e)))
      .finally(() => setLoading(false));
    return () => removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (loading || !state) return;
    const allowed =
      path === "/" ||
      path === "/onboarding" ||
      path === "/jury" ||
      path === "/login" ||
      (path === "/bank" && config.role === "manager") ||
      (config.cabinetAvailable && ["/cabinet", "/chat"].includes(path)) ||
      (path === "/apply" && !!state.profile.mvp2Answers);
    if (!allowed) {
      const target = state.profile.mvp2Answers ? "/apply" : "/onboarding";
      history.replaceState({}, "", target);
      setPath(target);
    }
  }, [
    path,
    loading,
    state?.profile.mvp2Answers,
    config.cabinetAvailable,
    config.role,
  ]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 7000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function upload(file: File, category?: string) {
    const chatId = !category ? activeChatId || state?.chats[0]?.id : undefined;
    setUploading(true);
    if (chatId) setUploadName(file.name);
    try {
      const f = new FormData();
      f.append("file", file);
      if (category) f.append("category", category);
      const d = await api<Doc>("/documents", f);
      if (chatId)
        setChatFiles((files) => [
          ...files.filter(
            (item) => item.docId !== d.id || item.chatId !== chatId,
          ),
          { chatId, docId: d.id },
        ]);
      setPending(d);
      await refresh();
    } catch (e) {
      setToast(visibleError(e));
    } finally {
      setUploading(false);
      setUploadName("");
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
  const publicPage = ["/", "/onboarding", "/jury", "/login"].includes(path);
  const page = path.split("/")[1] || "cabinet";
  const rendered = publicPage ? (
    path === "/" ? (
      <Landing go={go} />
    ) : path === "/jury" ? (
      <DemoPage go={go} />
    ) : path === "/login" ? (
      <LoginScreen go={go} />
    ) : (
      <JourneyOnboarding go={go} onComplete={refresh} />
    )
  ) : !state ? (
    <main className="loading-screen">
      <p>Не удалось восстановить сессию. Обновите страницу.</p>
    </main>
  ) : (
    <WorkspaceContext.Provider
      value={{
        state,
        cabinetPath: cabinetPath.current,
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
        uploadName,
        chatFiles,
        dismissChatFile: (docId, chatId) =>
          setChatFiles((files) =>
            files.filter(
              (file) => file.docId !== docId || file.chatId !== chatId,
            ),
          ),
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
      {page !== "bank" && (!config.cabinetAvailable || page === "apply") ? (
        <div className="origination app-shell">
          <header className="origination-header">
            <button className="unstyled" onClick={() => go("/")}>
              <Brand />
            </button>
            <div className="journey-header-tools">
              <SideRail>
                <SideRailItem tip="Обратиться к сотруднику">
                  <button
                    type="button"
                    className="side-rail-icon call"
                    aria-label="Обратиться к сотруднику"
                    onClick={() => {
                      setContactSent(false);
                      setContactOpen(true);
                    }}
                  >
                    <Phone aria-hidden="true" />
                  </button>
                </SideRailItem>
                <SideRailItem tip="Начать сначала">
                  <RestartJourney />
                </SideRailItem>
              </SideRail>
            </div>
          </header>
          <Mvp2 />
          <footer className="workspace-footer">Иллюстративные данные, не предложение банка. Решение принимает банк</footer>
        </div>
      ) : (
        <div className={"workspace app-shell page-" + page}>
          <header className="app-header">
            <button onClick={() => go("/cabinet")} className="unstyled">
              <Brand />
            </button>
            <nav className={mobileNav ? "open" : ""}>
              {[
                ["cabinet", "Кредитный кабинет"],
                ["chat", "Чат"],
                ...(config.role === "manager"
                  ? [["bank", "Рабочее место менеджера"]]
                  : []),
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
            <div className="header-tools g2-tools">
              <SideRail>
                {config.role !== "manager" && (
                  <SideRailItem tip="Начать сначала">
                    <RestartJourney />
                  </SideRailItem>
                )}
              </SideRail>
              <IconButton
                className="mobile-menu"
                label="Меню"
                onClick={() => setMobileNav(!mobileNav)}
              >
                <Menu size={20} />
              </IconButton>
            </div>
          </header>
          {page === "bank" ? (
            <>
              <ManagerAccess role={config.role} />
              {config.role === "manager" && <MvpManager />}
            </>
          ) : page === "chat" ? (
            <div className="full-chat">
              <Chat full />
            </div>
          ) : (
            <WorkspaceView tour={-1} />
          )}
          <footer className="workspace-footer">
          <span>Иллюстративные данные, не предложение банка. Решение принимает банк</span>
            {page === "financing" && (
              <button
                className="text-button"
                onClick={() => {
                  setContactSent(false);
                  setContactOpen(true);
                }}
              >
                Обратиться к сотруднику <ArrowRight size={12} />
              </button>
            )}
          </footer>
        </div>
      )}
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
                })
                  .then(() => setContactSent(true))
                  .catch(() => {});
              }}
            >
              <div className="contact-call">
                <span className="contact-free">Свободный сотрудник на линии</span>
                <h3>Перезвоним за 2 минуты</h3>
                <p>Оставьте телефон и коротко напишите вопрос.</p>
              </div>
              <p className="fine-print">
                  Вы можете обратиться на любом этапе. Здесь сохраняется только
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
                  обращение к сотруднику.
              </label>
              <Button>
                Перезвоните мне <ArrowRight size={16} />
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
                    <span>{config.fieldNames?.[k] || labelCode(k)}</span>
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
    </>
  );
}
