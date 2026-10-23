import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagerView, ManagerAccess } from "../../src/manager/ManagerWorkspace";
import {
  loadQueue,
  loadApplication,
  sendManagerEvent,
} from "../../src/manager/api";
import { elements, textOf, subject } from "./q3-harness";

export const detail: any = {
  application: { id: "q3", status: "queued", version: 7, amount: 300000 },
  dossier: {
    limit_now_rub: 400000,
    holes: ["statement"],
    N: 3,
    M: 5,
    checks: [
      {
        key: "fns",
        status: "unavailable",
        source: "Мок ФНС",
        checkedAt: "2026-10-23",
        managerText: "Повторить проверку",
      },
    ],
    alternatives: [
      {
        option_id: "q3-option",
        kind: "smaller_amount",
        product_id: "fixture",
        product_name: "Тестовый продукт",
        amount_rub: 300000,
        term_months: 12,
        rate_annual_pct: 24,
        monthly_payment_rub: 28000,
        reason: "В пределах лимита",
      },
    ],
  },
  events: [],
};
export function props(extra: any = {}) {
  return {
    rows: [
      {
        ...detail.dossier,
        application: detail.application,
        red_reason: "CLIENT_SILENT",
      },
    ],
    detail,
    selected: "q3",
    tab: "queue" as const,
    loading: false,
    detailLoading: false,
    busy: false,
    error: "",
    onSelect() {},
    onTab() {},
    onRetry() {},
    onAction: async () => {},
    ...extra,
  };
}
export function assertGuards(View = ManagerView) {
  for (const status of [
    "draft",
    "info_requested",
    "underwriting",
    "approved",
    "offered",
    "signed",
    "disbursed",
    "rejected",
    "expired",
    "withdrawn",
  ]) {
    const tree = View(
      props({
        detail: { ...detail, application: { ...detail.application, status } },
      }),
    );
    assert.equal(
      elements(tree).find((n) => n.props?.["data-option"])!.props.disabled,
      true,
      status,
    );
    for (const n of elements(tree).filter(
      (n) =>
        n.type === "button" && /Запросить документ|Отказать/.test(textOf(n)),
    ))
      assert.equal(n.props.disabled, true, status + " " + textOf(n));
  }
  for (const limit of [null, undefined, NaN, Infinity, -1, 0, 299999]) {
    const tree = View(
      props({
        detail: {
          ...detail,
          dossier: { ...detail.dossier, limit_now_rub: limit },
        },
      }),
    );
    assert.equal(
      elements(tree).find((n) => n.props?.["data-option"])!.props.disabled,
      true,
      String(limit),
    );
  }
  for (const mode of [{ busy: true }, { detailLoading: true }]) {
    const tree = View(props(mode));
    assert.ok(
      !elements(tree).some(
        (n) => n.props?.["data-option"] && !n.props.disabled,
      ),
    );
  }
  assert.equal(
    elements(
      View(
        props({
          detail: {
            ...detail,
            dossier: { ...detail.dossier, limit_now_rub: 300000 },
          },
        }),
      ),
    ).find((n) => n.props?.["data-option"])!.props.disabled,
    false,
  );
}
test("Q3 manager guards: ten non-queue statuses, unknown/invalid/over limit, equality, busy", () =>
  assertGuards());
