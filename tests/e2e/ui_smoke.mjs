import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// No browser packages, no injected clicks/focus/value assignments, no HTTP mocks.
const base = new URL(process.env.BASE_URL || "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("Use an isolated local demo via BASE_URL");
const out = resolve(dirname(fileURLToPath(import.meta.url)), "out");
const report = {
  baseURL: base.href,
  startedAt: new Date().toISOString(),
  steps: [],
  consoleErrors: [],
  networkErrors: [],
  failedRequests: [],
  fatal: null,
};
let browser, cdp;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(process.env.LOCALAPPDATA || "", "ms-playwright");
  for (const build of (await readdir(root))
    .filter((p) => p.startsWith("chromium-"))
    .sort()
    .reverse()) {
    for (const folder of (await readdir(join(root, build))).filter((p) =>
      p.startsWith("chrome-win"),
    )) {
      const path = join(root, build, folder, "chrome.exe");
      try {
        await access(path);
        return path;
      } catch {}
    }
  }
  throw new Error("Chrome not found; set CHROME_PATH");
}
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const p = this.pending.get(message.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(message.id);
        message.error
          ? p.reject(new Error(JSON.stringify(message.error)))
          : p.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
  }
  call(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }
}
async function launch() {
  const profile = await mkdtemp(join(tmpdir(), "q3-ui-"));
  browser = spawn(
    await chromePath(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(
      () => reject(new Error("Chrome startup timeout")),
      20000,
    );
    browser.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    browser.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Chrome exited: " + code));
    });
    browser.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return new CDP(ws);
}
async function page(width, role) {
  const { browserContextId } = await cdp.call("Target.createBrowserContext");
  const { targetId } = await cdp.call("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.call("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  let currentStep = "setup";
  const keyboard = [];
  const call = (method, params = {}) => cdp.call(method, params, sessionId);
  cdp.listeners.push((message) => {
    if (message.sessionId !== sessionId) return;
    const { method, params } = message;
    const context = { width, role, step: currentStep };
    if (method === "Runtime.consoleAPICalled" && params.type === "error")
      report.consoleErrors.push({
        ...context,
        text: params.args.map((a) => a.value ?? a.description).join(" "),
      });
    if (method === "Runtime.exceptionThrown")
      report.consoleErrors.push({
        ...context,
        text:
          params.exceptionDetails.exception?.description ||
          params.exceptionDetails.text,
      });
    if (method === "Network.responseReceived" && params.response.status >= 400)
      report.networkErrors.push({
        ...context,
        status: params.response.status,
        url: params.response.url,
      });
    if (method === "Network.loadingFailed" && !params.canceled)
      report.failedRequests.push({
        ...context,
        error: params.errorText,
        requestId: params.requestId,
      });
  });
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const until = async (expression, description) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error("Timeout: " + description);
  };
  const key = async (key, modifiers = 0) => {
    const code = { Tab: 9, Enter: 13, Escape: 27, a: 65 }[key] || 0;
    keyboard.push({ step: currentStep, key, modifiers });
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      windowsVirtualKeyCode: code,
      modifiers,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      windowsVirtualKeyCode: code,
      modifiers,
    });
  };
  const focusByTab = async (selector, text) => {
    const match = `(() => { const e = document.activeElement; return !!e && e.matches(${JSON.stringify(selector)}) && ${text ? `(e.innerText || e.textContent || '').trim().includes(${JSON.stringify(text)})` : "true"}; })()`;
    for (let i = 0; i < 250; i++) {
      if (await evaluate(match)) return;
      await key("Tab");
    }
    throw new Error("Unreachable by Tab: " + selector + " " + (text || ""));
  };
  const activate = async (selector, text) => {
    await focusByTab(selector, text);
    await key("Enter");
  };
  const fill = async (selector, value) => {
    await focusByTab(selector);
    await key("a", 2);
    keyboard.push({
      step: currentStep,
      key: "text entry",
      length: value.length,
    });
    await call("Input.insertText", { text: value });
  };
  const api = (path) =>
    evaluate(
      `fetch(${JSON.stringify("/api" + path)}, {credentials:'same-origin'}).then(async r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })`,
    );
  const snapshot = async (name) => {
    const audit = await evaluate(`(() => {
      const visible = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const name = e => e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || Array.from(e.labels || []).map(l => l.textContent).join(' ').trim() || (e.tagName === 'BUTTON' || e.tagName === 'A' ? e.textContent.trim() : '') || e.getAttribute('title') || (['submit','button'].includes(e.type) ? e.value : '');
      const controls = Array.from(document.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href]')).filter(visible);
      return {url:location.pathname, overflow:document.documentElement.scrollWidth > innerWidth,
        scrollWidth:document.documentElement.scrollWidth, innerWidth,
        unnamed:controls.filter(e => !name(e)).map(e => ({tag:e.tagName,id:e.id,type:e.type})),
        imagesWithoutAlt:Array.from(document.images).filter(e => !e.hasAttribute('alt')).map(e => e.src),
        invalidWithoutDescription:controls.filter(e => e.getAttribute('aria-invalid') === 'true' && !(e.getAttribute('aria-describedby') || '').split(' ').some(id => document.getElementById(id))).map(e => e.id || e.name),
        positiveTabIndex:controls.filter(e => e.tabIndex > 0).map(e => e.id || e.tagName)};
    })()`);
    const shot = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const filename = `${width}-${role}-${name}.png`;
    await writeFile(join(out, filename), Buffer.from(shot.data, "base64"));
    return { screenshot: filename, audit };
  };
  const step = async (name, fn) => {
    currentStep = name;
    const offsets = [
      report.consoleErrors.length,
      report.networkErrors.length,
      report.failedRequests.length,
    ];
    const firstKey = keyboard.length;
    let error;
    try {
      await fn();
      await pause(200);
    } catch (e) {
      error = e.message;
    }
    let evidence;
    try {
      evidence = await snapshot(name);
    } catch (e) {
      error ||= e.message;
    }
    const failures = [];
    if (error) failures.push(error);
    if (evidence?.audit.overflow) failures.push("Horizontal overflow");
    for (const k of [
      "unnamed",
      "imagesWithoutAlt",
      "invalidWithoutDescription",
      "positiveTabIndex",
    ])
      if (evidence?.audit[k].length) failures.push("Accessibility: " + k);
    if (report.consoleErrors.length > offsets[0])
      failures.push("Console error");
    if (
      report.networkErrors.length > offsets[1] ||
      report.failedRequests.length > offsets[2]
    )
      failures.push("Network error");
    report.steps.push({
      width,
      role,
      name,
      passed: !failures.length,
      failures,
      ...evidence,
      keyboard: keyboard.slice(firstKey),
      interaction: "CDP keyboard only; no DOM click/focus/value mutation",
    });
    if (error) throw new Error(error);
  };
  const login = async (phone, password) => {
    await step("landing", async () => {
      await call("Page.navigate", { url: base.href });
      await until(
        "!!document.querySelector('.landing, .public-nav, .hero-actions')",
        "landing rendered",
      );
      await snapshot("landing-page");
      await activate("button", "Войти");
      await until("location.pathname === '/login'", "login route");
    });
    await step("login", async () => {
      await fill('input[type="tel"]', phone);
      await fill("#auth-password", password);
      await snapshot("login-form");
      await activate(
        'form button[type="submit"], form button:not([type])',
        "Войти",
      );
      await until(
        "!!document.querySelector('.app-header')",
        "authenticated shell",
      );
      if (await evaluate("!!document.querySelector('.tour-card')"))
        await activate("button", "Пропустить");
    });
  };
  return {
    step,
    login,
    activate,
    fill,
    until,
    api,
    evaluate,
    close: () => cdp.call("Target.disposeBrowserContext", { browserContextId }),
  };
}
await mkdir(out, { recursive: true });
try {
  for (const key of [
    "CLIENT_PHONE",
    "CLIENT_PASSWORD",
    "MANAGER_PHONE",
    "MANAGER_PASSWORD",
  ])
    check(process.env[key], "Missing " + key + "; see UI_SMOKE.md");
  cdp = await launch();
  for (const width of [390, 1440]) {
    const client = await page(width, "client");
    try {
      await client.login(process.env.CLIENT_PHONE, process.env.CLIENT_PASSWORD);
      await client.step("cabinet", async () => {
        await client.until(
          "!!document.querySelector('.cabinet-v2')",
          "cabinet",
        );
        check(
          !(await client.evaluate(
            "!!document.querySelector('[data-tour=bank]')",
          )),
          "Client sees manager tab",
        );
      });
      await client.step("financing", async () => {
        if (width === 390) await client.activate('[aria-label="Меню"]');
        await client.activate('[data-tour="financing"]');
        await client.until(
          "location.pathname === '/financing'",
          "financing route",
        );
        await client.activate("button", "История подборов");
      });
      let selectionId;
      await client.step("selection", async () => {
        const state = await client.api("/state");
        check(state.selections.length, "Fixture requires saved selections");
        const count = await client.evaluate(
          "document.querySelectorAll('.funding-history-row').length",
        );
        for (let index = 1; index <= count; index++) {
          // Use the actual history order and read the resulting owner-scoped
          // draft. A lead created at 390 must not consume the 1440 fixture.
          await client.activate(
            `button.funding-history-row:nth-of-type(${index})`,
          );
          await pause(150);
          const draft = await client.evaluate(
            "Object.keys(sessionStorage).filter(k=>k.startsWith('alfa:financing-draft:v1:')).map(k=>{try{return JSON.parse(sessionStorage.getItem(k)).draft}catch{return null}}).find(d=>d?.selected)",
          );
          const selected = state.selections.find(
            (s) => s.id === draft?.selected,
          );
          if (
            selected &&
            !state.leads.some(
              (l) =>
                l.selectionId === selected.id && l.version === selected.version,
            )
          ) {
            selectionId = selected.id;
            break;
          }
          await client.activate("button", "История подборов");
        }
        check(
          selectionId,
          "Need an unsubmitted saved selection for each viewport",
        );
        await client.activate("button", "Перейти к оформлению");
        if (
          await client.evaluate(
            "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Понимаю, продолжить'))",
          )
        )
          await client.activate("button", "Понимаю, продолжить");
      });
      await client.step("submit", async () => {
        await client.activate("button", "Отправить заявление");
        await client.until(
          "document.querySelector('.funding-application')?.textContent.includes('Демо-заявка создана') || !!document.querySelector('[role=alert]')",
          "submission outcome",
        );
        const all = await client.api("/applications");
        const submitted = all.find(
          (a) => a.selection_id === selectionId && a.status !== "draft",
        );
        check(
          submitted,
          "UI submission did not enter the v2 conveyor (known Q3 BUG)",
        );
        const detail = await client.api("/applications/" + submitted.id);
        check(
          detail.events.some((e) => e.event === "submit"),
          "Missing submit event",
        );
      });
    } catch (e) {
      console.error(`${width} client: ${e.message}`);
    } finally {
      await client.close();
    }
    // Separate fixture applications per action and viewport: each decision is
    // irreversible in the demo state machine. Never replay on a stale version.
    for (const action of ["request_info", "send_to_underwriting", "reject"]) {
      const manager = await page(width, "manager-" + action);
      try {
        await manager.login(
          process.env.MANAGER_PHONE,
          process.env.MANAGER_PASSWORD,
        );
        let id;
        await manager.step("queue", async () => {
          if (width === 390) await manager.activate('[aria-label="Меню"]');
          await manager.activate('[data-tour="bank"]');
          await manager.until(
            "!!document.querySelector('.manager-workspace')",
            "manager workspace",
          );
          const rows = await manager.api("/bank/queue");
          const candidates = [];
          for (const row of rows) {
            const detail = await manager.api(
              "/applications/" + (row.application?.id || row.id),
            );
            const raw = detail.dossier || {};
            const parse = (value) =>
              typeof value === "string" ? JSON.parse(value) : value;
            const checks = parse(raw.checks) || {};
            const alternatives =
              parse(raw.alternatives) || checks._v2?.alternatives || [];
            const coreResult = parse(raw.core_result) || {};
            const core = coreResult.core || coreResult;
            const holes = parse(raw.holes) || [];
            if (
              action === "request_info"
                ? holes.length
                : action === "send_to_underwriting"
                  ? alternatives.some(
                      (a) =>
                        a.amount_rub > 0 && a.amount_rub <= core.limit_now_rub,
                    ) && raw.readiness_n === raw.readiness_m
                  : true
            )
              candidates.push(detail.application.id);
          }
          id = candidates[0];
          check(id, "No eligible queued fixture for " + action);
        });
        await manager.step("dossier", async () => {
          await manager.activate(`[data-application=${JSON.stringify(id)}]`);
          await manager.until(
            "!!document.querySelector('.manager-dossier form')",
            "dossier forms",
          );
        });
        await manager.step(action, async () => {
          if (action === "request_info") {
            await manager.fill(
              'textarea[name="text"]',
              "Нужна актуальная выписка для проверки",
            );
            await manager.activate("button", "Запросить документ");
          } else if (action === "reject") {
            await manager.fill(
              'textarea[name="reason"]',
              "Демонстрационное решение после проверки",
            );
            await manager.activate("button", "Отказать");
          } else {
            const option = await manager.evaluate(
              "document.querySelector('button[data-option]:not(:disabled)')?.getAttribute('data-option')",
            );
            check(option, "No actionable alternative");
            await manager.fill(
              `form[data-option-form=${JSON.stringify(option)}] textarea[name=memo]`,
              "Досье сверено, сумма в пределах лимита",
            );
            await manager.activate(`[data-option=${JSON.stringify(option)}]`);
          }
          await manager.until(
            `!document.querySelector('[data-application=' + ${JSON.stringify(JSON.stringify(id))} + ']') || !!document.querySelector('[role=alert]')`,
            "decision response",
          );
          const result = await manager.api("/applications/" + id);
          check(
            result.events.some(
              (e) => e.event === action && e.actor_role === "manager",
            ),
            "Decision absent in journal",
          );
          check(
            result.application.status ===
              {
                request_info: "info_requested",
                reject: "rejected",
                send_to_underwriting: "offered",
              }[action],
            "Unexpected persisted state",
          );
        });
      } catch (e) {
        console.error(`${width} ${action}: ${e.message}`);
      } finally {
        await manager.close();
      }
    }
  }
} catch (e) {
  report.fatal = e.stack || e.message;
} finally {
  if (cdp) {
    await cdp.call("Browser.close").catch(() => {});
    cdp.ws.close();
  }
  browser?.kill();
  report.finishedAt = new Date().toISOString();
  report.passed =
    !report.fatal &&
    report.steps.length === 42 &&
    report.steps.every((s) => s.passed) &&
    !report.consoleErrors.length &&
    !report.networkErrors.length &&
    !report.failedRequests.length;
  await writeFile(
    join(out, "ui-smoke.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.table(
    report.steps.map(({ width, role, name, passed, failures }) => ({
      width,
      role,
      step: name,
      passed,
      failures: failures.join("; "),
    })),
  );
  if (report.fatal) console.error(report.fatal);
  console.log("Report: " + join(out, "ui-smoke.json"));
  if (!report.passed) process.exitCode = 1;
}
