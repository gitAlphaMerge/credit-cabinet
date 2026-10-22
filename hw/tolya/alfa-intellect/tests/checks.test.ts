import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import request from "supertest";
import {
  checkCreditHistory,
  checkAml,
  checkTransparentBusiness,
  checkBankruptcy,
  runChecks,
} from "../server/checks";
import { RegistryError } from "../server/registry";

const source = "синтетические данные (мок)";
const scenarios = [
  {
    key: "bki",
    check: checkCreditHistory,
    bad: "9900000011",
    unavailable: "9900000012",
  },
  { key: "aml", check: checkAml, bad: "9900000021", unavailable: "9900000022" },
  {
    key: "fns",
    check: checkTransparentBusiness,
    bad: "9900000031",
    unavailable: "9900000032",
  },
] as const;

for (const scenario of scenarios) {
  test(`${scenario.key}: ok, bad с причиной, unavailable без исключения`, async () => {
    for (const [inn, status] of [
      ["9900000001", "ok"],
      [scenario.bad, "bad"],
      [scenario.unavailable, "unavailable"],
    ] as const) {
      const result = await scenario.check(inn);
      assert.equal(result.status, status);
      assert.equal(result.source, source);
      if (result.status === "bad") {
        assert.match(result.reasonCode, /^[A-Z][A-Z0-9_]+$/);
        assert.ok(result.managerText.length > 20);
      }
      if (result.status === "unavailable") {
        assert.match(result.managerText, /недоступен/);
        assert.equal("data" in result, false);
      }
    }
  });
}

test("runChecks сохраняет остальные результаты при недоступности любой проверки", async () => {
  for (const scenario of scenarios) {
    const results = await runChecks(scenario.unavailable);
    assert.equal(results[scenario.key].status, "unavailable");
    for (const key of ["bki", "aml", "fns"] as const)
      if (key !== scenario.key) assert.equal(results[key].status, "ok");
  }
});

test("Все четыре мока ЕГР имеют разные детерминированные наборы; наружу не уходит fetch", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Network forbidden");
  });
  const companies = JSON.parse(
    readFileSync(new URL("../fixtures/egr-mock.json", import.meta.url), "utf8"),
  ) as { inn: string }[];
  const combinations = new Set<string>();
  const allCombinations = new Set<string>();
  for (const { inn } of companies) {
    const first = await runChecks(inn);
    assert.deepEqual(await runChecks(inn), first);
    allCombinations.add(JSON.stringify(Object.values(first).map((r) => r.status)));
    if (
      ["9900000001", "9900000002", "990000000001", "990000000002"].includes(inn)
    )
      combinations.add(
        JSON.stringify(Object.values(first).map((r) => r.status)),
      );
    for (const result of Object.values(first))
      assert.equal(result.source, source);
  }
  for (const scenario of scenarios) {
    await runChecks(scenario.bad);
    await runChecks(scenario.unavailable);
  }
  assert.equal(combinations.size, 4);
  assert.equal(allCombinations.size, 5);
  assert.equal(calls, 0);
});

test("bankruptcy: explicit clean and active scenarios are independent copies", async () => {
  assert.equal((await checkBankruptcy("9900000001")).status, "ok");
  const result = await checkBankruptcy("9900000042");
  assert.equal(result.status, "bad");
  if (result.status !== "bad") return;
  assert.equal(result.data.active, true);
  assert.equal(result.reasonCode, "COMPLIANCE_BANKRUPTCY");
  result.data.active = false;
  const again = await checkBankruptcy("9900000042");
  assert.ok(again.status === "bad" && again.data.active);
});

test("Неизвестный и неполный ИНН: понятные 404/422 как у registry", async () => {
  for (const check of [
    checkCreditHistory,
    checkAml,
    checkTransparentBusiness,
    runChecks,
  ]) {
    await assert.rejects(
      check("7712345678"),
      (e: unknown) =>
        e instanceof RegistryError &&
        e.status === 404 &&
        /локальном моке/.test(e.message),
    );
    await assert.rejects(
      check("123"),
      (e: unknown) =>
        e instanceof RegistryError &&
        e.status === 422 &&
        /10 цифр/.test(e.message),
    );
  }
});

test("Данные БКИ правдоподобны и не мутируют между вызовами", async () => {
  const fixtureRows = JSON.parse(
    readFileSync(
      new URL("../fixtures/checks-mock.json", import.meta.url),
      "utf8",
    ),
  ) as { inn: string }[];
  for (const { inn } of fixtureRows) {
    const result = await checkCreditHistory(inn);
    if (result.status === "unavailable") continue;
    const data = result.data;
    assert.ok(Number.isInteger(data.openLoans) && data.openLoans >= 0);
    assert.ok(
      Number.isInteger(data.overdue30Plus12m) &&
        data.overdue30Plus12m >= data.overdue90Plus12m,
    );
    assert.ok(
      Number.isInteger(data.overdue90Plus12m) && data.overdue90Plus12m >= 0,
    );
    assert.ok(data.debtBurdenRatio >= 0 && data.debtBurdenRatio <= 1);
    data.openLoans = 999;
    const again = await checkCreditHistory(inn);
    assert.ok(again.status !== "unavailable" && again.data.openLoans !== 999);
  }
});

test("GET /api/checks/:inn: сессия, fallback без роли, manager после добавления роли, ошибки ИНН", async () => {
  process.env.DATABASE_PATH = ":memory:";
  const { app } = await import("../server/app");
  const { db, session } = await import("../server/store");
  await request(app).get("/api/checks/9900000001").expect(401);
  await request(app)
    .get("/api/checks/9900000001")
    .set("Cookie", "alfa_session=invalid")
    .expect(401);
  db.prepare("INSERT INTO users(id,phone,password,state) VALUES(?,?,?,?)").run(
    "checks-user",
    "checks-phone",
    "unused",
    "{}",
  );
  const cookie = "alfa_session=" + session("checks-user");
  const hasRole = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .some((column) => column.name === "role");
  if (!hasRole) {
    const response = await request(app)
      .get("/api/checks/9900000001")
      .set("Cookie", cookie)
      .expect(200);
    assert.deepEqual(response.body, await runChecks("9900000001"));
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client'");
  }
  await request(app)
    .get("/api/checks/9900000001")
    .set("Cookie", cookie)
    .expect(403);
  db.prepare("UPDATE users SET role='manager' WHERE id=?").run("checks-user");
  const response = await request(app)
    .get("/api/checks/9900000012")
    .set("Cookie", cookie)
    .expect(200);
  assert.deepEqual(response.body, await runChecks("9900000012"));
  const unknown = await request(app)
    .get("/api/checks/7712345678")
    .set("Cookie", cookie)
    .expect(404);
  assert.match(unknown.body.error, /локальном моке/);
  await request(app).get("/api/checks/123").set("Cookie", cookie).expect(422);
});
