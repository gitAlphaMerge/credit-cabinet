import type { AppState } from "./types";
import { day, daysBetween, validDate } from "./cabinet";
import {
  financialLabels,
  type FinancialKey,
  type FundingDatum,
  type FundingRequest,
} from "./financing";

const number = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n : null;
export function fundingBusinessData(
  s: AppState,
  overrides: FundingRequest["financials"] = {},
  today = day(),
): FundingDatum[] {
  const keys = Object.keys(financialLabels) as FinancialKey[];
  const data = Object.fromEntries(
    keys.map((key) => [
      key,
      {
        key,
        value: null,
        source: "Нет данных",
        period: "Не указан",
        asOf: today,
        currency: "RUB",
        kind: "manual",
        confirmed: false,
      },
    ]),
  ) as Record<FinancialKey, FundingDatum>;
  const set = (
    key: FinancialKey,
    value: unknown,
    source: string,
    period = "Месяц",
    kind: FundingDatum["kind"] = "fact",
    asOf = today,
  ) => {
    const n = number(value);
    if (n !== null)
      data[key] = {
        key,
        value: n,
        source,
        period,
        asOf,
        currency: "RUB",
        kind,
        confirmed: true,
        stale:
          !validDate(asOf) || daysBetween(asOf, today) > 90 || asOf > today,
      };
  };
  const statement = s.documents
    .filter((d) => d.confirmed && d.category === "statement")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (statement && statement.currency === "RUB") {
    const range = statement.period.match(
        /(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/,
      ),
      asOf = range?.[2] || statement.createdAt.slice(0, 10),
      months = Number(statement.fields.months),
      rows = statement.records?.filter(
        (r) => r.kind === "operating" && number(r.amount) !== null,
      );
    if (
      range &&
      validDate(range[1]) &&
      validDate(range[2]) &&
      range[1] <= range[2]
    ) {
      set(
        "flow",
        statement.fields.freeFlow,
        statement.name,
        statement.period,
        "fact",
        asOf,
      );
      if (rows?.length && months > 0) {
        set(
          "incoming",
          Math.round(
            rows.reduce((n, r) => n + Math.max(0, Number(r.amount)), 0) /
              months,
          ),
          statement.name,
          statement.period,
          "fact",
          asOf,
        );
        set(
          "expenses",
          Math.round(
            rows.reduce((n, r) => n + Math.max(0, -Number(r.amount)), 0) /
              months,
          ),
          statement.name,
          statement.period,
          "fact",
          asOf,
        );
      }
    }
  }
  // Only an explicit debt statement is zero. No debt rows is not proof of no debt.
  if (s.cabinet?.noCreditConfirmedAt)
    set(
      "existing",
      0,
      "Подтверждено отсутствие кредитов в кабинете",
      "Текущие обязательства",
      "manual",
      s.cabinet.noCreditConfirmedAt.slice(0, 10),
    );
  else if (/^Нет(?: кредитов)?$/i.test(s.profile.debt))
    set(
      "existing",
      0,
      "Онбординг: указано отсутствие кредитов",
      "На момент регистрации",
      "manual",
      s.profile.onboardedAt?.slice(0, 10) || "Не указан",
    );
  const facility =
    s.cabinet?.facility?.quality === "synthetic"
      ? undefined
      : s.cabinet?.facility;
  const schedule = s.documents.find(
    (d) => d.confirmed && d.category === "schedule" && d.currency === "RUB",
  );
  const events =
    facility?.quality !== "synthetic" && facility
      ? facility.events.filter((e) => e.status !== "paid" && e.date >= today)
      : undefined;
  const sums = new Map<string, number>();
  for (const e of events || [])
    sums.set(
      e.date.slice(0, 7),
      (sums.get(e.date.slice(0, 7)) || 0) + e.principal + e.interest + e.fees,
    );
  if (!events?.length)
    for (const e of schedule?.records || [])
      if (
        validDate(String(e.date)) &&
        String(e.date) >= today &&
        number(e.payment) !== null
      )
        sums.set(
          String(e.date).slice(0, 7),
          (sums.get(String(e.date).slice(0, 7)) || 0) + Number(e.payment),
        );
  if (sums.size) {
    const observed = Math.max(...sums.values());
    set(
      "existing",
      observed,
      facility?.source || schedule!.name,
      "Максимум в месяце по внесённому графику",
      facility ? "manual" : "fact",
      facility?.asOf || schedule!.createdAt.slice(0, 10),
    );
    if (/^Нет(?: кредитов)?$/i.test(s.profile.debt))
      data.existing.conflict = true;
  }
  for (const key of ["existing", "incoming", "expenses"] as FinancialKey[]) {
    const source = String(s.financials[key + "Source"] || "");
    if (/Подтверждено пользователем/.test(source))
      set(
        key,
        s.financials[key],
        source,
        "Месяц",
        "manual",
        source.match(/\d{4}-\d{2}-\d{2}/)?.[0] || today,
      );
  }
  if (
    s.financials.freeFlowSource &&
    /Подтверждено пользователем/.test(String(s.financials.freeFlowSource))
  )
    set(
      "flow",
      s.financials.freeFlow,
      String(s.financials.freeFlowSource),
      "Месяц",
      "manual",
    );
  for (const key of keys)
    if (Object.hasOwn(overrides, key)) {
      data[key] = {
        key,
        value: overrides[key] ?? null,
        source: "Введено пользователем для этого подбора",
        period: key === "available" ? "Свободно на сегодня" : "Месяц",
        asOf: today,
        currency: "RUB",
        kind: key === "changes" ? "forecast" : "manual",
        confirmed: true,
      };
    }
  // A manual gross cash flow requires BOTH sides, including an explicit zero.
  if (
    Object.hasOwn(overrides, "incoming") ||
    Object.hasOwn(overrides, "expenses") ||
    data.flow.value === null
  ) {
    const a = data.incoming,
      b = data.expenses;
    data.flow = {
      ...data.flow,
      value: a.value !== null && b.value !== null ? a.value - b.value : null,
      source: "Поступления минус обязательные расходы",
      period: a.period === b.period ? a.period : "Периоды требуют сверки",
      kind: a.kind === "manual" || b.kind === "manual" ? "manual" : "fact",
      confirmed: a.confirmed && b.confirmed,
      stale: a.stale || b.stale,
      conflict: a.period !== b.period && a.kind === "fact" && b.kind === "fact",
    };
  }
  return keys.map((k) => data[k]);
}
