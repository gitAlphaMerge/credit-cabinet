import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { WorkspaceContext, type Workspace } from "./context";
import { Brand, Button, Badge, Modal } from "./ui";
import { CabinetV2 } from "./CabinetV2";
import { SelectionResult } from "./SelectionResult";
import { RangeField } from "./RangeField";
import { MarkdownText } from "./MarkdownText";
import { CalculationView } from "./ui";
import { api } from "./api";
import { documentTypes, type AppState } from "../shared/types";
export function DemoPage({ go }: { go: (p: string) => void }) {
  const [kind, setKind] = useState<"ooo" | "ip" | "idea">("ooo"),
    [state, setState] = useState<AppState>(),
    [tab, setTab] = useState("cabinet"),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [amount, setAmount] = useState(3000000),
    [term, setTerm] = useState(36),
    [busy, setBusy] = useState(false),
    [apply, setApply] = useState(false);
  useEffect(() => {
    let current = true;
    setState(undefined);
    setError("");
    setEditing(false);
    api<AppState>("/public-demo?kind=" + kind)
      .then((s) => {
        if (current) setState(s);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [kind]);
  const navigate = (p: string) => {
    setTab(
      p.replace("/", "") === "financing" ? "selection" : p.replace("/", ""),
    );
  };
  const context: Workspace | undefined = state
    ? {
        state,
        config: { aiConnected: false },
        go: navigate,
        refresh: async () => {},
        act: async () => {},
        error: setError,
        activeChatId: "preview-chat",
        setActiveChatId: () => {},
        draft: "",
        setDraft: () => {},
        historyOpen: false,
        setHistoryOpen: () => {},
        upload: async () => {},
        uploading: false,
        reviewDocument: () => {},
        financingDraft: {},
        financingDraftStored: false,
        cacheFinancingDraft: () => {},
        chatVisible: false,
        setChatVisible: () => {},
        setSplit: () => {},
        sendMessage: async () => {},
        sending: null,
      }
    : undefined;
  return (
    <div className="public-demo">
      <header className="public-header">
        <button className="unstyled" onClick={() => go("/")}>
          <Brand />
        </button>
        <Badge tone="red">Публичная демонстрация</Badge>
        <Button onClick={() => go("/onboarding")}>
          Начать со своими данными <ArrowRight size={16} />
        </Button>
      </header>
      <main className="demo-main">
        <div className="demo-heading">
          <div>
            <button className="text-button" onClick={() => go("/")}>
              <ArrowLeft size={15} /> На главную
            </button>
            <h1>Посмотрите, как это работает</h1>
            <p>
              Синтетические компании. Без регистрации, создания аккаунта и
              сохранения в вашей финансовой истории.
            </p>
          </div>
          <div className="segmented" aria-label="Сценарий демонстрации">
            {[
              ["ooo", "ООО"],
              ["ip", "ИП"],
              ["idea", "Проект"],
            ].map(([k, title]) => (
              <button
                key={k}
                className={kind === k ? "active" : ""}
                onClick={() => setKind(k as typeof kind)}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
        <div
          className="page-tabs"
          role="tablist"
          aria-label="Экраны демонстрации"
        >
          {[
            ["cabinet", "Кредитный кабинет"],
            ["selection", "Подбор и расчёт"],
            ["chat", "Чат"],
            ["profile", "Документы"],
          ].map(([id, title]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {title}
            </button>
          ))}
        </div>
        {error ? (
          <div className="alert error" role="alert">
            {error}
          </div>
        ) : !state || !context ? (
          <p role="status">Загружаем пример…</p>
        ) : (
          <WorkspaceContext.Provider value={context}>
            <div className="demo-company">
              <b>{state.profile.name}</b>
              <span>{state.profile.source}</span>
            </div>
            {tab === "cabinet" ? (
              <CabinetV2 preview={state} onDiscuss={() => setTab("chat")} />
            ) : tab === "selection" ? (
              <>
                {editing && (
                  <form
                    className="panel demo-calculator"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        const s = await api("/public-demo/calculate", {
                          kind,
                          amount,
                          term,
                        });
                        setState({ ...state, selections: [s] });
                        setEditing(false);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <h2>Измените параметры примера</h2>
                    <div className="form-grid">
                      <RangeField
                        label="Сумма в примере"
                        value={amount}
                        min={10000}
                        max={1e8}
                        step={10000}
                        suffix="₽"
                        onChange={setAmount}
                      />
                      <RangeField
                        label="Срок в примере"
                        value={term}
                        min={1}
                        max={120}
                        suffix="мес."
                        onChange={setTerm}
                      />
                    </div>
                    <Button disabled={busy}>
                      {busy ? "Рассчитываем…" : "Пересчитать пример"}
                    </Button>
                  </form>
                )}
                <SelectionResult
                  item={state.selections[0]}
                  onRevise={() => {
                    setAmount(state.selections[0].calculation.amount);
                    setTerm(state.selections[0].calculation.term);
                    setEditing(true);
                  }}
                  onDiscuss={() => setTab("chat")}
                  onApply={() => setApply(true)}
                  onDocuments={() => setTab("profile")}
                />
              </>
            ) : tab === "chat" ? (
              <section className="demo-conversation panel">
                <Badge>Пример переписки · не свободный диалог с ИИ</Badge>
                {state.chats[0].messages.map((m) => (
                  <article key={m.id} className={"message " + m.role}>
                    <div className="message-body">
                      <MarkdownText text={m.text} />
                      {m.calculation && (
                        <CalculationView c={state.selections[0].calculation} />
                      )}
                    </div>
                  </article>
                ))}
                <Button secondary onClick={() => setTab("selection")}>
                  Открыть результат подбора <ArrowRight size={16} />
                </Button>
              </section>
            ) : (
              <section className="panel demo-documents">
                <h2>Профиль и финансовые документы</h2>
                <p>
                  Документы добавляются один раз, после проверки и подтверждения
                  показателей. В публичном демо загрузка отключена: файлы не
                  сохраняются.
                </p>
                <div className="demo-document-grid">
                  {documentTypes.map(([id, title]) => (
                    <div key={id}>
                      <FileText size={24} />
                      <h3>{title}</h3>
                      <Badge>Категория документа</Badge>
                    </div>
                  ))}
                </div>
                <Button onClick={() => go("/onboarding")}>
                  Создать свой профиль
                </Button>
              </section>
            )}
          </WorkspaceContext.Provider>
        )}
      </main>
      {apply && (
        <Modal
          title="Следующий шаг — ваш профиль"
          onClose={() => setApply(false)}
        >
          <p>
            В публичном демо заявки не создаются. Пройдите анкету, чтобы
            сохранить свои документы и расчёт, затем подготовьте досье.
          </p>
          <Button onClick={() => go("/onboarding")}>
            Перейти к анкете <ArrowRight size={16} />
          </Button>
        </Modal>
      )}
    </div>
  );
}
