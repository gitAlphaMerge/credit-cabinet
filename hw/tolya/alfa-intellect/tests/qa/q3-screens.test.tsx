import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceContext } from "../../src/context";
import { api, ApiError } from "../../src/api";
import { ErrorBoundary } from "../../src/ErrorBoundary";
import { subject, workspace, elements, textOf } from "./q3-harness";

const html = (tree: any, w = workspace()) =>
  renderToStaticMarkup(
    <WorkspaceContext.Provider value={w}>{tree}</WorkspaceContext.Provider>,
  );
test("Q3 landing CTAs resolve to implemented public routes and images have alt", () => {
  const paths: string[] = [];
  const component = subject("src/Landing.tsx");
  const tree = component.render("Landing", {
    go: (path: string) => paths.push(path),
  });
  for (const n of elements(tree).filter((n) => n.props?.onClick))
    n.props.onClick();
  assert.ok(
    paths.includes("/onboarding") &&
      paths.includes("/login") &&
      paths.includes("/demo"),
  );
  assert.ok(paths.every((p) => ["/onboarding", "/login", "/demo"].includes(p)));
  for (const img of html(tree).matchAll(/<img\b[^>]*>/g))
    assert.match(img[0], /\balt=/);
});
test("Q3 login blank, loading, server success and linked invalid field messages", async () => {
  assert.match(
    html(
      subject("src/Onboarding.tsx").render("Onboarding", {
        go() {},
        onAuth: async () => {},
      }),
    ),
    /На каком этапе ваш бизнес/,
  );
  const component = subject("src/Onboarding.tsx");
  let tree = component.render("Onboarding", {
    login: true,
    go() {},
    onAuth: async () => {},
  });
  assert.match(html(tree), /Номер телефона/);
  await elements(tree)
    .find((n) => n.type === "form")!
    .props.onSubmit({ preventDefault() {} });
  const invalid = html(
    component.render("Onboarding", {
      login: true,
      go() {},
      onAuth: async () => {},
    }),
  );
  assert.match(invalid, /aria-describedby="phone-error"/);
  assert.match(invalid, /id="phone-error"/);
  assert.match(invalid, /aria-describedby="password-error"/);
  const loading = subject("src/Onboarding.tsx", { states: { 6: true } });
  assert.match(
    html(loading.render("Onboarding", { login: true })),
    /Сохраняем/,
  );
  let authed = false;
  const success = subject("src/Onboarding.tsx", {
    states: { 3: "79991234567", 4: "fixture-password" },
  });
  const old = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true });
  try {
    tree = success.render("Onboarding", {
      login: true,
      go() {},
      onAuth: async () => {
        authed = true;
      },
    });
    await elements(tree)
      .find((n) => n.type === "form")!
      .props.onSubmit({ preventDefault() {} });
    assert.equal(authed, true);
  } finally {
    globalThis.fetch = old;
  }
});
async function authError(replace?: [string, string]) {
  const component = subject("src/Onboarding.tsx", {
    states: { 3: "79991234567", 4: "fixture-password" },
    replace,
  });
  const old = globalThis.fetch;
  try {
    for (const status of [0, 401, 422]) {
      globalThis.fetch = async () => {
        if (!status) throw new Error("offline");
        return Response.json(
          { error: "Проверяемый текст " + status },
          { status },
        );
      };
      const tree = component.render("Onboarding", { login: true });
      await elements(tree)
        .find((n) => n.type === "form")!
        .props.onSubmit({ preventDefault() {} });
      const result = html(component.render("Onboarding", { login: true }));
      assert.match(
        result,
        status
          ? new RegExp("Проверяемый текст " + status)
          : /Не удалось связаться с сервером/,
      );
      assert.match(result, /role="alert"/);
      assert.equal(component.states.get(6), false, "busy released on failure");
    }
  } finally {
    globalThis.fetch = old;
  }
}
test("Q3 authentication network and 4xx errors reach a visible alert", () =>
  authError());
