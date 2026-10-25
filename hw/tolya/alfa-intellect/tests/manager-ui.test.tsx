import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagerView, ManagerAccess } from "../src/manager/ManagerWorkspace";
import {
  loadQueue,
  loadApplication,
  sendManagerEvent,
  normalizeDossier,
  type QueueItem,
  type ApplicationDetail,
} from "../src/manager/api";

const rows: QueueItem[] = [
  {
    application: {
      id: "a",
      status: "queued",
      version: 3,
      amount: 900000,
      queued_at: "2026-10-23T08:00:00Z",
    },
    client_name: "Первый клиент",
    red_reason: "CLIENT_SILENT",
    N: 3,
    M: 5,
    limit_now_rub: 500000,
  },
  {
    application: { id: "b", status: "queued", version: 7, amount: 800000 },
    client_name: "Второй клиент",
    red_reason: "CLIENT_DISAGREED",
    N: 4,
    M: 5,
    limit_now_rub: 500000,
  },
];
const detail: ApplicationDetail = {
  application: rows[1].application,
  dossier: {
    limit_now_rub: 500000,
    holes: ["statement"],
    client_objections: "Не устраивает срок",
    checks: [
      {
        key: "fns",
        status: "unavailable",
        source: "Мок ФНС",
        checkedAt: "2026-10-23T08:00:00Z",
        managerText: "Повторить проверку",
      },
    ],
    alternatives: [
      {
        option_id: "small",
        kind: "smaller_amount",
        product_id: "fixture",
        product_name: "Тестовый продукт",
        amount_rub: 400000,
        term_months: 12,
        rate_annual_pct: 24,
        monthly_payment_rub: 40000,
        reason: "В пределах лимита",
      },
      {
        option_id: "large",
        kind: "smaller_amount",
        product_id: "fixture",
        product_name: "Сверх лимита",
        amount_rub: 600000,
        term_months: 12,
        rate_annual_pct: 24,
        monthly_payment_rub: 60000,
        reason: "Тест ограничения",
      },
    ],
  },
  events: [
    {
      seq: 1,
      actor_role: "system",
      event: "escalate_disagreed",
      from_status: "info_requested",
      to_status: "queued",
      at: "2026-10-23T08:00:00Z",
      reason: "CLIENT_DISAGREED",
    },
  ],
};
const noop = () => {};
function view(overrides = {}) {
  return ManagerView({
    rows,
    detail,
    selected: "b",
    tab: "queue",
    loading: false,
    detailLoading: false,
    error: "",
    busy: false,
    onSelect: noop,
    onTab: noop,
    onRetry: noop,
    onAction: async () => {},
    ...overrides,
  });
}
function elements(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
test("queue preserves server order, human reasons and server N/M", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => Response.json(rows);
  try {
    const loaded = await loadQueue("queue");
    const html = renderToStaticMarkup(view({ rows: loaded }));
    assert.ok(html.indexOf("Первый клиент") < html.indexOf("Второй клиент"));
    for (const text of [
      "Клиент молчит после напоминания",
      "Не согласен с вариантами",
      "3 из 5",
      "4 из 5",
    ])
      assert.ok(html.includes(text), text);
  } finally {
    globalThis.fetch = old;
  }
});
test("selecting application loads objections, alternatives, unavailable source and system timeline", async () => {
  let selected = "";
  const row = elements(
    view({ onSelect: (id: string) => (selected = id) }),
  ).find((e) => e.props?.["data-application"] === "b");
  row.props.onClick();
  assert.equal(selected, "b");
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "/api/applications/b");
    return Response.json(detail);
  };
  try {
    const html = renderToStaticMarkup(
      view({ detail: await loadApplication(selected) }),
    );
    for (const text of [
      "Не устраивает срок",
      "Нужна проверка менеджером",
      "Источник недоступен",
      "Мок ФНС",
      "система",
    ])
      assert.ok(html.includes(text), text);
  } finally {
    globalThis.fetch = old;
  }
});
test("option click sends version, option id, idempotency key; conflict has human text", async () => {
  const old = globalThis.fetch;
  let body: any;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init!.body as string);
    assert.ok((init!.headers as Record<string, string>)["Idempotency-Key"]);
    return Response.json({ error: "AMOUNT_EXCEEDS_LIMIT" }, { status: 409 });
  };
  try {
    let message = "";
    const tree = view({
      onAction: async (event: any, payload: any) => {
        try {
          await sendManagerEvent(detail.application, event, payload);
        } catch (e) {
          message = (e as Error).message;
        }
      },
    });
    const form = elements(tree).find((e) => e.props?.["data-option-form"] === "small");
    assert.ok(form, "underwriting requires a memo form");
    const memo = elements(form).find((e) => e.props?.name === "memo");
    assert.equal(memo.props.required, true);
    await form.props.onSubmit({
      preventDefault() {},
      currentTarget: { elements: { namedItem: () => ({ value: "Verified dossier" }) } },
    });
    assert.deepEqual(body, {
      event: "send_to_underwriting",
      expectedVersion: 7,
      payload: { option_id: "small", memo: "Verified dossier" },
    });
    assert.match(message, /Сумма превышает текущий лимит/);
    assert.ok(renderToStaticMarkup(view({ error: message })).includes(message));
  } finally {
    globalThis.fetch = old;
  }
});
test("all alternatives above or without a known limit are disabled", () => {
  for (const limit of [undefined, null, 0, 399999, 500000]) {
    const tree = view({
      detail: {
        ...detail,
        dossier: { ...detail.dossier, limit_now_rub: limit },
      },
    });
    for (const option of detail.dossier!.alternatives!) {
      const button = elements(tree).find(
        (e) => e.props?.["data-option"] === option.option_id,
      );
      if (limit == null || option.amount_rub > limit) {
        assert.equal(button.props.disabled, true);
        assert.ok(button.props.title);
      }
    }
  }
});
test("rejected tab uses rejected endpoint and explains enforcement", async () => {
  let tab = "";
  elements(view({ onTab: (value: string) => (tab = value) }))
    .find((e) => e.props?.id === "manager-rejected")
    .props.onClick();
  assert.equal(tab, "rejected");
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "/api/bank/rejected");
    return Response.json([
      {
        ...rows[0],
        red_reason: "UNDERWRITING_REJECTED",
        reason: "ENFORCEMENT",
      },
    ]);
  };
  try {
    assert.match(
      renderToStaticMarkup(view({ rows: await loadQueue("rejected"), tab })),
      /Исполнительное производство/,
    );
  } finally {
    globalThis.fetch = old;
  }
});
test("empty, unavailable server and absent dossier are explicit", () => {
  assert.match(
    renderToStaticMarkup(view({ rows: [], detail: null })),
    /Красных заявок нет, система разобрала остальные сама/,
  );
  assert.match(
    renderToStaticMarkup(view({ error: "Сервер недоступен" })),
    /Сервер недоступен/,
  );
  assert.match(
    renderToStaticMarkup(view({ detail: { ...detail, dossier: null } })),
    /Досье пока нет/,
  );
});
test("client cannot render manager workspace", () => {
  assert.match(
    renderToStaticMarkup(<ManagerAccess role="client" />),
    /Доступно только менеджеру/,
  );
  assert.ok(
    !renderToStaticMarkup(<ManagerAccess role="client" />).includes(
      "Рабочее место менеджера",
    ),
  );
});
test("document request and rejection use contract payloads and current version", async () => {
  const old = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init!.body as string) });
    return Response.json({
      application: { ...detail.application, version: 8 },
    });
  };
  try {
    await sendManagerEvent(detail.application, "request_info", {
      hole: "statement",
      text: "Нужна выписка за полный период",
    });
    await sendManagerEvent(detail.application, "reject", {
      reason: "Причина решения",
    });
    assert.deepEqual(calls, [
      {
        url: "/api/applications/b/events",
        body: {
          event: "request_info",
          expectedVersion: 7,
          reason: "Нужна выписка за полный период",
          payload: {
            hole: "statement",
          },
        },
      },
      {
        url: "/api/applications/b/events",
        body: {
          event: "reject",
          expectedVersion: 7,
          reason: "Причина решения",
          payload: {},
        },
      },
    ]);
  } finally {
    globalThis.fetch = old;
  }
});
test("rejected applications cannot send alternatives even within limit", () => {
  const tree = view({
    detail: {
      ...detail,
      application: { ...detail.application, status: "rejected" },
    },
  });
  assert.equal(
    elements(tree).find((e) => e.props?.["data-option"] === "small").props
      .disabled,
    true,
  );
});
test("network errors are visible to the caller", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  try {
    await assert.rejects(loadQueue("queue"), /Сервер недоступен/);
  } finally {
    globalThis.fetch = old;
  }
});

test("FIX-A4: compliance report is authoritative and service metadata is never a check", () => {
  const check = detail.dossier!.checks![0];
  for (const compliance of [
    { checks: [check] },
    JSON.stringify({ checks: [check] }),
  ]) {
    const dossier = normalizeDossier({
      checks: JSON.stringify({ legacy: { status: "fail" }, _v2: { compliance: {} } }),
      compliance,
    });
    assert.deepEqual(dossier!.checks, [check]);
    const html = renderToStaticMarkup(view({ detail: { ...detail, dossier } }));
    assert.ok(!html.includes("Не пройдено"));
    assert.match(html, /Источник недоступен/);
  }
  assert.deepEqual(normalizeDossier({ checks: JSON.stringify({ fns: check, _v2: {} }) })!.checks, [check]);
  assert.deepEqual(normalizeDossier({ compliance: { checks: [] }, checks: { _v2: {} } })!.checks, []);
});
