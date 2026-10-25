import test, { after } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { missingDataFor, mergeMissingData } from "../server/mvp2";
import { MissingDataStep } from "../src/MissingDataStep";
import { journeyView } from "../shared/journey-view";
import type { MissingField, MvpApplication } from "../shared/mvp2";

const application = (missing: MissingField[] = []) =>
  ({ id: "a", missing, financial: { limit: 1000000, limitAfter: 1500000 } }) as MvpApplication;

test("critical request precedes larger limit opportunity and keeps distinct explanations", () => {
  const items = missingDataFor(application([
    { id: "accounts:1:history", key: "accounts", label: "История", title: "История", why: "Мало месяцев", effect: "Проверим оборот", section: 1, status: "todo" },
    { id: "accounts:1:recent", key: "accounts", label: "Последний месяц", title: "Последний месяц", why: "Нет свежей выписки", effect: "Уточним лимит", section: 1, status: "todo" },
    { id: "consents", key: "consents", label: "Согласия", title: "Согласия", why: "Без согласия проверка невозможна", effect: "Продолжим проверку", section: 0, status: "todo" },
  ]));
  assert.deepEqual(items.map((item) => item.id), ["consents", "accounts:1:history", "accounts:1:recent"]);
  assert.notEqual(items[1].why, items[2].why);
});

test("uploaded and skipped items stay closed; new request does not duplicate them", () => {
  const before: MissingField[] = [
    { id: "account", key: "accounts", label: "CSV", title: "CSV", why: "Нужна выписка", effect: "Уточним лимит", section: 1, status: "todo" },
    { id: "debt", key: "debt", label: "Долг", title: "Долг", why: "Нужен остаток", effect: "Уточним нагрузку", section: 2, status: "skipped" },
  ];
  const merged = mergeMissingData(before, [before[0]], ["accounts"]);
  assert.deepEqual(merged.map((item) => item.status), ["uploaded", "skipped"]);
  assert.equal(merged.filter((item) => item.id === "account").length, 1);
  const accounts = mergeMissingData([
    { ...before[0], id: "accounts:first:file" },
    { ...before[0], id: "accounts:second:file" },
  ], [], ["accounts:first:"]);
  assert.equal(accounts.find((item) => item.id === "accounts:first:file")?.status, "uploaded");
  assert.equal(accounts.find((item) => item.id === "accounts:second:file")?.status, "todo");
});

test("empty list skips the supplement; manager request joins existing list", () => {
  assert.deepEqual(missingDataFor(application()), []);
  assert.equal(journeyView({ ...application(), lifecycle: "DECIDED", decision: "ADDITIONAL_DATA_REQUIRED" }, { applicationId: "a", view: "supplement" }), "decision");
  const manager: MissingField = { id: "manager:debt:1", key: "debt", label: "Уточните долг", title: "Уточните долг", why: "Менеджеру нужен остаток", effect: "Заявку рассмотрят с уточнённой нагрузкой", section: 2, status: "todo" };
  const merged = mergeMissingData([{ ...manager, id: "existing" }], [manager]);
  assert.deepEqual(merged.map((item) => item.id), ["existing", "manager:debt:1"]);
});

test("client renders one active item with the rest collapsed", () => {
  const items = missingDataFor(application([
    { id: "one", key: "debt", label: "Долг", title: "Долг", why: "Для оценки нагрузки", effect: "Уточним лимит", section: 2, status: "todo" },
    { id: "two", key: "accounts", label: "Выписка", title: "Выписка", why: "Для оборота", effect: "Проверим доходы", section: 1, status: "todo" },
  ]));
  const html = renderToStaticMarkup(createElement(MissingDataStep, { items, onSkip: () => {} }));
  assert.equal((html.match(/data-active="true"/g) ?? []).length, 1);
  assert.match(html, /Подать без этого/);
  assert.match(html, /<details/);
});

test("skipping the last open request moves the real MVP2 application forward", async () => {
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "mvp2-missing-")), "test.sqlite");
  delete process.env.TEAM_AGENT_URL;
  delete process.env.OPENAI_API_KEY;
  const { app } = await import("../server/app");
  const { db } = await import("../server/store");
  after(() => db.close());
  const client = request.agent(app);
  const boot = await client.post("/api/journey/session").send({}).expect(200);
  const created = (await client.post("/api/journey/complete").send({ answers: {
    industry: "Производство", age: "Более 3 лет", purpose: "Текущие расходы",
    amountRange: "3–5 млн ₽", amount: 3000000, term: 12,
    usage: "Всё сразу", repayment: "Регулярная выручка",
  }}).expect(200)).body as MvpApplication;
  const item: MissingField = { id: "manual:one", key: "debt", label: "Укажите долг", title: "Укажите долг", why: "Нужна оценка долговой нагрузки", effect: "Банк уточнит лимит", section: 2, status: "todo" };
  const current = { ...created, lifecycle: "DECIDED", decision: "ADDITIONAL_DATA_REQUIRED", missing: [item] };
  db.prepare("UPDATE mvp2_dossiers SET data=? WHERE application_id=?").run(JSON.stringify(current), created.id);
  const skipped = (await client.post(`/api/mvp2/applications/${created.id}/missing/${item.id}/skip`).send({ version: created.version }).expect(200)).body as MvpApplication;
  assert.equal(skipped.missing[0].status, "skipped");
  assert.equal(skipped.decision, "MANAGER_REVIEW_REQUIRED");
  assert.equal(skipped.lifecycle, "DECIDED");
  const meeting = { ...skipped, lifecycle: "MEETING_SCHEDULED", decision: "MANAGER_REVIEW_REQUIRED" };
  db.prepare("UPDATE mvp2_dossiers SET data=? WHERE application_id=?").run(JSON.stringify(meeting), created.id);
  db.prepare("UPDATE users SET role='manager' WHERE id=?").run(boot.body.workspaceId);
  const { managerMvp } = await import("../server/mvp2");
  const requested = managerMvp(db, boot.body.workspaceId, created.id, skipped.version, "ADDITIONAL_DATA_REQUIRED", "Уточните текущий долг для проверки нагрузки", "debt");
  assert.equal(requested.missing.length, 2);
  assert.equal(requested.missing[0].status, "todo");
  assert.ok(requested.missing.some((entry) => entry.id?.startsWith("manager:") && entry.why?.includes("текущий долг")));
});
