import test from "node:test";
import assert from "node:assert/strict";
import { extract } from "../../server/documents";

test("CSV preserves quoted separators, escaped quotes, CRLF and multiline text", async () => {
  for (const delimiter of [",", ";"]) {
    const source = [
      ["date", "amount", "kind", "counterparty", "purpose"].join(delimiter),
      [
        "2026-02-28",
        '"1 234,50"',
        "operating",
        '"Банк; ООО, ""А"""',
        '"Первая\r\nвторая"',
      ].join(delimiter),
    ].join("\r\n");
    const result = await extract(Buffer.from(source), "statement.csv");
    assert.equal(result.records[0].counterparty, 'Банк; ООО, "А"');
    assert.equal(result.records[0].purpose, "Первая\r\nвторая");
    assert.equal(result.fields.inflow, 1234.5);
  }
});

test("CSV rejects malformed quotes and 50001 operations", async () => {
  for (const row of ['2026-10-22,1,"operating', '2026-10-22,1,"operating"junk'])
    await assert.rejects(
      extract(Buffer.from("date,amount,kind\n" + row), "statement.csv"),
    );
  await assert.rejects(
    extract(
      Buffer.from(
        "date,amount,kind\n" +
          Array(50_001).fill("2026-10-22,1,operating").join("\n"),
      ),
      "statement.csv",
    ),
    /50 000/,
  );
});

test("calendar validation allows leap day and rejects rollover in statements and schedules", async () => {
  const result = await extract(
    Buffer.from("date,amount,kind\n2024-02-29,1,operating"),
    "statement.csv",
  );
  assert.equal(result.records[0].date, "2024-02-29");
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01"])
    for (const source of [
      `date,amount,kind\n${date},1,operating`,
      `date,payment,principal,interest,balance\n${date},1,1,0,0`,
    ])
      await assert.rejects(extract(Buffer.from(source), "statement.csv"));
});
