import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
process.env.DATABASE_PATH = ":memory:";
process.env.AI_PROVIDER = "";
process.env.TEAM_AGENT_URL = "";
process.env.EGR_PROVIDER = "mock";
const root = fileURLToPath(new URL("../../../../..", import.meta.url));
export const clock = () => new Date("2026-10-23T12:00:00Z");
export async function setup() {
  const store = await import("../../server/store");
  const api = await import("../../server/applications");
  const seed = await import("../../scripts/seed-manager");
  return { ...store, api, ...seed };
}
// Intercept only HTTP transport: production httpCoreClient still serializes and
// validates, production cores adapter executes the real Liza core without sockets.
export function realCoreTransport() {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).pathname, "/score");
    calls++;
    const run = spawnSync(
      "python",
      [
        "-B",
        "-X",
        "utf8",
        "-c",
        [
          "import sys,json,os",
          "sys.path.insert(0,os.path.join(sys.argv[1],'services','ml-model'))",
          "import cores",
          "r=json.load(sys.stdin)",
          "c=cores.REGISTRY['liza'][0](r['statement_csv'],r['need'],r['questionnaire'])",
          "print(json.dumps({'core':c},ensure_ascii=False))",
        ].join("\n"),
        root,
      ],
      {
        input: String(init?.body),
        encoding: "utf8",
        env: { ...process.env, CORE_ID: "liza" },
      },
    );
    assert.equal(run.status, 0, run.stderr);
    return new Response(run.stdout, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = previous;
    },
  };
}
export function validInn(inn: string) {
  const digits = [...inn].map(Number);
  const digit = (w: number[]) =>
    (w.reduce((s, v, i) => s + v * digits[i], 0) % 11) % 10;
  return /^\d{10}$/.test(inn)
    ? digit([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9]
    : /^\d{12}$/.test(inn) &&
        digit([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10] &&
        digit([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11];
}
