import { playUiSound } from "./ui-sounds";
let sequence = 0;
let nativeFetch: typeof fetch | undefined;
/** Background autosaves/polls do not pretend to be a new task for the user. */
export function activityLabel(path: string, method: string) {
  if (/^\/journey\/(onboarding|position|draft|session)/.test(path)) return "";
  if (method === "GET" && !/registry|company|download|export/.test(path)) return "";
  if (/documents/.test(path)) return "Работаем с документом";
  if (/messages|\/turn/.test(path)) return "Готовим ответ";
  if (/meeting|consultation/.test(path)) return "Сохраняем обращение";
  if (/registry|company/.test(path)) return "Проверяем сведения компании";
  if (/submit|complete|score|calculate|select/.test(path)) return "Готовим результат";
  if (/auth/.test(path)) return "Открываем рабочее пространство";
  return "Сохраняем изменения";
}
export function beginActivity(label: string) {
  if (!label || typeof window === "undefined") return () => {};
  const id = ++sequence;
  window.dispatchEvent(new CustomEvent("alfa-request-start", {detail: {id, label}}));
  return (ok = true) => window.dispatchEvent(new CustomEvent("alfa-request-end", {detail: {id, ok}}));
}

/** Track every same-origin API caller, including the separate manager/client helpers. */
export async function trackedFetch(input: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let path = "";
  if (url.startsWith("/api/")) path = url.slice(4);
  else if (typeof location !== "undefined") {
    try {const parsed = new URL(url, location.origin); if (parsed.origin === location.origin && parsed.pathname.startsWith("/api/")) path = parsed.pathname.slice(4);} catch {}
  }
  const method = (options?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
  const label = path ? activityLabel(path, method) : "";
  const finish = beginActivity(label);
  let succeeded = false;
  try {
    const response = await (nativeFetch ?? globalThis.fetch)(input, options);
    succeeded = response.ok;
    if (label && method !== "GET") playUiSound(response.ok ? "success" : "error");
    return response;
  } catch (error) {if (label) playUiSound("error"); throw error;}
  finally {finish(succeeded);}
}

/** Preserve native fetch semantics, request bodies, credentials and idempotency keys. */
export function installRequestActivity() {
  if (typeof window === "undefined") return;
  const current = window.fetch as typeof fetch & {alfaNativeFetch?: typeof fetch};
  nativeFetch = current.alfaNativeFetch ?? current.bind(window);
  const wrapped = trackedFetch as typeof fetch & {alfaNativeFetch?: typeof fetch};
  wrapped.alfaNativeFetch = nativeFetch;
  window.fetch = wrapped;
}
