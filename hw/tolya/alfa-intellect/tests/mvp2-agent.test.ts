import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("MVP2 team agent calls a guarded model; offline/unsafe answers are not templates", () => {
  const result = spawnSync(
    "python3",
    [fileURLToPath(new URL("./mvp2_agent_checks.py", import.meta.url))],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 5 tests/);
});
