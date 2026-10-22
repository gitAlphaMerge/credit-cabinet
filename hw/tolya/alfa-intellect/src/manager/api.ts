import type { AlternativeOffer } from "../../server/alternatives";
import type {
  ComplianceCheck,
  DocumentFreshness,
} from "../../server/compliance";

export type Application = {
  id: string;
  status: string;
  version: number;
  amount: number;
  queued_at?: string | null;
  updated_at?: string;
  client_name?: string;
};
export type Dossier = {
  limit_now_rub?: number | null;
  N?: number | null;
  M?: number | null;
  readiness_n?: number | null;
  readiness_m?: number | null;
  holes?: string[];
  checks?: ComplianceCheck[];
  documents?: DocumentFreshness[];
  stops_fired?: string[];
  verified?: string[];
  client_objections?: string;
  alternatives?: AlternativeOffer[];
};
export type QueueItem = Dossier & {
  application: Application;
  client_name?: string;
  red_reason?: string;
  reason?: string;
  priority?: number;
};
export type JournalEvent = {
  seq: number;
  actor_role: string;
  actor_id?: string | null;
  event: string;
  from_status?: string | null;
  to_status: string;
  at: string;
  reason?: string | null;
};
export type ApplicationDetail = {
  application: Application;
  dossier: Dossier | null;
  events: JournalEvent[];
};
export type ManagerEvent = "request_info" | "send_to_underwriting" | "reject";

const errorLabels: Record<string, string> = {
  AMOUNT_EXCEEDS_LIMIT:
    "Сумма превышает текущий лимит. Выберите меньшую сумму.",
};
async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(body === undefined
          ? {}
          : { "Idempotency-Key": crypto.randomUUID() }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Сервер недоступен. Проверьте соединение и повторите запрос.",
    );
  }
  const data = await response.json().catch(() => {
    throw new Error("Не удалось прочитать ответ сервера.");
  });
  if (!response.ok) {
    const message =
      errorLabels[data.code] ||
      errorLabels[data.error] ||
      data.error ||
      "Не удалось выполнить запрос";
    throw new Error(
      response.status === 409
        ? `${message} Обновите очередь перед повторным решением.`
        : message,
    );
  }
  return data;
}
function parsed(value: unknown): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
// The current storage response contains JSON columns; v2 can return decoded fields.
export function normalizeDossier(raw: any): Dossier | null {
  if (!raw) return null;
  const result = parsed(raw.core_result),
    core = result?.core ?? result ?? {};
  const compliance = parsed(raw.compliance);
  const checks = parsed(raw.checks) ?? compliance?.checks;
  return {
    ...raw,
    limit_now_rub: raw.limit_now_rub ?? core.limit_now_rub,
    holes: parsed(raw.holes),
    stops_fired: parsed(raw.stops_fired) ?? core.stops_fired,
    alternatives: parsed(raw.alternatives),
    documents: parsed(raw.documents) ?? compliance?.documents,
    checks: Array.isArray(checks)
      ? checks
      : checks &&
        Object.entries(checks).map(([key, check]) => ({
          key,
          ...(check as object),
        })),
  };
}
export async function loadQueue(
  tab: "queue" | "rejected",
): Promise<QueueItem[]> {
  const data = await request<any[]>("/bank/" + tab);
  return data.map((row) => ({
    ...row,
    ...normalizeDossier(row.dossier ?? row),
    application: row.application ?? row,
  }));
}
export async function loadApplication(id: string): Promise<ApplicationDetail> {
  const data = await request<ApplicationDetail>(
    "/applications/" + encodeURIComponent(id),
  );
  return {
    ...data,
    dossier: normalizeDossier(data.dossier),
    events: data.events ?? [],
  };
}
export function sendManagerEvent(
  application: Application,
  event: ManagerEvent,
  payload: Record<string, string>,
) {
  return request(
    "/applications/" + encodeURIComponent(application.id) + "/events",
    { event, expectedVersion: application.version, payload },
  );
}
