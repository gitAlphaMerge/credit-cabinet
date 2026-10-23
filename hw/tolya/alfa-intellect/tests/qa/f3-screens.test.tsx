import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

test("F3 every contract status has a safe client screen", async () => {
  const { ApplicationStatusView } = await import("../../src/ApplicationStatus");
  for (const status of "draft queued info_requested underwriting approved offered signed disbursed rejected expired withdrawn".split(
    " ",
  )) {
    const html = renderToStaticMarkup(
      <ApplicationStatusView
        detail={{
          application: { id: "own", status, version: 3, amount: 300000 },
          dossier: {
            holes: ["statement", "SECRET_BANK_CODE"],
            stops_fired: ["COMPLIANCE_FNS_TAX_DEBT"],
          },
          events: [
            {
              seq: 1,
              to_status: status,
              reason: "SECRET_BANK_CODE",
              at: "2026-10-23",
              actor_role: "system",
              event: "submit",
            },
          ],
        }}
        busy={false}
        onAction={async () => {}}
      />,
    );
    assert.match(html, /Моя заявка/);
    assert.match(html, /История заявки/);
    assert.doesNotMatch(
      html,
      /undefined|null|NaN|SECRET_BANK_CODE|COMPLIANCE_/,
    );
    assert.doesNotMatch(html, /24%|28\s*000/);
  }
});

test("F3 memo has six deterministic dossier blocks and explicit review", async () => {
  const { memoBlocks, ManagerMemo } =
    await import("../../src/manager/ManagerMemo");
  const detail = {
    application: { id: "own", status: "queued", version: 3, amount: 300000 },
    dossier: { limit_now_rub: 400000, N: 3, M: 5, holes: ["statement"] },
    events: [],
  };
  assert.equal(memoBlocks(detail).length, 6);
  assert.deepEqual(memoBlocks(detail), memoBlocks(detail));
  const html = renderToStaticMarkup(
    <ManagerMemo
      detail={detail}
      busy={false}
      onClose={() => {}}
      onSend={async () => {}}
    />,
  );
  assert.match(html, /Комментарий менеджера/);
  assert.match(html, /Я проверил досье/);
  assert.match(html, /Передать андеррайтеру/);
  assert.doesNotMatch(html, /undefined|null|NaN/);
});

import { elements, subject, textOf, workspace } from "./q3-harness";
import {
  clientRequest,
  loadOwnApplication,
  loadOwnApplications,
  sendClientEvent,
} from "../../src/application-client";