test("Q3 financing new/history/empty, saved result, pending submission, loading and errors", async () => {
  const w = workspace();
  const empty = workspace({
    state: { ...w.state, selections: [] },
    financingDraft: { tab: "history" },
  });
  assert.match(
    html(
      subject("src/Financing.tsx", { workspace: empty }).render("Financing"),
      empty,
    ),
    /История начнётся/,
  );
  assert.match(
    html(subject("src/Financing.tsx", { workspace: w }).render("Financing"), w),
    /Что хотите изменить в бизнесе/,
  );
  w.financingDraft = { selected: w.state.selections[0].id };
  assert.match(
    html(subject("src/Financing.tsx", { workspace: w }).render("Financing"), w),
    /Перейти к оформлению/,
  );
  const loading = subject("src/Financing.tsx", {
    workspace: w,
    states: { 7: true, 4: true },
  });
  assert.match(html(loading.render("Financing"), w), /Сохраняем/);
  for (const message of ["Нет соединения", "Данные отклонены 422"]) {
    w.act = async () => {
      throw new Error(message);
    };
    const component = subject("src/Financing.tsx", {
      workspace: w,
      states: { 7: true },
    });
    const tree = component.render("Financing");
    await elements(tree)
      .find(
        (n) => n.props?.onClick && textOf(n).trim() === "Отправить заявление",
      )!
      .props.onClick();
    assert.match(html(component.render("Financing"), w), new RegExp(message));
    assert.equal(component.states.get(4), false);
  }
});
test("Q3 profile empty documents, lookup loading, invalid INN, transport and 4xx linked errors", async () => {
  const w = workspace();
  w.state.profile.inn = undefined;
  const component = subject("src/Profile.tsx", { workspace: w });
  assert.match(
    html(
      subject("src/Profile.tsx", { workspace: w, states: { 4: true } }).render(
        "ProfilePage",
      ),
      w,
    ),
    /Ищем/,
  );
  let tree = component.render("ProfilePage");
  assert.match(html(tree, w), /ИНН/);
  const form = elements(tree).find((n) => n.props?.className === "inn-search");
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {} });
  assert.match(html(component.render("ProfilePage"), w), /id="inn-error"/);
  assert.match(
    html(component.render("ProfilePage"), w),
    /aria-describedby="inn-help inn-error"/,
  );
  const old = globalThis.fetch;
  try {
    for (const status of [0, 404, 422]) {
      const c = subject("src/Profile.tsx", {
        workspace: w,
        states: { 2: "9900000001" },
      });
      globalThis.fetch = async () => {
        if (!status) throw new Error("offline");
        return Response.json({ error: "Реестр: " + status }, { status });
      };
      tree = c.render("ProfilePage");
      await elements(tree)
        .find((n) => n.props?.className === "inn-search")!
        .props.onSubmit({ preventDefault() {} });
      assert.match(
        html(c.render("ProfilePage"), w),
        status ? new RegExp("Реестр: " + status) : /Не удалось связаться/,
      );
      assert.equal(c.states.get(4), false);
    }
  } finally {
    globalThis.fetch = old;
  }
});
test("Q3 cabinet empty and populated; notifications empty, loaded and mark pending", () => {
  const w = workspace();
  const cabinet = subject("src/CabinetV2.tsx", { workspace: w });
  const empty = html(cabinet.render("CabinetV2", { onDiscuss() {} }), w);
  assert.match(empty, /Ваше финансирование/);
  const preview = html(
    cabinet.render("CabinetV2", { preview: w.state, onDiscuss() {} }),
    w,
  );
  assert.match(preview, /Кредит бизнеса/);
  const notices = subject("src/NotificationCenter.tsx", {
    workspace: w,
    states: { 0: true },
  });
  assert.match(html(notices.render("NotificationCenter"), w), /Пока тихо/);
  w.state.notifications = [
    {
      id: "q3-notice",
      key: "q3-notice",
      title: "Нужен документ",
      body: "Пришлите выписку",
      href: "profile",
      read: false,
      createdAt: "2026-10-23",
    },
  ];
  assert.match(
    html(notices.render("NotificationCenter"), w),
    /Пришлите выписку/,
  );
  const busy = subject("src/NotificationCenter.tsx", {
    workspace: w,
    states: { 0: true, 1: true },
  });
  assert.ok(
    elements(busy.render("NotificationCenter"))
      .filter(
        (n) => n.type === "button" && /Прочитать все|Прочитано/.test(textOf(n)),
      )
      .every((n) => n.props.disabled),
  );
});
test("Q3 chat empty and sending states render with context; error boundary provides recovery", () => {
  const oldWidth = globalThis.innerWidth;
  Object.assign(globalThis, { innerWidth: 1440 });
  try {
    const w = workspace();
    w.state.chats = [{ id: "q3-chat", title: "Чат", messages: [] }];
    w.activeChatId = "q3-chat";
    const chat = subject("src/Chat.tsx", {
      workspace: w,
      mocks: { "./motion": { useReducedMotion: () => true } },
    });
    assert.match(
      html(chat.render("Chat", { full: true }), w),
      /Отправить сообщение/,
    );
    w.sending = { chatId: "q3-chat", text: "Текст в обработке" };
    assert.match(
      html(chat.render("Chat", { full: true }), w),
      /Текст в обработке/,
    );
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { failed: true };
    assert.match(html(boundary.render()), /Обновить страницу/);
  } finally {
    Object.assign(globalThis, { innerWidth: oldWidth });
  }
});
test("Q3 generic API preserves structured 422 fields and network/malformed responses", async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { error: "Неверная сумма", fields: { amount: "Минимум 10000" } },
        { status: 422 },
      );
    await assert.rejects(
      api("/selections", {}),
      (e) =>
        e instanceof ApiError &&
        e.message === "Неверная сумма" &&
        e.fields?.amount === "Минимум 10000",
    );
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await assert.rejects(api("/state"), /Не удалось связаться/);
    globalThis.fetch = async () => new Response("bad JSON", { status: 502 });
    await assert.rejects(api("/state"), /Не удалось прочитать/);
  } finally {
    globalThis.fetch = old;
  }
});
test("Q3 shared shell exposes network/4xx failures from notifications/profile and chat, with sending lock", async () => {
  const old = {
    location: globalThis.location,
    width: globalThis.innerWidth,
    fetch: globalThis.fetch,
  };
  Object.assign(globalThis, {
    location: { pathname: "/chat" },
    innerWidth: 1440,
  });
  try {
    const w = workspace();
    w.state.chats = [{ id: "q3-chat", title: "Чат", messages: [] }];
    const c = subject("src/App.tsx", {
      states: {
        0: "/chat",
        1: w.state,
        2: { role: "client" },
        3: false,
        5: "q3-chat",
      },
    });
    const context = () =>
      elements(c.render("App")).find((n) => n.props?.value?.act)!.props.value;
    for (const path of ["/notifications/read", "/profile"]) {
      for (const status of [0, 422]) {
        globalThis.fetch = async () => {
          if (!status) throw new Error("offline");
          return Response.json({ error: "Ответ сервера 422" }, { status });
        };
        await assert.rejects(context().act(path, {}));
        const alert = elements(c.render("App")).find(
          (n) => n.props?.className === "toast",
        );
        assert.ok(alert);
        assert.equal(alert.props.role, "alert");
        assert.match(
          textOf(alert),
          status ? /Ответ сервера 422/ : /Не удалось связаться/,
        );
      }
    }
    let fail!: (e: Error) => void;
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      if (requests === 1)
        return new Promise((_resolve, reject) => {
          fail = reject;
        });
      return Response.json(w.state);
    };
    const pending = context().sendMessage("Сообщение");
    assert.equal(context().sending.text, "Сообщение");
    await context().sendMessage("Дубликат");
    assert.equal(requests, 1, "second send is locked");
    fail(new Error("offline"));
    await pending;
    assert.equal(context().sending, null);
    assert.match(
      textOf(
        elements(c.render("App")).find((n) => n.props?.className === "toast"),
      ),
      /Не удалось связаться/,
    );
  } finally {
    Object.assign(globalThis, {
      location: old.location,
      innerWidth: old.width,
      fetch: old.fetch,
    });
  }
});
test("Q3 mutation strength: authentication error handler and manager event version/reason/headers", async () => {
  await assert.rejects(
    authError(["setError((e as Error).message)", 'setError("")']),
    { name: "AssertionError" },
  );
  console.log("KILLED Onboarding.tsx: swallowed error");
  const old = globalThis.fetch;
  try {
    const mutations: [string, string, (body: any, init: any) => void][] = [
      [
        "expectedVersion: application.version",
        "expectedVersion: 1",
        (body) => assert.equal(body.expectedVersion, 7),
      ],
      [
        "? { reason }",
        '? { reason: "" }',
        (body) => assert.equal(body.reason, "Проверенная причина"),
      ],
      [
        '{ "Idempotency-Key": crypto.randomUUID() }',
        "{}",
        (_body, init) => assert.ok(init.headers["Idempotency-Key"]),
      ],
    ];
    for (const [from, to, oracle] of mutations) {
      const baseline = subject("src/manager/api.ts");
      globalThis.fetch = async (_url, init) => {
        oracle(JSON.parse(String(init?.body)), init);
        return Response.json({});
      };
      await baseline.exports.sendManagerEvent(
        { id: "q3", version: 7 },
        "reject",
        { reason: "Проверенная причина" },
      );
      const c = subject("src/manager/api.ts", { replace: [from, to] });
      let killed = false;
      globalThis.fetch = async (_url, init) => {
        try {
          oracle(JSON.parse(String(init?.body)), init);
        } catch (error) {
          killed = error instanceof assert.AssertionError;
          throw error;
        }
        return Response.json({});
      };
      // The transport converts thrown assertions into a human network error.
      await assert.rejects(
        c.exports.sendManagerEvent({ id: "q3", version: 7 }, "reject", {
          reason: "Проверенная причина",
        }),
      );
      assert.equal(killed, true, "the actual payload oracle must fail");
      console.log("KILLED manager/api.ts: " + from);
    }
  } finally {
    globalThis.fetch = old;
  }
});
