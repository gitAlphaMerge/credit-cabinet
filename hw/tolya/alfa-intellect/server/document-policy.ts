import type { AppState, Doc } from "../shared/types";

// All numeric lifetimes are prototype assumptions, not bank approval rules.
export const freshnessRules: Record<
  string,
  {
    basis: "period" | "annual" | "upload" | "schedule";
    days?: number;
    source: string;
  }
> = {
  statement: {
    basis: "period",
    days: 30,
    source:
      "Допущение прототипа: 30 дней от последней операции; соответствует default server/compliance.ts, не норматив",
  },
  balance: {
    basis: "annual",
    source:
      "Допущение прототипа: до 31 марта после следующего отчётного года; кейс и v2-contract срок не задают",
  },
  pnl: {
    basis: "annual",
    source:
      "Допущение прототипа: годовой ОФР до 31 марта после следующего отчётного года; для промежуточного 90 дней",
  },
  model: {
    basis: "upload",
    days: 90,
    source:
      "Допущение прототипа: пересмотр плановых показателей каждые 90 дней",
  },
  plan: {
    basis: "upload",
    days: 90,
    source: "Допущение прототипа: пересмотр бизнес-плана каждые 90 дней",
  },
  schedule: {
    basis: "schedule",
    days: 30,
    source:
      "Допущение прототипа: 30 дней от загрузки, не позже последнего платежа; изменение кредита аннулирует актуальность",
  },
};
export type TimedDocument = Doc & {
  periodFrom?: string | null;
  periodTo?: string | null;
  validUntil?: string | null;
  version?: number;
  versions?: TimedDocument[];
  source?: string;
  provider?: string;
  creditRevision?: string;
};
const validDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const addDays = (v: string, n: number) =>
  new Date(Date.parse(v) + n * 86400000).toISOString().slice(0, 10);
export const shortDocumentDate = (v: string) =>
  v.slice(8, 10) + "." + v.slice(5, 7) + "." + v.slice(0, 4);

export function documentMetadata(
  doc: Pick<Doc, "category" | "period" | "fields" | "records" | "createdAt">,
) {
  const explicit = [doc.fields.periodStart, doc.fields.periodEnd];
  const dates = doc.period.match(/\d{4}-\d{2}-\d{2}/g)?.filter(validDate) || [];
  const records = (doc.records || [])
    .map((r) => String(r.date))
    .filter(validDate)
    .sort();
  let from: string | null = null,
    to: string | null = null;
  if (explicit.every(validDate)) [from, to] = explicit as string[];
  else if (dates.length >= 2) [from, to] = [dates[0], dates.at(-1)!];
  else if (records.length) [from, to] = [records[0], records.at(-1)!];
  else if (
    ["balance", "pnl"].includes(doc.category) &&
    /^\d{4}(?:\s*год)?$/.test(doc.period.trim())
  ) {
    const year = doc.period.slice(0, 4);
    [from, to] = [year + "-01-01", year + "-12-31"];
  }
  if (from && to && from > to) [from, to] = [null, null];
  const rule = freshnessRules[doc.category];
  const uploaded = doc.createdAt.slice(0, 10);
  let validUntil: string | null = null;
  if (rule && validDate(uploaded)) {
    if (rule.basis === "upload") validUntil = addDays(uploaded, rule.days!);
    else if (rule.basis === "period" && to)
      validUntil = addDays(to, rule.days!);
    else if (rule.basis === "annual" && from && to) {
      const annual =
        from.slice(5) === "01-01" &&
        to.slice(5) === "12-31" &&
        from.slice(0, 4) === to.slice(0, 4);
      validUntil = annual
        ? `${Number(to.slice(0, 4)) + 2}-03-31`
        : addDays(to, 90);
    } else if (rule.basis === "schedule" && to)
      validUntil = [to, addDays(uploaded, rule.days!)].sort()[0];
  }
  return { periodFrom: from, periodTo: to, validUntil };
}

export function creditRevision(state: AppState) {
  const f = state.cabinet?.facility;
  return JSON.stringify(
    f
      ? [
          f.id,
          f.amount,
          f.rate,
          f.term,
          f.events.map((e) => [e.date, e.principal, e.interest, e.fees]),
        ]
      : state.credit
        ? [
            state.credit.id,
            state.credit.calculation.amount,
            state.credit.calculation.rate,
            state.credit.calculation.term,
          ]
        : null,
  );
}

export function documentStatus(
  doc: Doc | undefined,
  form: string,
  category: string,
  now = new Date(),
  revision?: string,
) {
  if (form === "ИП" && ["balance", "pnl"].includes(category))
    return { code: "na", label: "Не нужен для ИП" };
  if (!doc) return { code: "missing", label: "Нет" };
  if (!doc.confirmed) return { code: "pending", label: "На проверке" };
  const metadata = documentMetadata(doc),
    timed = doc as TimedDocument;
  const today = now.toISOString().slice(0, 10);
  const invalidPeriod =
    category !== "schedule" &&
    category !== "model" &&
    category !== "plan" &&
    !!metadata.periodTo &&
    metadata.periodTo > today;
  if (
    !metadata.validUntil ||
    invalidPeriod ||
    metadata.validUntil < today ||
    (category === "schedule" &&
      timed.creditRevision !== undefined &&
      revision !== undefined &&
      timed.creditRevision !== revision)
  )
    return { code: "stale", label: "Устарел, обновите" };
  return {
    code: "fresh",
    label: "Актуален до " + shortDocumentDate(metadata.validUntil),
  };
}

export function documentSource(
  category: string,
  form: string,
  registered = true,
) {
  if (!registered) return null;
  if (category === "statement") return "Alfa API: выписки по счетам";
  if (["balance", "pnl"].includes(category) && form !== "ИП")
    return "ГИР БО ФНС";
  return null;
}

export function confirmDocumentVersion(state: AppState, doc: TimedDocument) {
  if (doc.confirmed) return;
  const previous = state.documents.filter(
    (d) => d.category === doc.category && d.confirmed,
  ) as TimedDocument[];
  const versions = previous.flatMap((d) => [
    ...(d.versions || []),
    { ...d, versions: undefined },
  ]);
  doc.versions = [
    ...new Map(
      versions.filter((d) => d.id !== doc.id).map((d) => [d.id, d]),
    ).values(),
  ];
  doc.version = Math.max(0, ...doc.versions.map((d) => d.version || 1)) + 1;
  Object.assign(doc, documentMetadata(doc));
  doc.confirmed = true;
  // Only the active list changes; full snapshots and file bytes remain available.
  state.documents = [
    doc,
    ...state.documents.filter(
      (d) => d.id !== doc.id && !(d.category === doc.category && d.confirmed),
    ),
  ];
}
