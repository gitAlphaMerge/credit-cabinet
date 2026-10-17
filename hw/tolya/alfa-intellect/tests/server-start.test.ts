import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("Занятый порт: понятная ошибка и exit 1 без ложного сообщения об успехе", async (t) => {
  const occupied = createServer();
  await new Promise<void>((resolve) =>
    occupied.listen(0, "127.0.0.1", resolve),
  );
  t.after(
    () => new Promise<void>((resolve) => occupied.close(() => resolve())),
  );
  const address = occupied.address();
  assert.ok(address && typeof address !== "string");
  await assert.rejects(
    promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          DATABASE_PATH: ":memory:",
          PORT: String(address.port),
          HOST: "127.0.0.1",
        },
        timeout: 10000,
      },
    ),
    (error: any) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /уже занят/);
      assert.doesNotMatch(error.stdout, /Альфа-Интеллект: http/);
      return true;
    },
  );
});