test("Q3 manager empty, loading, absent detail/dossier, success and textual alert", () => {
  const cases: [any, RegExp][] = [
    [{ rows: [], detail: null }, /Красных заявок нет/],
    [{ rows: [], tab: "rejected" }, /Отказов нет/],
    [{ loading: true }, /role="status"[^>]*>Загружаем очередь/],
    [{ detailLoading: true }, /Загружаем досье/],
    [{ detail: null }, /Выберите заявку/],
    [{ detail: { ...detail, dossier: null } }, /Досье пока нет/],
    [{}, /Источник недоступен/],
    [
      { error: "Проверяемый текст 422" },
      /role="alert"[^>]*>Проверяемый текст 422/,
    ],
  ];
  for (const [extra, expected] of cases)
    assert.match(renderToStaticMarkup(ManagerView(props(extra))), expected);
});
test("Q3 client cannot render manager controls, unknown and unauthenticated roles denied", () => {
  for (const role of ["client", undefined, "system", "MANAGER"]) {
    const html = renderToStaticMarkup(<ManagerAccess role={role} />);
    assert.match(html, /Доступно только менеджеру/);
    assert.doesNotMatch(html, /manager-queue|Досье заявки|Запросить документ/);
  }
});
test("Q3 manager uses server N/M verbatim and never converts unavailable checks to passed", () => {
  const html = renderToStaticMarkup(ManagerView(props()));
  assert.match(html, /3 из 5/);
  assert.doesNotMatch(html, /Пройдено/);
  const unknown = renderToStaticMarkup(
    ManagerView(props({ rows: [{ application: detail.application }] })),
  );
  assert.match(unknown, /Полнота досье: нет данных/);
});
test("Q3 manager API network, malformed JSON and 401/403/404/409/422 preserve caller error", async () => {
  const old = globalThis.fetch;
  try {
    for (const status of [401, 403, 404, 409, 422]) {
      globalThis.fetch = async () =>
        Response.json({ error: "Причина " + status }, { status });
      await assert.rejects(loadQueue("queue"), new RegExp("Причина " + status));
      await assert.rejects(
        loadApplication("q3"),
        new RegExp("Причина " + status),
      );
      await assert.rejects(
        sendManagerEvent(detail.application, "reject", { reason: "Причина" }),
        new RegExp("Причина " + status),
      );
    }
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    await assert.rejects(loadQueue("queue"), /Сервер недоступен/);
    globalThis.fetch = async () => new Response("<html>upstream</html>");
    await assert.rejects(loadApplication("q3"), /Не удалось прочитать/);
  } finally {
    globalThis.fetch = old;
  }
});
test("Q3 manager retry/select/tab callbacks and accessible names of all native controls", () => {
  const calls: string[] = [];
  const tree = ManagerView(
    props({
      onRetry: () => calls.push("retry"),
      onSelect: (id: string) => calls.push(id),
      onTab: (tab: string) => calls.push(tab),
    }),
  );
  for (const node of elements(tree).filter(
    (n) =>
      n.type === "button" &&
      ["Обновить очередь", "Очередь", "Отказы"].includes(textOf(n).trim()),
  ))
    node.props.onClick();
  elements(tree)
    .find((n) => n.props?.["data-application"])!
    .props.onClick();
  assert.deepEqual(calls, ["retry", "queue", "rejected", "q3"]);
  for (const node of elements(tree).filter((n) => n.type === "button"))
    assert.ok(node.props["aria-label"] || textOf(node).trim());
  for (const node of elements(tree).filter((n) =>
    ["textarea", "select", "input"].includes(n.type),
  )) {
    const label = elements(tree).find(
      (n) => n.type === "label" && elements(n).includes(node),
    );
    assert.ok(
      node.props["aria-label"] || (label && textOf(label).trim()),
      node.props.name,
    );
  }
});
test("Q3 mutation strength: status guard, limit boundary, server N/M and visible errors", () => {
  const mutations: [string, string, (view: typeof ManagerView) => void][] = [
    [
      'p.detail?.application.status === "queued"',
      "true",
      (view) => assertGuards(view),
    ],
    ["option.amount_rub > limit", "false", (view) => assertGuards(view)],
    [
      "{n} из {m}",
      "{m} из {m}",
      (view) => assert.match(renderToStaticMarkup(view(props())), /3 из 5/),
    ],
    [
      "{p.error && (",
      "{false && (",
      (view) =>
        assert.match(
          renderToStaticMarkup(view(props({ error: "mutation-visible" }))),
          /mutation-visible/,
        ),
    ],
  ];
  for (const [from, to, oracle] of mutations) {
    const mutant = subject("src/manager/ManagerWorkspace.tsx", {
      replace: [from, to],
    });
    assert.throws(
      () => oracle(mutant.exports.ManagerView),
      { name: "AssertionError" },
      "survived " + from,
    );
    console.log("KILLED ManagerWorkspace: " + from);
  }
});
