import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--base")) {
  console.error("Usage: node scripts/smoke.mjs [--base http://localhost:4173]");
  process.exit(1);
}
const base = new URL(args[1] || "http://localhost:4173");
let cookie = "";
let failures = 0;
const rows = [];
async function check(name, action) {
  try {
    await action();
    rows.push({ check: name, result: "OK", detail: "" });
  } catch (error) {
    failures++;
    rows.push({ check: name, result: "FAIL", detail: error.message });
  }
}
async function call(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35000),
  });
  return response;
}
for (const path of ["/", "/demo"]) {
  await check(`GET ${path}`, async () => {
    const response = await call(path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<html/i);
  });
}
await check("GET /health", async () => {
  const response = await call("/health");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "ok");
  assert.equal(data.db, "ok");
  assert.ok(["ok", "down", "not_configured"].includes(data.team_api));
});
await check("Регистрация тестового пользователя", async () => {
  const response = await call("/api/auth/register", {
    phone: "79" + String(randomInt(0, 1_000_000_000)).padStart(9, "0"),
    password: randomUUID(),
    profile: {
      name: "Smoke: синтетический пользователь",
      form: "ООО",
      registered: true,
      stage: "operating",
      sector: "Производство",
      ageBand: "3–5 лет",
      result: "Прибыль",
      debt: "Нет",
      intent: "Проверка",
    },
  });
  assert.equal(response.status, 200, await response.text());
  cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  assert.ok(cookie.startsWith("alfa_session="));
});
await check("ИНН из локального мока", async () => {
  const response = await call("/api/lookup", { inn: "9900000001" });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.inn, "9900000001");
  assert.equal(data.demo, true);
  assert.match(data.source, /синтетические данные \(мок\)/);
});
await check("Адаптер командного ядра", async () => {
  const lines = ["date,amount,counterparty,purpose"];
  for (let month = 0; month < 12; month++) {
    const date = `${month < 3 ? 2025 : 2026}-${String(((month + 9) % 12) + 1).padStart(2, "0")}`;
    lines.push(
      `${date}-01,1000000,Покупатель,Оплата по договору`,
      `${date}-10,-300000,Поставщик,Оплата за материалы`,
      `${date}-20,-100000,Арендодатель,Арендная плата`,
    );
  }
  const response = await call("/api/team-score", {
    statement_csv: lines.join("\n"),
    need: {
      purpose: "кассовый разрыв",
      amount_rub: 100000,
      term_months: 12,
      repay_from: "выручка",
      asked_for: "кредит",
    },
    questionnaire: {
      form: "ООО",
      need: "кассовый разрыв",
      sector: "производство",
      years: "больше 3",
      trend: "в плюс",
    },
    confirmed_fields: {},
  });
  assert.ok([200, 502].includes(response.status), `HTTP ${response.status}`);
  const data = await response.json();
  assert.ok(data && typeof data === "object");
  if (response.status === 502) assert.match(data.error, /ядро недоступно/);
  else {
    // по context/api-contract.md статус ядра лежит в core.status, текст для клиента в view.status_text
    assert.equal(typeof data.core?.status, "string");
    assert.equal(typeof data.view?.status_text, "string");
  }
});
console.table(rows);
process.exitCode = failures ? 1 : 0;
