import { z } from "zod";
import { addDays, day, daysBetween, validDate } from "../shared/cabinet";
import { fundingBusinessData } from "../shared/financing-business";
import {
  fundingCatalog,
  fundingPurposes,
  financialLabels,
  type FundingAssessment,
  type FundingCheck,
  type FundingProduct,
  type FundingRequest,
} from "../shared/financing";
import type { AppState, Calculation, Selection } from "../shared/types";

const optionalMoney = z
  .number()
  .finite()
  .min(0)
  .max(1e12)
  .nullable()
  .optional();
export const fundingInput = z
  .object({
    purpose: z.enum(fundingPurposes),
    amount: z.number().finite().min(10000).max(1e12),
    term: z.number().int().min(1).max(120).nullable(),
    needed: z.enum(["urgent", "month", "later", "date"]),
    neededDate: z.string().optional(),
    usage: z.enum(["once", "parts", "regular"]),
    description: z.string().max(1000),
    repayFrom: z.string().trim().min(1).max(300),
    productId: z
      .enum(["working", "investment", "contract", "overdraft", "refinance"])
      .optional(),
    cycleDays: z.number().int().min(1).max(90),
    details: z.record(
      z.string(),
      z.union([
        z.string().max(400),
        z.number().finite().min(-1e12).max(1e12),
        z.boolean(),
        z.null(),
      ]),
    ),
    financials: z
      .object({
        incoming: optionalMoney,
        expenses: optionalMoney,
        existing: optionalMoney,
        available: optionalMoney,
        flow: z.number().finite().min(-1e12).max(1e12).nullable().optional(),
        changes: z.number().finite().min(-1e12).max(1e12).nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.needed === "date" &&
      (!p.neededDate ||
        !validDate(p.neededDate) ||
        p.neededDate < day() ||
        p.neededDate > addDays(day(), 3650))
    )
      ctx.addIssue({
        code: "custom",
        path: ["neededDate"],
        message: "Выберите дату не раньше сегодня и не дальше 10 лет.",
      });
    for (const [key, v] of Object.entries(p.details)) {
      if (
        /Date$/.test(key) &&
        v &&
        (typeof v !== "string" ||
          !validDate(v) ||
          v < addDays(day(), -365) ||
          v > addDays(day(), 3650))
      )
        ctx.addIssue({
          code: "custom",
          path: ["details", key],
          message: "Введите существующую дату в формате ДД.ММ.ГГГГ.",
        });
      if (typeof v === "number" && key !== "effect" && v < 0)
        ctx.addIssue({
          code: "custom",
          path: ["details", key],
          message: "Значение не может быть отрицательным.",
        });
      if (
        v !== null &&
        key === "currentRate" &&
        (typeof v !== "number" || v > 100)
      )
        ctx.addIssue({
          code: "custom",
          path: ["details", key],
          message: "Ставка — от 0 до 100%.",
        });
      if (
        v !== null &&
        key === "currentMonths" &&
        (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 120)
      )
        ctx.addIssue({
          code: "custom",
          path: ["details", key],
          message: "Срок — целое число от 1 до 120 месяцев.",
        });
    }
  });
const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
function monthDate(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z"),
    target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  target.setUTCDate(
    Math.min(
      d.getUTCDate(),
      new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return day(target);
}
/** Separate repayment mechanics; all catalogue rates are explicit scenarios. */
export function instrumentSchedule(
  p: FundingProduct,
  amount: number,
  term: number,
  usage: FundingRequest["usage"],
  cycleDays: number,
  start: string,
): Calculation["schedule"] {
  if (p.kind === "overdraft") {
    const interest = round((((amount * p.rate) / 100) * cycleDays) / 365);
    return [
      {
        month: 1,
        date: addDays(start, cycleDays),
        payment: round(amount + interest),
        principal: amount,
        interest,
        balance: 0,
      },
    ];
  }
  const i = p.rate / 1200,
    factor = i ? (1 - (1 + i) ** -term) / i : term,
    payment = amount / factor;
  let balance = p.kind === "line" ? 0 : amount;
  const result: Calculation["schedule"] = [];
  for (let k = 1; k <= term; k++) {
    if (p.kind === "line")
      balance =
        usage === "parts"
          ? round((amount * Math.min(k, Math.min(3, term))) / Math.min(3, term))
          : amount;
    const interest = round(balance * i),
      principal =
        p.kind === "line"
          ? k === term
            ? balance
            : 0
          : k === term
            ? balance
            : round(Math.min(balance, payment - interest));
    const next = round(Math.max(0, balance - principal));
    result.push({
      month: k,
      date: monthDate(start, k),
      payment: round(principal + interest),
      principal,
      interest,
      balance: next,
    });
    if (p.kind === "loan") balance = next;
  }
  return result;
}
function checksFor(
  p: FundingProduct,
  request: FundingRequest,
  s: AppState,
  term: number,
  today: string,
): FundingCheck[] {
  const profile = s.profile,
    age =
      profile.registeredAt && validDate(profile.registeredAt)
        ? daysBetween(profile.registeredAt, today) / 30.4375
        : /менее|до года/i.test(profile.ageBand)
          ? 0
          : /1[–—-]3|1–2|от 1/i.test(profile.ageBand)
            ? 12
            : /3[–—-]5/i.test(profile.ageBand)
              ? 36
              : /более|старше|5/i.test(profile.ageBand)
                ? 60
                : null;
  const item = (
    label: string,
    state: FundingCheck["state"],
    detail: string,
  ) => ({ label, state, detail });
  return [
    item(
      "Цель финансирования",
      p.purposes.includes(request.purpose)
        ? "met"
        : request.purpose === "Другая цель"
          ? "unknown"
          : "unmet",
      p.purposes.includes(request.purpose)
        ? "Назначение инструмента соответствует задаче."
        : "Назначение в каталоге не совпадает с целью запроса.",
    ),
    item(
      "Форма и регистрация бизнеса",
      profile.registered && p.forms.includes(profile.form) ? "met" : "unmet",
      profile.registered
        ? `Каталог: ${p.forms.join(" / ")}. В профиле: ${profile.form}.`
        : "Бизнес не зарегистрирован; кредитные условия требуют отдельного рассмотрения.",
    ),
    item(
      "Возраст бизнеса",
      age === null ? "unknown" : age >= p.minAge ? "met" : "unmet",
      `В сценарном каталоге — от ${p.minAge} месяцев. Источник: профиль бизнеса.`,
    ),
    item(
      "Сумма",
      request.amount >= p.min && request.amount <= p.max ? "met" : "unmet",
      `Каталог: ${p.min.toLocaleString("ru-RU")}–${p.max.toLocaleString("ru-RU")} ₽.`,
    ),
    item(
      "Срок",
      term <= p.term ? "met" : "unmet",
      `До ${p.term} месяцев по сценарию каталога.`,
    ),
    item(
      "Обеспечение и индивидуальные условия",
      "unknown",
      "Требования к обеспечению, комиссии и персональная ставка в каталоге не подтверждены; уточняются банком.",
    ),
  ];
}
export interface FundingEngine {
  evaluate(
    request: FundingRequest,
    state: AppState,
    today?: string,
  ): Omit<Selection, "id" | "version" | "createdAt">;
}
export const transparentFundingEngine: FundingEngine = {
  evaluate(request, s, today = day()) {
    const baseData = fundingBusinessData(s, request.financials, today),
      baseValue = (key: string) => {
        const d = baseData.find((d) => d.key === key)!;
        return d.stale || d.conflict ? null : d.value;
      };
    const gap =
      validDate(String(request.details.expenseDate || "")) &&
      validDate(String(request.details.receiptsDate || ""))
        ? daysBetween(
            String(request.details.expenseDate),
            String(request.details.receiptsDate),
          )
        : null;
    const cycleDays =
      request.purpose === "Кассовый разрыв" &&
      request.details.cycleManual !== true &&
      gap !== null &&
      gap > 0 &&
      gap <= 90
        ? gap
        : request.cycleDays;
    const termFor = (p: FundingProduct) =>
      request.term ??
      (p.kind === "overdraft"
        ? 12
        : Math.min(
            p.term,
            request.purpose === "Оборудование"
              ? 48
              : request.purpose === "Кассовый разрыв"
                ? 3
                : 24,
          ));
    const ranked = fundingCatalog
        .map((p) => ({
          p,
          checks: checksFor(p, request, s, termFor(p), today),
        }))
        .map((x) => ({
          ...x,
          score:
            (x.p.purposes.includes(request.purpose) ? 100 : 0) -
            x.checks.filter((c) => c.state === "unmet").length * 20 +
            (request.usage !== "once" && x.p.kind === "line" ? 15 : 0) +
            (() => {
              const flow = baseValue("flow"),
                debt = baseValue("existing");
              if (flow === null || debt === null) return 0;
              const peak = Math.max(
                  ...instrumentSchedule(
                    x.p,
                    request.amount,
                    termFor(x.p),
                    request.usage,
                    cycleDays,
                    today,
                  ).map((r) => r.payment),
                ),
                period = x.p.kind === "overdraft" ? cycleDays / 30 : 1;
              return (flow / 1.25 - debt) * period >= peak ? 15 : -15;
            })(),
        }))
        .sort((a, b) => b.score - a.score),
      recommended = ranked[0].p,
      p = fundingCatalog.find((p) => p.id === request.productId) || recommended,
      term = termFor(p),
      checks = checksFor(p, request, s, term, today),
      data = baseData,
      datum = (k: string) => data.find((d) => d.key === k)!,
      usable = (k: string) => {
        const d = datum(k);
        return d.stale || d.conflict ? null : d.value;
      };
    let flow = usable("flow"),
      existing = usable("existing");
    const assumptions = [
      "Ставка — сценарное допущение из каталога demo-1, не персональное предложение банка.",
      "Комиссии, страхование и налоги на сделку не включены. Условия и график банка могут отличаться.",
      "Базовый сценарий сохраняет наблюдаемый или введённый месячный операционный поток. История не гарантирует будущие поступления; ожидаемые изменения не повышают посильную сумму автоматически.",
      "Модель DSCR ≥ 1,25; стресс — снижение операционного потока на 30%. Это не банковский скоринг.",
    ];
    if (usable("available") === null)
      assumptions.push(
        "Свободный остаток денег не указан. Посильность по потоку не подтверждает наличие денег на конкретную дату и запас ликвидности.",
      );
    const risks = checks
      .filter((c) => c.state === "unmet")
      .map((c) => c.label + ": " + c.detail);
    if (request.purpose === "Кассовый разрыв") {
      if (gap !== null && gap <= 0)
        risks.push(
          "По указанным датам поступление не позже расхода. Уточните, действительно ли образуется кассовый разрыв.",
        );
      if (gap !== null && gap > 90) {
        checks.push({
          label: "Продолжительность разрыва",
          state: p.kind === "overdraft" ? "unmet" : "unknown",
          detail:
            "Разрыв длиннее 90 дней; сценарий короткого овердрафта может его не покрывать.",
        });
        risks.push(
          "Срок между расходом и поступлением превышает моделируемый цикл овердрафта.",
        );
      }
      if (request.details.confidence === "uncertain")
        risks.push(
          "Ожидаемое поступление не подтверждено; нельзя полагаться на него как на гарантированный источник возврата.",
        );
    }
    if (request.purpose === "Рефинансирование") {
      const old = num(request.details.currentPayment),
        balance = num(request.details.currentBalance);
      if (
        old !== null &&
        existing !== null &&
        existing < old &&
        request.details.debtIncluded !== false
      ) {
        datum("existing").conflict = true;
        existing = null;
      }
      if (
        existing !== null &&
        old !== null &&
        balance !== null &&
        request.details.debtIncluded === true &&
        request.amount >= balance &&
        existing >= old
      ) {
        existing = round(existing - old);
        assumptions.push(
          "Из действующих платежей исключён платёж полностью рефинансируемого долга: пользователь подтвердил, что он включён в общую нагрузку.",
        );
      } else
        risks.push(
          "Старый платёж не исключён из нагрузки: подтвердите остаток долга, платёж и его включение в действующие обязательства. Частичное рефинансирование требует отдельного графика.",
        );
    }
    if (p.kind === "line")
      assumptions.push(
        request.usage === "parts"
          ? "Линия: три равных транша в начале первых трёх месяцев (либо по числу месяцев, если срок короче); проценты на выбранный остаток, основной долг — в конце срока."
          : "Линия: полная выборка лимита в начале; ежемесячные проценты, весь основной долг — в конце. Поступления для его возврата не предполагаются автоматически.",
      );
    if (p.kind === "overdraft")
      assumptions.push(
        `Овердрафт: один цикл ${cycleDays} дней, полная выборка; возврат долга и процентов одним платежом. Срок лимита ${term} мес. не равен сроку одной задолженности. Продление долга не предполагается.${request.details.cycleManual !== true && gap !== null && gap > 0 && gap <= 90 ? " Длительность определена по датам расхода и поступления." : ""}`,
      );
    if (request.term === null)
      assumptions.push(
        `Для сравнения выбран срок ${term} мес.; его можно изменить.`,
      );
    if (datum("changes").value !== null)
      assumptions.push(
        "Ожидаемые изменения показаны как прогноз пользователя и не повышают базовую посильную сумму автоматически.",
      );
    const start =
      request.needed === "date" && request.neededDate
        ? request.neededDate
        : request.purpose === "Кассовый разрыв" &&
            validDate(String(request.details.expenseDate || "")) &&
            String(request.details.expenseDate) >= today
          ? String(request.details.expenseDate)
          : today;
    assumptions.push(
      `Сценарная дата предоставления: ${start}; первая выплата рассчитана от неё.`,
    );
    const schedule = instrumentSchedule(
        p,
        request.amount,
        term,
        request.usage,
        cycleDays,
        start,
      ),
      peak = Math.max(...schedule.map((r) => r.payment)),
      final = schedule.at(-1)!.payment,
      budget =
        flow !== null && existing !== null
          ? Math.max(0, flow / 1.25 - existing)
          : null,
      factor = p.kind === "overdraft" ? cycleDays / 30 : 1,
      unitPeak = peak / request.amount,
      capacity =
        budget === null
          ? null
          : round(Math.max(0, (budget * factor) / unitPeak)),
      denominator = existing !== null ? peak + existing * factor : null,
      dscr =
        flow !== null && denominator !== null && denominator > 0
          ? round((flow * factor) / denominator)
          : null,
      stressDscr =
        flow !== null && denominator !== null && denominator > 0
          ? round((flow * 0.7 * factor) / denominator)
          : null;
    const missing = data
      .filter(
        (d) =>
          ["flow", "existing"].includes(d.key) &&
          (d.value === null || d.stale || d.conflict),
      )
      .map(
        (d) =>
          `${financialLabels[d.key]}: ${d.conflict ? "конфликт источников" : d.stale ? "нужны актуальные данные" : "нет данных"}`,
      );
    data
      .filter((d) => d.conflict)
      .forEach((d) =>
        risks.push(`Уточните противоречие: ${financialLabels[d.key]}.`),
      );
    data
      .filter((d) => d.stale)
      .forEach((d) =>
        risks.push(
          `Устаревший или будущий период: ${financialLabels[d.key]}; показатель не используется для оценки посильности.`,
        ),
      );
    if (p.kind !== "loan")
      risks.push(
        "Проверьте источник возврата всей суммы в конце цикла: низкие промежуточные проценты не означают низкую общую нагрузку.",
      );
    if (stressDscr !== null && stressDscr < 1)
      risks.push(
        "При снижении потока на 30% его недостаточно для пикового платежа и действующих обязательств.",
      );
    const effect = num(request.details.effect),
      cost = num(request.details.purchaseCost),
      paybackMonths =
        effect !== null && effect > 0 && cost !== null
          ? round(cost / effect)
          : null;
    let decision: FundingAssessment["decision"] =
      capacity === null
        ? "insufficient"
        : request.amount > capacity
          ? "reduce"
          : "consider";
    if (usable("available") !== null && usable("available")! >= request.amount)
      decision = "unnecessary";
    else if (
      request.purpose === "Оборудование" &&
      effect !== null &&
      effect <= 0
    )
      decision = "rethink";
    const title = {
      consider: "Нагрузка выглядит посильной в этом сценарии",
      reduce: "Сначала уменьшите кредитную нагрузку",
      unnecessary: "Возможно, заимствование не требуется",
      rethink: "Сначала проверьте экономику покупки",
      insufficient: "Инструмент подобран, посильность пока не определена",
    }[decision];
    const total = round(schedule.reduce((n, r) => n + r.payment, 0)),
      interest = round(total - request.amount);
    const calc: Calculation = {
      amount: request.amount,
      term,
      rate: p.rate,
      monthlyPayment: p.kind === "line" ? schedule[0].payment : peak,
      total,
      interest,
      flow,
      existing,
      maxAmount: capacity,
      dscr,
      stressDscr,
      schedule,
      source:
        p.source +
        " · " +
        data.map((d) => `${financialLabels[d.key]}: ${d.source}`).join("; "),
      formula:
        p.kind === "loan"
          ? "A = S × i / (1 − (1 + i)^−n), i = ставка / 1200; при i=0: A=S/n."
          : p.kind === "line"
            ? "Проценты месяца = выбранный остаток × ставка / 1200; основной долг возвращается в конце срока."
            : "Проценты = выбранная сумма × ставка / 100 × дни / 365; платёж = долг + проценты.",
    };
    const reasons = [
      p.purposes.includes(request.purpose)
        ? `Назначение «${p.name.toLowerCase()}» соответствует вашей задаче.`
        : "Выбран вручную: цель требует отдельного согласования.",
      p.kind === "line"
        ? "Транши позволяют разделить получение денег; проценты зависят от выбранного остатка."
        : p.kind === "overdraft"
          ? "Короткий цикл подходит для временного разрыва до поступления денег."
          : "Равные месячные платежи помогают планировать нагрузку.",
      capacity === null
        ? "Неизвестные потоки или обязательства не приняты за ноль; посильная сумма не рассчитана."
        : `Посильная сумма рассчитана по ${p.kind === "loan" ? "ежемесячному" : "пиковому"} платежу, с учётом действующих обязательств.`,
    ];
    const historical = s.documents.find(
        (d) =>
          d.confirmed &&
          d.category === "statement" &&
          d.name === datum("flow").source &&
          d.period === datum("flow").period &&
          Number(d.fields.months) >= 3,
      ),
      fullSchedule = s.documents.some(
        (d) =>
          d.confirmed &&
          d.category === "schedule" &&
          d.currency === "RUB" &&
          [...new Set(schedule.map((r) => r.date.slice(0, 7)))].every((month) =>
            d.records?.some(
              (r) =>
                validDate(String(r.date)) &&
                String(r.date).slice(0, 7) === month &&
                num(r.payment) !== null,
            ),
          ),
      );
    const level: FundingAssessment["level"] =
      capacity === null
        ? "Ориентировочная"
        : historical &&
            fullSchedule &&
            datum("flow").kind === "fact" &&
            usable("available") !== null
          ? "Расширенная"
          : "Предварительно обоснованная";
    const assessment: FundingAssessment = {
      cycleDays: p.kind === "overdraft" ? cycleDays : undefined,
      engine: "transparent-mvp-2",
      recommendedId: recommended.id,
      selectedId: p.id,
      level,
      decision,
      title,
      data,
      checks,
      missing,
      reasons,
      assumptions,
      alternatives: ranked
        .filter(
          (x) => x.p.id !== p.id && x.p.purposes.includes(request.purpose),
        )
        .slice(0, 2)
        .map((x) => ({
          id: x.p.id,
          name: x.p.name,
          reason: x.checks.some((c) => c.state === "unmet")
            ? "Есть несоответствия сценарным условиям — проверьте параметры."
            : x.p.kind === "line"
              ? "Можно сравнить получение частями."
              : "Можно сравнить другую схему возврата.",
        })),
      peakPayment: peak,
      finalPayment: final,
      paymentLabel:
        p.kind === "overdraft"
          ? `Возврат через ${cycleDays} дн.`
          : p.kind === "line"
            ? "Проценты первого месяца"
            : "Платёж в месяц",
      existingAfter: existing,
      flow,
      capacity,
      dscr,
      stressDscr,
      paybackMonths,
      formula: [
        calc.formula,
        "Бюджет нового платежа = max(0, поток / 1,25 − действующие платежи).",
        "Посильная сумма = бюджет / платёж на 1 ₽ долга. Для овердрафта бюджет пропорционален длительности цикла / 30.",
        "DSCR = операционный поток / (пиковый платёж + действующие платежи за тот же период). Чистый поток не является бухгалтерской прибылью или подтверждённым CFADS.",
      ],
      catalogVersion: p.version,
    };
    return {
      input: { ...request, term: request.term },
      assessment,
      product: p.name,
      purpose: request.purpose,
      repayFrom: request.repayFrom,
      ownFunds: num(request.details.ownFunds) ?? 0,
      calculation: calc,
      risks,
      alternatives: assessment.alternatives.map((a) => a.name),
      status: checks.some((c) => c.state === "unmet")
        ? "Проверьте соответствие продукта"
        : title,
    };
  },
};
