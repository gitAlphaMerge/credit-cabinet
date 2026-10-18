import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  TrendingDown,
  MessageSquare,
  FileText,
  Check,
  Pencil,
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
  type Metric,
  type PaymentEvent,
} from "../shared/cabinet";
import type { AppState } from "../shared/types";

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
        <h3>Здесь будет график задолженности</h3>
        <p>Добавьте договор и график платежей — без выдуманной истории.</p>
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
}: {
  facility: Facility;
  onClose: () => void;
}) {
  const w = useWorkspace(),
    [record, setRecord] = useState<PaymentEvent | null>(null),
    [recordDate, setRecordDate] = useState(day()),
    [recordSource, setRecordSource] = useState(""),
    [recordError, setRecordError] = useState("");
  const next =
    facility.events.find((p) => p.status !== "paid" && p.date >= day()) ||
    facility.events[0];
  const [month, setMonth] = useState((next?.date || day()).slice(0, 7) + "-01"),
    [selected, setSelected] = useState(next?.date || day());
  const d = new Date(month + "T00:00:00Z"),
    offset = (d.getUTCDay() + 6) % 7,
    length = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate(),
    events = facility.events.filter((p) => p.date === selected);
  const shift = (n: number) =>
    setMonth(
      day(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))),
    );
  return (
    <Modal title="Календарь платежей" onClose={onClose}>
      <div className="cv-calendar">
        <div className="cv-calendar-head">
          <button aria-label="Предыдущий месяц" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <b>
            {d.toLocaleDateString("ru-RU", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </b>
          <button aria-label="Следующий месяц" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="cv-calendar-grid">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
            <small key={w}>{w}</small>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={"blank" + i} />
          ))}
          {Array.from({ length }, (_, i) => {
            const dt = month.slice(0, 8) + String(i + 1).padStart(2, "0"),
              ps = facility.events.filter((p) => p.date === dt);
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
              >
                {i + 1}
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
                <p>
                  {facility.name} · {statusText(p, day())}
                </p>
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
            <p>На эту дату обязательств в графике нет.</p>
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
        <p className="cv-note">
          Отсутствие отметки об оплате не означает просрочку. Источник:{" "}
          {facility.source}.
        </p>
      </div>
    </Modal>
  );
}
function MetricInfo({
  metric: m,
  onClose,
}: {
  metric: Metric;
  onClose: () => void;
}) {
  return (
    <Modal title={m.name} onClose={onClose}>
      <div className="cv-metric-info">
        <h3>
          {m.value === null
            ? "Недостаточно данных"
            : m.value.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) +
              m.unit}
        </h3>
        <p>{m.meaning}</p>
        <dl>
          <div>
            <dt>Формула</dt>
            <dd>{m.formula}</dd>
          </div>
          <div>
            <dt>Исходные данные</dt>
            <dd>{m.inputs}</dd>
          </div>
          <div>
            <dt>Источник</dt>
            <dd>{m.source}</dd>
          </div>
          <div>
            <dt>Период</dt>
            <dd>{m.period}</dd>
          </div>
        </dl>
        <p>{m.reason}</p>
      </div>
    </Modal>
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
            firstDate: addDays(today, 10),
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
    firstDate: "Ближайшая договорная дата",
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
            for (const k of ["amount", "balance", "rate", "term"])
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
              ? "Укажите актуальный остаток и все ожидаемые поступления и обязательные расходы до конца горизонта. Кредитные платежи из графика добавятся автоматически — не дублируйте их в плане."
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
                ) : (
                  <input
                    required
                    maxLength={180}
                    type={
                      /Date|through|start|end/.test(k)
                        ? "date"
                        : ["amount", "balance", "rate", "term"].includes(k)
                          ? "number"
                          : "text"
                    }
                    step={k === "term" ? 1 : "any"}
                    min={
                      k === "amount" && kind === "coverage"
                        ? undefined
                        : ["amount", "balance", "rate", "term"].includes(k)
                          ? 0
                          : undefined
                    }
                    value={v}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                )}
              </label>
            ))}
        </div>
        {kind === "facility" && (
          <label>
            <span>График из профиля (необязательно)</span>
            <select
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
            >
              <option value="">Рассчитать по договорным параметрам</option>
              {w.state.documents
                .filter((d) => d.confirmed && d.category === "schedule")
                .map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
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
                <input
                  aria-label={"Сумма операции " + (n + 1)}
                  placeholder="Сумма со знаком"
                  type="number"
                  step="any"
                  value={i.amount}
                  onChange={(e) =>
                    setItems(
                      items.map((v, j) =>
                        j === n ? { ...v, amount: e.target.value } : v,
                      ),
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
        <label className="cv-confirm">
          <input type="checkbox" required />
          <span>
            {kind === "plan"
              ? "Подтверждаю остаток и полноту плана за указанный период; кредитные платежи не продублированы."
              : "Проверил сведения и подтверждаю их как пользовательские данные, не как банковскую проверку."}
          </span>
        </label>
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
            {busy ? "Сохраняем…" : "Подтвердить и сохранить"}
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
}: {
  preview?: AppState;
  onDiscuss: () => void;
}) {
  const w = useWorkspace(),
    s = preview || w.state,
    v = useMemo(() => cabinetSnapshot(s), [s]),
    c = v.facility,
    p = v.next;
  const [calendar, setCalendar] = useState(false),
    [info, setInfo] = useState<Metric | null>(null),
    [editor, setEditor] = useState<EditorKind | null>(null);
  return (
    <div className="cabinet-v2">
      <div className="cv-heading">
        <div>
          <small>ВАШЕ ФИНАНСОВОЕ ПРОСТРАНСТВО</small>
          <h1>Кредитный кабинет</h1>
        </div>
        <span>{date(v.today)}</span>
      </div>
      {preview && (
        <div className="cv-training-label">
          Учебный пример · синтетические данные исчезнут после обучения
        </div>
      )}
      <div className="cv-overview">
        <section className="cv-card cv-facility" data-tour="summary">
          <div className="cv-card-head">
            <h2>{c?.name || "Ваше финансирование"}</h2>
            {c && (
              <span className="cv-chip">
                {c.quality === "synthetic"
                  ? "Синтетический пример"
                  : c.quality === "document"
                    ? "График подтверждён"
                    : "Внесено вручную"}
              </span>
            )}
          </div>
          <small>
            {c?.kind === "line" || c?.kind === "overdraft"
              ? "Использованная задолженность"
              : "Остаток основного долга"}
          </small>
          <div className="cv-hero-number">
            {c
              ? value(c.balance)
              : s.cabinet?.noCreditConfirmedAt
                ? "0 ₽"
                : "—"}
          </div>
          {c ? (
            <>
              <div className="cv-loan-facts">
                <span>
                  {c.kind === "loan" ? "Первоначальная сумма" : "Лимит"}
                  <b>{value(c.kind === "loan" ? c.amount : c.limit)}</b>
                </span>
                <span>
                  {c.kind === "loan"
                    ? "Погашено основного долга"
                    : "Доступные средства"}
                  <b>
                    {value(
                      c.kind === "loan"
                        ? c.amount - c.balance
                        : c.limit === undefined
                          ? null
                          : c.limit - c.balance,
                    )}
                  </b>
                </span>
              </div>
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
                <span>{c.rate}% годовых</span>
                <span>
                  {c.term} мес.{" "}
                  {c.quality === "synthetic" ? "общий срок" : "осталось"}
                </span>
                <span>До {date(c.events.at(-1)?.date || c.asOf)}</span>
              </div>
              <details>
                <summary>Подробнее о договоре</summary>
                <p>
                  {c.source}. Остаток на {date(c.asOf)}.{" "}
                  {c.quality === "manual"
                    ? "Плановый график рассчитан по указанным параметрам; индивидуальные условия, комиссии и переносы дат не учтены."
                    : "Исполнение отмечается только по подтверждённым данным."}
                </p>
              </details>
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
                {!s.cabinet?.noCreditConfirmedAt && (
                  <button
                    className="text-button"
                    disabled={!!preview}
                    onClick={() => void w.act("/cabinet/no-credit", {})}
                  >
                    Нет действующих кредитов
                  </button>
                )}
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
            <CalendarDays size={19} />
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
          <button
            className="cv-calendar-button"
            disabled={!c?.events.length}
            onClick={() => setCalendar(true)}
          >
            <CalendarDays size={16} />
            Календарь платежей
            <ArrowRight size={14} />
          </button>
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
            <h2>Как меняется задолженность</h2>
            <p>Остаток основного долга по графику</p>
          </div>
          {c && <span className="cv-chip">{c.events.length} платежей</span>}
        </div>
        <DebtChart facility={c} />
      </section>
      <section className="cv-card cv-financial" data-tour="forecast">
        <div className="cv-card-head">
          <div>
            <h2>Готовность к платежу</h2>
            <p>Денежный поток и прогноз · разные источники, разные периоды</p>
          </div>
          <button
            className="cv-icon"
            aria-label="Источники денежных показателей"
            onClick={() =>
              setInfo({
                id: "cash",
                name: "Денежный поток и прогноз",
                value: null,
                unit: "",
                assessment: "",
                tone: "neutral",
                meaning:
                  "Поступления минус все списания — чистый денежный поток, не бухгалтерская прибыль и не CFADS.",
                formula:
                  "Поступления − списания; прогноз: начальный остаток + плановые поступления − расходы − платежи",
                source: v.cash.source + "; план: " + v.forecast.source,
                period: v.cash.start + " — " + v.cash.end,
                inputs: `Остаток по выписке ${value(v.cash.balance)} на ${v.cash.asOf || "неизвестную дату"}.`,
                reason: v.forecast.reason,
              })
            }
          >
            <Info size={17} />
          </button>
        </div>
        <div className="cv-cash-forecast">
          <div className="cv-cash">
            <small>Чистый поток за 30 дней</small>
            <strong>{value(v.cash.net)}</strong>
            <span>
              {date(v.cash.start)} — {date(v.cash.end)}
              {v.cash.partial ? " · неполный период" : ""}
            </span>
            <details>
              <summary>Остаток, поступления и списания</summary>
              <dl>
                <div>
                  <dt>
                    Остаток на{" "}
                    {v.cash.asOf ? date(v.cash.asOf) : "дату выписки"}
                  </dt>
                  <dd>{value(v.cash.balance)}</dd>
                </div>
                <div>
                  <dt>Поступления</dt>
                  <dd>{value(v.cash.inflow)}</dd>
                </div>
                <div>
                  <dt>Списания</dt>
                  <dd>{value(v.cash.outflow)}</dd>
                </div>
              </dl>
              <p className="cv-note">
                {v.cash.source}. Только подтверждённые строки выписки. Период
                может быть неполным.
              </p>
            </details>
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
                : v.forecast.deficit! > 0
                  ? "Есть риск нехватки средств"
                  : "Средств предварительно достаточно"}
            </span>
            <p>{v.forecast.reason}</p>
            {v.forecast.available && (
              <p className="cv-note">
                План до {date(v.forecast.through)} · {v.forecast.source}.
                Прогноз по подтверждённым пользователем предположениям.
              </p>
            )}
            {v.forecast.available && (
              <div className="cv-forecast-more">
                <span>
                  Минимум за 30 дней<b>{value(v.forecast.minimum)}</b>
                </span>
                <span>
                  Возможный дефицит<b>{value(v.forecast.deficit)}</b>
                </span>
                <span>
                  Дата минимума<b>{date(v.forecast.minimumDate!)}</b>
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="cv-finance-actions">
          <button
            className="text-button"
            disabled={!!preview}
            onClick={() => setEditor("plan")}
          >
            <Pencil size={14} />
            Уточнить план движения денег
          </button>
          <button className="text-button" onClick={() => w.go("/profile")}>
            <FileText size={14} />
            Документы бизнеса
          </button>
          <button
            className="cv-discuss"
            data-tour="discuss"
            disabled={!!preview}
            onClick={onDiscuss}
          >
            <MessageSquare size={16} />
            Обсудить с агентом
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="cv-metrics" data-tour="metrics">
          {v.metrics.map((m) => (
            <div key={m.id} className={"cv-metric " + m.tone}>
              <div>
                <small>{m.name}</small>
                <button
                  aria-label={"О показателе: " + m.name}
                  onClick={() => setInfo(m)}
                >
                  <Info size={14} />
                </button>
              </div>
              <b>
                {m.value === null
                  ? "—"
                  : m.value.toLocaleString("ru-RU", {
                      maximumFractionDigits: 2,
                    }) + m.unit}
              </b>
              <span>{m.assessment}</span>
            </div>
          ))}
        </div>
        <button
          className="text-button cv-coverage-link"
          disabled={!!preview}
          onClick={() => setEditor("coverage")}
        >
          Данные и методика CFADS
          <ArrowRight size={13} />
        </button>
      </section>
      <section className="cv-recommendations" data-tour="recommendations">
        <div className="cv-card-head">
          <h2>На что обратить внимание</h2>
          <small>Проверено при открытии · {date(v.today)}</small>
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
                  r.href === "profile" ? () => w.go("/profile") : onDiscuss
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
      {calendar && c && (
        <PaymentCalendar facility={c} onClose={() => setCalendar(false)} />
      )}
      {info && <MetricInfo metric={info} onClose={() => setInfo(null)} />}
      {editor && (
        <CabinetEditor kind={editor} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
