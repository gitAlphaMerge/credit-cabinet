import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express, { type Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import * as applications from "../../server/applications";
import { publicPreview } from "../../server/preview";
import { ManagerView } from "../../src/manager/ManagerWorkspace";
import { loadApplication, sendManagerEvent } from "../../src/manager/api";
import { elements, textOf, subject, workspace } from "./q3-harness";

let app: Express, db: DatabaseSync, owner: string, manager: string;
let store: typeof import("../../server/store");
const state = publicPreview();
state.profile.inn = "9900000001";
state.selections[0].calculation.amount = 500000;
state.selections[0].calculation.term = 12;
state.documents = [
  {
    id: "statement",
    category: "statement",
    name: "fixture.csv",
    period: "2026",
    confirmed: true,
    fields: {},
    createdAt: "2026-10-23",
    currency: "RUB",
    mime: "text/csv",
    records: [{ date: "2026-10-22", amount: 1000 }],
  },
];
const alternative: any = {
  option_id: "q3-small",
  kind: "smaller_amount",
  product_id: "fixture",
  product_name: "Тестовый продукт",
  amount_rub: 300000,
  term_months: 12,
  rate_annual_pct: 24,
  monthly_payment_rub: 28000,
  reason: "В пределах лимита",
};
const deps: applications.Dependencies = {
  clock: () => new Date("2026-10-23T12:00:00Z"),
  compliance: async () => ({
    gate: "pass",
    checks: [],
    documents: [],
    reasons: [],
    holes: [],
    enrichment: {},
  }),
  core: {
    async score() {
      return {
        core_result: {
          core: { stops_fired: [], missing: [], limit_now_rub: 400000 },
        },
      };
    },
  },
  bki: async () => ({
    status: "ok",
    source: "синтетические данные (мок)",
    data: {
      openLoans: 0,
      overdue30Plus12m: 0,
      overdue90Plus12m: 0,
      debtBurdenRatio: 0,
    },
  }),
  alternatives: () => [alternative],
};
before(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.AI_PROVIDER = "local";
  process.env.TEAM_AGENT_URL = "";
  process.env.TEAM_API_URL = "";
  store = await import("../../server/store");
  db = store.db;
  ({ app } = await import("../../server/app"));
  for (const [id, role] of [
    ["q3-client", "client"],
    ["q3-manager", "manager"],
    ["q3-other", "client"],
  ]) {
    db.prepare(
      "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)",
    ).run(id, id, "unused", JSON.stringify(state), role);
  }
  owner = "alfa_session=" + store.session("q3-client");
  manager = "alfa_session=" + store.session("q3-manager");
  applications.configureApplications(deps);
});
after(() => db?.close());
async function queued() {
  const { application } = applications.createApplication(
    db,
    "q3-client",
    {
      selectionId: state.selections[0].id,
      selectionVersion: 1,
    },
    deps,
  );
  const transition = (event: applications.Event, payload: any) =>
    applications.transitionApplication(
      db,
      {
        applicationId: application.id,
        expectedVersion: applications.applicationOf(db, application.id).version,
        event,
        actorRole: "system",
        actorId: null,
        payload,
      },
      deps,
    );
  await transition("submit", { consent: true });
  assert.equal(
    applications.applicationOf(db, application.id).status,
    "info_requested",
  );
  await transition("escalate_disagreed", {
    client_objections: "Не согласен с условиями",
  });
  assert.equal(applications.applicationOf(db, application.id).status, "queued");
  return application.id;
}
function transport(
  cookie: string,
  replies: { status: number; body: any; path: string }[],
) {
  return (async (url: any, init: any = {}) => {
    const path = String(url);
    const method = (init.method ?? "GET").toLowerCase();
    let call = (request(app) as any)[method](path).set("Cookie", cookie);
    for (const [key, value] of Object.entries(init.headers ?? {}))
      call = call.set(key, value);
    if (init.body) call = call.send(JSON.parse(init.body));
    const response = await call;
    replies.push({ path, status: response.status, body: response.body });
    return Response.json(response.body, { status: response.status });
  }) as typeof fetch;
}
function view(detail: any, onAction: any) {
  return ManagerView({
    rows: [{ application: detail.application }],
    selected: detail.application.id,
    detail,
    tab: "queue",
    loading: false,
    detailLoading: false,
    error: "",
    busy: false,
    onSelect() {},
    onTab() {},
    onRetry() {},
    onAction,
  });
}
for (const event of [
  "request_info",
  "send_to_underwriting",
  "reject",
] as const) {
  test("Q3 real manager form -> real route -> persisted " + event, async () => {
    const id = await queued();
    // Requesting a document needs an actual hole in the frozen dossier. This
    // fixture changes only the test DB, never a production implementation.
    if (event === "request_info")
      db.prepare(
        "UPDATE dossiers SET holes='[\"statement\"]' WHERE application_id=?",
      ).run(id);
    const old = globalThis.fetch,
      replies: any[] = [];
    globalThis.fetch = transport(manager, replies);
    try {
      const detail = await loadApplication(id);
      let action: Promise<any> | undefined;
      const tree = view(
        detail,
        (name: any, payload: any) =>
          (action = sendManagerEvent(detail.application, name, payload)),
      );
      const form = elements(tree).find(
        (n) =>
          n.type === "form" &&
          (event === "send_to_underwriting"
            ? n.props["data-option-form"] === alternative.option_id
            : event === "reject"
              ? elements(n).some((f) => f.props?.name === "reason")
              : elements(n).some((f) => f.props?.name === "hole")),
      );
      assert.ok(form, "rendered form for " + event);
      assert.ok(
        !elements(form).find((n) => n.type === "button")?.props.disabled,
      );
      const oldFormData = globalThis.FormData;
      const data = {
        hole: "statement",
        text: "Предоставьте выписку",
        reason: "Решение после проверки",
        memo: "Проверено досье",
      };
      try {
        globalThis.FormData = class {
          get(key: keyof typeof data) {
            return data[key];
          }
        } as any;
        form.props.onSubmit({
          preventDefault() {},
          currentTarget: {
            elements: { namedItem: () => ({ value: data.memo }) },
          },
        });
        assert.ok(action, "real onAction invoked");
        await action;
      } finally {
        globalThis.FormData = oldFormData;
      }
      assert.ok(
        replies.every((r) => r.status < 400),
        JSON.stringify(replies),
      );
      assert.equal(
        applications.applicationOf(db, id).status,
        event === "request_info"
          ? "info_requested"
          : event === "reject"
            ? "rejected"
            : "offered",
      );
      assert.ok(
        applications
          .eventsOf(db, id)
          .some((e) => e.event === event && e.actor_role === "manager"),
      );
      console.log("HTTP " + event + " -> " + replies.at(-1).status);
    } finally {
      globalThis.fetch = old;
    }
  });
}
test("Q3 client server access: queue/rejected/detail, spoofed role, config authoritative", async () => {
  const id = await queued();
  for (const path of ["/api/bank/queue", "/api/bank/rejected"]) {
    await request(app)
      .get(path)
      .set("Cookie", owner)
      .set("X-Role", "manager")
      .expect(403);
    await request(app).get(path).expect(401);
  }
  const other = "alfa_session=" + store.session("q3-other");
  await request(app)
    .get("/api/applications/" + id)
    .set("Cookie", other)
    .expect(404);
  const config = await request(app)
    .get("/api/config")
    .set("Cookie", owner)
    .expect(200);
  assert.equal(config.body.role, "client");
  const forbidden = await request(app)
    .post(`/api/applications/${id}/events`)
    .set("Cookie", owner)
    .set("Idempotency-Key", "q3-client-reject")
    .send({
      event: "reject",
      expectedVersion: applications.applicationOf(db, id).version,
      reason: "Нельзя",
      payload: {},
    });
  assert.equal(forbidden.status, 403);
});
test("Q3 client navigation does not include the manager tab", () => {
  const oldLocation = globalThis.location,
    oldWidth = globalThis.innerWidth;
  Object.assign(globalThis, {
    location: { pathname: "/cabinet" },
    innerWidth: 1440,
  });
  try {
    const s = subject("src/App.tsx", {
      states: { 0: "/cabinet", 1: state, 2: { role: "client" }, 3: false },
    });
    const tree = s.render("App");
    assert.ok(!elements(tree).some((n) => n.props?.["data-tour"] === "bank"));
  } finally {
    Object.assign(globalThis, { location: oldLocation, innerWidth: oldWidth });
  }
});
test("Q3 client profile save, notification read and new chat buttons reach real routes", async () => {
  const s = store.stateOf("q3-client");
  s.notifications = [
    {
      id: "q3-route-notice",
      key: "q3-route-notice",
      title: "Проверка",
      body: "Документ",
      href: "profile",
      read: false,
      createdAt: "2026-10-23",
    },
  ];
  store.saveState("q3-client", s);
  const replies: any[] = [],
    pending: Promise<any>[] = [];
  const w = workspace({ state: s });
  w.act = (path, body, method) => {
    const action = (async () => {
      let call = (request(app) as any)
        [(method || "POST").toLowerCase()]("/api" + path)
        .set("Cookie", owner);
      const response = await call.send(body);
      replies.push({ path, status: response.status });
      assert.ok(response.status < 400, JSON.stringify(response.body));
      w.state = store.stateOf("q3-client");
      return response.body;
    })();
    pending.push(action);
    return action;
  };
  const profile = subject("src/Profile.tsx", {
    workspace: w,
    states: { 0: true },
  });
  const form = elements(profile.render("ProfilePage")).find(
    (n) => n.type === "form",
  );
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {} });
  const notice = subject("src/NotificationCenter.tsx", {
    workspace: w,
    states: { 0: true },
  });
  elements(notice.render("NotificationCenter"))
    .find((n) => n.type === "button" && textOf(n).trim() === "Прочитать все")!
    .props.onClick();
  await pending.at(-1);
  assert.ok(store.stateOf("q3-client").notifications.every((n) => n.read));
  const oldWidth = globalThis.innerWidth;
  Object.assign(globalThis, { innerWidth: 1440 });
  try {
    const count = w.state.chats.length;
    const chat = subject("src/Chat.tsx", {
      workspace: w,
      mocks: { "./motion": { useReducedMotion: () => true } },
    });
    elements(chat.render("Chat", { full: true }))
      .find((n) => n.props?.label === "Новый диалог")!
      .props.onClick();
    await pending.at(-1);
    assert.equal(store.stateOf("q3-client").chats.length, count + 1);
  } finally {
    Object.assign(globalThis, { innerWidth: oldWidth });
  }
  assert.deepEqual(
    replies.map((r) => r.path),
    ["/profile", "/notifications/read", "/chats"],
  );
  assert.ok(
    replies.every((r) => r.status === 200),
    JSON.stringify(replies),
  );
});
test("Q3 mutation strength: real client role denial and config role", async () => {
  const mutant = subject("server/applications-routes.ts", {
    replace: ['user.role !== "manager"', "false"],
  });
  const isolated = express();
  isolated.use((_req, res, next) => {
    res.locals.userId = "q3-client";
    next();
  });
  isolated.use("/api", mutant.exports.applicationsRouter);
  const response = await request(isolated).get("/api/bank/queue");
  assert.equal(response.status, 200, "mutant bypass is actually exercised");
  assert.notEqual(response.status, 403, "baseline oracle kills role bypass");
  console.log(
    "KILLED applications-routes.ts: user.role !== manager (baseline expects 403, mutant 200)",
  );
  const changed = subject("server/app.ts", {
    replace: ['getUser(user.user_id)?.role ?? "client"', '"manager"'],
  });
  const config = await request(changed.exports.app)
    .get("/api/config")
    .set("Cookie", owner);
  assert.equal(config.body.role, "manager");
  assert.notEqual(config.body.role, "client");
  console.log("KILLED app.ts: client config role changed to manager");
});
test("BUG: Q3 visible client submission must enter v2 and expose a submitted application", async () => {
  const replies: any[] = [];
  const w = workspace({
    state: structuredClone(state),
    financingDraft: { selected: state.selections[0].id },
  });
  w.act = async (path, body) => {
    const res = await request(app)
      .post("/api" + path)
      .set("Cookie", owner)
      .send(body as any);
    replies.push(res);
    assert.ok(res.status < 400, JSON.stringify(res.body));
    w.state = store.stateOf("q3-client");
    return res.body;
  };
  const before = await request(app)
    .get("/api/applications")
    .set("Cookie", owner);
  const component = subject("src/Financing.tsx", {
    workspace: w,
    states: { 7: true, 9: true },
  });
  const button = elements(component.render("Financing")).find(
    (n) => n.props?.onClick && textOf(n).trim() === "Отправить заявление",
  );
  assert.ok(button, "actual visible submit button");
  await button.props.onClick();
  assert.equal(replies.at(-1).status, 200);
  const after = await request(app)
    .get("/api/applications")
    .set("Cookie", owner);
  assert.equal(
    after.body.length,
    before.body.length + 1,
    "visible UI succeeded but created zero v2 applications; legacy funding_applications is disconnected",
  );
  assert.notEqual(
    after.body.at(-1).status,
    "draft",
    "submit must execute the conveyor",
  );
});
