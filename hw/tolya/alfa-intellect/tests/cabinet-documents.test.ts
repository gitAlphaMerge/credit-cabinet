import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extract } from "../server/documents";
test("ОФР для коэффициентов: две выручки, прибыль от продаж и границы периодов сохраняются отдельно", async () => {
  const d = await extract(
    await readFile("fixtures/pnl-comparable.csv"),
    "pnl-comparable.csv",
  );
  assert.equal(d.category, "pnl");
  assert.equal(d.fields.salesProfit, 2400000);
  assert.equal(d.fields.profit, 1800000);
  assert.equal(d.fields.previousRevenue, 15000000);
  assert.equal(d.fields.periodStart, "2025-01-01");
});
test("Пустой остаток выписки не становится нулём; комиссии графика входят в сумму", async () => {
  const d = await extract(
    Buffer.from("date,amount,kind,balance\n2026-10-18,100,operating,\n"),
    "statement.csv",
  );
  assert.equal(d.records[0].balance, undefined);
  assert.equal(d.fields.lastBalance, undefined);
  const schedule = await extract(
    Buffer.from(
      "date,payment,principal,interest,fees,balance\n2026-10-21,111,100,10,1,0\n",
    ),
    "schedule.csv",
  );
  assert.equal(schedule.records[0].fees, 1);
  await assert.rejects(
    extract(
      Buffer.from(
        "date,payment,principal,interest,fees,balance\n2026-10-21,110,100,10,1,0\n",
      ),
      "schedule.csv",
    ),
  );
});
