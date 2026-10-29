import { trackedFetch } from "./request-activity";
let workspaceId: string | null = null;
export function setApiWorkspace(value: string | null) {
  workspaceId = value;
}
/** Scope browser requests to the workspace that mounted this page, including keepalive saves. */
export function workspaceHeaders(): Record<string, string> {
  return workspaceId ? { "X-Journey-Workspace": workspaceId } : {};
}
export class ApiError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const requestMethod = (method || (body === undefined ? "GET" : "POST")).toUpperCase();
  const response = await trackedFetch("/api" + path, {
    method: requestMethod,
    credentials: "same-origin",
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(/messages|\/turn|documents/.test(path) ? 90000 : 30000) : undefined,
    headers: {
      ...workspaceHeaders(),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  }).catch((error) => {
    if (error?.name === "TimeoutError" || error?.name === "AbortError")
      throw new ApiError("Сервер отвечает дольше обычного. Действие могло продолжиться: проверьте статус перед повтором.");
    throw new ApiError(
      "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.",
    );
  });
  const data = await response.json().catch(() => {
    throw new ApiError(
      "Не удалось прочитать ответ сервера. Попробуйте ещё раз.",
    );
  });
  if (!response.ok)
    throw new ApiError(
      data.error || "Не удалось выполнить запрос",
      data.fields,
      response.status,
    );
  return data;
}
export const money = (n: number | null | undefined, compact = false) =>
  n === null || n === undefined
    ? "Не определено"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 0,
        ...(compact ? { notation: "compact" as const } : {}),
      }).format(n);
export const date = (v: string) =>
  new Date(v).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
