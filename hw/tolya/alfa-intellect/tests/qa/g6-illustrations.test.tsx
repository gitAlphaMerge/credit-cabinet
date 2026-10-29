import { ProfilePage } from "../../src/Profile";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Illustration,
  StatusIllustration,
  ProductIllustration,
  DocumentIllustration,
  CheckIllustration,
  illustrationTitles,
  statusIllustrations,
  productIllustrations,
} from "../../src/Illustration";
import { ApplicationStatusView } from "../../src/ApplicationStatus";
import { ManagerView } from "../../src/manager/ManagerWorkspace";
import { fundingCatalog } from "../../shared/financing";
import { WorkspaceContext } from "../../src/context";
import { subject, workspace } from "./q3-harness";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const contract = read("../../../docs/v2-contract.md");
const statuses = contract
  .match(
    /`(draft queued info_requested underwriting approved offered signed disbursed rejected expired withdrawn)`/,
  )![1]
  .split(" ");
const images = (html: string) =>
  [...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)].map((m) => m[1]);
function localImage(path: string) {
  assert.match(
    path,
    /^\/icons\/(products|status|docs|checks|empty)\/[\w-]+\.svg$/,
  );
  assert.ok(existsSync(new URL("public" + path, root)), path);
}
const idle = {
  rows: [],
  selected: "",
  detail: null,
  tab: "queue" as const,
  loading: false,
  detailLoading: false,
  error: "",
  busy: false,
  onSelect() {},
  onTab() {},
  onRetry() {},
  async onAction() {},
};

test("G6 all 11 frozen statuses have existing images on client, queue and dossier", () => {
  assert.equal(statuses.length, 11);
  assert.deepEqual(
    Object.keys(statusIllustrations).sort(),
    [...statuses].sort(),
  );
  for (const status of statuses) {
    const expected = images(
      renderToStaticMarkup(<StatusIllustration status={status} decorative />),
    )[0];
    localImage(expected);
    const application = { id: "g6", status, version: 1, amount: 300000 };
    const detail = { application, dossier: null, events: [] };
    const client = renderToStaticMarkup(
      <ApplicationStatusView
        detail={detail}
        busy={false}
        onAction={async () => {}}
      />,
    );
    const manager = renderToStaticMarkup(
      <ManagerView
        {...idle}
        rows={[{ application }]}
        selected="g6"
        detail={detail}
      />,
    );
    assert.ok(images(client).includes(expected), "client " + status);
    assert.equal(
      images(manager).filter((src) => src === expected).length,
      2,
      "queue + dossier " + status,
    );
  }
});

