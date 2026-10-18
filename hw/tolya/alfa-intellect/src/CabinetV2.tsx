import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  TrendingDown,
  MessageSquare,
  Check,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, Modal } from "./ui";
import { date, money } from "./api";
import {
  addDays,
  cabinetSnapshot,
  day,
  daysBetween,
  type Facility,
  type PaymentEvent,
} from "../shared/cabinet";
import type { AppState } from "../shared/types";
import { AnchoredPanel, ContextHelp } from "./ContextHelp";
import { FinancialIndicators } from "./FinancialIndicators";
import { CalendarPicker, calendarCells } from "./CalendarPicker";
import { NumericInput } from "./NumericInput";

const value = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : money(n);
const total = (p: PaymentEvent) => p.principal + p.interest + p.fees;
const statusText = (p: PaymentEvent, today: string) =>
  p.status === "paid"
    ? "Оплата подтверждена"
    : p.status === "overdue"
      ? "Просрочка подтверждена"
      : p.date < today
        ? "Исполнение не уточнено"
        : "Плановый платёж";
export function DebtChart({ facility }: { facility: Facility | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!facility || !facility.events.length)
    return (
      <div className="cv-chart-empty">
        <TrendingDown size={28} />
        <h3>Как будет уменьшаться долг</h3>
        <p>Добавьте сведения о кредите — здесь появится план погашения.</p>
      </div>
    );
  const firstBalance =
    facility.events[0].principal + facility.events[0].balance;
  const points = [
    { date: facility.startDate, balance: firstBalance, status: "paid" },
    ...facility.events,
  ];
  const max = Math.max(firstBalance, ...points.map((p) => p.balance), 1),
    first = Date.parse(points[0].date),
    last = Date.parse(points.at(-1)!.date),
    x = (i: number) =>
      38 +
      ((Date.parse(points[i].date) - first) / Math.max(1, last - first)) * 730,
    y = (b: number) => 175 - (b / max) * 145;
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.balance)}`)
    .join(" ");
  const fact = points.slice(
    0,
    points.findIndex((p, i) => i > 0 && p.status !== "paid") === -1
      ? points.length
      : points.findIndex((p, i) => i > 0 && p.status !== "paid"),
  );
  return (
    <div className="cv-chart">
      <div className="cv-chart-key">
        <span>
          <i />
          План
        </span>
        {fact.length > 1 && (
          <span>
            <i className="fact" />
            Подтверждённое исполнение
          </span>
        )}
        <small>Основной долг, ₽</small>
      </div>
      <div
        className="cv-chart-plot"
        tabIndex={0}
        role="img"
        aria-label="Остаток основного долга по времени. Стрелки влево и вправо — даты и суммы."
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            setHover((i) =>
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  (i ?? 0) + (e.key === "ArrowRight" ? 1 : -1),
                ),
              ),
            );
          }
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            v = ((e.clientX - r.left) / r.width) * 800;
          setHover(
            points.reduce(
              (best, _, i) =>
                Math.abs(x(i) - v) < Math.abs(x(best) - v) ? i : best,
              0,
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1="38"
              x2="768"
              y1={175 - f * 145}
              y2={175 - f * 145}
              stroke="#edf0f4"
              strokeDasharray={f ? "3 6" : undefined}
            />
          ))}
          <path
            className="cv-chart-plan"
            d={path}
            fill="none"
            stroke="#c5cbd5"
            strokeWidth="2.5"
          />
          {fact.length > 1 && (
            <path
              d={fact
                .map(
                  (p, i) =>
                    `${i ? "L" : "M"}${38 + ((Date.parse("settledAt" in p ? p.settledAt || p.date : p.date) - first) / Math.max(1, last - first)) * 730},${y(p.balance)}`,
                )
                .join(" ")}
              fill="none"
              stroke="#ee574b"
              strokeWidth="3"
            />
          )}
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1="20"
                y2="180"
                stroke="#c2c9d4"
                strokeDasharray="3 4"
              />
              <circle
                cx={x(hover)}
                cy={y(points[hover].balance)}
                r="4"
                fill="#ee574b"
              />
            </>
          )}
        </svg>
        <span className="cv-axis-top">
          {(max / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}{" "}
          млн
        </span>
        <span className="cv-axis-zero">0</span>
        {hover !== null && (
          <div className="cv-chart-tooltip" role="status">
            <b>
              {date(points[hover].date)} · {money(points[hover].balance)}
            </b>
            <small>
              {hover === 0
                ? "Начальный остаток"
                : statusText(facility.events[hover - 1], day())}
            </small>
          </div>
        )}
      </div>
      <div className="cv-xlabels">
        <span>{date(points[0].date)}</span>
        <span>Дата платежа</span>
        <span>{date(points.at(-1)!.date)}</span>
      </div>
    </div>
  );
}
export function PaymentCalendar({
  facility,
  onClose,
  anchor = null,
  onDiscuss,
}: {
  facility: Facility | null;
  onClose: () => void;
  anchor?: HTMLElement | null;
  onDiscuss?: (date: string) => void;
}) {
  const w = useWorkspace(),
    [record, setRecord] = useState<PaymentEvent | null>(null),
    [recordDate, setRecordDate] = useState(day()),
    [recordSource, setRecordSource] = useState(""),
    [recordError, setRecordError] = useState("");
  const payments = facility?.events || [];
  const next =
    payments.find((p) => p.status !== "paid" && p.date >= day()) || payments[0];
  const [month, setMonth] = useState((next?.date || day()).slice(0, 7) + "-01"),
    [selected, setSelected] = useState(next?.date || day());
  const d = new Date(month + "T00:00:00Z"),
    events = payments.filter((p) => p.date === selected);
  const chooseMonth = (year: number, index: number) => {
    const nextMonth = day(new Date(Date.UTC(year, index, 1)));
    const nextYear = Number(nextMonth.slice(0, 4));
    if (nextYear < firstYear || nextYear > lastYear) return;
    setMonth(nextMonth);
    setSelected(
      payments.find((p) => p.date.startsWith(nextMonth.slice(0, 7)))?.date ||
        nextMonth,
    );
  };
  const shift = (n: number) =>
    chooseMonth(d.getUTCFullYear(), d.getUTCMonth() + n);
  const firstYear = Math.min(
    Number(day().slice(0, 4)),
    Number((facility?.startDate || day()).slice(0, 4)),
  );
  const lastYear = Math.max(
    firstYear + 3,
    Number(day().slice(0, 4)) + 3,
    ...payments.map((p) => Number(p.date.slice(0, 4))),
  );
  return (
    <AnchoredPanel anchor={anchor} title="Календарь платежей" onClose={onClose}>
      <div className="cv-calendar">
        <div className="cv-calendar-head">
          <button
            aria-label="Предыдущий месяц"
            disabled={d.getUTCFullYear() === firstYear && d.getUTCMonth() === 0}
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="cv-month-selectors">
            <CalendarPicker
              label="Месяц календаря"
              value={d.getUTCMonth()}
              onChange={(value) => chooseMonth(d.getUTCFullYear(), value)}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i,
                label: new Date(Date.UTC(2026, i, 1)).toLocaleDateString(
                  "ru-RU",
                  {
                    month: "long",
                    timeZone: "UTC",
                  },
                ),
              }))}
            />
            <CalendarPicker
              label="Год календаря"
              value={d.getUTCFullYear()}
              onChange={(value) => chooseMonth(value, d.getUTCMonth())}
              options={Array.from(
                { length: lastYear - firstYear + 1 },
                (_, i) => ({
                  value: firstYear + i,
                  label: String(firstYear + i),
                }),
              )}
            />
          </div>
          <button
            aria-label="Следующий месяц"
            disabled={d.getUTCFullYear() === lastYear && d.getUTCMonth() === 11}
            onClick={() => shift(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="cv-calendar-grid">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
            <small key={w}>{w}</small>
          ))}
          {calendarCells(month).map((dt, i) => {
            if (!dt) return <span key={"blank" + i} aria-hidden="true" />;
            const ps = payments.filter((p) => p.date === dt);
            return (
              <button
                key={dt}
                aria-label={
                  dt +
                  (ps.length
                    ? " · платёж " + money(ps.reduce((n, p) => n + total(p), 0))
                    : "")
                }
                aria-pressed={selected === dt}
                className={
                  (ps.length ? "has-payment " : "") +
                  (dt === selected ? "selected" : "")
                }
                onClick={() => setSelected(dt)}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setSelected(dt);
                }}
                onFocus={() => setSelected(dt)}
              >
                {Number(dt.slice(-2))}
                {!!ps.length && <i />}
              </button>
            );
          })}
        </div>
        <div className="cv-calendar-detail">
          <small>{date(selected)}</small>
          {events.length ? (
            events.map((p) => (
              <div key={p.id}>
                <h3>{money(total(p))}</h3>
                <p>{statusText(p, day())}</p>
                <dl>
                  <div>
                    <dt>Основной долг</dt>
                    <dd>{money(p.principal)}</dd>
                  </div>
                  <div>
                    <dt>Проценты</dt>
                    <dd>{money(p.interest)}</dd>
                  </div>
                  {p.fees > 0 && (
                    <div>
                      <dt>Комиссии</dt>
                      <dd>{money(p.fees)}</dd>
                    </div>
                  )}
                </dl>
                {p.status !== "paid" && p.date <= day() && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setRecord(p);
                      setRecordError("");
                    }}
                  >
                    Уточнить исполнение
                  </button>
                )}
              </div>
            ))
          ) : (
            <p>
              {payments.length
                ? "На эту дату обязательств в графике нет."
                : "Платежи появятся после добавления графика кредита."}
            </p>
          )}
          {!!events.length && onDiscuss && (
            <button
              className="calendar-discuss"
              onClick={() => {
                onClose();
                onDiscuss(selected);
              }}
            >
              <MessageSquare size={15} />
              Обсудить с агентом
              <ArrowRight size={14} />
            </button>
          )}
        </div>
        {record && (
          <form
            className="cv-payment-record"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await w.act("/cabinet/payment", {
                  id: record.id,
                  status: "paid",
                  recordedDate: recordDate,
                  source: recordSource,
                });
                setRecord(null);
              } catch (e) {
                setRecordError((e as Error).message);
              }
            }}
          >
            <h3>Подтверждение полного платежа</h3>
            <p className="cv-note">
              Отметка пользователя, не банковская проверка. Подтвердите
              фактическое исполнение всей суммы {money(total(record))}.
            </p>
            <label>
              Дата фактической оплаты
              <input
                aria-label="Дата фактической оплаты"
                type="date"
                required
                max={day()}
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
              />
            </label>
            <label>
              Основание оплаты
              <input
                aria-label="Основание оплаты"
                required
                minLength={5}
                maxLength={180}
                value={recordSource}
                onChange={(e) => setRecordSource(e.target.value)}
              />
            </label>
            <label className="cv-confirm">
              <input type="checkbox" required />
              Проверил полное исполнение
            </label>
            {recordError && (
              <p role="alert" className="cv-error">
                {recordError}
              </p>
            )}
            <Button>Подтвердить оплату</Button>
          </form>
        )}
      </div>
    </AnchoredPanel>
  );
}
type EditorKind = "facility" | "plan" | "coverage";
export function CabinetEditor({
  kind,
  onClose,
}: {
  kind: EditorKind;
  onClose: () => void;
}) {
  const w = useWorkspace(),
    today = day(),
    plan = w.state.cabinet?.plan,
    coverage = w.state.cabinet?.coverage;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<Record<string, string>>(
      kind === "facility"
        ? {
            name: "",
            amount: "",
            balance: "",
            rate: "",
            term: "",
            contractTerm: "",
            issuedDate: "",
            firstDate: "",
            documentId: "",
          }
        : kind === "plan"
          ? {
              balance: plan ? String(plan.balance) : "",
              balanceDate: plan?.balanceDate || today,
              through: plan?.through || addDays(today, 29),
              source: plan?.source || "",
            }
          : {
              amount: coverage ? String(coverage.amount) : "",
              start: coverage?.start || today,
              end: coverage?.end || addDays(today, 29),
              source: coverage?.source || "",
              methodology: coverage?.methodology || "",
            },
    );
  const [items, setItems] = useState(
    plan?.items.map((i) => ({
      date: i.date,
      label: i.label,
      amount: String(i.amount),
    })) || [{ date: today, label: "", amount: "" }],
  );
  const labels: Record<string, string> = {
    name: "Название договора",
    amount:
      kind === "coverage" ? "CFADS за период, ₽" : "Первоначальная сумма, ₽",
    balance:
      kind === "plan"
        ? "Остаток денег на дату, ₽"
        : "Остаток основного долга сегодня, ₽",
    rate: "Годовая ставка, %",
    term: "Оставшийся срок, месяцев",
    contractTerm: "Общий срок договора, месяцев",
    issuedDate: "Дата выдачи кредита",
    firstDate: "Дата ближайшего платежа",
    balanceDate: "Дата остатка",
    through: "План полностью покрывает период до",
    source: "Источник данных",
    start: "Начало периода CFADS",
    end: "Конец периода CFADS",
    methodology:
      "Методика CFADS: состав доходов, расходов, налогов и корректировок",
  };
  return (
    <Modal
      title={
        kind === "facility"
          ? "Добавить действующий кредит"
          : kind === "plan"
            ? "План движения денег"
            : "Подтвердить CFADS"
      }
      onClose={onClose}
      wide
    >
      <form
        className="cv-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const body: any = { ...form };
            if (kind === "facility")
              for (const key of ["issuedDate", "contractTerm"])
                if (body[key] === "") delete body[key];
            for (const k of [
              "amount",
              "balance",
              "rate",
              "term",
              "contractTerm",
            ])
              if (k in body) body[k] = Number(body[k]);
            if (kind === "facility" && !body.documentId) delete body.documentId;
            if (kind === "plan")
              body.items = items
                .filter((i) => i.label || i.amount)
                .map((i) => ({ ...i, amount: Number(i.amount) }));
            await w.act(
              "/cabinet/" + (kind === "facility" ? "facility" : kind),
              body,
            );
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="cv-note">
          {kind === "facility"
            ? "Это учёт вашего существующего договора, не выдача кредита. Параметры подтверждаете вы; новые заявки в банк не отправляются. Без документа будет построен расчётный аннуитетный график без комиссий."
            : kind === "plan"
              ? "Укажите остаток на начало указанного дня и все ожидаемые поступления и обязательные расходы до конца горизонта. Кредитные платежи из графика добавятся автоматически — не дублируйте их в плане."
              : "CFADS не равен чистому потоку выписки. Укажите обоснованную сумму, источник и методику за тот же период, что долговые обязательства."}
        </p>
        <div className="cv-form-grid">
          {Object.entries(form)
            .filter(([k]) => k !== "documentId")
            .map(([k, v]) => (
              <label key={k} className={k === "methodology" ? "span-all" : ""}>
                <span>{labels[k]}</span>
                {k === "methodology" ? (
                  <textarea
                    required
                    minLength={20}
                    maxLength={800}
                    value={v}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                ) : [
                    "amount",
                    "balance",
                    "rate",
                    "term",
                    "contractTerm",
                  ].includes(k) ? (
                  <NumericInput
                    aria-label={labels[k]}
                    required={k !== "contractTerm"}
                    value={v}
                    onValueChange={(value) => setForm({ ...form, [k]: value })}
                    unit={
                      k === "rate"
                        ? "%"
                        : k === "term" || k === "contractTerm"
                          ? "мес."
                          : "₽"
                    }
                    decimals={k === "term" || k === "contractTerm" ? 0 : 2}
                    signed={kind === "coverage" && k === "amount"}
                    min={
                      k === "term" || k === "contractTerm"
                        ? 1
                        : k === "amount" && kind === "coverage"
                          ? undefined
                          : k === "amount"
                            ? 0.01
                            : 0
                    }
                    max={
                      k === "rate"
                        ? 100
                        : k === "term" || k === "contractTerm"
                          ? 120
                          : 1e12
                    }
                    placeholder={
                      k === "rate"
                        ? "18"
                        : k === "term" || k === "contractTerm"
                          ? "36"
                          : "1 000 000"
                    }
                  />
                ) : (
                  <input
                    required={k !== "issuedDate"}
                    aria-label={labels[k]}
                    aria-describedby={
                      k === "firstDate" ? "next-payment-hint" : undefined
                    }
                    maxLength={180}
                    type={/Date|through|start|end/.test(k) ? "date" : "text"}
                    value={v}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                )}
                {k === "firstDate" && (
                  <small id="next-payment-hint" className="cv-field-hint">
                    Когда по вашему графику нужно внести следующий платёж по
                    кредиту.
                  </small>
                )}
              </label>
            ))}
        </div>
        {kind === "facility" && (
          <label>
            <span>Откуда взять график платежей?</span>
            <select
              aria-label="Откуда взять график платежей?"
              aria-describedby="schedule-source-hint"
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
            >
              <option value="">Рассчитать по сумме, ставке и сроку</option>
              {w.state.documents
                .filter((d) => d.confirmed && d.category === "schedule")
                .map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
            <small id="schedule-source-hint" className="cv-field-hint">
              Или выберите график банка, который вы уже загрузили в «Мой бизнес»
              → «Документы». Если файла нет, рассчитаем оставшиеся платежи по
              введённым данным.
            </small>
          </label>
        )}
        {kind === "plan" && (
          <div className="cv-plan-items">
            <h3>Плановые операции</h3>
            <p className="cv-note">
              Положительная сумма — поступление, отрицательная — расход. Если
              операций нет, оставьте строки пустыми и подтвердите полный план.
            </p>
            {items.map((i, n) => (
              <div className="cv-plan-row" key={n}>
                <input
                  aria-label={"Дата операции " + (n + 1)}
                  type="date"
                  value={i.date}
                  onChange={(e) =>
                    setItems(
                      items.map((v, j) =>
                        j === n ? { ...v, date: e.target.value } : v,
                      ),
                    )
                  }
                />
                <input
                  aria-label={"Описание операции " + (n + 1)}
                  placeholder="Назначение"
                  value={i.label}
                  maxLength={100}
                  onChange={(e) =>
                    setItems(
                      items.map((v, j) =>
                        j === n ? { ...v, label: e.target.value } : v,
                      ),
                    )
                  }
                />
                <NumericInput
                  aria-label={"Сумма операции " + (n + 1)}
                  placeholder="Сумма со знаком"
                  signed
                  value={i.amount}
                  onValueChange={(amount) =>
                    setItems(
                      items.map((v, j) => (j === n ? { ...v, amount } : v)),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={"Убрать операцию " + (n + 1)}
                  onClick={() => setItems(items.filter((_, j) => n !== j))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setItems([...items, { date: today, label: "", amount: "" }])
              }
            >
              <Plus size={15} />
              Добавить операцию
            </button>
          </div>
        )}
        {kind !== "facility" && (
          <label className="cv-confirm">
            <input type="checkbox" required />
            <span>
              {kind === "plan"
                ? "Подтверждаю остаток и полноту плана за указанный период; кредитные платежи не продублированы."
                : "Проверил сведения и подтверждаю их как пользовательские данные, не как банковскую проверку."}
            </span>
          </label>
        )}
        {error && (
          <p className="cv-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button secondary type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={busy}>
            {busy
              ? "Сохраняем…"
              : kind === "facility"
                ? "Сохранить кредит"
                : "Подтвердить и сохранить"}
            <Check size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function CabinetV2({
  preview,
  onDiscuss,
  training = false,
}: {
  preview?: AppState;
  onDiscuss: (paymentDate?: string) => void;
  training?: boolean;
}) {
  const w = useWorkspace(),
    s = preview || w.state,
    v = useMemo(() => cabinetSnapshot(s, undefined, !!preview), [s, preview]),
    c = v.facility,
    p = v.next;
  const calendarAnchor = useRef<HTMLButtonElement>(null);
  const [calendar, setCalendar] = useState(false),
    [editor, setEditor] = useState<EditorKind | null>(null);
  return (
    <div className="cabinet-v2 unified-cabinet">
      {training && (
        <div className="cv-training-label">
          Учебный пример · синтетические данные исчезнут после обучения
        </div>
      )}
      <div className="cv-overview">
        <section className="cv-card cv-facility" data-tour="summary">
          <div className="cv-card-head">
            <h2>{c ? "Кредит бизнеса" : "Ваше финансирование"}</h2>
          </div>
          <div className="cv-summary-grid">
            <div>
              <small>
                {c?.kind === "line" || c?.kind === "overdraft"
                  ? "Кредитный лимит"
                  : "Первоначальная сумма"}
              </small>
              <strong>
                {c
                  ? value(c.kind === "loan" ? c.amount : c.limit)
                  : s.cabinet?.noCreditConfirmedAt
                    ? "0 ₽"
                    : "—"}
              </strong>
            </div>
            <div>
              <small>Остаток основного долга</small>
              <strong className="cv-hero-number">
                {c
                  ? value(c.balance)
                  : s.cabinet?.noCreditConfirmedAt
                    ? "0 ₽"
                    : "—"}
              </strong>
            </div>
            <div>
              <small>
                {c && c.kind !== "loan" ? "Доступные средства" : "Уже погашено"}
              </small>
              <strong>
                {c
                  ? value(
                      c.kind === "loan"
                        ? c.amount - c.balance
                        : c.limit === undefined
                          ? null
                          : c.limit - c.balance,
                    )
                  : s.cabinet?.noCreditConfirmedAt
                    ? "0 ₽"
                    : "—"}
              </strong>
            </div>
            <div>
              <small>Прогресс погашения</small>
              <strong>
                {v.progress === null
                  ? "—"
                  : v.progress.toLocaleString("ru-RU", {
                      maximumFractionDigits: 1,
                    }) + "%"}
              </strong>
            </div>
          </div>
          {c ? (
            <>
              {v.progress !== null && (
                <div className="cv-progress">
                  <div
                    role="progressbar"
                    aria-label="Погашено основного долга"
                    aria-valuenow={Math.round(v.progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i style={{ width: v.progress + "%" }} />
                  </div>
                  <small>{v.progress.toFixed(1)}%</small>
                </div>
              )}
              <div className="cv-terms">
                <div>
                  <span>Ставка</span>
                  <strong>{c.rate}% годовых</strong>
                </div>
                <div>
                  <span>
                    {c.contractTerm || c.quality === "synthetic"
                      ? "Срок кредита"
                      : "Оставшийся срок"}
                  </span>
                  <strong>{c.contractTerm || c.term} месяцев</strong>
                </div>
                <div>
                  <span>Дата погашения</span>
                  <strong>{date(c.events.at(-1)?.date || c.asOf)}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <p>
                {s.cabinet?.noCreditConfirmedAt
                  ? "Вы подтвердили отсутствие действующего кредита."
                  : "Сведения о действующем финансировании пока не добавлены."}
              </p>
              <div className="cv-empty-actions">
                <Button
                  secondary
                  disabled={!!preview}
                  onClick={() => setEditor("facility")}
                >
                  <Plus size={15} />
                  Добавить кредит
                </Button>
                <button
                  className="text-button"
                  onClick={() => w.go("/financing")}
                >
                  Подобрать финансирование
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}
        </section>
        <section className="cv-card cv-next" data-tour="payment">
          <div className="cv-card-head">
            <h2>Ближайший платёж</h2>
            <button
              ref={calendarAnchor}
              type="button"
              className="cv-calendar-launch"
              aria-label="Календарь платежей"
              title="Календарь платежей"
              aria-haspopup="dialog"
              aria-expanded={calendar}
              onClick={() => setCalendar((open) => !open)}
            >
              <CalendarDays size={20} />
            </button>
          </div>
          <small>{p ? date(p.date) : "График не определён"}</small>
          <div className="cv-payment-number">{value(p ? total(p) : null)}</div>
          {p ? (
            <>
              <span className="cv-chip">
                {daysBetween(v.today, p.date) === 0
                  ? "Сегодня"
                  : `Через ${daysBetween(v.today, p.date)} дн.`}
              </span>
              <div className="cv-payment-parts">
                <span>
                  Основной долг<b>{value(p.principal)}</b>
                </span>
                <span>
                  Проценты<b>{value(p.interest)}</b>
                </span>
                {p.fees > 0 && (
                  <span>
                    Комиссии<b>{value(p.fees)}</b>
                  </span>
                )}
              </div>
            </>
          ) : (
            <p>Даты и суммы появятся из подтверждённого графика.</p>
          )}
          {v.unresolved.length > 0 && (
            <p className="cv-note">
              По {v.unresolved.length} прошедшим датам требуется уточнить
              исполнение. Просрочка не установлена.
            </p>
          )}
        </section>
      </div>
      <section className="cv-card cv-debt-chart" data-tour="schedule">
        <div className="cv-card-head">
          <div>
            <h2>График погашения кредита</h2>
            <p>Как уменьшается остаток основного долга</p>
          </div>
          <ContextHelp label="Как читать график погашения">
            <p>
              По горизонтали — даты, по вертикали — оставшийся основной долг в
              рублях. Наклон линии показывает, как долг уменьшается до полного
              погашения.
            </p>
            <p>
              Серая линия — план по договору, красная — подтверждённое
              исполнение. Наведите на линию или используйте стрелки на
              клавиатуре, чтобы увидеть дату и остаток.
            </p>
            <p>
              Проценты и комиссии не входят в остаток основного долга. Состав
              ближайшего платежа показан в соседней карточке.
            </p>
          </ContextHelp>
        </div>
        <DebtChart facility={c} />
      </section>
      <section className="cv-card cv-financial" data-tour="forecast">
        <div className="cv-card-head">
          <div>
            <h2>Хватит ли денег на платёж?</h2>
          </div>
          <ContextHelp label="Что означает прогноз денег после платежа">
            <p>
              Показывает, сколько денег может остаться на счёте после ближайшего
              платежа, и возможный дефицит в течение 30 дней.
            </p>
            <dl>
              <div>
                <dt>Формула</dt>
                <dd>
                  Остаток на начало + ожидаемые поступления − расходы −
                  кредитные платежи.
                </dd>
              </div>
              <div>
                <dt>Нужные данные</dt>
                <dd>
                  Сведения о кредите и банковская выписка. Для прогноза —
                  подтверждённый остаток и полный план поступлений и расходов с
                  датами.
                </dd>
              </div>
              <div>
                <dt>Источники</dt>
                <dd>
                  {v.cash.source}; {v.forecast.source}.
                </dd>
              </div>
            </dl>
            <p>
              Чистый поток за прошедшие 30 дней — факт из выписки, не прибыль и
              не прогноз. Прогноз опирается на ваши предположения и не
              гарантирует будущих поступлений.
            </p>
            <p>
              {date(v.cash.start)} — {date(v.cash.end)}
              {v.cash.partial ? " · неполный период" : ""}. Поступления:{" "}
              {value(v.cash.inflow)}. Списания: {value(v.cash.outflow)}.
              Остаток: {value(v.cash.balance)}.
            </p>
            <p>{v.forecast.reason}</p>
            {v.forecast.available && (
              <p>
                План до {date(v.forecast.through)}. Минимальный остаток:{" "}
                {value(v.forecast.minimum)} на {date(v.forecast.minimumDate!)}.
                Возможный дефицит: {value(v.forecast.deficit)}.
              </p>
            )}
          </ContextHelp>
        </div>
        <div className="cv-cash-forecast">
          <div className="cv-cash">
            <small>Чистый поток за 30 дней</small>
            <strong>{value(v.cash.net)}</strong>
            {v.cash.net === null && <span>Недостаточно данных</span>}
          </div>
          <div
            className={
              "cv-forecast " +
              (v.forecast.available
                ? v.forecast.deficit! > 0
                  ? "risk"
                  : "enough"
                : "unknown")
            }
          >
            <small>Прогноз после ближайшего платежа</small>
            <strong>{value(v.forecast.afterNext)}</strong>
            <span>
              {!v.forecast.available
                ? "Недостаточно данных"
                : v.forecast.afterNext === null
                  ? "Ближайший платёж вне горизонта 30 дней"
                  : v.forecast.deficit! > 0
                    ? "Есть риск нехватки средств"
                    : "Средств предварительно достаточно"}
            </span>
          </div>
        </div>
        <div className="cv-finance-actions">
          <button
            className="cv-discuss"
            data-tour="discuss"
            disabled={!!preview}
            onClick={() => onDiscuss()}
          >
            <MessageSquare size={16} />
            Обсудить с агентом
            <ArrowRight size={14} />
          </button>
        </div>
        <FinancialIndicators metrics={v.metrics} />
      </section>
      <section className="cv-recommendations" data-tour="recommendations">
        <div className="cv-card-head">
          <h2>На что обратить внимание</h2>
        </div>
        {v.signals.length ? (
          v.signals.map((r) => (
            <article key={r.key}>
              <i className={r.type === "risk" ? "risk" : ""} />
              <div>
                <b>{r.title}</b>
                <p>{r.body}</p>
                <time>{date(r.date)}</time>
              </div>
              <button
                className="text-button"
                disabled={!!preview}
                onClick={
                  r.href === "profile"
                    ? () => w.go("/profile")
                    : () => onDiscuss()
                }
              >
                {r.href === "profile" ? "Обновить данные" : "Обсудить"}
                <ArrowRight size={14} />
              </button>
            </article>
          ))
        ) : (
          <div className="cv-no-signals">
            <Check size={19} />
            <p>
              Новых рекомендаций нет. По мере появления подтверждённых данных
              здесь будут важные события.
            </p>
          </div>
        )}
      </section>
      {calendar && (
        <PaymentCalendar
          facility={c}
          anchor={calendarAnchor.current}
          onDiscuss={preview ? undefined : onDiscuss}
          onClose={() => setCalendar(false)}
        />
      )}
      {editor && (
        <CabinetEditor kind={editor} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
