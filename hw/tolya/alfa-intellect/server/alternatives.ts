import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * v2 контракт: альтернативы, когда запрошенное не проходит. Владелец реализации: пакет P3.
 * Типы заморожены. Источник продуктов: data/catalog/products.json
 * (8 продуктов Толи, ALFA_*). Ставки и рамки берутся только оттуда, не выдумываются.
 */
export type AlternativeKind =
  "smaller_amount" | "longer_term" | "other_product";
export type AlternativeOffer = {
  option_id: string;
  kind: AlternativeKind;
  product_id: string;
  product_name: string;
  amount_rub: number;
  term_months: number;
  rate_annual_pct: number;
  monthly_payment_rub: number;
  /** Одна фраза клиенту: почему этот вариант проходит. */
  reason: string;
};
export type AlternativesRequest = {
  amount_rub: number;
  term_months: number;
  purpose: string;
  form: "ИП" | "ООО" | null;
  months_active: number | null;
  /** Из ответа ядра Лизы. */
  limit_now_rub: number;
  core_instrument: string | null;
  core_status: string | null;
};
export type AlternativesBuilder = (
  req: AlternativesRequest,
) => AlternativeOffer[];

type CatalogProduct = {
  id: string;
  bank_product_name: string;
  bank_borrower_types: string;
  bank_min_business_age_months: number;
  bank_min_amount_rub: number;
  bank_max_amount_rub: number;
  bank_min_term_months: number | null;
  bank_max_term_months: number | null;
  bank_base_rate_from_pct: number | null;
  bank_rate_unit: string;
  bank_repayment_type: string;
  bank_revolving: number | null;
  bank_allowed_purposes: string;
  bank_restricted_uses: string;
  bank_collateral: string;
  bank_tranche_max_months: number | null;
  bank_tranche_max_days_without_subscription: number | null;
};

let catalog: CatalogProduct[] | undefined;
/** Clear the module cache so tests can verify catalogue reloads. */
export function resetAlternativesCatalogForTests() {
  catalog = undefined;
}
function products(): CatalogProduct[] {
  return (catalog ??= JSON.parse(
    readFileSync(
      process.env.PRODUCTS_CATALOG ||
        new URL("../../../../data/catalog/products.json", import.meta.url),
      "utf8",
    ),
  ).products);
}
const tokens = (value: string) => value.split(";").map((x) => x.trim());

// Exact public purpose aliases only. Unknown or restricted descriptions require clarification.
function purposeAllowed(p: CatalogProduct, purpose: string): boolean {
  const value = purpose.trim().toLowerCase();
  if (tokens(p.bank_restricted_uses).includes(value)) return false;
  const working = [
    "кассовый разрыв",
    "сезон",
    "закупка под контракт",
    "оборотные средства",
    "working_capital",
  ];
  const development = ["рост", "оборудование", "business_development"];
  const allowed = tokens(p.bank_allowed_purposes);
  if (working.includes(value))
    return allowed.some((x) =>
      [
        "working_capital",
        "working_capital_only",
        "short_term_working_capital",
        "business_purchase_of_goods_equipment_services",
      ].includes(x),
    );
  if (development.includes(value))
    return allowed.some((x) =>
      [
        "business_development",
        "business_purchase_of_goods_equipment_services",
      ].includes(x),
    );
  if (["рефинансирование", "refinance_existing_business_loans"].includes(value))
    return allowed.includes("refinance_existing_business_loans");
  return false;
}
function maxTerm(p: CatalogProduct): number {
  return Math.min(
    p.bank_max_term_months ?? Infinity,
    p.bank_tranche_max_months ?? Infinity,
    p.bank_tranche_max_days_without_subscription === null
      ? Infinity
      : Math.floor(p.bank_tranche_max_days_without_subscription / 30),
  );
}
function payment(
  p: CatalogProduct,
  amount: number,
  term: number,
): number | null {
  const base = p.bank_base_rate_from_pct;
  if (base === null || !Number.isFinite(base) || base < 0) return null;
  const rate = (base * (p.bank_rate_unit === "daily_pct" ? 365 : 1)) / 1200;
  if (!["annual_pct", "daily_pct"].includes(p.bank_rate_unit)) return null;
  if (p.bank_revolving === 1) return amount * rate;
  if (p.bank_repayment_type.includes("annuity"))
    return rate ? (amount * rate) / (1 - (1 + rate) ** -term) : amount / term;
  if (p.bank_repayment_type === "equal_principal_plus_monthly_interest")
    return amount / term + amount * rate;
  return null;
}

