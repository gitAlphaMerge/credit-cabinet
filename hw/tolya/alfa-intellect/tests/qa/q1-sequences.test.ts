import test from "node:test";
import {
  a,
  db,
  owner,
  manager,
  assert,
  create,
  post,
  internal,
  setMode,
  deps,
} from "./q1-harness";
import {
  rules,
  events,
  roles,
  terminals,
  delegated,
  mulberry32,
  minimize,
  type ModelStatus,
  type ModelRole,
} from "./q1-model";

type Step = { event: a.Event; role: ModelRole };
const scenarios = [
  "green",
  "holes",
  "stop",
  "limit",
  "gate_info",
  "gate_stop",
  "bki30",
  "bki90",
] as const;
type Scenario = (typeof scenarios)[number];
function payload(event: string) {
  return {
    consent: true,
    confirmed_fields: { qa: true },
    option_id: "q1-option",
    text: "fixture",
    client_objections: "fixture",
    memo: "fixture",
    code: "0000",
    amount: 300000,
  };
}
function predicted(
  status: ModelStatus,
  step: Step,
  scenario: Scenario,
  http: boolean,
  nudged: boolean,
  hasOption: boolean,
): ModelStatus | undefined {
  // HTTP has no system account. A forged payload actorRole still uses the owned
  // client session; system-only actions fail, regular client actions remain valid.
  const caller = http && step.role === "system" ? "client" : step.role;
  const delegatedCaller =
    http && caller === "client" && delegated.includes(step.event);
  const rule = rules.find(
    (r) => r.event === step.event && r.from.includes(status),
  );
  if (!rule || !rule.callers.includes(delegatedCaller ? "system" : caller))
    return;
  if (step.event === "expire") return; // fresh offer
  // docs/v2-contract.md:45: send_to_underwriting `{ option_id? }`, amount <= limit_now_rub.
  // The fixture option (100 000) fits the limit scenario (100 000); otherwise the
  // queued dossier is incomplete or above limit. HTTP cascades to offered (states.md:141).
  if (step.event === "send_to_underwriting")
    return scenario === "limit" && hasOption
      ? http ? "offered" : "underwriting"
      : undefined;
  if (step.event === "escalate_silent" && !nudged) return;
  if (step.event === "accept_alternative" && !hasOption) return;
  if (["submit", "client_update", "accept_alternative"].includes(step.event)) {
    if (["stop", "gate_stop", "bki90"].includes(scenario)) return "rejected";
    if (["holes", "gate_info", "bki30"].includes(scenario))
      return "info_requested";
    if (scenario === "limit" && step.event !== "accept_alternative")
      return "info_requested";
    return "offered";
  }
  if (step.event === "sign" && http) return "disbursed";
  return rule.outcomes[0];
}