test("G6 every registry path exists and accessible names exactly match SVG titles", () => {
  const files = ["products", "status", "docs", "checks", "empty"].flatMap(
    (group) =>
      readdirSync(new URL("public/icons/" + group, root))
        .filter((f) => f.endsWith(".svg"))
        .map((f) => group + "/" + f.slice(0, -4)),
  );
  assert.equal(files.length, 38);
  assert.deepEqual(Object.keys(illustrationTitles).sort(), files.sort());
  for (const key of files) {
    const title = read("public/icons/" + key + ".svg").match(
      /<title>(.*?)<\/title>/,
    )![1];
    assert.equal(
      illustrationTitles[key as keyof typeof illustrationTitles],
      title,
      key,
    );
  }
  const html = renderToStaticMarkup(
    <Illustration group="docs" name="statement" />,
  );
  assert.match(html, /alt="Выписка"/);
  assert.doesNotMatch(html, /<svg|data:image|fetch\(/);
  for (const size of [32, 48, 64, 96] as const) {
    const decorative = renderToStaticMarkup(
      <Illustration group="docs" name="statement" size={size} decorative />,
    );
    assert.match(decorative, /alt=""/);
    assert.match(decorative, /aria-hidden="true"/);
    assert.ok(decorative.includes(`width="${size}" height="${size}"`));
    assert.match(decorative, /background:transparent/);
    assert.doesNotMatch(decorative, /background:#fff/);
    assert.match(decorative, /flex-shrink:0/);
  }
});

test("G6 catalog IDs and migration IDs use one table; unknown and hostile IDs use neutral fallback", () => {
  const catalog = JSON.parse(read("../../../data/catalog/products.json"));
  const ids = [
    ...catalog.products.map((p: { id: string }) => p.id),
    ...fundingCatalog.map((p) => p.id),
    "WORKING",
    "INVEST",
    "RCL",
    "NCL",
    "OVERDRAFT",
    "REFI",
  ];
  for (const id of ids) {
    assert.ok(Object.hasOwn(productIllustrations, id), id);
    images(
      renderToStaticMarkup(<ProductIllustration productId={id} decorative />),
    ).forEach(localImage);
  }
  for (const id of [
    undefined,
    "NEW_PRODUCT",
    "../secret",
    "__proto__",
    "constructor",
  ]) {
    const paths = images(
      renderToStaticMarkup(<ProductIllustration productId={id} />),
    );
    assert.deepEqual(paths, ["/icons/docs/questionnaire.svg"]);
    paths.forEach(localImage);
  }
});

test("G6 map lists only real assets and accounts for every one of 38 images", () => {
  const map = read("docs/design/icon-map.md");
  const paths = [
    ...new Set([...map.matchAll(/\/icons\/[\w/-]+\.svg/g)].map((m) => m[0])),
  ];
  assert.equal(paths.length, 38);
  paths.forEach(localImage);
  for (const screen of [
    "Landing",
    "Onboarding",
    "Cabinet",
    "Financing",
    "SelectionResult",
    "ApplicationStatus",
    "Profile",
    "Chat",
    "ManagerWorkspace",
  ])
    assert.ok(map.includes(screen), screen);
  assert.match(map, /Покрытие: \*\*\d+\/38\*\*/);
});

test("G6 manager empty, error, compliance and document states retain text and local illustrations", () => {
  const empty = renderToStaticMarkup(<ManagerView {...idle} />);
  assert.ok(images(empty).includes("/icons/empty/ready.svg"));
  assert.match(empty, /Красных заявок нет/);
  const failed = renderToStaticMarkup(
    <ManagerView {...idle} error="Сервер недоступен" />,
  );
  assert.ok(images(failed).includes("/icons/empty/network.svg"));
  assert.match(failed, /role="alert"/);
  const application = {
    id: "g6",
    status: "queued",
    version: 1,
    amount: 300000,
  };
  const detail = {
    application,
    events: [],
    dossier: {
      checks: ["egrul", "fns", "bankruptcy", "aml"].map((key) => ({
        key,
        status: "unavailable",
        managerText: key,
        source: "мок",
        checkedAt: "2026-10-24",
      })),
      documents: [
        {
          category: "statement",
          status: "expired",
          documentDate: "2024-01-01",
          ageDays: 1000,
          ttlDays: 90,
        },
      ],
    },
  };
  const html = renderToStaticMarkup(
    <ManagerView
      {...idle}
      rows={[{ application }]}
      selected="g6"
      detail={detail as any}
    />,
  );
  for (const key of ["egrul", "fns", "bankruptcy", "aml"])
    assert.ok(images(html).includes(`/icons/checks/${key}.svg`));
  assert.ok(images(html).includes("/icons/docs/statement.svg"));
  assert.match(html, /Источник недоступен/);
  assert.match(html, /Устарел/);
  assert.doesNotMatch(html, /<img[^>]*alt="(ФНС|Выписка)"/);
});

test("G6 document types, unknown check and unknown status never form broken image URLs", () => {
  for (const category of [
    "statement",
    "balance",
    "pnl",
    "plan",
    "schedule",
    "contract_main_customer",
    "reconciliation_act",
    "model",
    "unknown",
    "__proto__",
  ]) {
    images(
      renderToStaticMarkup(
        <DocumentIllustration category={category} decorative />,
      ),
    ).forEach(localImage);
  }
  images(renderToStaticMarkup(<StatusIllustration status="unknown" />)).forEach(
    localImage,
  );
  images(renderToStaticMarkup(<CheckIllustration check="unknown" />)).forEach(
    localImage,
  );
});

test("G6 client empty, upload and profile states use decorative images beside existing text", () => {
  const w = workspace();
  w.config.role = "client";
  w.state.credit = null;
  w.state.documents = [];
  w.state.selections = [];
  const render = (path: string, name: string, states = {}, props = {}) => {
    const tree = subject(path, { workspace: w, states }).render(name, props);
    return renderToStaticMarkup(
      <WorkspaceContext.Provider value={w}>{tree}</WorkspaceContext.Provider>,
    );
  };
  const empty = render("src/ApplicationStatus.tsx", "ApplicationStatus", {
    3: false,
  });
  assert.ok(images(empty).includes("/icons/empty/applications.svg"));
  assert.match(empty, /Заявок пока нет/);
  const history = render("src/Financing.tsx", "Financing", { 0: "history" });
  assert.ok(images(history).includes("/icons/empty/applications.svg"));
  const profile = renderToStaticMarkup(<WorkspaceContext.Provider value={w}><ProfilePage/></WorkspaceContext.Provider>);
  for (const name of [
    "statement",
    "balance",
    "income",
    "questionnaire",
    "business-plan",
    "debt-schedule",
  ]) {
    assert.ok(images(profile).includes(`/icons/docs/${name}.svg`), name);
  }
  const application = {
    id: "g6",
    status: "info_requested",
    version: 1,
    amount: 300000,
  };
  const detail = { application, dossier: { holes: ["statement"] }, events: [] };
  const upload = renderToStaticMarkup(
    <ApplicationStatusView
      detail={detail}
      busy={false}
      onAction={async () => {}}
    />,
  );
  assert.ok(images(upload).includes("/icons/empty/upload.svg"));
  assert.match(upload, /Документов пока нет/);
});

test("G6 documented 36 of 38 assets are reachable through real screen renders", () => {
  const used = new Set<string>();
  const collect = (html: string) =>
    images(html).forEach((path) => {
      localImage(path);
      used.add(path);
    });
  for (const status of statuses) {
    collect(
      renderToStaticMarkup(
        <ApplicationStatusView
          detail={{
            application: { id: "g6", status, version: 1, amount: 1 },
            dossier: null,
            events: [],
          }}
          busy={false}
          onAction={async () => {}}
        />,
      ),
    );
  }
  collect(renderToStaticMarkup(<ManagerView {...idle} />));
  collect(renderToStaticMarkup(<ManagerView {...idle} error="Ошибка" />));
  const application = { id: "g6", status: "queued", version: 1, amount: 1 };
  const detail = {
    application,
    events: [],
    dossier: {
      stops_fired: ["BKI_OVERDUE_90_PLUS"],
      checks: ["egrul", "fns", "bankruptcy", "aml"].map((key) => ({
        key,
        status: "bad",
        managerText: key,
        source: "мок",
        checkedAt: "2026-10-24",
      })),
      documents: [
        "statement",
        "balance",
        "pnl",
        "model",
        "plan",
        "schedule",
        "contract_main_customer",
        "reconciliation_act",
      ].map((category) => ({
        category,
        documentDate: null,
        status: "unknown",
        ageDays: null,
        ttlDays: 90,
      })),
      alternatives: Object.keys(productIllustrations).map((id) => ({
        product_id: id,
        option_id: id,
        product_name: id,
        kind: "smaller_amount",
        amount_rub: 1,
        term_months: 1,
        rate_annual_pct: 1,
        monthly_payment_rub: 1,
        reason: "мок",
      })),
    },
  };
  collect(
    renderToStaticMarkup(
      <ManagerView
        {...idle}
        rows={[{ application }]}
        selected="g6"
        detail={detail as any}
      />,
    ),
  );
  const w = workspace();
  w.config.role = "client";
  const tree = subject("src/ApplicationStatus.tsx", {
    workspace: w,
    states: { 3: false },
  }).render("ApplicationStatus");
  collect(
    renderToStaticMarkup(
      <WorkspaceContext.Provider value={w}>{tree}</WorkspaceContext.Provider>,
    ),
  );
  assert.equal(used.size, 36);
  const map = read("docs/design/icon-map.md");
  assert.ok(map.includes(`Покрытие: **${used.size}/38**`));
  const unused = Object.keys(illustrationTitles)
    .map((key) => "/icons/" + key + ".svg")
    .filter((path) => !used.has(path));
  assert.deepEqual(unused.sort(), [
    "/icons/empty/notifications.svg",
    "/icons/status/queued-sent.svg",
  ]);
});
