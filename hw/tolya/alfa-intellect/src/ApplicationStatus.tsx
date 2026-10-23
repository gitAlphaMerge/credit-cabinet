import { useEffect, useRef, useState } from "react";
import { Illustration, StatusIllustration, ProductIllustration, DocumentIllustration } from "./Illustration";
import { useWorkspace } from "./context";
import { money } from "./api";
import { formatRate } from "./format-rate";
import {
  clientLabels,
  finite,
  loadOwnApplication,
  loadOwnApplications,
  offerOf,
  sendClientEvent,
  escalateToManager,
  statusLabels,
  type ClientDetail,
} from "./application-client";

type Props = {
  detail: ClientDetail;
  busy: boolean;
  onAction(event: string, payload?: Record<string, unknown>): Promise<void>;
  documents?: {
    id: string;
    name: string;
    category: string;
    confirmed: boolean;
  }[];
  uploading?: boolean;
  onUpload?(file: File, category: string): Promise<void>;
  onReview?(id: string): void;
  onDisagree?(text: string): Promise<void>;
  toolbar?: React.ReactNode;
  onEscalate?(text: string): Promise<void>;
  onOpenProfile?(): void;
};
// Эти пробелы закрывает ИНН в профиле, а не загрузка документа.
const registryHoles = ["egrul", "fns", "bankruptcy", "aml"];
const nextSteps: Record<string, string> = {
  draft:
    "Заявка ещё не отправлена. Вернитесь в подбор финансирования, чтобы проверить условия и согласие.",
  queued:
    "Менеджер рассматривает заявку. Мы сообщим, если понадобятся дополнительные сведения.",
  info_requested:
    "Дополните данные и подтвердите загруженные документы. Затем отправьте их на повторную проверку.",
  underwriting:
    "Банк проверяет заявку. Дополнительных действий пока не требуется.",
  approved: "Банк готовит условия предложения. Обновите заявку чуть позже.",
  offered: "Проверьте условия и график перед подписанием договора.",
  signed: "Договор подписан. Ожидайте подтверждения зачисления.",
  disbursed:
    "Выдача завершена. В прототипе зачисление смоделировано, реальные деньги не переводятся.",
  rejected:
    "Уточните сведения и обсудите результат с банком перед новой заявкой.",
  expired:
    "Предложение больше не действует. Вернитесь в подбор для новой заявки.",
  withdrawn: "Вы отозвали заявку. При необходимости можно начать новый подбор.",
};
const documentCategories: Record<string, string> = {
  statement: "Банковская выписка",
  balance: "Бухгалтерский баланс",
  pnl: "Отчёт о финансовых результатах",
  model: "Финансовая модель",
  plan: "Бизнес-план",
  schedule: "График платежей",
};
export function ApplicationStatusView(p: Props) {
  const [documentError, setDocumentError] = useState("");
  const { application: a, dossier: d, events } = p.detail;
  const offer = offerOf(p.detail);
  const schedule = Array.isArray(offer.schedule) ? offer.schedule : [];
  const reasons =
    a.status === "rejected"
      ? [
          ...new Set(
            [
              events.findLast((e) => e.to_status === "rejected")?.reason,
              ...(d?.stops_fired ?? []),
              ...(d?.checks?.map((c) => c.reasonCode) ?? []),
            ].filter((r): r is string => !!r),
          ),
        ]
      : [];
  const options = ["info_requested", "queued"].includes(a.status)
    ? (d?.alternatives ?? [])
    : [];
  return (
    <main className="cabinet-v2 unified-cabinet application-status">
      <header className="cv-heading">
        <div>
          <small>МОЯ ЗАЯВКА</small>
          <h1>Моя заявка</h1>
          <span className="badge">
            {statusLabels[a.status] || "Статус уточняется"}
          </span>
        </div>
        <div className="application-heading-actions">
          {p.toolbar}
          <StatusIllustration status={a.status} size={48} decorative />
        </div>
      </header>
      <div className="application-columns">
        <section className="application-stack">
          <article className="cv-card">
            <h2>{statusLabels[a.status] || "Статус уточняется"}</h2>
            <p>
              {nextSteps[a.status] || "Обновите заявку или свяжитесь с банком."}
            </p>
            {finite(a.amount) && (
              <p>
                Запрошено: <b>{money(a.amount)}</b>
              </p>
            )}
            {reasons.map((r) => (
              <p key={r}>
                {clientLabels[r] || "Для уточнения причины свяжитесь с банком."}
              </p>
            ))}
          </article>
          {a.status === "info_requested" && (
            <section
              className="cv-card application-stack"
              aria-label="Дополнить заявку"
            >
              <h2>Что нужно дополнить</h2>
              {d?.holes?.map((h, i) => (
                <p key={i}>
                  {clientLabels[h] ||
                    "Дополнительные сведения: уточните в чате с банком"}
                </p>
              ))}
              {d?.holes?.some((h) => registryHoles.includes(h)) && (
                <div className="application-hint" role="status">
                  <p>
                    Эти проверки банк делает по ИНН компании. Укажите или
                    проверьте ИНН в профиле, затем вернитесь сюда, загрузите
                    выписку и нажмите «Дослать».
                  </p>
                  {p.onOpenProfile && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={p.onOpenProfile}
                    >
                      Открыть профиль
                    </button>
                  )}
                </div>
              )}
              {d?.holes?.some((h) =>
                ["contract_main_customer", "reconciliation_act"].includes(h),
              ) && (
                <p role="status">
                  Загрузчик прототипа пока поддерживает только финансовые
                  шаблоны. Для договора или акта сверки свяжитесь с банком в
                  чате.
                </p>
              )}
              <label className="field">
                <span>Категория документа</span>
                <select
                  name="category"
                  form="application-documents"
                  disabled={p.busy || p.uploading}
                  defaultValue="statement"
                >
                  {Object.entries(documentCategories).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <form
                id="application-documents"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (p.busy || p.uploading) return;
                  const form = new FormData(e.currentTarget);
                  const documents = form.getAll("documents").map(String);
                  if (!documents.length) {
                    setDocumentError(
                      "Выберите хотя бы один подтверждённый документ.",
                    );
                    return;
                  }
                  setDocumentError("");
                  await p.onAction("client_update", { documents });
                }}
              >
                <label className="field">
                  <span>Загрузить документ</span>
                  <input
                    type="file"
                    disabled={p.busy || p.uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      const category = (
                        document.getElementById(
                          "application-documents",
                        ) as HTMLFormElement
                      )?.elements.namedItem("category") as HTMLSelectElement;
                      if (file)
                        void p.onUpload?.(file, category?.value || "statement");
                      e.target.value = "";
                    }}
                  />
                </label>
                <p>
                  После загрузки проверьте извлечённые данные и подтвердите
                  документ.
                </p>
                {!p.documents?.length && <p><Illustration group="empty" name="upload" size={64} decorative /> Документов пока нет</p>}
                {p.documents?.map((doc) => (
                  <div key={doc.id}>
                    <DocumentIllustration category={doc.category} size={32} decorative />{" "}
                    {doc.confirmed ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          name="documents"
                          value={doc.id}
                          disabled={p.busy}
                        />
                        {doc.name}
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={p.busy || p.uploading}
                        onClick={() => p.onReview?.(doc.id)}
                      >
                        Проверить документ: {doc.name}
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="button"
                  disabled={
                    p.busy ||
                    p.uploading ||
                    !p.documents?.some((doc) => doc.confirmed)
                  }
                >
                  Дослать
                </button>
                {documentError && <p role="alert">{documentError}</p>}
              </form>
              {p.onEscalate && !options.length && (
                <form
                  className="application-escalate"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const text = String(
                      new FormData(e.currentTarget).get("cannot") || "",
                    ).trim();
                    if (text && !p.busy) await p.onEscalate?.(text);
                  }}
                >
                  <label className="field">
                    <span>Не можете дослать? Напишите почему, заявку посмотрит менеджер</span>
                    <textarea
                      name="cannot"
                      required
                      maxLength={2000}
                      disabled={p.busy}
                    />
                  </label>
                  <button className="button secondary" disabled={p.busy}>
                    Передать менеджеру
                  </button>
                </form>
              )}
            </section>
          )}
          {!!options.length && (
            <section className="cv-card application-stack">
              <h2>Доступные варианты</h2>
              {options.map((option) => (
                <article key={option.option_id} className="application-option">
                  <h3><ProductIllustration productId={option.product_id} size={32} decorative /> {option.product_name}</h3>
                  {finite(option.amount_rub) && (
                    <p>Сумма: {money(option.amount_rub)}</p>
                  )}
                  {finite(option.term_months) && (
                    <p>Срок: {option.term_months} мес.</p>
                  )}
                  {finite(option.rate_annual_pct) && (
                    <p>Ставка: {formatRate(option.rate_annual_pct)} годовых</p>
                  )}
                  {finite(option.monthly_payment_rub) && (
                    <p>Платёж: {money(option.monthly_payment_rub)}</p>
                  )}
                  <button
                    className="button"
                    disabled={p.busy}
                    onClick={() =>
                      void p.onAction("accept_alternative", {
                        option_id: option.option_id,
                      })
                    }
                  >
                    Принять вариант
                  </button>
                </article>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const text = String(
                    new FormData(e.currentTarget).get("objections") || "",
                  ).trim();
                  if (text && !p.busy) await p.onDisagree?.(text);
                }}
              >
                <label className="field">
                  <span>Почему варианты не подходят</span>
                  <textarea
                    name="objections"
                    required
                    maxLength={2000}
                    disabled={p.busy}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={p.busy || !p.onDisagree}
                >
                  Не согласен, обсудить в чате
                </button>
              </form>
            </section>
          )}
          {["offered", "signed", "disbursed"].includes(a.status) && (
            <section className="cv-card application-stack">
              <h2>Условия предложения</h2>
              <div className="application-terms">
                {finite(offer.amount) && (
                  <p>
                    Сумма <b>{money(offer.amount)}</b>
                  </p>
                )}
                {finite(offer.term_months) && (
                  <p>
                    Срок <b>{offer.term_months} мес.</b>
                  </p>
                )}
                {finite(offer.rate) && (
                  <p>
                    Ставка{" "}
                    <b>
                      {formatRate(offer.rate * 100)} годовых
                    </b>
                  </p>
                )}
                {finite(schedule[0]?.payment) && (
                  <p>
                    Первый платёж <b>{money(schedule[0].payment)}</b>
                  </p>
                )}
              </div>
              {schedule.length > 0 && (
                <details>
                  <summary>График платежей</summary>
                  <ol>
                    {schedule.map(
                      (row: any, i: number) =>
                        finite(row.payment) && (
                          <li key={i}>
                            Платёж {i + 1}: {money(row.payment)}
                          </li>
                        ),
                    )}
                  </ol>
                </details>
              )}
              {a.status === "offered" && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!p.busy)
                      await p.onAction("sign", {
                        code: String(
                          new FormData(e.currentTarget).get("code") || "",
                        ),
                      });
                  }}
                >
                  <label className="field">
                    <span>Код из СМС</span>
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      required
                      disabled={p.busy}
                    />
                  </label>
                  <p className="fine-print">
                    Демонстрационная подпись. Код: 0000, СМС не отправляется.
                  </p>
                  <button className="button" disabled={p.busy}>
                    Подписать договор
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={p.busy}
                    onClick={() => void p.onAction("withdraw")}
                  >
                    Отказаться от предложения
                  </button>
                </form>
              )}
            </section>
          )}
          <section className="cv-card">
            <h2>История заявки</h2>
            {!events.length ? (
              <p>История пока пуста</p>
            ) : (
              <ol className="application-history">
                {events.map((e) => (
                  <li key={e.seq}>
                    <b>{statusLabels[e.to_status] || "Статус обновлён"}</b>
                    {Number.isFinite(Date.parse(e.at)) && (
                      <time dateTime={e.at}>
                        {new Date(e.at).toLocaleString("ru-RU")}
                      </time>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
        <aside className="application-stack">
          <section className="cv-card">
            <h2>Готовность заявки</h2>
            {finite(d?.readiness_n ?? d?.N) &&
            finite(d?.readiness_m ?? d?.M) ? (
              <p>
                {d?.readiness_n ?? d?.N} из {d?.readiness_m ?? d?.M}
              </p>
            ) : (
              <p>Данных пока нет</p>
            )}
            {finite(d?.limit_now_rub) && (
              <p>Лимит сейчас: {money(d.limit_now_rub)}</p>
            )}
            <p className="fine-print">
              Оценка готовности не заменяет решение банка.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
export function ApplicationStatus() {
  const w = useWorkspace();
  const [rows, setRows] = useState<{ id: string; status: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (w.config.role !== "client") return;
    let current = true;
    setLoading(true);
    setDetail(null);
    setError("");
    loadOwnApplications()
      .then(async (list) => {
        if (!current) return;
        setRows(list);
        const id = list.some((r) => r.id === selected)
          ? selected
          : list.at(-1)?.id || "";
        if (id !== selected) {
          setSelected(id);
          return;
        }
        if (id) {
          const result = await loadOwnApplication(id);
          if (current) setDetail(result);
        }
      })
      .catch(() => {
        if (current) {
          setRows([]);
          setError("Не удалось загрузить заявку. Повторите попытку.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [selected, revision, w.config.role]);
  async function perform(fn: () => Promise<unknown>) {
    if (lock.current || !detail || detail.application.id !== selected) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (w.config.role !== "client")
    return (
      <main className="cv-card">
        <h1>Доступно только клиенту</h1>
      </main>
    );
  const toolbar = (
    <div className="application-toolbar">
        <button
          className="button secondary"
          disabled={busy || loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Обновить заявку
        </button>
        {!!rows.length && (
          <label className="field">
            <span>Выбрать свою заявку</span>
            <select
              value={selected}
              disabled={busy || loading}
              onChange={(e) => {
                setDetail(null);
                setSelected(e.target.value);
              }}
            >
              {rows.map((row, i) => (
                <option key={row.id} value={row.id}>
                  Заявка {i + 1}:{" "}
                  {statusLabels[row.status] || "Статус уточняется"}
                </option>
              ))}
            </select>
          </label>
        )}
    </div>
  );
  return (
    <div className="application-page">
      {!(detail && detail.application.id === selected) && toolbar}
      {error && (
        <p role="alert" className="application-toolbar">
          {error}{" "}
          <Illustration group="empty" name="network" size={48} decorative />
        </p>
      )}
      {loading ? (
        <p role="status" className="application-toolbar">
          Загружаем заявку…
        </p>
      ) : detail && detail.application.id === selected ? (
        <ApplicationStatusView
          detail={detail}
          busy={busy}
          uploading={w.uploading}
          documents={w.state.documents}
          toolbar={toolbar}
          onOpenProfile={() => w.go("/profile")}
          onEscalate={(text) =>
            perform(() => escalateToManager(detail, text))
          }
          onUpload={async (file, category) => {
            await w.upload(file, category);
          }}
          onReview={(id) => {
            const doc = w.state.documents.find((d) => d.id === id);
            if (doc) w.reviewDocument(doc);
          }}
          onAction={(event, payload) =>
            perform(() => sendClientEvent(detail, event, payload))
          }
          onDisagree={(text) =>
            perform(async () => {
              const chat = w.activeChatId || w.state.chats[0]?.id;
              if (!chat)
                throw new Error(
                  "Откройте чат с банком, чтобы обсудить варианты.",
                );
              await w.act("/chats/" + encodeURIComponent(chat) + "/messages", {
                text:
                  "Не согласен с вариантами по заявке " +
                  detail.application.id +
                  ": " +
                  text,
              });
              w.go("/chat");
            })
          }
        />
      ) : (
        !error && (
          <main className="cv-card application-toolbar">
            <h1>Моя заявка</h1>
            <Illustration group="empty" name="applications" size={64} decorative />
            <p>Заявок пока нет</p>
            <button className="button" onClick={() => w.go("/financing")}>
              Подобрать финансирование
            </button>
          </main>
        )
      )}
    </div>
  );
}