async function play(steps: Step[], scenario: Scenario, http: boolean) {
  setMode(scenario);
  const id = create();
  let status: ModelStatus = "draft",
    nudged = false,
    hasOption = false;
  for (const step of steps) {
    const before = a.applicationOf(db, id),
      oldEvents = a.eventsOf(db, id);
    const expected = predicted(status, step, scenario, http, nudged, hasOption);
    let succeeded = false,
      failure: unknown;
    if (http) {
      const result = await post(
        id,
        step.event,
        { ...payload(step.event), actorRole: step.role },
        step.role === "manager" ? manager : owner,
      );
      succeeded = result.status === 200;
      failure = { status: result.status, body: result.body };
    } else {
      try {
        await internal(id, step.event, payload(step.event), step.role);
        succeeded = true;
      } catch (error) {
        if (!(error instanceof a.ApplicationError)) throw error;
        failure = { status: error.status, message: error.message };
      }
    }
    assert.equal(
      succeeded,
      expected !== undefined,
      JSON.stringify({ step, status, expected, failure, scenario, http }),
    );
    const after = a.applicationOf(db, id),
      journal = a.eventsOf(db, id);
    if (expected === undefined) {
      assert.deepEqual(after, before);
      assert.deepEqual(journal, oldEvents);
    } else {
      assert.equal(after.status, expected);
      assert.equal(
        after.version - before.version,
        journal.length - oldEvents.length,
      );
      status = expected;
      if (step.event === "agent_nudge") nudged = true;
      if (
        [
          "submit",
          "client_update",
          "accept_alternative",
          "request_info",
        ].includes(step.event)
      )
        nudged = false;
      if (
        ["submit", "client_update", "accept_alternative"].includes(step.event)
      )
        hasOption = scenario === "limit" && step.event !== "accept_alternative";
    }
    let replayed: string | null = null;
    for (const [index, entry] of journal.entries()) {
      assert.equal(entry.seq, index + 1);
      assert.equal(entry.from_status, replayed);
      assert.ok(
        rules.some(
          (r) =>
            r.event === entry.event &&
            r.from.includes(replayed as ModelStatus | null) &&
            r.journal === entry.actor_role &&
            r.outcomes.includes(entry.to_status as ModelStatus),
        ),
        JSON.stringify(entry),
      );
      if (replayed && terminals.includes(replayed as ModelStatus))
        assert.fail("terminal state has an outgoing event");
      if (entry.to_status === "approved") {
        assert.equal(replayed, "underwriting");
        const dossier = a.dossierOf(db, id)!;
        assert.equal(dossier.compliance?.gate, "pass");
        assert.equal(dossier.readiness_n, dossier.readiness_m);
      }
      replayed = entry.to_status as string;
    }
    assert.equal(after.status, replayed);
    assert.equal(after.version, journal.length);
    assert.ok(
      a.bankQueue(db, deps).every((r) => r.application.status === "queued"),
    );
  }
}

function generate(seed: number): { steps: Step[]; scenario: Scenario } {
  const random = mulberry32(seed),
    count = 1 + Math.floor(random() * 25);
  const pick = <T>(values: readonly T[]): T =>
    values[Math.floor(random() * values.length)];
  const scenario = pick(scenarios);
  const steps = Array.from({ length: count }, (): Step => ({
    event: pick(events) as a.Event,
    role: pick(roles),
  }));
  if (random() < 0.8) steps[0] = { event: "submit", role: "client" };
  return { steps, scenario };
}

for (const http of [false, true])
  test(
    `500 seeded sequences via ${http ? "HTTP" : "transitionApplication"} against document oracle`,
    { timeout: 180000 },
    async () => {
      const base = Number(process.env.Q1_SEED ?? 20261023) >>> 0;
      const cases = Number(process.env.Q1_CASES ?? 500);
      assert.ok(Number.isInteger(cases) && cases > 0 && cases <= 500);
      const failures: {
        seed: number;
        steps: Step[];
        scenario: Scenario;
        error: unknown;
      }[] = [];
      for (let i = 0; i < cases; i++) {
        const seed = (base + i) >>> 0,
          { steps, scenario } = generate(seed);
        try {
          await play(steps, scenario, http);
        } catch (error) {
          failures.push({ seed, steps, scenario, error });
        }
      }
      if (failures.length) {
        const first = failures[0];
        const signature = (error: unknown) =>
          String(error).match(/"step":(\{[^}]+\})/)?.[1] ?? String(error);
        const minimal = await minimize(first.steps, async (steps) => {
          try {
            await play(steps, first.scenario, http);
            return false;
          } catch (error) {
            return signature(error) === signature(first.error);
          }
        });
        assert.fail(
          `seed=${first.seed}; transport=${http ? "HTTP" : "internal"}; scenario=${first.scenario}; failures=${failures.length}/${cases}; 1-minimal=${JSON.stringify(minimal)}; original=${String(first.error)}; reproduce PowerShell: $env:Q1_SEED='${first.seed}'; $env:Q1_CASES='1'; node --experimental-transform-types --import ./tests/qa/q1-loader.ts --test --test-force-exit tests/qa/q1-sequences.test.ts`,
        );
      }
    },
  );