const detail: any = {
  application: { id: "own", status: "offered", amount: 300000, version: 7 },
  dossier: { limit_now_rub: 400000, N: 3, M: 5 },
  events: [
    {
      seq: 1,
      event: "make_offer",
      to_status: "offered",
      at: "2026-10-23",
      payload: JSON.stringify({
        amount: 250000,
        rate: 0.24,
        term_months: 6,
        schedule: [{ payment: 45000 }],
      }),
    },
  ],
};
test("F3 offer renders only actual server terms, not requested amount as offer", async () => {
  const { ApplicationStatusView } = await import("../../src/ApplicationStatus");
  const html = renderToStaticMarkup(
    <ApplicationStatusView
      detail={detail}
      busy={false}
      onAction={async () => {}}
    />,
  ).replaceAll("\u00a0", " ");
  assert.match(html, /250 000/);
  assert.match(html, /24%/);
  assert.match(html, /45 000/);
  assert.match(html, /6 мес/);
  assert.match(html, /Код из СМС/);
  assert.match(html, /0000/);
  const invalid = structuredClone(detail);
  invalid.events[0].payload = {
    amount: null,
    rate: NaN,
    schedule: [{ payment: Infinity }],
  };
  assert.doesNotMatch(
    renderToStaticMarkup(
      <ApplicationStatusView
        detail={invalid}
        busy={false}
        onAction={async () => {}}
      />,
    ),
    /undefined|null|NaN|Infinity|24%|Первый платёж/,
  );
});
test("F3 own list/detail and events use session, exact version, payload and idempotency", async () => {
  const old = globalThis.fetch;
  const calls: any[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push([url, init]);
      return Response.json(
        String(url).endsWith("/events")
          ? {}
          : String(url).endsWith("/applications")
            ? [{ id: "own" }]
            : detail,
      );
    };
    await loadOwnApplications();
    await loadOwnApplication("own");
    await sendClientEvent(detail, "sign", { code: "0000" });
    assert.deepEqual(
      calls.map((c) => c[0]),
      [
        "/api/applications",
        "/api/applications/own",
        "/api/applications/own/events",
      ],
    );
    assert.ok(calls.every((c) => c[1].credentials === "same-origin"));
    assert.deepEqual(JSON.parse(calls[2][1].body), {
      event: "sign",
      expectedVersion: 7,
      payload: { code: "0000" },
    });
    assert.ok(calls[2][1].headers["Idempotency-Key"]);
    globalThis.fetch = async () =>
      Response.json({
        ...detail,
        application: { ...detail.application, id: "foreign" },
      });
    await assert.rejects(loadOwnApplication("own"), /недоступна/);
  } finally {
    globalThis.fetch = old;
  }
});
test("F3 transport hides internal errors and exposes retryable network, malformed and conflict errors", async () => {
  const old = globalThis.fetch;
  try {
    for (const status of [401, 403, 404, 409, 422, 500]) {
      globalThis.fetch = async () =>
        Response.json({ error: "SECRET_BANK_CODE" }, { status });
      await assert.rejects(
        clientRequest("/applications"),
        (e: any) =>
          !e.message.includes("SECRET_BANK_CODE") && /[А-Яа-я]/.test(e.message),
      );
    }
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await assert.rejects(loadOwnApplications(), /связаться/);
    globalThis.fetch = async () => new Response("invalid");
    await assert.rejects(loadOwnApplications(), /прочитать/);
  } finally {
    globalThis.fetch = old;
  }
});
test("F3 client controls have accessible names, are native keyboard controls, and lock while busy", () => {
  const view = subject("src/ApplicationStatus.tsx");
  for (const status of ["offered", "info_requested"]) {
    const tree = view.render("ApplicationStatusView", {
      detail: { ...detail, application: { ...detail.application, status } },
      busy: true,
      onAction: async () => {},
      documents: [{ id: "doc", name: "Выписка", confirmed: true }],
    });
    const nodes = elements(tree);
    for (const node of nodes.filter((n) =>
      ["input", "select", "textarea", "button"].includes(n.type),
    )) {
      assert.ok(
        node.type === "button"
          ? textOf(node).trim() || node.props["aria-label"]
          : nodes.some((n) => n.type === "label" && elements(n).includes(node)),
      );
      assert.equal(node.props.disabled, true, node.type);
      assert.equal(node.props.tabIndex, undefined);
    }
  }
});
test("F3 document, alternative, disagreement and signature handlers use contract payloads", async () => {
  const old = globalThis.FormData;
  const values = new Map<string, any>();
  globalThis.FormData = class {
    get(k: string) {
      return values.get(k);
    }
    getAll(k: string) {
      return values.get(k) || [];
    }
  } as any;
  try {
    const calls: any[] = [];
    const view = subject("src/ApplicationStatus.tsx");
    const d = {
      ...detail,
      application: { ...detail.application, status: "info_requested" },
      dossier: {
        alternatives: [
          { option_id: "option", amount_rub: 200000, product_name: "Тест" },
        ],
      },
    };
    const props = {
      detail: d,
      busy: false,
      onAction: async (...args: any[]) => {
        calls.push(args);
      },
      onDisagree: async (text: string) => {
        calls.push(["disagree", text]);
      },
    };
    let nodes = elements(view.render("ApplicationStatusView", props));
    values.set("documents", ["confirmed-doc"]);
    await nodes
      .find((n) => n.props?.id === "application-documents")
      .props.onSubmit({ preventDefault() {}, currentTarget: {} });
    await nodes
      .find((n) => n.type === "button" && textOf(n) === "Принять вариант")
      .props.onClick();
    values.set("objections", "Нужен другой срок");
    await nodes
      .filter((n) => n.type === "form")[1]
      .props.onSubmit({ preventDefault() {}, currentTarget: {} });
    nodes = elements(
      view.render("ApplicationStatusView", { ...props, detail }),
    );
    values.set("code", "0000");
    await nodes
      .find((n) => n.type === "form")
      .props.onSubmit({ preventDefault() {}, currentTarget: {} });
    assert.deepEqual(calls, [
      ["client_update", { documents: ["confirmed-doc"] }],
      ["accept_alternative", { option_id: "option" }],
      ["disagree", "Нужен другой срок"],
      ["sign", { code: "0000" }],
    ]);
  } finally {
    globalThis.FormData = old;
  }
});
test("F3 manager memo cannot submit without review or beyond limit; reviewed memo reaches existing event", async () => {
  const memo = subject("src/manager/ManagerMemo.tsx", { states: { 1: true } });
  const sent: any[] = [];
  const props = {
    detail: {
      ...detail,
      application: { ...detail.application, status: "queued" },
    },
    busy: false,
    onClose() {},
    onSend: async (payload: any) => {
      sent.push(payload);
    },
  };
  let tree = memo.render("ManagerMemo", props);
  await elements(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.equal(sent.length, 1);
  assert.match(sent[0].memo, /1 · Запрос[\s\S]*6 · Рекомендация/);
  const unreviewed = subject("src/manager/ManagerMemo.tsx");
  await elements(unreviewed.render("ManagerMemo", props))
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.equal(sent.length, 1);
  tree = memo.render("ManagerMemo", {
    ...props,
    detail: { ...props.detail, dossier: { limit_now_rub: 299999 } },
  });
  await elements(tree)
    .find((n) => n.type === "form")
    .props.onSubmit({ preventDefault() {} });
  assert.equal(sent.length, 1);
});
test("F3 manager or unknown role never loads client applications", () => {
  for (const role of ["manager", undefined, "system"]) {
    const view = subject("src/ApplicationStatus.tsx", {
      workspace: workspace({ config: { role } }),
    });
    assert.match(textOf(view.render("ApplicationStatus")), /только клиенту/);
  }
});

test("F3 memo completion uses existing manager event; failure retains the draft", async () => {
  const calls: any[] = [];
  let fail = false;
  const queued = {
    ...detail,
    application: { ...detail.application, status: "queued" },
  };
  const c = subject("src/manager/ManagerWorkspace.tsx", {
    states: {
      0: {},
      1: "queue",
      2: [],
      3: "own",
      4: queued,
      5: false,
      6: false,
    },
    mocks: {
      "./api": {
        loadApplication: async () => queued,
        loadQueue: async () => [],
        sendManagerEvent: async (...args: any[]) => {
          if (fail) throw new Error("conflict");
          calls.push(args);
        },
      },
    },
  });
  const modal = () =>
    elements(c.render("ManagerWorkspace")).find(
      (n) => n.type?.name === "ManagerMemo",
    );
  const payload = { memo: "Проверенное досье" };
  fail = true;
  await assert.rejects(modal().props.onSend(payload), /conflict/);
  assert.ok(modal(), "failed send must keep modal open");
  fail = false;
  await modal().props.onSend(payload);
  assert.deepEqual(calls, [
    [queued.application, "send_to_underwriting", payload],
  ]);
  assert.equal(modal(), undefined);
});

test("F3 obsolete client detail response is ignored after selection changes", async () => {
  let complete!: (value: any) => void;
  const c = subject("src/ApplicationStatus.tsx", {
    states: { 1: "own" },
    workspace: workspace({ config: { role: "client" } }),
    mocks: {
      "./application-client": {
        statusLabels: {},
        loadOwnApplications: async () => [{ id: "own" }],
        loadOwnApplication: () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      },
    },
  });
  c.render("ApplicationStatus");
  const cleanup = c.effects[0]();
  await Promise.resolve();
  cleanup();
  complete(detail);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(c.states.get(2), null);
});