export const buildAlternatives: AlternativesBuilder = (req) => {
  if (
    !Number.isFinite(req.amount_rub) ||
    req.amount_rub <= 0 ||
    !Number.isFinite(req.limit_now_rub) ||
    req.limit_now_rub <= 0 ||
    !Number.isInteger(req.term_months) ||
    req.term_months <= 0 ||
    req.months_active === null ||
    !Number.isFinite(req.months_active) ||
    req.months_active < 0 ||
    !["ИП", "ООО"].includes(req.form ?? "")
  )
    return [];
  const amount =
    Math.floor(Math.min(req.amount_rub, req.limit_now_rub) / 10000) * 10000;
  const list = products();
  const make = (
    p: CatalogProduct,
    term: number,
    kind: AlternativeKind,
  ): AlternativeOffer | null => {
    if (
      !tokens(p.bank_borrower_types).includes(
        req.form === "ИП" ? "IP" : "OOO",
      ) ||
      req.months_active! < p.bank_min_business_age_months ||
      !purposeAllowed(p, req.purpose) ||
      amount < p.bank_min_amount_rub ||
      amount > p.bank_max_amount_rub ||
      term < (p.bank_min_term_months ?? 1) ||
      term > maxTerm(p)
    )
      return null;
    const monthly = payment(p, amount, term);
    if (monthly === null || !Number.isFinite(monthly)) return null;
    const rate =
      p.bank_base_rate_from_pct! * (p.bank_rate_unit === "daily_pct" ? 365 : 1);
    const money = (n: number) =>
      n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    const rounded = Math.round(monthly * 100) / 100;
    const condition =
      p.bank_collateral === "required" ? " при подтверждении залога" : "";
    const detail =
      p.bank_revolving === 1
        ? "только проценты на выбранную сумму, основной долг возвращается отдельно"
        : p.bank_repayment_type === "equal_principal_plus_monthly_interest"
          ? "первый и наибольший платёж"
          : "платёж";
    return {
      option_id: createHash("sha256")
        .update(`${p.id}:${amount}:${term}`)
        .digest("hex"),
      kind,
      product_id: p.id,
      product_name: p.bank_product_name,
      amount_rub: amount,
      term_months: term,
      rate_annual_pct: rate,
      monthly_payment_rub: rounded,
      reason: `Можно рассмотреть ${money(amount)} ₽${condition}, ${detail} ${money(Math.round(rounded))} ₽ в месяц, окончательные условия определяет банк`,
    };
  };
  const current = list.find((p) => p.id === req.core_instrument);
  const smaller = current
    ? make(current, req.term_months, "smaller_amount")
    : null;
  const others = list
    .filter((p) => p.id !== req.core_instrument)
    .map((p) => make(p, req.term_months, "other_product"))
    .filter((o): o is AlternativeOffer => o !== null)
    .sort(
      (a, b) =>
        a.monthly_payment_rub - b.monthly_payment_rub ||
        a.product_id.localeCompare(b.product_id),
    );
  const extendedTerm = current ? maxTerm(current) : Infinity;
  const baseline = current ? payment(current, amount, req.term_months) : null;
  const longer =
    current && Number.isFinite(extendedTerm) && extendedTerm > req.term_months
      ? make(current, extendedTerm, "longer_term")
      : null;
  return [
    smaller,
    others[0],
    longer && baseline !== null && longer.monthly_payment_rub < baseline
      ? longer
      : null,
  ]
    .filter((o): o is AlternativeOffer => o != null)
    .slice(0, 3);
};
