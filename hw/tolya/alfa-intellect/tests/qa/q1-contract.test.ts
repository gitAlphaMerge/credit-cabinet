import test from "node:test";
import assert from "node:assert/strict";
import { TRANSITIONS, transition } from "../../server/applications";
import { rules, statuses, roles, terminals } from "./q1-model";

test("document oracle matches all persisted transition edges and caller preflights", () => {
  const expected = rules.flatMap((r) =>
    r.from.flatMap((from) =>
      r.outcomes.map((to) => [from, r.event, r.journal, to]),
    ),
  );
  // Scoring callers authorize the request; the persisted outcomes belong to system.
  // application-states.md:118-120 describes callers; :139 describes journal ownership.
  for (const r of rules.filter((r) =>
    ["submit", "client_update", "accept_alternative"].includes(r.event),
  ))
    for (const from of r.from)
      for (const caller of r.callers.filter((v) => v !== "system"))
        expected.push([from, r.event, caller, "underwriting"]);
  assert.deepEqual(
    TRANSITIONS.map((row) => JSON.stringify(row)).sort(),
    expected.map((row) => JSON.stringify(row)).sort(),
  );
});

test("all undefined status/event/role/target combinations fail; terminals have no exits", () => {
  for (const from of [null, ...statuses])
    for (const rule of rules)
      for (const role of roles)
        for (const to of statuses) {
          const allowed = TRANSITIONS.some(
            ([f, e, r, t]) =>
              f === from && e === rule.event && r === role && t === to,
          );
          if (allowed)
            assert.equal(
              transition(
                from,
                rule.event as (typeof TRANSITIONS)[number][1],
                role,
                to,
              ),
              to,
            );
          else
            assert.throws(() =>
              transition(
                from,
                rule.event as (typeof TRANSITIONS)[number][1],
                role,
                to,
              ),
            );
          if (from !== null && terminals.includes(from))
            assert.equal(allowed, false);
        }
});
