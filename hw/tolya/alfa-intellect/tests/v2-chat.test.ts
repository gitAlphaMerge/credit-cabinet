import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const frontend = new URL("../../../../services/frontend/v2/", import.meta.url);
for (const page of ["chat", "kabinet"]) {
  test(`v2 ${page}: send, duplicate guard, retry, session and apply intent`, async () => {
    const html = readFileSync(new URL(`${page}.html`, frontend), "utf8");
    assert.match(html, /@keydown.enter="v.send\(\$event\)"/);
    assert.match(html, /aria-label="Отправить" @click="v.send"/);
    const input = { value: "  Вопрос  " };
    const storage = new Map();
    const requests: any[] = [];
    const timers = new Map<number, () => void>();
    let resolve!: (r: Response) => void;
    const context = vm.createContext({
      console, AbortController, URLSearchParams, crypto: { randomUUID: () => "random-tab-id" },
      setTimeout: (fn: () => void, ms: number) => { timers.set(ms, fn); return ms; },
      clearTimeout: (id: number) => timers.delete(id), clearInterval,
      sessionStorage: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) },
      document: { getElementById: () => input }, window: { location: { search: "?intent=apply" } },
      fetch: (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        return new Promise<Response>(r => { resolve = r; });
      },
      DCLogic: class {
        state: any; props: any;
        constructor(props: any) { this.props = props; }
        setState(update: any) { Object.assign(this.state, typeof update === "function" ? update(this.state) : update); }
      },
      mountDC: (Component: any) => { context.component = new Component({}); },
    });
    vm.runInContext(html.match(/<script>\s*class Component[\s\S]*?<\/script>/)![0].replace(/^<script>|<\/script>$/g, ""), context);
    const component = context.component;
    const messages = () => component.state.messages || component.state.thread;
    const pending = component.renderVals().send();
    assert.equal(component.state.sending, true);
    assert.ok(timers.has(40000));
    input.value = "Повтор";
    component.send();
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { session_id: "random-tab-id", text: "Вопрос", card: {} });
    resolve(new Response(JSON.stringify({ text: "Ответ" })));
    await pending;
    assert.equal(messages().at(-1).text, "Ответ");
    assert.equal(component.state.sending, false);
    const failed = component.sendTurn("Сбой");
    resolve(new Response("", { status: 503 }));
    await failed;
    const error = messages().at(-1);
    assert.equal(error.text, "Ассистент сейчас недоступен, попробуйте через минуту");
    // Petite-vue passes a reactive wrapper, rather than the original state object.
    const retried = component.renderVals().retry({ ...error });
    resolve(new Response(JSON.stringify({ text: "Восстановлен" })));
    await retried;
    assert.equal(messages().filter((m: any) => m.user && m.text === "Сбой").length, 1);
    assert.equal(messages().at(-1).text, "Восстановлен");
    assert.ok(!messages().some((m: any) => m.retry));
    input.value = "   ";
    component.send();
    assert.equal(requests.length, 3);
    if (page === "chat") {
      component.componentDidMount();
      assert.equal(requests.at(-1).text, "Хочу оформить заявку");
      resolve(new Response(JSON.stringify({ text: "Обсудим заявку" })));
      await new Promise(r => setTimeout(r, 0));
    }
    assert.equal(component.agentSession(), "random-tab-id");
    context.fetch = (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
    });
    const timedOut = component.sendTurn("Таймаут");
    timers.get(40000)!();
    await timedOut;
    assert.equal(component.state.sending, false);
    assert.equal(messages().at(-1).retry, "Таймаут");
    context.fetch = async () => { throw new TypeError("offline"); };
    await component.sendTurn("Нет сети");
    assert.equal(messages().at(-1).retry, "Нет сети");
    component.sessionId = null;
    context.sessionStorage = { getItem() { throw new Error("denied"); } };
    assert.equal(component.agentSession(), "random-tab-id");
    component.componentWillUnmount();
  });
}
