import test from "node:test";
import assert from "node:assert/strict";
import { extract } from "../../server/documents";
import { seed, csv } from "./q2-harness";
const message = `seed=${seed}`;

test("semicolon and comma CSV must preserve statement records", async () => {
  const source = csv();
  assert.deepEqual(
    await extract(Buffer.from(source.replaceAll(",", ";")), "statement.csv"),
    await extract(Buffer.from(source), "statement.csv"),
    message,
  );
});

test("CP1251 statement must preserve counterparty and enforcement purpose", async () => {
  const source =
    "date,amount,counterparty,purpose,kind\n2026-10-22,-100,Банк,ФССП,operating";
  const bytes = Buffer.from(
    [...source].map((c) =>
      c === "Ё"
        ? 0xa8
        : c === "ё"
          ? 0xb8
          : c.charCodeAt(0) >= 0x410 && c.charCodeAt(0) <= 0x44f
            ? c.charCodeAt(0) - 0x350
            : c.charCodeAt(0),
    ),
  );
  assert.deepEqual(
    await extract(bytes, "statement.csv"),
    await extract(Buffer.from(source), "statement.csv"),
    message,
  );
});

test("impossible calendar date is not a valid operation", async () => {
  await assert.rejects(
    extract(
      Buffer.from("date,amount,kind\n2026-02-30,1000,operating"),
      "statement.csv",
    ),
    message,
  );
});

test("50000 operations plus header fit the advertised row limit", async () => {
  const source =
    "date,amount,kind\n" +
    Array(50_000).fill("2026-10-22,1,operating").join("\n");
  assert.ok(Buffer.byteLength(source) < 8 * 1024 * 1024, message);
  const result = await extract(Buffer.from(source), "statement.csv");
  assert.equal(result.fields.operations, 50_000, message);
});
