import test from "node:test";
import assert from "node:assert/strict";
import { journeyView, journeySection } from "../shared/journey-view";
import type { MvpApplication } from "../shared/mvp2";
const approved = {
  id: "a",
  lifecycle: "CONTRACT_READY",
  decision: "APPROVED",
  contract: { number: "MVP-a", date: "2026-10-25", hash: "h", version: 1 },
} as MvpApplication;
const position = (view: string) => ({ applicationId: "a", view });
test("a delayed autosave cannot send navigation back to an earlier form section", () => {
  assert.equal(
    journeySection("a", { applicationId: "a", section: 2 }, { section: 0 }),
    2,
  );
  assert.equal(
    journeySection("a", { applicationId: "a", section: 0 }, { section: 3 }),
    0,
  );
  assert.equal(
    journeySection("a", { applicationId: "other", section: 3 }, { section: 1 }),
    1,
  );
  assert.equal(journeySection("a", { applicationId: "a", section: 90 }), 0);
});
test("return to decision and reload do not force the already generated contract", () => {
  assert.equal(journeyView(approved, position("decision")), "decision");
  assert.equal(journeyView(approved, position("chat")), "chat");
  assert.equal(journeyView(approved, position("contract")), "contract");
  assert.equal(journeyView(approved), "contract");
});
test("processing always outranks a stale document or questionnaire position", () => {
  for (const lifecycle of ["SUBMITTED", "PROCESSING"] as const)
    for (const view of [
      "dossier",
      "questionnaire",
      "contract",
      "receive",
      "decision",
    ])
      assert.equal(
        journeyView({ ...approved, lifecycle }, position(view)),
        "processing",
      );
});
test("only compatible saved screens are restored for each decision and lifecycle", () => {
  const a = { ...approved, contract: undefined };
  assert.equal(journeyView(a, position("details")), "details");
  assert.equal(journeyView(a, position("receive")), "decision");
  for (const decision of [
    "ADDITIONAL_DATA_REQUIRED",
    "MANAGER_REVIEW_REQUIRED",
    "DECLINED",
  ] as const) {
    const next = { ...a, lifecycle: "DECIDED" as const, decision };
    assert.equal(journeyView(next, position("contract")), "decision");
    assert.equal(journeyView(next, position("receive")), "decision");
    assert.equal(journeyView(next, position("chat")), "chat");
  }
  assert.equal(
    journeyView(
      { ...a, decision: "MANAGER_REVIEW_REQUIRED" },
      position("meeting"),
    ),
    "meeting",
  );
  assert.equal(
    journeyView(
      { ...a, decision: "ADDITIONAL_DATA_REQUIRED" },
      position("supplement"),
    ),
    "supplement",
  );
  assert.equal(
    journeyView(
      { ...approved, lifecycle: "SIGNED_DEMO" },
      position("contract"),
    ),
    "contract",
  );
  assert.equal(
    journeyView({ ...approved, lifecycle: "SIGNED_DEMO" }),
    "receive",
  );
});
test("draft resumes the explicit screen and ignores another application's position", () => {
  const draft = {
    ...approved,
    lifecycle: "DRAFT" as const,
    decision: undefined,
    contract: undefined,
  };
  for (const view of [
    "recommendation",
    "catalog",
    "intro",
    "questionnaire",
    "dossier",
  ])
    assert.equal(journeyView(draft, position(view)), view);
  assert.equal(journeyView(draft, position("receive")), "recommendation");
  assert.equal(
    journeyView(draft, { applicationId: "other", view: "dossier" }),
    "recommendation",
  );
});

test("a funded application restores confirmation instead of skipping to another workspace", () => {
  const funded = {...approved,lifecycle:"ACTIVE" as const};
  for (const saved of [undefined,position("receive"),position("contract"),position("decision")])
    assert.equal(journeyView(funded,saved),"funded");
  assert.notEqual(journeyView({...approved,lifecycle:"SIGNED_DEMO"}),"funded");
});

test("a booked manager call restores its card while explicit return to decision remains available", () => {
  const booked = {...approved,contract:undefined,lifecycle:"MEETING_SCHEDULED" as const,decision:"MANAGER_REVIEW_REQUIRED" as const,meeting:{slotId:"s",at:"2026-10-30T12:00:00+03:00",manager:"Менеджер"}};
  assert.equal(journeyView(booked),"meeting");
  assert.equal(journeyView(booked,position("processing")),"meeting");
  assert.equal(journeyView(booked,position("decision")),"decision");
  assert.equal(journeyView({...booked,meeting:undefined}),"decision");
  assert.equal(journeyView({...booked,decision:"APPROVED",lifecycle:"MANAGER_APPROVED"}),"decision");
});
