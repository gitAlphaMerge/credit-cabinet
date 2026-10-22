/**
 * v2 контракт: альтернативы, когда запрошенное не проходит. Владелец реализации: пакет P3.
 * Заглушка базы: типы заморожены, тело заменит P3. Источник продуктов: data/catalog/products.json
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

export const buildAlternatives: AlternativesBuilder = () => [];
