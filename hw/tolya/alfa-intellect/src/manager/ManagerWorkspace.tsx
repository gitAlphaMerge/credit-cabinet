import { useEffect, useRef, useState, type ReactNode } from "react";
import { money } from "../api";
import { formatRate } from "../format-rate";
import { Illustration, StatusIllustration, ProductIllustration, DocumentIllustration, CheckIllustration } from "../Illustration";
import { ManagerMemo } from "./ManagerMemo";
import { labelCode, safeDisplayText, visibleError } from "../application-client";
import {
  loadApplication,
  loadQueue,
  sendManagerEvent,
  type ApplicationDetail,
  type ManagerEvent,
  type ManagerPayload,
  type QueueItem,
} from "./api";

const explain = labelCode;
const verdicts: Record<string, string> = {
  underwriting: "Готова к автоматическому офферу",
  info_requested: "Нужны дополнительные сведения",
  rejected: "Стоп проверки",
};
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
type StatsDay = {
  date: string;
  forwarded: number;
  rejected: number;
  requested: number;
};
// Панель продуктивности: решения менеджера за 7 дней из журнала заявок, ничего не дорисовывается.
function ManagerStats({ revision }: { revision: number }) {
  const [data, setData] = useState<{
    days: StatsDay[];
    avgMinutes: number | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/bank/stats", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [revision]);
  if (!data) return null;
  const sum = (key: "forwarded" | "rejected" | "requested") =>
    data.days.reduce((n, d) => n + d[key], 0);
  const forwarded = sum("forwarded"),
    rejected = sum("rejected"),
    requested = sum("requested"),
    decided = forwarded + rejected + requested,
    peak = Math.max(1, ...data.days.map((d) => d.forwarded + d.rejected + d.requested));
  return (
    <section className="manager-productivity" aria-label="Продуктивность за неделю">
      <div className="manager-prod-head">
        <h2>Моя продуктивность</h2>
        <small>решения за 7 дней</small>
      </div>
      {decided === 0 && (
        <p className="manager-prod-empty">
          Пока нет решений за неделю: график появится после первого решения по заявке.
        </p>
      )}
      <div className="manager-prod-body">
        <div className="manager-prod-bars" role="img" aria-label={`Решений за неделю: ${decided}`}>
          {data.days.map((d) => {
            const all = d.forwarded + d.rejected + d.requested;
            return (
              <div key={d.date} className="manager-prod-day" title={`${d.date}: ${all}`}>
                <div className="manager-prod-stack" style={{ height: `${(all / peak) * 100}%` }}>
                  <i className="fwd" style={{ flex: d.forwarded }} />
                  <i className="req" style={{ flex: d.requested }} />
                  <i className="rej" style={{ flex: d.rejected }} />
                </div>
                <span>{d.date.slice(8)}.{d.date.slice(5, 7)}</span>
              </div>
            );
          })}
        </div>
        <dl className="manager-prod-kpi">
          <div>
            <dt>Решено</dt>
            <dd>{decided}</dd>
          </div>
          <div>
            <dt>Передано / отказ</dt>
            <dd>
              {forwarded} / {rejected}
            </dd>
          </div>
          <div>
            <dt>Среднее до решения</dt>
            <dd>{data.avgMinutes === null ? "нет данных" : waitLabel(data.avgMinutes)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
type ViewProps = {
  stats?: ReactNode;
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
  onAction(event: ManagerEvent, payload: ManagerPayload): Promise<void>;
  onMemo?(): void;
};
// Досье, собранные до 23.10, хранят технический ключ проверки в тексте.
const checkText = (text?: string) =>
  text?.replace(/^(egrul|fns|bankruptcy|aml):/, (_, key) => `${labelCode(key)}:`);

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
      {p.stats}
      {!p.loading && p.rows.length > 0 && (
        <div className="manager-stats" aria-label="Сводка очереди">
          <div className="manager-stat">
            <span>{p.tab === "queue" ? "У вас в очереди" : "Отказов всего"}</span>
            <b>{p.rows.length}</b>
          </div>
          {p.tab === "queue" && (
            <div className="manager-stat">
              <span>Вернулись после досылки</span>
              <b>{returned}</b>
            </div>
          )}
          {p.tab === "queue" && (
            <div className="manager-stat">
              <span>Дольше всех ждёт</span>
              <b>{waitLabel(oldest)}</b>
            </div>
          )}
        </div>
      )}
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
          {p.error}{" "}
          <Illustration group="empty" name="network" size={48} decorative />
        </p>
      )}
      {p.loading ? (
        <p role="status">Загружаем очередь…</p>
      ) : !p.rows.length ? (
        <p className="cv-card">
          <Illustration group="empty" name="ready" size={64} decorative />{" "}
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
                    <StatusIllustration status={r.application.status} size={32} decorative />{" "}
                    {r.client_name ||
                      r.application.client_name ||
                      "Имя клиента: нет данных"}
                  </strong>
                  <span className="manager-stop">
                    {p.tab === "rejected"
                      ? "Отказ"
                      : r.return_to_manager
                      ? "Возврат после досылки"
                      : r.red_reason
                      ? explain(r.red_reason)
                      : "Причина передачи: нет данных"}
                    {r.reason ? `: ${safeDisplayText(r.reason)}` : ""}
                  </span>
                  {r.return_to_manager && (
                    <span className="manager-missing">вы просили вернуть</span>
                  )}
                  {r.return_to_manager && r.core_verdict && (
                    <span>Новый вердикт: {verdicts[r.core_verdict] || labelCode(r.core_verdict)}</span>
                  )}
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
                <h2><StatusIllustration status={p.detail.application.status} size={48} decorative /> Досье заявки</h2>
                {d?.return_to_manager && (
                  <p className="manager-missing">вы просили вернуть</p>
                )}
                {d?.return_to_manager && d.core_verdict && (
                  <p>Новый вердикт: {verdicts[d.core_verdict] || labelCode(d.core_verdict)}</p>
                )}
                {d?.age?.source === "questionnaire" && (
                  <p className="manager-missing">
                    Возраст бизнеса со слов клиента, реестр не подтвердил
                  </p>
                )}
                {d?.age?.mismatch && (
                  <p className="manager-missing">
                    Возраст в анкете расходится с реестром: по реестру{" "}
                    {d.age.months} мес., скоринг по реестру
                  </p>
                )}
                <button
                  type="button"
                  className="button secondary"
                  disabled={!actionable || !d}
                  onClick={p.onMemo}
                >
                  Подготовить записку андеррайтеру
                </button>
                <p>
                  {labelCode(p.detail.application.status)}{" "}
                  · Лимит сейчас: {rub(limit)}
                </p>
                {!d ? (
                  <p>Досье пока нет</p>
                ) : (
                  <>
                    <h3><Illustration group="status" name="underwriting-checks" size={48} decorative /> Проверки комплаенса</h3>
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
                            <CheckIllustration check={c.key} size={32} decorative />{" "}
                            {c.status === "ok"
                              ? "Пройдено"
                              : c.status === "unavailable"
                                ? "Источник недоступен"
                                : "Не пройдено"}
                          </strong>
                          :{" "}
                          {safeDisplayText(checkText(c.managerText)) ||
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
                        <DocumentIllustration category={doc.category} size={32} decorative />{" "}
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
                    {d.stops_fired?.some((s) => ["BKI_OVERDUE_30_PLUS", "BKI_OVERDUE_90_PLUS"].includes(s)) && <CheckIllustration check="bki" size={32} decorative />}
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
                    <h4><ProductIllustration productId={option.product_id} size={32} decorative /> {labelCode(option.product_id)}</h4>
                            <p>
                              {rub(option.amount_rub)} · {option.term_months}{" "}
                              мес. · {formatRate(option.rate_annual_pct)} годовых
                            </p>
                            <p>Платёж: {rub(option.monthly_payment_rub)}</p>
                            <p>{safeDisplayText(option.reason)}</p>
                            <form
                              className="manager-option-form"
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
                      key={p.detail.application.id + ":" + p.detail.application.version}
                      className="manager-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        return p.onAction("request_info", {
                          hole: String(data.get("hole")),
                          text: String(data.get("text")).trim(),
                          return_to_manager: data.get("return_to_manager") === "on",
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
                          defaultValue=""
                        >
                          <option value="" disabled>
                            {d.holes?.length
                              ? "Выберите, что запросить"
                              : "Ядро не нашло недостающих данных"}
                          </option>
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
                      <label className="manager-return">
                        <input
                          type="checkbox"
                          name="return_to_manager"
                          defaultChecked={false}
                          disabled={!actionable}
                          aria-describedby="manager-return-help"
                        />
                        Вернуть мне после досылки
                      </label>
                      <small id="manager-return-help">
                        Без галочки зелёная заявка уйдёт клиенту сама
                      </small>
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
                      <h3>Отказать</h3>
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
                            ? labelCode(e.from_status)
                            : "Начало"}{" "}
                          → {labelCode(e.to_status)}
                        </p>
                        <p>
                          {e.reason ? safeDisplayText(e.reason) : "Причина не указана"}
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
          setError(visibleError(e));
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
        if (current) setError(visibleError(e));
      })
      .finally(() => {
        if (current) setDetailLoading(false);
      });
    return () => {
      current = false;
    };
  }, [selected, loading, revision]);
  async function action(event: ManagerEvent, payload: ManagerPayload) {
    if (!detail || detail.application.id !== selected || lock.current) return;
    if (Object.values(payload).some((value) => typeof value === "string" && !value.trim())) {
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
      setError(visibleError(e));
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
        stats={<ManagerStats revision={revision} />}
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
          if (event === "send_to_underwriting") setMemo({
            option_id: typeof payload.option_id === "string" ? payload.option_id : undefined,
            memo: typeof payload.memo === "string" ? payload.memo : undefined,
          });
          else await action(event, payload).catch(() => {});
        }}
      />
    </>
  );
}
