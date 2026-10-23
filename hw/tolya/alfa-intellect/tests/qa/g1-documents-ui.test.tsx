import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { elements, textOf, subject, workspace } from "./q3-harness";
import {
  documentStatus,
  type TimedDocument,
} from "../../server/document-policy";

const doc = (
  category: string,
  overrides: Partial<TimedDocument> = {},
): TimedDocument => ({
  id: category,
  category,
  name: "данные.csv",
  period: "2026-10-01 - 2026-10-24",
  fields: {},
  confirmed: true,
  createdAt: "2026-10-24T10:00:00Z",
  currency: "RUB",
  mime: "text/csv",
  ...overrides,
});
const cards = (tree: any) =>
  elements(tree).filter(
    (n) => n.type === "article" && n.props.className === "document-card",
  );

test("G1 date statuses include expiry boundary, unknown dates, pending and non-applicable IP", () => {
  const d = doc("statement");
  assert.equal(
    documentStatus(d, "ООО", "statement", new Date("2026-11-23T23:59:59Z"))
      .label,
    "Актуален до 23.11.2026",
  );
  assert.equal(
    documentStatus(d, "ООО", "statement", new Date("2026-11-24T00:00:00Z"))
      .label,
    "Устарел, обновите",
  );
  assert.equal(
    documentStatus(
      doc("statement", { period: "неизвестен" }),
      "ООО",
      "statement",
    ).code,
    "stale",
  );
  assert.equal(
    documentStatus(doc("statement", { confirmed: false }), "ООО", "statement")
      .label,
    "На проверке",
  );
  assert.equal(documentStatus(undefined, "ООО", "plan").label, "Нет");
  assert.equal(
    documentStatus(doc("balance"), "ИП", "balance").label,
    "Не нужен для ИП",
  );
});

test("G1 renders dates, missing, stale, pending, distinct icons and source-limited pull controls", () => {
  const w = workspace();
  w.state.profile.form = "ООО";
  w.state.profile.registered = true;
  const today = new Date().toISOString().slice(0, 10);
  w.state.documents = [
    doc("statement", {
      period: `${today} - ${today}`,
      createdAt: new Date().toISOString(),
    }),
    doc("balance", { period: "2020" }),
    doc("pnl", { confirmed: false }),
  ];
  const tree = subject("src/Profile.tsx", { workspace: w }).render(
    "ProfilePage",
  );
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Актуален до/);
  assert.match(html, /Устарел, обновите/);
  assert.match(html, /На проверке/);
  assert.match(html, /Годен до/);
  const all = cards(tree);
  assert.equal(all.length, 6);
  assert.equal(
    new Set(
      all.map((c) => elements(c).find((n) => n.type === "img")?.props.src),
    ).size,
    6,
  );
  for (const card of all) {
    const title = textOf(elements(card).find((n) => n.type === "h3"));
    const buttons = elements(card).filter(
      (n) => typeof n.props?.onClick === "function",
    );
    const pulls = buttons.filter((n) => /Подтянуть/.test(textOf(n)));
    if (/Финансовая модель|Бизнес-план|График кредитных платежей/.test(title))
      assert.equal(pulls.length, 0);
    assert.equal(
      elements(card).filter(
        (n) => n.props?.className === "button" || n.type?.name === "Button",
      ).length,
      1,
    );
  }
});

test("G1 IP balance and PNL have no upload, template or pull controls", () => {
  const w = workspace();
  w.state.profile.form = "ИП";
  const tree = subject("src/Profile.tsx", { workspace: w }).render(
    "ProfilePage",
  );
  for (const card of cards(tree).slice(1, 3)) {
    assert.match(textOf(card), /Не нужен для ИП/);
    assert.equal(
      elements(card).filter((n) => n.props?.onClick || n.type === "a").length,
      0,
    );
  }
});

test("G1 pull reviews the unconfirmed response, locks duplicate clicks and shows failures", async () => {
  const w = workspace();
  w.state.documents = [];
  w.state.profile.form = "ООО";
  w.state.profile.registered = true;
  const imported = doc("balance", { confirmed: false });
  let resolve!: (v: any) => void,
    calls = 0,
    reviewed: any,
    error = "";
  w.act = async (path, body) => {
    calls++;
    assert.equal(path, "/documents/import");
    assert.deepEqual(body, { category: "balance" });
    return new Promise((done) => {
      resolve = done;
    });
  };
  w.reviewDocument = (d) => {
    reviewed = d;
  };
  w.error = (value) => {
    error = value;
  };
  const component = subject("src/Profile.tsx", { workspace: w });
  const click = () =>
    elements(cards(component.render("ProfilePage"))[1])
      .find((n) => textOf(n) === "Подтянуть" && n.props.onClick)!
      .props.onClick();
  const firstClick = elements(cards(component.render("ProfilePage"))[1]).find(
    (n) => textOf(n) === "Подтянуть" && n.props.onClick,
  )!.props.onClick;
  firstClick();
  firstClick();
  assert.equal(calls, 1);
  assert.ok(
    elements(cards(component.render("ProfilePage"))[1]).find(
      (n) => textOf(n) === "Подтягиваем…" && n.props.disabled,
    ),
  );
  resolve(imported);
  await new Promise((done) => setImmediate(done));
  assert.equal(reviewed, imported);
  w.act = async () => {
    throw new Error("Источник временно недоступен");
  };
  click();
  await new Promise((done) => setImmediate(done));
  assert.equal(error, "Источник временно недоступен");
  assert.equal(component.states.get(8), null);
});

test("G1 history shows previous file links without replacing the current action", () => {
  const w = workspace();
  w.state.documents = [
    doc("statement", {
      versions: [doc("statement", { id: "old", name: "июль.csv" })],
    }),
  ];
  const tree = subject("src/Profile.tsx", { workspace: w }).render(
    "ProfilePage",
  );
  const first = cards(tree)[0];
  assert.match(textOf(first), /Предыдущие версии: 1/);
  assert.ok(
    elements(first).some(
      (n) => n.props?.href === "/api/documents/old/download",
    ),
  );
});
