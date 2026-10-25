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
  const response = await fetch("/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  }).catch(() => {
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
