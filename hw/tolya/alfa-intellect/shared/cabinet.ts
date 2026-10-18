import type { AppState, Notice } from "./types";

export type PaymentEvent = {
  settledAt?: string;
  id: string;
  date: string;
  principal: number;
  interest: number;
  fees: number;
  balance: number;
  status: "planned" | "paid" | "overdue";
};
export type Facility = {
  contractTerm?: number;
  issuedAt?: string;
  id: string;
  kind: "loan" | "line" | "overdraft";
  name: string;
  amount: number;
  balance: number;
  rate: number;
  term: number;
  startDate: string;
  asOf: string;
  source: string;
  quality: "manual" | "document" | "synthetic";
  limit?: number;
  events: PaymentEvent[];
};
export type CashPlan = {
  balance: number;
  balanceDate: string;
  through: string;
  source: string;
  confirmedAt: string;
  items: { id: string; date: string; amount: number; label: string }[];
};
export type Coverage = {
  previousValue?: number;
  amount: number;
  start: string;
  end: string;
  source: string;
  methodology: string;
  confirmedAt: string;
};
export type CabinetData = {
  facility?: Facility;
  noCreditConfirmedAt?: string;
  plan?: CashPlan;
  coverage?: Coverage;
};
export type Metric = {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  assessment: string;
  tone: "neutral" | "good" | "warning" | "danger";
  meaning: string;
  formula: string;
  source: string;
  period: string;
  inputs: string;
  reason: string;
};
export const day = (value?: Date) =>
  value
    ? value.toISOString().slice(0, 10)
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(
        new Date(),
      );
