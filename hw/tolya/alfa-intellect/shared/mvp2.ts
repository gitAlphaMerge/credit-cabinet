import { z } from "zod";
import { day, validDate } from "./cabinet";
import { innError } from "./inn";
import {
  fundingTerms,
  overdraftCycles,
  type FundingProduct,
} from "./financing";
export const productIds = [
  "WORKING",
  "INVEST",
  "RCL",
  "NCL",
  "OVERDRAFT",
  "REFI",
] as const;
export type ProductId = (typeof productIds)[number];
export type Product = {
  id: ProductId;
  name: string;
  rate: number;
  min: number;
  max: number;
  minTerm: number;
  maxTerm: number;
  kind: "loan" | "line" | "overdraft";
  description: string;
  repayment: string;
};
/** Single catalog. Server validates all submitted terms against this source. Synthetic, not bank tariffs. */
export const products: Product[] = [
  {
    id: "WORKING",
    name: "Оборотный кредит",
    rate: 23.5,
    min: 300000,
    max: 5000000,
    minTerm: 6,
    maxTerm: 24,
    kind: "loan",
    description: "Разовая сумма на текущую деятельность и закупки",
    repayment: "Ежемесячные платежи по графику",
  },
  {
    id: "INVEST",
    name: "Инвестиционный кредит",
    rate: 22,
    min: 500000,
    max: 7000000,
    minTerm: 12,
    maxTerm: 60,
    kind: "loan",
    description: "Оборудование, транспорт и расширение бизнеса",
    repayment: "Ежемесячные платежи по графику",
  },
  {
    id: "RCL",
    name: "Возобновляемая кредитная линия",
    rate: 24,
    min: 500000,
    max: 5000000,
    minTerm: 6,
    maxTerm: 24,
    kind: "line",
    description: "Регулярная выборка и возврат в пределах лимита",
    repayment: "Возвращённый основной долг восстанавливает доступный лимит",
  },
  {
    id: "NCL",
    name: "Невозобновляемая кредитная линия",
    rate: 23,
    min: 500000,
    max: 7000000,
    minTerm: 12,
    maxTerm: 36,
    kind: "line",
    description: "Финансирование проекта отдельными траншами",
    repayment: "Лимит выдачи не восстанавливается после возврата",
  },
  {
    id: "OVERDRAFT",
    name: "Овердрафт",
    rate: 26,
    min: 300000,
    max: 2000000,
    minTerm: 1,
    maxTerm: 12,
    kind: "overdraft",
    description: "Короткий кассовый разрыв до поступления выручки",
    repayment:
      "Каждая задолженность погашается в выбранный срок; проценты на фактический долг",
  },
  {
    id: "REFI",
    name: "Рефинансирование",
    rate: 22.5,
    min: 300000,
    max: 5000000,
    minTerm: 12,
    maxTerm: 48,
    kind: "loan",
    description: "Целевое финансирование для замены действующего кредита",
    repayment:
      "Ежемесячные платежи; внешний кредит не считается автоматически погашенным",
  },
];
export function productTerms(product: Product): number[] {
  return product.kind === "overdraft"
    ? [12]
    : fundingTerms({
        kind: product.kind,
        minTerm: product.minTerm,
        term: product.maxTerm,
      } as FundingProduct);
}
export function nearestProductTerm(
  product: Product,
  requested: number,
): number {
  return productTerms(product).reduce((best, term) =>
    Math.abs(term - requested) < Math.abs(best - requested) ? term : best,
  );
}
export function defaultContractDetails(
  company: Company,
  accounts: Pick<Questionnaire["accounts"][number], "bank" | "number">[],
  profile?: { name?: string; registryRecord?: Record<string, unknown> },
) {
  const ip = company.form === "ИП";
  const registry = profile?.registryRecord;
  const director =
    company.director ||
    (typeof registry?.director === "string" ? registry.director : "");
  const ipName = company.name.match(/^ИП\s+([^«"\d]+)$/u)?.[1]?.trim() || "";
  const signatory = ip
    ? ipName.split(/\s+/u).length === 3
      ? ipName
      : company.demo
        ? "Синтетический предприниматель"
        : ""
    : director || (company.demo ? "Синтетический директор" : "");
  const ogrnip =
    company.ogrnip ||
    (typeof registry?.ogrnip === "string" ? registry.ogrnip : "");
  const alfaAccount = accounts.find(
    (account) =>
      /альфа|alfa/i.test(account.bank) && /^\d{20}$/.test(account.number),
  );
  const generatedAccount =
    company.demo && /^\d{10}(\d{2})?$/.test(company.inn)
      ? `${ip ? "40802810" : "40702810"}${(BigInt(company.inn) % 1000000000000n).toString().padStart(12, "0")}`
      : "";
  return {
    signatory,
    authority: ip
      ? `записи в ЕГРИП${ogrnip ? `, ОГРНИП ${ogrnip}` : ""}`
      : "Устава",
    receivingAccount: alfaAccount?.number || generatedAccount,
    receivingBank: alfaAccount || generatedAccount ? "АО «Альфа-Банк»" : "",
  };
}
export const industries = [
  "Торговля и маркетплейсы",
  "Услуги",
  "Строительство",
  "Производство",
  "Общепит",
  "Логистика и транспорт",
  "IT",
  "Сельское хозяйство",
  "Другое",
];
export const ages = [
  "Менее 6 месяцев",
  "6–12 месяцев",
  "1–3 года",
  "Более 3 лет",
  "Зарегистрирован, ещё не работает",
];
export const purposes = [
  "Закупки",
  "Текущие расходы",
  "Кассовый разрыв",
  "Оборудование/транспорт",
  "Ремонт/новая точка",
  "Контракт",
  "Рефинансирование",
  "Не определился",
];
export const ranges = [
  "До 300 тыс. ₽",
  "300–500 тыс. ₽",
  "500 тыс.–1 млн ₽",
  "1–3 млн ₽",
  "3–5 млн ₽",
  "5–7 млн ₽",
  "Более 7 млн ₽",
  "Не знаю",
];
export const uses = [
  "Всё сразу",
  "Частями",
  "Многократная выборка и возврат",
  "До ближайшего поступления",
  "Не знаю",
];
export const repayments = [
  "Регулярная выручка",
  "Продажи/работы",
  "Оплата контракта",
  "Новый проект",
  "Другое",
  "Не знаю",
];
export const neededOptions = ["Срочно", "До месяца", "Позже", "Выбрать дату"];
export const catalogAmount = { min: 300000, max: 7000000, step: 50000 };
export function amountBand(amount: number | null): string {
  if (amount === null) return "Не знаю";
  return ranges[
    amount < 300000
      ? 0
      : amount < 500000
        ? 1
        : amount < 1000000
          ? 2
          : amount <= 3000000
            ? 3
            : amount <= 5000000
              ? 4
              : amount <= 7000000
                ? 5
                : 6
  ];
}
const text = z.string().trim().max(500);
const rub = z.number().finite().min(0).max(1e12);
const tri = z.enum(["yes", "no", "unknown"]);
export const onboardingSchema = z
  .object({
    industry: z.enum(industries as [string, ...string[]]),
    age: z.enum(ages as [string, ...string[]]),
    purpose: z.enum(purposes as [string, ...string[]]),
    amountRange: z.enum(ranges as [string, ...string[]]),
    amount: z
      .number()
      .int()
      .min(catalogAmount.min)
      .max(catalogAmount.max)
      .nullable()
      .optional(),
    term: z.number().int().min(1).max(60),
    usage: z.enum(uses as [string, ...string[]]),
    repayment: z.enum(repayments as [string, ...string[]]),
  })
  .strict();
export type OnboardingAnswers = z.infer<typeof onboardingSchema>;
export const questionnaireInputSchema = z
  .object({
    inn: z
      .string()
      .regex(/^(\d{10}|\d{12})$/)
      .or(z.literal(""))
      .refine((value) => !value || !innError(value), {
        message: "Проверьте ИНН: контрольные цифры не совпадают.",
      }),
    companyConfirmed: z.boolean(),
    registryError: text,
    authorized: z.boolean(),
    consents: z
      .object({
        registry: z.boolean(),
        financial: z.boolean(),
        bki: z.boolean(),
      })
      .strict(),
    actualIndustry: text,
    accounts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            bank: text,
            number: z.string().max(40),
            documentId: z.string().max(100),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    complete: tri,
    outsideType: text,
    outsideIn: rub.nullable(),
    outsideOut: rub.nullable(),
    loans: tri,
    debt: rub.nullable(),
    monthlyDebt: rub.nullable(),
    balloon: rub.nullable(),
    balloonExpected: tri.default("unknown"),
    balloonPeriod: text,
    leasing: z.enum(["yes", "no", "unknown"]),
    monthlyLeasing: rub.nullable(),
    debtReconciled: z.boolean(),
    seasonality: tri,
    future: z.enum(["none", "income", "expense", "both", "unknown"]),
    futureIn: rub.nullable(),
    futureOut: rub.nullable(),
    futurePeriod: text,
    purpose: z.enum(["", ...purposes]),
    purposeDetails: text.default(""),
    amount: z.number().int().min(0).max(1e12),
    term: z
      .number()
      .int()
      .refine(
        (term) =>
          term === 0 ||
          products.some((product) => productTerms(product).includes(term)),
        {
          message: "Выберите срок из сетки продукта.",
        },
      ),
    neededAt: z.enum(["", ...neededOptions]),
    neededDate: text.default(""),
    productId: z.enum(productIds),
    usage: z.enum(["", ...uses]),
    repayment: z.enum(["", ...repayments]),
    projectCost: rub.nullable(),
    economicEffect: rub.nullable(),
    cycleDays: z.number().int().min(1).max(365).nullable(),
    overdraftRepaymentDays: z
      .union([z.literal(30), z.literal(60), z.literal(90)])
      .default(60),
    tranches: text,
    oldRate: z.number().min(0).max(100).nullable(),
    oldPayment: rub.nullable(),
    oldBalance: rub.nullable(),
    signatory: text,
    authority: text,
    receivingAccount: z.string().max(40),
    receivingBank: text,
    customerContractAmount: z
      .number()
      .finite()
      .min(0)
      .max(99999999999)
      .nullable()
      .default(null),
    customerContractMonths: z
      .number()
      .int()
      .min(1)
      .max(120)
      .nullable()
      .default(null),
    reconciliationReference: z.string().trim().max(160).default(""),
  })
  .strict();
export type Questionnaire = z.infer<typeof questionnaireInputSchema>;
/** Inactive answers are neither required nor financially active, even for direct API calls. */
export function normalizeQuestionnaire<T extends Record<string, any>>(
  value: T,
): T {
  const q: Record<string, any> = { ...value };
  q.neededDate ??= "";
  q.purposeDetails ??= "";
  if (q.loans !== "yes") {
    Object.assign(q, {
      debt: null,
      monthlyDebt: null,
      balloon: null,
      balloonPeriod: "",
      balloonExpected: "no",
    });
  } else {
    if (q.balloonExpected === undefined)
      q.balloonExpected = q.balloon ? "yes" : "unknown";
    if (q.balloonExpected !== "yes")
      Object.assign(q, { balloon: null, balloonPeriod: "" });
  }
  if (q.leasing !== "yes") q.monthlyLeasing = null;
  if (q.complete !== "no")
    Object.assign(q, { outsideType: "", outsideIn: null, outsideOut: null });
  if (!["income", "both"].includes(q.future)) q.futureIn = null;
  if (!["expense", "both"].includes(q.future)) q.futureOut = null;
  if (["none", "unknown"].includes(q.future)) q.futurePeriod = "";
  if (q.productId !== "INVEST")
    Object.assign(q, { projectCost: null, economicEffect: null });
  if (!["RCL", "OVERDRAFT"].includes(q.productId)) q.cycleDays = null;
  if (q.productId !== "NCL") q.tranches = "";
  if (q.productId !== "REFI")
    Object.assign(q, { oldRate: null, oldPayment: null, oldBalance: null });
  if (q.neededAt !== "Выбрать дату") q.neededDate = "";
  if (q.purpose !== "Не определился") q.purposeDetails = "";
  return q as T;
}
export const questionnaireSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? normalizeQuestionnaire(value as Record<string, unknown>)
      : value,
  questionnaireInputSchema,
);
export function questionnaireErrors(
  q: Questionnaire,
  section: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = (key: keyof Questionnaire, label: string) => {
    if (q[key] === null || q[key] === "") errors[key] = label;
  };
  const numeric = (
    key: keyof Questionnaire,
    label: string,
    max = 1e12,
    min = 0,
    integer = false,
  ) => {
    const value = q[key];
    if (value === null || value === undefined || value === "") return;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      errors[key] =
        `${label}: укажите ${integer ? "целое число" : "число"} от ${min.toLocaleString("ru-RU")} до ${max.toLocaleString("ru-RU")}.`;
  };
  if (section === 0) {
    if (innError(q.inn)) errors.inn = innError(q.inn);
    if (!q.companyConfirmed)
      errors.companyConfirmed = "Подтвердите найденную компанию.";
    if (!q.authorized)
      errors.authorized = "Для подачи нужны полномочия представителя.";
    if (Object.values(q.consents).some((v) => !v))
      errors.consents =
        "Подтвердите согласие на обработку данных и дополнительные проверки.";
  }
  if (section === 1) {
    if (q.accounts.some((a) => a.documentId && !a.bank.trim()))
      errors.accounts = "Укажите банк для каждого загруженного счёта.";
    if (q.complete === "no") {
      required("outsideType", "Укажите операции вне CSV.");
      required("outsideIn", "Укажите поступления вне CSV.");
      required("outsideOut", "Укажите расходы вне CSV.");
      numeric("outsideIn", "Поступления вне выписок");
      numeric("outsideOut", "Расходы вне выписок");
    }
  }
  if (section === 2) {
    // Unknown is valid incomplete input; missingFor requests it after submission, not a format error.
    if (q.loans === "yes") {
      required("debt", "Укажите остаток долга.");
      required("monthlyDebt", "Укажите месячный платёж.");
      numeric("debt", "Остаток долга");
      numeric("monthlyDebt", "Ежемесячный платёж");
    }
    if (q.leasing === "yes") {
      required("monthlyLeasing", "Укажите платёж по лизингу.");
      numeric("monthlyLeasing", "Платёж по лизингу");
    }
    if (q.loans === "yes" && q.balloonExpected === "yes") {
      numeric("balloon", "Разовое погашение");
      if (!q.balloon || q.balloon <= 0)
        errors.balloon = "Укажите положительную сумму погашения.";
      if (!validDate(q.balloonPeriod) || q.balloonPeriod < day())
        errors.balloonPeriod =
          "Выберите действительную дату погашения, не ранее сегодняшнего дня.";
    }
  }
  if (section === 3) {
    if (["income", "both"].includes(q.future))
      required("futureIn", "Укажите будущее поступление.");
    if (["expense", "both"].includes(q.future))
      required("futureOut", "Укажите будущий расход.");
    if (!["none", "unknown"].includes(q.future))
      required("futurePeriod", "Укажите период будущих операций.");
    if (["income", "both"].includes(q.future))
      numeric("futureIn", "Будущие поступления");
    if (["expense", "both"].includes(q.future))
      numeric("futureOut", "Будущие расходы");
  }
  if (section === 4) {
    required("purpose", "Уточните назначение средств.");
    required("neededAt", "Укажите, когда нужны средства.");
    if (!purposes.includes(q.purpose))
      errors.purpose = "Выберите назначение финансирования из списка.";
    if (!uses.includes(q.usage))
      errors.usage = "Выберите способ использования средств.";
    if (!repayments.includes(q.repayment))
      errors.repayment = "Выберите источник погашения.";
    if (!neededOptions.includes(q.neededAt))
      errors.neededAt = "Выберите, когда нужны средства.";
    if (
      q.neededAt === "Выбрать дату" &&
      (!validDate(q.neededDate) || q.neededDate < day())
    )
      errors.neededDate =
        "Выберите действительную дату, не ранее сегодняшнего дня.";
    if (q.purpose === "Не определился")
      required("purposeDetails", "Уточните назначение финансирования.");
    if (!Number.isSafeInteger(q.amount) || q.amount <= 0 || q.amount > 1e12)
      errors.amount = "Введите положительную сумму в рублях.";
    if (!Number.isInteger(q.term) || q.term < 1)
      errors.term = "Выберите срок продукта.";
    const product = products.find((p) => p.id === q.productId);
    if (product && (q.amount < product.min || q.amount > product.max))
      errors.amount = `Для этого продукта доступно от ${product.min.toLocaleString("ru-RU")} до ${product.max.toLocaleString("ru-RU")} ₽. Измените сумму или продукт.`;
    if (product && !productTerms(product).includes(q.term))
      errors.term = `Выберите срок: ${productTerms(product).join(", ")} мес.`;
    if (
      q.productId === "OVERDRAFT" &&
      !overdraftCycles.includes(q.overdraftRepaymentDays)
    )
      errors.overdraftRepaymentDays = "Выберите 30, 60 или 90 дней.";
    if (q.productId === "INVEST")
      required("projectCost", "Укажите стоимость проекта.");
    if (q.productId === "INVEST") {
      numeric("projectCost", "Стоимость проекта");
      numeric("economicEffect", "Дополнительный денежный результат");
    }
    if (["RCL", "OVERDRAFT"].includes(q.productId))
      required("cycleDays", "Укажите длительность использования.");
    if (["RCL", "OVERDRAFT"].includes(q.productId))
      numeric(
        "cycleDays",
        "Цикл использования",
        q.productId === "OVERDRAFT" ? 60 : 365,
        1,
        true,
      );
    if (q.productId === "NCL")
      required("tranches", "Укажите суммы и сроки траншей.");
    if (q.productId === "REFI") {
      required("oldBalance", "Укажите остаток старого кредита.");
      required("oldRate", "Укажите ставку старого кредита.");
      required("oldPayment", "Укажите платёж старого кредита.");
      numeric("oldBalance", "Остаток прежнего кредита");
      numeric("oldRate", "Ставка прежнего кредита", 100);
      numeric("oldPayment", "Платёж прежнего кредита");
    }
  }
  return errors;
}
export function recommend(a: OnboardingAnswers): ProductId {
  if (a.purpose === "Рефинансирование") return "REFI";
  if (a.usage === uses[3] || a.purpose === "Кассовый разрыв")
    return "OVERDRAFT";
  if (a.usage === uses[2]) return "RCL";
  if (a.usage === uses[1]) return "NCL";
  if ([purposes[3], purposes[4]].includes(a.purpose)) return "INVEST";
  return "WORKING";
}
export function initialQuestionnaire(a: OnboardingAnswers): Questionnaire {
  return {
    inn: "",
    companyConfirmed: false,
    registryError: "",
    authorized: false,
    consents: { registry: false, financial: false, bki: false },
    actualIndustry: "",
    accounts: [{ id: "account-1", bank: "", number: "", documentId: "" }],
    complete: "unknown",
    outsideType: "",
    outsideIn: null,
    outsideOut: null,
    loans: "unknown",
    debt: null,
    monthlyDebt: null,
    balloon: null,
    balloonExpected: "unknown",
    balloonPeriod: "",
    leasing: "unknown",
    monthlyLeasing: null,
    debtReconciled: false,
    seasonality: "unknown",
    future: "none",
    futureIn: null,
    futureOut: null,
    futurePeriod: "",
    purpose: a.purpose,
    purposeDetails: "",
    amount:
      a.amount !== undefined
        ? (a.amount ?? 0)
        : ([250000, 400000, 750000, 2000000, 4000000, 6000000, 7500000, 0][
            ranges.indexOf(a.amountRange)
          ] ?? 0),
    term: nearestProductTerm(
      products.find((p) => p.id === recommend(a))!,
      a.term,
    ),
    neededAt: "До месяца",
    neededDate: "",
    productId: recommend(a),
    usage: a.usage,
    repayment: a.repayment,
    projectCost: null,
    economicEffect: null,
    cycleDays: null,
    overdraftRepaymentDays: 60,
    tranches: "",
    oldRate: null,
    oldPayment: null,
    oldBalance: null,
    signatory: "",
    authority: "",
    receivingAccount: "",
    receivingBank: "",
    customerContractAmount: null,
    customerContractMonths: null,
    reconciliationReference: "",
  };
}
export function productIssues(
  q: Pick<Questionnaire, "productId" | "amount" | "term">,
): string[] {
  const p = products.find((p) => p.id === q.productId);
  if (!p) return ["Выберите продукт из каталога."];
  return [
    !Number.isSafeInteger(q.amount) || q.amount < p.min || q.amount > p.max
      ? `Сумма продукта: от ${p.min.toLocaleString("ru-RU")} до ${p.max.toLocaleString("ru-RU")} ₽.`
      : "",
    !productTerms(p).includes(q.term)
      ? `Срок продукта: ${productTerms(p).join(", ")} мес.`
      : "",
  ].filter(Boolean);
}
export type MissingField = {
  key: string;
  label: string;
  section: number;
  id?: string;
  title?: string;
  why?: string;
  effect?: string;
  status?: "todo" | "uploaded" | "accepted" | "skipped";
};
export type MissingDataItem = MissingField & {
  id: string;
  title: string;
  why: string;
  effect: string;
  status: "todo" | "uploaded" | "accepted" | "skipped";
};
export const managerRequestedFields: MissingField[] = [
  { key: "actualIndustry", label: "Фактическая деятельность", section: 0 },
  { key: "accounts", label: "CSV по расчётным счетам", section: 1 },
  { key: "debt", label: "Остаток долга", section: 2 },
  { key: "monthlyDebt", label: "Месячный платёж по кредитам", section: 2 },
  { key: "monthlyLeasing", label: "Платёж по лизингу", section: 2 },
  { key: "projectCost", label: "Стоимость проекта", section: 4 },
  {
    key: "customerContractAmount",
    label: "Сумма договора с заказчиком",
    section: 4,
  },
  {
    key: "reconciliationReference",
    label: "Реквизиты акта сверки",
    section: 4,
  },
];
export type Decision =
  | "APPROVED"
  | "MANAGER_REVIEW_REQUIRED"
  | "ADDITIONAL_DATA_REQUIRED"
  | "DECLINED";
export type Lifecycle =
  | "DRAFT"
  | "SUBMITTED"
  | "PROCESSING"
  | "DECIDED"
  | "MEETING_SCHEDULED"
  | "MANAGER_APPROVED"
  | "MANAGER_DECLINED"
  | "CONTRACT_READY"
  | "SIGNED_DEMO"
  | "ACTIVE";
export type Company = {
  inn: string;
  name: string;
  form: string;
  registeredAt?: string;
  okved?: string;
  activity?: string;
  status: string;
  source: string;
  region?: string;
  director?: string;
  ogrnip?: string;
  demo?: boolean;
};
export type Stage = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "waiting-data";
  at?: string;
};
export type Alternative = {
  id: string;
  productId: ProductId;
  amount: number;
  term: number;
  rate: number;
  payment: number;
  reason: string;
};
export type MvpApplication = {
  id: string;
  businessId: string;
  version: number;
  onboarding: OnboardingAnswers;
  recommendedProductId: ProductId;
  questionnaire: Questionnaire;
  company?: Company;
  lifecycle: Lifecycle;
  decision?: Decision;
  reasons: string[];
  missing: MissingField[];
  alternatives: Alternative[];
  stages: Stage[];
  error?: string;
  financial?: {
    flow: number;
    payment: number;
    dscr: number;
    limit: number;
    limitNow?: number;
    limitAfter?: number;
    months: number;
    debtInCsv: number;
    uncoveredDebt: number;
    source: string;
  };
  noCredit?: {
    weeks: number;
    overpayment: number;
    amount: number;
    term: number;
  };
  clientDeferred?: boolean;
  provenance: Record<
    string,
    {
      source: "ONBOARDING" | "REGISTRY" | "CSV" | "USER_CONFIRMED" | "ENGINE";
      confirmed: boolean;
      at: string;
    }
  >;
  meeting?: { slotId: string; at: string; manager: string };
  signature?: { id: string; at: string; hash: string; version: number };
  contract?: { number: string; date: string; hash: string; version: number };
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
};
