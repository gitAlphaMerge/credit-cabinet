import { useEffect, useRef, useState } from "react";
import { money } from "../api";
import { ManagerMemo } from "./ManagerMemo";
import {
  loadApplication,
  loadQueue,
  sendManagerEvent,
  type ApplicationDetail,
  type ManagerEvent,
  type QueueItem,
} from "./api";

const labels: Record<string, string> = {
  CLIENT_SILENT: "Клиент молчит после напоминания",
  CLIENT_DISAGREED: "Не согласен с вариантами",
  UNDERWRITING_REJECTED: "Отказ андеррайтинга",
  ENFORCEMENT: "Исполнительное производство",
  NOT_BUSINESS: "Заёмщик не является ИП или ООО",
  TOO_YOUNG: "Недостаточная история работы бизнеса",
  NO_FREE_CASHFLOW: "Нет положительного свободного денежного потока",
  CASH_OUT: "Высокая доля снятия наличных",
  SHORT_STATEMENT: "Недостаточный период выписки",
  BKI_OVERDUE_90_PLUS: "Просрочка в БКИ более 90 дней",
  BKI_OVERDUE_30_PLUS: "Просрочка в БКИ более 30 дней",
  statement: "Банковская выписка",
  request: "Параметры заявки",
  business: "Данные бизнеса",
  consent: "Согласие клиента",
  checks: "Проверки",
  contract_main_customer: "Контракт с основным заказчиком",
  reconciliation_act: "Акт сверки",
  COMPLIANCE_INN_MISSING: "Не указан ИНН",
  COMPLIANCE_EGRUL_NOT_FOUND: "Компания не найдена в реестре",
  COMPLIANCE_EGRUL_INACTIVE: "Деятельность компании прекращена",
  COMPLIANCE_EGRUL_MISMATCH: "Данные не совпадают с реестром",
  COMPLIANCE_FNS_UNRELIABLE: "Недостоверные сведения ФНС",
  COMPLIANCE_FNS_TAX_DEBT: "Налоговая задолженность",
  COMPLIANCE_BANKRUPTCY: "Сведения о банкротстве",
  COMPLIANCE_AML_REVIEW: "Нужна дополнительная проверка",
  COMPLIANCE_DOC_EXPIRED: "Документ устарел",
  COMPLIANCE_DOC_DATE_UNKNOWN: "Дата документа неизвестна",
  COMPLIANCE_SOURCE_UNAVAILABLE: "Источник недоступен",
  LIMIT_EXCEEDED_ALTERNATIVES: "Запрошенная сумма превышает лимит",
};
const statuses: Record<string, string> = {
  draft: "Черновик",
  queued: "В очереди",
  info_requested: "Дозапрос",
  underwriting: "Андеррайтинг",
  approved: "Одобрена",
  offered: "Предложение выдано",
  signed: "Подписана",
  disbursed: "Выдана",
  rejected: "Отказ",
  expired: "Истекла",
  withdrawn: "Отозвана",
};
const explain = (code: string) => labels[code] || `Требует уточнения: ${code}`;
const timestamp = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("ru-RU")
    : "Нет данных о времени";
const rub = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value)
    ? money(value)
    : "Нет данных";