export const addDays = (date: string, n: number) =>
  day(new Date(Date.parse(date + "T00:00:00Z") + n * 86400000));
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    day(new Date(s)) === s
  );
}
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const sum = (values: number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
const rub = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";

export function facilityOf(s: AppState): Facility | null {
  if (s.cabinet?.facility) return s.cabinet.facility;
  const c = s.credit;
  if (!c) return null;
  // Legacy paid count is explicit synthetic fixture state, not inferred from dates.
  return {
    id: c.id,
    kind: "loan",
    name: "Сохранённый тестовый кредит",
    amount: c.calculation.amount,
    balance: c.balance,
    rate: c.calculation.rate,
    term: c.calculation.term,
    startDate: c.calculation.schedule[0]?.date || day(),
    asOf: day(),
    source: c.source,
    quality: "synthetic",
    events: c.calculation.schedule.map((p, i) => ({
      id: c.id + ":" + i,
      date: p.date,
      principal: p.principal,
      interest: p.interest,
      fees: 0,
      balance: p.balance,
      status: i < c.paid ? "paid" : "planned",
    })),
  };
}
export function cabinetSnapshot(s: AppState, today = day()) {
  const facility = facilityOf(s),
    events = facility?.events || [],
    end = addDays(today, 29),
    start = addDays(today, -29);
  const next =
    events
      .filter((p) => p.status !== "paid" && p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  const unresolved = events.filter(
    (p) => p.status !== "paid" && p.date < today,
  );
  const statement = s.documents
    .filter((d) => d.confirmed && d.category === "statement")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const rows =
    statement?.records?.filter(
      (r) =>
        validDate(String(r.date)) &&
        String(r.date) >= start &&
        String(r.date) <= today &&
        number(r.amount) !== null,
    ) || [];
  const range = statement?.period.match(
    /(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/,
  );
  const fullPeriod = !!range && range[1] <= start && range[2] >= today;
  const inflow =
    rows.length || fullPeriod
      ? sum(rows.map((r) => Math.max(0, Number(r.amount))))
      : null;
  const outflow =
    rows.length || fullPeriod
      ? sum(rows.map((r) => Math.max(0, -Number(r.amount))))
      : null;
  const last = statement?.records
    ?.filter(
      (r) =>
        validDate(String(r.date)) &&
        number(r.balance) !== null &&
        String(r.date) <= today,
    )
    .at(-1);
  const cash = {
    start,
    end: today,
    inflow,
    outflow,
    net: inflow !== null && outflow !== null ? sum([inflow, -outflow]) : null,
    balance: last ? Number(last.balance) : null,
    asOf: last ? String(last.date) : null,
    source: statement?.name || "Банковская выписка не подтверждена",
    fullPeriod,
    partial: !!rows.length && !fullPeriod,
  };
  const plan = s.cabinet?.plan;
  const planReady =
    !!plan &&
    !!facility &&
    plan.balanceDate <= today &&
    daysBetween(plan.balanceDate, today) <= 7 &&
    plan.through >= end &&
    unresolved.length === 0;
  let running = plan?.balance || 0,
    minimum = Infinity,
    minimumDate = today,
    afterNext: number | null = null;
  const timeline: { date: string; balance: number }[] = [];
  if (planReady && plan)
    for (let d = plan.balanceDate; d <= end; d = addDays(d, 1)) {
      const ins = plan.items
          .filter((i) => i.date === d && i.amount > 0)
          .map((i) => i.amount),
        outs = plan.items
          .filter((i) => i.date === d && i.amount < 0)
          .map((i) => i.amount);
      const payments = events.filter((p) =>
        p.status === "paid" ? p.settledAt === d : p.date === d,
      );
      // Conservative intraday order: expenses and debt before incoming funds.
      running = sum([
        running,
        ...outs,
        ...payments.map((p) => -p.principal - p.interest - p.fees),
      ]);
      if (d >= today && running < minimum) {
        minimum = running;
        minimumDate = d;
      }
      if (next?.date === d) afterNext = running;
      running = sum([running, ...ins]);
      if (d >= today) timeline.push({ date: d, balance: running });
    }
  const forecast = {
    available: planReady,
    afterNext,
    minimum: planReady ? minimum : null,
    minimumDate: planReady ? minimumDate : null,
    deficit: planReady ? Math.max(0, -minimum) : null,
    through: end,
    source: plan?.source || "Нет подтверждённого датированного плана",
    reason: !facility
      ? "Добавьте график действующего кредита."
      : unresolved.length
        ? "Уточните исполнение обязательств с прошедшими датами: отсутствие сведений не означает просрочку."
        : !plan
          ? "Нужны датированный остаток и подтверждённый план поступлений и расходов."
          : !planReady
            ? "Обновите остаток (не старше 7 дней) и план на весь горизонт 30 дней."
            : "Расходы и кредитные платежи учитываются до поступлений того же дня. Фактический порядок операций может отличаться." +
              (next && next.date > end
                ? " Ближайший платёж вне 30-дневного горизонта и отдельно не оценён."
                : ""),
    timeline,
  };
  const coverage = s.cabinet?.coverage;
  const denominator = coverage
    ? sum(
        events
          .filter((p) => p.date >= coverage.start && p.date <= coverage.end)
          .map((p) => p.principal + p.interest),
      )
    : 0;
  const dscr =
    coverage &&
    facility &&
    denominator > 0 &&
    coverage.start >= facility.startDate &&
    coverage.end <= (facility.events.at(-1)?.date || "")
      ? coverage.amount / denominator
      : null;
  const recentPayments = sum(
    events
      .filter((p) => p.date >= start && p.date <= today)
      .map((p) => p.principal + p.interest + p.fees),
  );
  const share =
    facility &&
    start >= facility.startDate &&
    fullPeriod &&
    inflow !== null &&
    inflow > 0
      ? (recentPayments / inflow) * 100
      : null;
  const pnls = s.documents
    .filter((d) => d.confirmed && d.category === "pnl")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pnl = pnls[0],
    f = pnl?.fields;
  const comparable =
    f &&
    validDate(String(f.periodStart)) &&
    validDate(String(f.periodEnd)) &&
    validDate(String(f.previousStart)) &&
    validDate(String(f.previousEnd)) &&
    String(f.periodEnd) <= today &&
    String(f.periodStart) <= String(f.periodEnd) &&
    String(f.previousStart) <= String(f.previousEnd) &&
    String(f.previousEnd) < String(f.periodStart) &&
    Math.abs(
      daysBetween(String(f.periodStart), String(f.periodEnd)) -
        daysBetween(String(f.previousStart), String(f.previousEnd)),
    ) <= 1;
  const revenue = number(f?.revenue),
    previous = number(f?.previousRevenue),
    salesProfit = number(f?.salesProfit);
  const growth =
    comparable && revenue !== null && previous !== null && previous > 0
      ? ((revenue - previous) / previous) * 100
      : null;
  const margin =
    f &&
    validDate(String(f.periodStart)) &&
    validDate(String(f.periodEnd)) &&
    String(f.periodEnd) <= today &&
    String(f.periodStart) <= String(f.periodEnd) &&
    revenue !== null &&
    revenue > 0 &&
    salesProfit !== null
      ? (salesProfit / revenue) * 100
      : null;
  const metrics: Metric[] = [
    {
      id: "dscr",
      name: "Покрытие долга · DSCR",
      value: dscr,
      unit: "×",
      assessment:
        dscr === null
          ? "Недостаточно данных"
          : dscr >= 1.3
            ? "Есть запас покрытия"
            : dscr >= 1
              ? "Небольшой запас"
              : "Поток ниже обязательств",
      tone:
        dscr === null
          ? "neutral"
          : dscr >= 1.3
            ? "good"
            : dscr >= 1
              ? "warning"
              : "danger",
      meaning:
        "Во сколько раз доступные для обслуживания долга деньги покрывают основной долг и проценты.",
      formula: "CFADS / (основной долг + проценты за тот же период)",
      source: coverage?.source || "Подтверждённый CFADS не задан",
      period: coverage ? coverage.start + " — " + coverage.end : "Не задан",
      inputs: coverage
        ? `CFADS ${rub(coverage.amount)}; обязательства ${rub(denominator)}. Методика: ${coverage.methodology}`
        : "Чистый поток выписки не подставляется вместо CFADS.",
      reason:
        "Ориентиры MVP: ≥ 1,3; 1,0–1,3; < 1,0. Это не норматив конкретного банка. Учитываются только обязательства, внесённые в кабинет.",
    },
    {
      id: "share",
      name: "Платежи / поступления",
      value: share,
      unit: "%",
      assessment:
        share === null ? "Недостаточно данных" : "Без универсального порога",
      tone: "neutral",
      meaning:
        "Какая доля поступлений сопоставимого периода приходится на кредитные платежи.",
      formula: "Кредитные платежи / поступления × 100%",
      source: cash.source,
      period: start + " — " + today,
      inputs: `Платежи по графику: ${rub(recentPayments)}; поступления: ${inflow === null ? "неизвестны" : rub(inflow)}.`,
      reason:
        "Нужна полная выписка за период. Не учитывает обязательные операционные расходы; не доказывает платёжеспособность.",
    },
    {
      id: "growth",
      name: "Динамика выручки",
      value: growth,
      unit: "%",
      assessment:
        growth === null
          ? "Недостаточно данных"
          : growth >= 0
            ? "Рост к прошлому периоду"
            : "Снижение к прошлому периоду",
      tone: "neutral",
      meaning: "Изменение бухгалтерской выручки между сопоставимыми периодами.",
      formula: "(Выручка − предыдущая выручка) / предыдущая выручка × 100%",
      source: pnl?.name || "Нет подтверждённого ОФР",
      period: pnl?.period || "Не задан",
      inputs: f
        ? `Выручка ${revenue === null ? "неизвестна" : rub(revenue)}; предыдущая ${previous === null ? "неизвестна" : rub(previous)}.`
        : "Нужны две сопоставимые величины выручки.",
      reason:
        previous === 0
          ? "При нулевой базе процентный прирост не рассчитывается."
          : "Поступления по счёту не заменяют бухгалтерскую выручку. Нужны границы двух сопоставимых периодов.",
    },
    {
      id: "margin",
      name: "Рентабельность продаж",
      value: margin,
      unit: "%",
      assessment:
        margin === null ? "Недостаточно данных" : "Оценивать с учётом отрасли",
      tone: "neutral",
      meaning: "Доля прибыли от продаж в бухгалтерской выручке.",
      formula: "Прибыль от продаж / выручка × 100%",
      source: pnl?.name || "Нет подтверждённого ОФР",
      period: pnl?.period || "Не задан",
      inputs: `Прибыль от продаж: ${salesProfit === null ? "неизвестна" : rub(salesProfit)}; выручка ${revenue === null ? "неизвестна" : rub(revenue)}.`,
      reason:
        "Чистая прибыль не подменяет прибыль от продаж. Универсальная зелёная норма не назначается.",
    },
  ];
  const signals: {
    key: string;
    title: string;
    body: string;
    type: NonNullable<Notice["type"]>;
    href: string;
    date: string;
  }[] = [];
  if (next) {
    const n = daysBetween(today, next.date);
    if (n <= 10)
      signals.push({
        key: `due:${facility!.id}:${next.id}:${n <= 0 ? 0 : n <= 3 ? 3 : 10}`,
        title: n === 0 ? "Сегодня дата платежа" : `До платежа ${n} дн.`,
        body: `${next.date} · ${rub(next.principal + next.interest + next.fees)}. Проверьте доступные средства.`,
        type: "payment",
        href: "cabinet-v2",
        date: today,
      });
  }
  if (forecast.available && forecast.deficit! > 0)
    signals.push({
      key: `deficit:${facility!.id}:${forecast.minimumDate}`,
      title: "Возможна нехватка средств",
      body: `По подтверждённому плану дефицит ${rub(forecast.deficit!)} на ${forecast.minimumDate}.`,
      type: "risk",
      href: "cabinet-v2",
      date: today,
    });
  if (cash.net !== null && cash.net < 0)
    signals.push({
      key: `negative:${statement!.id}:${today}`,
      title: "Отрицательный денежный поток",
      body: `За ${start} — ${today} списания превысили поступления на ${rub(-cash.net)}${cash.partial ? " (доступная часть периода)" : ""}.`,
      type: "risk",
      href: "cabinet-v2",
      date: today,
    });
  if (dscr !== null && dscr < 1.3)
    signals.push({
      key: `coverage:${facility!.id}:${coverage!.end}`,
      title:
        dscr < 1 ? "Поток ниже долговых платежей" : "Небольшой запас покрытия",
      body: `DSCR ${dscr.toFixed(2)} за ${coverage!.start} — ${coverage!.end}. Ориентир MVP, не норматив банка.`,
      type: "risk",
      href: "cabinet-v2",
      date: today,
    });
  if (
    dscr !== null &&
    dscr >= 1.3 &&
    coverage?.previousValue !== undefined &&
    dscr < coverage.previousValue - 1e-10
  )
    signals.push({
      key: `coverage-change:${facility!.id}:${coverage.confirmedAt}`,
      title: "Снизилось покрытие обязательств",
      body: `DSCR изменился с ${coverage.previousValue.toFixed(2)} до ${dscr.toFixed(2)} за тот же период ${coverage.start} — ${coverage.end}. Это динамика расчёта, не банковский норматив.`,
      type: "risk",
      href: "cabinet-v2",
      date: today,
    });
  if (statement && (!last || daysBetween(String(last.date), today) > 30))
    signals.push({
      key: `stale:${statement.id}`,
      title: "Обновите банковскую выписку",
      body: "В документе нет актуального остатка. Для прогноза нужны свежие данные и план движения денег.",
      type: "data",
      href: "profile",
      date: today,
    });
  return {
    today,
    facility,
    next,
    unresolved,
    cash,
    forecast,
    metrics,
    signals: signals.slice(0, 4),
    progress:
      facility && facility.kind === "loan"
        ? Math.max(
            0,
            Math.min(100, (1 - facility.balance / facility.amount) * 100),
          )
        : null,
  };
}
export type CabinetSnapshot = ReturnType<typeof cabinetSnapshot>;
