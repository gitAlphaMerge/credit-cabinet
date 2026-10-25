import { normalizeDossier, type ApplicationDetail } from "./manager/api";
import { products } from "../shared/mvp2";

export type ClientDetail = Omit<ApplicationDetail, "events"> & {
  events: (ApplicationDetail["events"][number] & { payload?: unknown })[];
};
// Единый словарь экранных названий для клиента и менеджера.
export const uiLabels: Record<string, string> = {
  draft: "Черновик заявки",
  queued: "Заявка у менеджера",
  info_requested: "Нужны дополнительные сведения",
  underwriting: "Заявка на проверке",
  approved: "Банк готовит предложение",
  offered: "Банк подготовил предложение",
  signed: "Договор подписан",
  disbursed: "Деньги на счёте",
  rejected: "По заявке получен отказ",
  expired: "Срок предложения истёк",
  withdrawn: "Заявка отозвана",
  CLIENT_SILENT: "Клиент молчит после напоминания",
  CLIENT_DISAGREED: "Не согласен с вариантами",
  UNDERWRITING_REJECTED: "Отказ после проверки",
  ENFORCEMENT: "Исполнительное производство",
  NOT_BUSINESS: "Заёмщик не является ИП или ООО",
  TOO_YOUNG: "Недостаточная история работы бизнеса",
  NO_FREE_CASHFLOW: "Нет положительного свободного денежного потока",
  CASH_OUT: "Высокая доля снятия наличных",
  statement: "Банковская выписка",
  statement_fresh: "Актуальная банковская выписка",
  contract_main_customer: "Договор с основным заказчиком",
  reconciliation_act: "Акт сверки",
  request: "Параметры заявки",
  business: "Данные бизнеса",
  consent: "Согласие на проверку",
  checks: "Сведения для проверки",
  egrul: "Регистрационные данные",
  fns: "Сведения о налогах",
  bankruptcy: "Сведения о статусе бизнеса",
  aml: "Документы по операциям",
  COMPLIANCE_INN_MISSING: "Укажите ИНН в профиле компании.",
  COMPLIANCE_EGRUL_NOT_FOUND: "Проверьте ИНН и приложите выписку из реестра.",
  COMPLIANCE_EGRUL_INACTIVE:
    "В реестре бизнес отмечен как недействующий. Уточните данные в банке.",
  COMPLIANCE_EGRUL_MISMATCH: "Уточните данные компании в профиле и реестре.",
  COMPLIANCE_FNS_UNRELIABLE:
    "Уточните регистрационные сведения в налоговой службе.",
  COMPLIANCE_FNS_TAX_DEBT:
    "Обнаружена налоговая задолженность. Проверьте долг в личном кабинете налогоплательщика и приложите сведения об уплате или сверке.",
  COMPLIANCE_BANKRUPTCY:
    "В сведениях о бизнесе указано действующее банкротство. Свяжитесь с банком для уточнения.",
  COMPLIANCE_AML_REVIEW:
    "Поясните назначение операций и приложите подтверждающие договоры или счета.",
  COMPLIANCE_DOC_EXPIRED: "Загрузите актуальную выписку.",
  COMPLIANCE_DOC_DATE_UNKNOWN:
    "Уточните дату документа и загрузите актуальную версию.",
  COMPLIANCE_SOURCE_UNAVAILABLE:
    "Не удалось получить сведения. Повторите проверку позже или свяжитесь с банком.",
  BKI_OVERDUE_90_PLUS:
    "По кредитной истории есть длительная просрочка. Уточните сведения в банке.",
  BKI_OVERDUE_30_PLUS: "Уточните сведения о просрочке в кредитной истории.",
  SHORT_STATEMENT: "Предоставьте выписку за более длительный период.",
  LIMIT_EXCEEDED_ALTERNATIVES:
    "Запрошенная сумма превышает доступный лимит. Рассмотрите предложенные варианты.",
  MANAGER_APPROVED: "Подтверждено менеджером",
  SIGNED_DEMO: "Договор подписан",
  DECIDED: "Результат проверки готов",
  LOW_DSCR: "Недостаточно свободного денежного потока для платежа",
  APPROVED: "Можно продолжить оформление",
  MANAGER_REVIEW_REQUIRED: "Нужна проверка менеджером",
  ADDITIONAL_DATA_REQUIRED: "Нужны дополнительные сведения",
  DECLINED: "Запрошенные условия не прошли проверку",
};
export const statusLabels = uiLabels;
export const clientLabels = uiLabels;
export const unknownLabel = "Нужна проверка менеджером";
/** Возвращает название известного кода или нейтральную подпись. */
export function labelCode(code: string | null | undefined): string {
  if (!code) return unknownLabel;
  return uiLabels[code] ?? products.find((product) => product.id === code)?.name ?? unknownLabel;
}
/** Сохраняет человеческий текст и скрывает незнакомые технические коды. */
export function safeDisplayText(value: string | null | undefined): string {
  if (!value) return "";
  if (uiLabels[value]) return uiLabels[value];
  if (/\b[A-Z][A-Z0-9_]{3,}\b|\b(?:mvp|synthetic|engine|SHA-256)\b/i.test(value))
    return unknownLabel;
  return value;
}
/** Переводит технические обозначения внутри объяснения расчёта. */
export function presentTechnicalText(value: string): string {
  return value
    .replace(/\bDSCR\b/g, "коэффициент покрытия долга")
    .replace(/\bCFADS\b/g, "денежный поток для обслуживания долга")
    .replace(/\bRUB\b/g, "рубли")
    .replace(/Учебн(?:ый|ая|ое|ые)\s+/gi, "")
    .replace(/синтетическ(?:ий|ая|ое|ие)\s+/gi, "")
    .replace(/каталога\s+xlsx-[\w-]+\b/gi, "каталога")
    .replace(/\bxlsx-[\w-]+\b/gi, "каталог");
}
/** Оставляет обычную ошибку, а подробности технической пишет в консоль. */
export function visibleError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b[A-Z][A-Z0-9_]{3,}\b|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b(?:mvp|synthetic|engine|SHA-256)\b/i.test(message)) {
    console.error("Ошибка сервера:", error);
    return "Не получилось, попробуйте ещё раз";
  }
  return message;
}
export const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
export function jsonObject(value: unknown): Record<string, any> {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
export async function clientRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(body === undefined ? {} : { "Idempotency-Key": crypto.randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error("Не удалось связаться с сервером. Повторите попытку.");
  });
  const data = await response.json().catch(() => {
    throw new Error("Не удалось прочитать ответ сервера.");
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "Заявка изменилась. Обновите её перед повторным действием."
        : response.status === 404 || response.status === 403
          ? "Заявка недоступна."
          : response.status === 422
            ? "Проверьте введённые данные и код подтверждения."
            : "Не удалось выполнить действие. Повторите попытку.",
    );
  return data;
}
export async function loadOwnApplications() {
  return clientRequest<{ id: string; status: string }[]>("/applications");
}
export async function loadOwnApplication(id: string): Promise<ClientDetail> {
  const data = await clientRequest<ClientDetail>(
    "/applications/" + encodeURIComponent(id),
  );
  if (data.application?.id !== id) throw new Error("Заявка недоступна.");
  return {
    ...data,
    dossier: normalizeDossier(data.dossier),
    events: data.events ?? [],
  };
}
export function sendClientEvent(
  detail: ClientDetail,
  event: string,
  payload: Record<string, unknown> = {},
) {
  return clientRequest(
    "/applications/" + encodeURIComponent(detail.application.id) + "/events",
    {
      event,
      expectedVersion: detail.application.version,
      payload,
    },
  );
}
// Клиент не может дослать запрошенное: явное возражение, сервер сам переводит заявку к менеджеру.
export function escalateToManager(detail: ClientDetail, text: string) {
  return clientRequest(
    "/applications/" + encodeURIComponent(detail.application.id) + "/disagreement",
    {
      expectedVersion: detail.application.version,
      client_objections: text,
    },
  );
}
export function offerOf(detail: ClientDetail) {
  return jsonObject(
    detail.events.findLast((e) => e.event === "make_offer")?.payload,
  );
}