function waiting(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return "Время в очереди неизвестно";
  return `В очереди ${Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000))} мин.`;
}
export function ManagerAccess({ role }: { role?: string }) {
  return role === "manager" ? (
    <ManagerWorkspace />
  ) : (
    <main className="cv-card">
      <h1>Доступно только менеджеру</h1>
    </main>
  );
}
type ViewProps = {
  rows: QueueItem[];
  selected: string;
  detail: ApplicationDetail | null;
  tab: "queue" | "rejected";
  loading: boolean;
  detailLoading: boolean;
  error: string;
  busy: boolean;
  onSelect(id: string): void;
  onTab(tab: "queue" | "rejected"): void;
  onRetry(): void;
  onAction(event: ManagerEvent, payload: Record<string, string>): Promise<void>;
  onMemo?(): void;
};
export function ManagerView(p: ViewProps) {
  const row = p.rows.find((r) => r.application.id === p.selected);
  const d = p.detail?.dossier;
  const limit = d?.limit_now_rub;
  const actionable =
    p.detail?.application.status === "queued" && !p.busy && !p.detailLoading;
  return (
    <main className="cabinet-v2 unified-cabinet manager-workspace">
      <header className="cv-heading">
        <div>
          <small>БАНКОВСКАЯ СТОРОНА</small>
          <h1>Рабочее место менеджера</h1>
        </div>
        <button
          className="button secondary"
          disabled={p.busy}
          onClick={p.onRetry}
        >
          Обновить очередь
        </button>
      </header>
      <nav className="manager-tabs" aria-label="Разделы заявок">
        <button
          id="manager-queue"
          className="button secondary"
          aria-pressed={p.tab === "queue"}
          onClick={() => p.onTab("queue")}
        >
          Очередь
        </button>
        <button
          id="manager-rejected"
          className="button secondary"
          aria-pressed={p.tab === "rejected"}
          onClick={() => p.onTab("rejected")}
        >
          Отказы
        </button>
      </nav>
      {p.error && (
        <p role="alert" className="manager-stop">
          {p.error}
        </p>
      )}
      {p.loading ? (
        <p role="status">Загружаем очередь…</p>
      ) : !p.rows.length ? (
        <p className="cv-card">
          {p.tab === "queue"
            ? "Красных заявок нет, система разобрала остальные сама"
            : "Отказов нет"}
        </p>
      ) : (
        <div className="manager-columns">
          <section aria-label="Список заявок" className="manager-queue">
            {p.rows.map((r) => {
              const n = r.N ?? r.readiness_n,
                m = r.M ?? r.readiness_m;
              return (
                <button
                  key={r.application.id}
                  data-application={r.application.id}
                  className="cv-card manager-row"
                  aria-pressed={p.selected === r.application.id}
                  disabled={p.busy}
                  onClick={() => p.onSelect(r.application.id)}
                >
                  <strong>
                    {r.client_name ||
                      r.application.client_name ||
                      "Имя клиента: нет данных"}
                  </strong>
                  <span className="manager-stop">
                    {r.red_reason
                      ? explain(r.red_reason)
                      : "Причина передачи: нет данных"}
                    {r.reason ? `: ${explain(r.reason)}` : ""}
                  </span>
                  <span>
                    Запрос: <b>{rub(r.application.amount)}</b>
                  </span>
                  <span>
                    Лимит сейчас: <b>{rub(r.limit_now_rub)}</b>
                  </span>
                  {n != null && m != null && m > 0 && n >= 0 && n <= m ? (
                    <div className="cv-progress">
                      <div>
                        <i style={{ width: `${(100 * n) / m}%` }} />
                      </div>
                      <small>
                        {n} из {m}
                      </small>
                    </div>
                  ) : (
                    <span>Полнота досье: нет данных</span>
                  )}
                  <small>{waiting(r.application.queued_at)}</small>
                </button>
              );
            })}
          </section>
          <section
            aria-label="Досье выбранной заявки"
            aria-busy={p.detailLoading}
            className="cv-card manager-dossier"
          >
            {p.detailLoading ? (
              <p role="status">Загружаем досье…</p>
            ) : !p.detail ? (
              <p>Выберите заявку, чтобы открыть досье</p>
            ) : (
              <>
                <h2>Досье заявки</h2>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!actionable || !d}
                  onClick={p.onMemo}
                >
                  Подготовить записку андеррайтеру
                </button>
                <p>
                  {statuses[p.detail.application.status] || "Статус неизвестен"}{" "}
                  · Лимит сейчас: {rub(limit)}
                </p>
                {!d ? (
                  <p>Досье пока нет</p>
                ) : (
                  <>
                    <h3>Проверки комплаенса</h3>
                    {!d.checks?.length ? (
                      <p>Нет данных о проверках</p>
                    ) : (
                      d.checks.map((c, i) => (
                        <article
                          key={i}
                          className={
                            c.status === "ok"
                              ? "manager-verified"
                              : c.status === "unavailable"
                                ? "manager-missing"
                                : "manager-stop"
                          }
                        >
                          <strong>
                            {c.status === "ok"
                              ? "Пройдено"
                              : c.status === "unavailable"
                                ? "Источник недоступен"
                                : "Не пройдено"}
                          </strong>
                          :{" "}
                          {c.managerText ||
                            (c.reasonCode
                              ? explain(c.reasonCode)
                              : "Описание отсутствует")}
                          <small>
                            Источник: {c.source || "нет данных"} ·{" "}
                            {timestamp(c.checkedAt)}
                          </small>
                        </article>
                      ))
                    )}
                    <h3>Что сверено</h3>
                    <div className="manager-verified">
                      {d.verified?.length ? (
                        d.verified.map((v) => <p key={v}>{explain(v)}</p>)
                      ) : (
                        <p>Отдельный список сверенных данных не предоставлен</p>
                      )}
                    </div>
                    <h3>Чего не хватает</h3>
                    <div className="manager-missing">
                      {d.holes ? (
                        d.holes.length ? (
                          d.holes.map((h) => <p key={h}>{explain(h)}</p>)
                        ) : (
                          <p>Недостающих данных нет</p>
                        )
                      ) : (
                        <p>Нет данных о полноте досье</p>
                      )}
                    </div>
                    {d.documents?.map((doc, i) => (
                      <p
                        key={i}
                        className={
                          doc.status === "fresh"
                            ? "manager-verified"
                            : "manager-missing"
                        }
                      >
                        {explain(doc.category)}:{" "}
                        {doc.status === "fresh"
                          ? "Актуален"
                          : doc.status === "expired"
                            ? "Устарел"
                            : "Дата неизвестна"}{" "}
                        · {timestamp(doc.documentDate)}
                      </p>
                    ))}
                    <h3>Стоп-факторы</h3>
                    <div className="manager-stop">
                      {d.stops_fired ? (
                        d.stops_fired.length ? (
                          d.stops_fired.map((s) => <p key={s}>{explain(s)}</p>)
                        ) : (
                          <p>Стоп-факторов нет</p>
                        )
                      ) : (
                        <p>Нет данных о стоп-факторах</p>
                      )}
                    </div>
                    <h3>Тезисы клиента</h3>
                    <p className="manager-objections">
                      {d.client_objections ||
                        row?.client_objections ||
                        "Тезисы клиента не переданы"}
                    </p>
                    <h3>Альтернативы</h3>
                    {!d.alternatives?.length ? (
                      <p>Альтернативы не предоставлены</p>
                    ) : (
                      d.alternatives.map((option) => {
                        const blocked =
                          typeof limit !== "number" ||
                          !Number.isFinite(limit) ||
                          !Number.isFinite(option.amount_rub) ||
                          option.amount_rub <= 0 ||
                          option.amount_rub > limit;
                        const why = blocked
                          ? "Сумма превышает текущий лимит или лимит неизвестен"
                          : !actionable
                            ? "Решение доступно только для заявки в очереди"
                            : "Передать выбранный вариант на андеррайтинг";
                        return (
                          <article
                            className="manager-option"
                            key={option.option_id}
                          >
                            <h4>{option.product_name}</h4>
                            <p>
                              {rub(option.amount_rub)} · {option.term_months}{" "}
                              мес. · {option.rate_annual_pct}% годовых
                            </p>
                            <p>Платёж: {rub(option.monthly_payment_rub)}</p>
                            <p>{option.reason}</p>
                            <form
                              data-option-form={option.option_id}
                              onSubmit={(e) => {
                                e.preventDefault();
                                const memo = (
                                  e.currentTarget.elements.namedItem(
                                    "memo",
                                  ) as HTMLTextAreaElement
                                ).value.trim();
                                if (!memo || blocked || !actionable) return;
                                return p.onAction("send_to_underwriting", {
                                  option_id: option.option_id,
                                  memo,
                                });
                              }}
                            >
                              <label className="field">
                                <span>Записка андеррайтеру</span>
                                <textarea
                                  name="memo"
                                  required
                                  maxLength={4000}
                                  disabled={!actionable}
                                />
                              </label>
                              <button
                                className="button"
                                data-option={option.option_id}
                                disabled={blocked || !actionable}
                                title={why}
                              >
                                Предложить вариант
                              </button>
                            </form>
                            {(blocked || !actionable) && <small>{why}</small>}
                          </article>
                        );
                      })
                    )}
                    <form
                      className="manager-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void p.onAction("request_info", {
                          hole: String(data.get("hole")),
                          text: String(data.get("text")).trim(),
                        });
                      }}
                    >
                      <h3>Запросить документ</h3>
                      <label className="field">
                        <span>Недостающие данные</span>
                        <select
                          name="hole"
                          required
                          disabled={!actionable || !d.holes?.length}
                        >
                          {d.holes?.map((h) => (
                            <option key={h} value={h}>
                              {explain(h)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Сообщение клиенту</span>
                        <textarea
                          name="text"
                          required
                          maxLength={4000}
                          disabled={!actionable}
                        />
                      </label>
                      <button
                        className="button secondary"
                        disabled={!actionable || !d.holes?.length}
                      >
                        Запросить документ
                      </button>
                    </form>
                    <form
                      className="manager-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void p.onAction("reject", {
                          reason: String(data.get("reason")).trim(),
                        });
                      }}
                    >
                      <label className="field">
                        <span>Причина отказа</span>
                        <textarea
                          name="reason"
                          required
                          maxLength={4000}
                          disabled={!actionable}
                        />
                      </label>
                      <button
                        className="button secondary"
                        disabled={!actionable}
                      >
                        Отказать
                      </button>
                    </form>
                  </>
                )}
                <h3>Журнал событий</h3>
                {!p.detail.events.length ? (
                  <p>Журнал пока пуст</p>
                ) : (
                  <ol className="manager-timeline">
                    {p.detail.events.map((e) => (
                      <li key={e.seq}>
                        <strong>
                          {e.actor_role === "system"
                            ? "система"
                            : e.actor_role === "manager"
                              ? "менеджер"
                              : "клиент"}
                        </strong>{" "}
                        · {timestamp(e.at)}
                        <p>
                          {e.from_status
                            ? statuses[e.from_status] || "Статус неизвестен"
                            : "Начало"}{" "}
                          → {statuses[e.to_status] || "Статус неизвестен"}
                        </p>
                        <p>
                          {e.reason ? explain(e.reason) : "Причина не указана"}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
export function ManagerWorkspace() {
  const [memo, setMemo] = useState<{
    option_id?: string;
    memo?: string;
  } | null>(null);
  const [tab, setTab] = useState<"queue" | "rejected">("queue");
  const [rows, setRows] = useState<QueueItem[]>([]),
    [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    setDetail(null);
    loadQueue(tab)
      .then((list) => {
        if (current) {
          setRows(list);
          setSelected((id) =>
            list.some((r) => r.application.id === id)
              ? id
              : list[0]?.application.id || "",
          );
        }
      })
      .catch((e) => {
        if (current) {
          setRows([]);
          setSelected("");
          setError(e.message);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [tab, revision]);
  useEffect(() => {
    let current = true;
    setDetail(null);
    if (!selected || loading) return;
    setDetailLoading(true);
    loadApplication(selected)
      .then((d) => {
        if (current) setDetail(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setDetailLoading(false);
      });
    return () => {
      current = false;
    };
  }, [selected, loading, revision]);
  async function action(event: ManagerEvent, payload: Record<string, string>) {
    if (!detail || detail.application.id !== selected || lock.current) return;
    if (Object.values(payload).some((value) => !value.trim())) {
      setError("Заполните текст решения");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await sendManagerEvent(detail.application, event, payload);
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {memo &&
        detail &&
        !detailLoading &&
        detail.application.id === selected && (
          <ManagerMemo
            key={
              detail.application.id +
              ":" +
              detail.application.version +
              ":" +
              (memo.option_id || "original")
            }
            detail={detail}
            optionId={memo.option_id}
            initialComment={memo.memo}
            busy={busy}
            onClose={() => setMemo(null)}
            onSend={async (payload) => {
              await action("send_to_underwriting", payload);
              setMemo(null);
            }}
          />
        )}
      <ManagerView
        rows={rows}
        selected={selected}
        detail={detail}
        tab={tab}
        loading={loading}
        detailLoading={detailLoading}
        error={error}
        busy={busy}
        onSelect={(id) => {
          setMemo(null);
          setError("");
          setDetail(null);
          setSelected(id);
        }}
        onTab={(value) => {
          setMemo(null);
          if (!lock.current) {
            setRows([]);
            setSelected("");
            setDetail(null);
            setTab(value);
          }
        }}
        onRetry={() => setRevision((v) => v + 1)}
        onMemo={() => setMemo({})}
        onAction={async (event, payload) => {
          if (event === "send_to_underwriting") setMemo(payload);
          else await action(event, payload).catch(() => {});
        }}
      />
    </>
  );
}
