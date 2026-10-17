import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Activity,
  MessageSquare,
  Info,
  ChevronDown,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, Badge, LineChart, CalculationView, Field } from "./ui";
import { money, date, api } from "./api";
import type { AppState } from "../shared/types";
import { EfficiencyPanel } from "./Efficiency";
export function Cabinet({ preview }: { preview?: AppState }) {
  const w = useWorkspace(),
    s = preview || w.state,
    c = s.credit;
  const [prediction, setPrediction] = useState<any>(null),
    [forecastError, setForecastError] = useState(""),
    [stress, setStress] = useState(false),
    [editing, setEditing] = useState(false),
    [figures, setFigures] = useState({ balance: 0, incoming: 0, expenses: 0 });
  const next = c?.calculation.schedule[c.paid];
  useEffect(() => {
    if (!c || !next || preview) return;
    let current = true;
    setPrediction(null);
    setForecastError("");
    api("/credit/forecast", { stress })
      .then((result) => {
        if (!current) return;
        setPrediction(result);
        if (result.available && result.after < 0) void w.refresh();
      })
      .catch((e) => {
        if (current) setForecastError(e.message);
      });
    return () => {
      current = false;
    };
  }, [
    c?.id,
    next?.date,
    stress,
    preview,
    s.financials.balance,
    s.financials.incoming,
    s.financials.expenses,
  ]);
  const f =
    preview && c && next
      ? {
          available: true,
          after:
            Number(s.financials.balance) +
            Number(s.financials.incoming) * (stress ? 0.7 : 1) -
            Number(s.financials.expenses) -
            next.payment,
          source: s.financials.forecastSource,
          date: next.date,
        }
      : prediction;
  const progress = c
    ? Math.round((1 - c.balance / c.calculation.amount) * 100)
    : 0;
  return (
    <div className="credit-content credit-dashboard">
      <section className="panel credit-summary" data-tour="summary">
        <div className="panel-title">
          <h2>Кредиты бизнеса</h2>
          {!preview && (
            <Badge>{c ? "1 активный кредит" : "Активных кредитов нет"}</Badge>
          )}
        </div>
        {c?.demo && !preview && (
          <p className="fine-print">
            Сохранённый синтетический договор · {c.source}
          </p>
        )}
        <div className="credit-summary-grid">
          <div>
            <small>Общая сумма кредитов</small>
            <strong>{money(c?.calculation.amount ?? 0)}</strong>
          </div>
          <div>
            <small>Остаток основного долга</small>
            <strong>{money(c?.balance ?? 0)}</strong>
          </div>
          <div>
            <small>Уже погашено</small>
            <b>{money(c ? c.calculation.amount - c.balance : 0)}</b>
          </div>
          <div>
            <small>Прогресс погашения</small>
            <b>{progress}%</b>
          </div>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Прогресс погашения"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i style={{ width: progress + "%" }} />
        </div>
        {!c ? (
          <div className="no-credit-note">
            <span>
              Кредитов пока нет. Можно начать с оценки финансирования.
            </span>
            <button className="text-button" onClick={() => w.go("/financing")}>
              Подобрать финансирование <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div className="credit-params">
            <span>
              Срок <b>{c.calculation.term} мес.</b>
            </span>
            <span>
              Ставка по модели <b>{c.calculation.rate}%</b>
            </span>
            <span>
              Платежей учтено{" "}
              <b>
                {c.paid} из {c.calculation.term}
              </b>
            </span>
          </div>
        )}
      </section>
      <section className="panel next-payment" data-tour="payment">
        <div className="panel-title">
          <h2>Ближайший платёж</h2>
          <CalendarDays size={20} />
        </div>
        <div className="payment-value">
          <strong>{money(next?.payment ?? 0)}</strong>
          <Badge>
            {next ? date(next.date) : "Нет запланированных платежей"}
          </Badge>
        </div>
        {next && (
          <div className="payment-breakdown">
            <span style={{ flex: next.principal, background: "#ef3124" }} />
            <span style={{ flex: next.interest, background: "#f9c7c2" }} />
          </div>
        )}
        <div className="payment-legend">
          <span>
            <i className="red-dot" /> Основной долг{" "}
            <b>{money(next?.principal ?? 0)}</b>
          </span>
          <span>
            <i className="pink-dot" /> Проценты{" "}
            <b>{money(next?.interest ?? 0)}</b>
          </span>
        </div>
      </section>
      <section className="panel payment-schedule">
        <div className="panel-title">
          <h2>График платежей</h2>
          <span className="muted">
            {c ? c.calculation.term + " месяцев" : "—"}
          </span>
        </div>
        {c ? (
          <>
            <LineChart
              height={125}
              values={[
                c.calculation.amount,
                ...c.calculation.schedule.map((p) => p.balance),
              ]}
              labels={["Начало срока", "Середина", "Погашение"]}
            />
            <details className="credit-details">
              <summary>
                Условия и полный график <ChevronDown size={16} />
              </summary>
              <CalculationView c={c.calculation} open />
            </details>
          </>
        ) : (
          <div className="schedule-empty">
            <CalendarDays size={24} />
            <p>График появится, когда будет добавлен кредит</p>
            <small>Платежи и даты пока не определены</small>
          </div>
        )}
      </section>
      <section className="panel forecast-card" data-tour="forecast">
        <div className="panel-title">
          <h2>Денежный прогноз к платежу</h2>
          <Activity size={20} />
        </div>
        {c && next && (
          <div className="segmented">
            <button
              className={!stress ? "active" : ""}
              onClick={() => setStress(false)}
            >
              Базовый прогноз
            </button>
            <button
              className={stress ? "active" : ""}
              onClick={() => setStress(true)}
            >
              Поступления −30%
            </button>
          </div>
        )}
        {forecastError ? (
          <div className="alert error" role="alert">
            {forecastError}
          </div>
        ) : c && next && !preview && !f ? (
          <p role="status">Рассчитываем прогноз…</p>
        ) : f?.available ? (
          <>
            <small className="muted">Прогнозный остаток после выплаты</small>
            <div
              className={"forecast-number " + (f.after < 0 ? "negative" : "")}
            >
              {money(f.after)}
            </div>
            <LineChart
              height={115}
              description="Прогноз остатка по заданным предположениям"
              values={[
                Number(s.financials.balance),
                Number(s.financials.balance) +
                  Number(s.financials.incoming) * (stress ? 0.7 : 1),
                f.after,
              ]}
              labels={["Исходный остаток", "Поступления", "После выплаты"]}
              color={f.after < 0 ? "#ef3124" : "#12865f"}
            />
            <p className="fine-print">
              {f.source}. На {date(f.date)}. Прогноз по предположениям, не
              остаток банковского счёта.
            </p>
          </>
        ) : (
          <div className="forecast-empty">
            <span className="icon-tile">
              <Info size={22} />
            </span>
            <div>
              <h3>Недостаточно данных для прогноза</h3>
              <p>
                {!c
                  ? "Нужны график кредита и подтверждённые денежные показатели."
                  : "Добавьте выписку или уточните ожидаемые поступления и расходы."}
              </p>
              <button className="text-button" onClick={() => w.go("/profile")}>
                <Upload size={16} /> Добавить документы
              </button>
            </div>
          </div>
        )}
        {c && !preview && (
          <>
            <button
              className="text-button"
              onClick={() => {
                setFigures({
                  balance: Number(s.financials.balance ?? 0),
                  incoming: Number(s.financials.incoming ?? 0),
                  expenses: Number(s.financials.expenses ?? 0),
                });
                setEditing(!editing);
              }}
            >
              Уточнить предположения <ArrowRight size={15} />
            </button>
            {editing && (
              <form
                className="forecast-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await w.act("/forecast-assumptions", figures);
                  setEditing(false);
                }}
              >
                {Object.entries(figures).map(([k, v]) => (
                  <Field
                    key={k}
                    label={
                      k === "balance"
                        ? "Исходный остаток"
                        : k === "incoming"
                          ? "Будущие поступления"
                          : "Обязательные расходы"
                    }
                  >
                    <input
                      type="number"
                      min={0}
                      max={1e9}
                      required
                      value={v}
                      onChange={(e) =>
                        setFigures({ ...figures, [k]: Number(e.target.value) })
                      }
                    />
                  </Field>
                ))}
                <Button>Подтвердить предположения</Button>
              </form>
            )}
          </>
        )}
        {f?.available && (
          <div
            className={"forecast-conclusion " + (f.after < 0 ? "warning" : "")}
          >
            <AlertTriangle size={18} />
            <p>
              {f.after < 0
                ? "Возможен дефицит. Проверьте сроки поступлений и обязательные расходы."
                : "Сравните базовый и стрессовый прогноз: предположения не меняют условия кредита."}
            </p>
            {!preview && (
              <button
                className="text-button"
                onClick={() => {
                  w.setDraft(
                    "Объясни денежный прогноз по сохранённому кредиту и его ограничения.",
                  );
                  w.go("/chat");
                }}
              >
                <MessageSquare size={16} /> Обсудить
              </button>
            )}
          </div>
        )}
      </section>
      <EfficiencyPanel
        state={s}
        onOpen={preview ? undefined : () => w.go("/efficiency")}
      />
    </div>
  );
}
