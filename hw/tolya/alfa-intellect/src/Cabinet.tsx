import { useEffect, useState } from "react";
import {
  ArrowRight,
  WalletCards,
  CalendarDays,
  TrendingUp,
  ShieldCheck,
  FlaskConical,
  Info,
  MessageSquare,
  ChevronDown,
  Activity,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, Badge, LineChart, CalculationView, Field } from "./ui";
import { money, date, api } from "./api";
export function Cabinet() {
  const w = useWorkspace(),
    c = w.state.credit,
    [forecast, setForecast] = useState<any>(null),
    [stress, setStress] = useState(false),
    [editing, setEditing] = useState(false),
    [figures, setFigures] = useState({
      balance: 850000,
      incoming: 1200000,
      expenses: 780000,
    });
  useEffect(() => {
    if (c)
      api("/credit/forecast", { stress })
        .then((result) => {
          setForecast(result);
          if (result.available && result.after < 0) void w.refresh();
        })
        .catch((e) => w.error(e.message));
  }, [
    c?.id,
    stress,
    w.state.financials.balance,
    w.state.financials.incoming,
    w.state.financials.expenses,
  ]);
  async function discuss() {
    w.setDraft(
      c
        ? "Объясни нагрузку по моему демонстрационному кредиту и прогноз к платежу."
        : "Помоги понять, с чего начать подбор финансирования.",
    );
    w.go("/chat");
  }
  if (!c)
    return (
      <section className="credit-empty panel">
        <div className="panel-title">
          <h2>Кредитный кабинет</h2>
          <Badge>Нет активных кредитов</Badge>
        </div>
        <div className="empty-illustration">
          <span className="empty-orbit" />
          <div className="empty-wallet">
            <WalletCards size={43} />
          </div>
          <span className="empty-check">
            <CheckMark />
          </span>
        </div>
        <h2>
          Место для ваших
          <br />
          следующих возможностей
        </h2>
        <p>
          У вас пока нет действующих кредитов.
          <br />
          Подберите финансирование под задачу бизнеса —<br />с понятным платежом
          и объяснением условий.
        </p>
        <Button onClick={() => w.go("/financing")}>
          Подобрать финансирование <ArrowRight size={18} />
        </Button>
        <div className="empty-benefits">
          <span>
            <CalendarDays size={18} /> График платежей
          </span>
          <span>
            <TrendingUp size={18} /> Прогноз к выплате
          </span>
          <span>
            <ShieldCheck size={18} /> Объяснение нагрузки
          </span>
        </div>
        <div className="demo-load">
          <span className="icon-tile red">
            <FlaskConical size={18} />
          </span>
          <div>
            <b>Хотите увидеть кабинет в работе?</b>
            <small>
              Загрузите синтетический кредит. Он будет отмечен как демо.
            </small>
          </div>
          <button
            className="text-button"
            onClick={() => void w.act("/credit/demo", {})}
          >
            Открыть демо <ArrowRight size={16} />
          </button>
        </div>
      </section>
    );
  const calc = c.calculation,
    next = calc.schedule[c.paid],
    progress = (1 - c.balance / calc.amount) * 100;
  return (
    <div className="credit-content">
      <section className="panel my-credit">
        <div className="panel-title">
          <h2>Мой кредит</h2>
          <Badge tone="red">Демо · синтетический договор</Badge>
        </div>
        <small className="muted">Кредит на развитие бизнеса · {c.source}</small>
        <div className="credit-amount">
          <div>
            <small>Остаток основного долга</small>
            <strong>{money(c.balance)}</strong>
          </div>
          <span className="icon-tile red">
            <WalletCards size={26} />
          </span>
        </div>
        <div className="progress-label">
          <span>Погашено {Math.round(progress)}%</span>
          <b>
            {c.paid} из {calc.term} платежей
          </b>
        </div>
        <div className="progress-track">
          <i style={{ width: progress + "%" }} />
        </div>
        <div className="credit-params">
          <div>
            <small>Первоначальная сумма</small>
            <b>{money(calc.amount)}</b>
          </div>
          <div>
            <small>Ставка по модели</small>
            <b>{calc.rate}% годовых</b>
          </div>
          <div>
            <small>Срок</small>
            <b>{calc.term} месяцев</b>
          </div>
        </div>
        <details className="credit-details">
          <summary>
            Подробнее о кредите <ChevronDown size={16} />
          </summary>
          <p className="fine-print">
            Первые {c.paid} платежей учтены только в синтетическом сценарии. Это
            не подтверждение реальных операций.
          </p>
          <CalculationView c={calc} />
        </details>
      </section>
      <section className="panel next-payment">
        <div className="panel-title">
          <h2>Ближайший платёж</h2>
          <CalendarDays size={20} />
        </div>
        <div className="payment-value">
          <strong>{money(next.payment)}</strong>
          <Badge>{date(next.date)}</Badge>
        </div>
        <div className="payment-breakdown">
          <span style={{ flex: next.principal, background: "#ef3124" }} />
          <span style={{ flex: next.interest, background: "#f9c7c2" }} />
        </div>
        <div className="payment-legend">
          <span>
            <i className="red-dot" /> Основной долг{" "}
            <b>{money(next.principal)}</b>
          </span>
          <span>
            <i className="pink-dot" /> Проценты <b>{money(next.interest)}</b>
          </span>
        </div>
      </section>
      <section className="panel forecast-card">
        <div className="panel-title">
          <h2>Хватит ли денег к платежу?</h2>
          <Activity size={21} />
        </div>
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
        {forecast?.available ? (
          <>
            <small className="muted">Прогнозный остаток после выплаты</small>
            <div
              className={
                "forecast-number " + (forecast.after < 0 ? "negative" : "")
              }
            >
              {money(forecast.after)}
            </div>
            <LineChart
              color={forecast.after < 0 ? "#ef3124" : "#13976c"}
              values={[
                Number(w.state.financials.balance),
                Number(w.state.financials.balance) +
                  Number(w.state.financials.incoming) * (stress ? 0.7 : 1),
                forecast.after,
              ]}
              labels={["Исходный остаток", "Поступления", "После выплаты"]}
              height={115}
            />
            <p className="fine-print">
              Источник: {forecast.source}. На {forecast.date}. Предполагаемые
              расходы: {money(Number(w.state.financials.expenses))}. Это
              сценарий, не гарантированный остаток счёта.
            </p>
          </>
        ) : (
          <div className="alert">
            <Info size={18} />
            <span>
              Недостаточно данных для прогноза. Добавьте выписку или подтвердите
              ожидаемые поступления и расходы.
            </span>
          </div>
        )}
        <button
          className="text-button"
          onClick={() => {
            setFigures({
              balance: Number(w.state.financials.balance || 0),
              incoming: Number(w.state.financials.incoming || 0),
              expenses: Number(w.state.financials.expenses || 0),
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
                  min="0"
                  max="1000000000"
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
      </section>
      <section className="panel agent-insight">
        <span className="icon-tile green">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h3>Оставьте бизнесу финансовый запас</h3>
          <p>
            {forecast?.after < 0
              ? "По указанному сценарию возможен дефицит. Проверьте сроки поступлений и обязательные расходы."
              : "Сравните базовый и стрессовый прогноз. Изменение поступлений влияет на остаток, но не меняет условия кредита."}
          </p>
          <button className="text-button" onClick={() => void discuss()}>
            Обсудить с агентом <MessageSquare size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
function CheckMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20">
      <path
        d="m4 10 4 4 8-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
