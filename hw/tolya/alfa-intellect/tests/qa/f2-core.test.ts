import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  a,
  fixture,
  offerOf,
  liveInstrumentAssertion,
} from "./q4-review-harness";

process.env.DATABASE_PATH = ":memory:";
const { db } = await import("../../server/store");
after(() => db.close());

for (const phase of ["compliance", "core", "bki"] as const) {
  for (const event of [
    "submit",
    "client_update",
    "accept_alternative",
  ] as const) {
    test(`${event}: changed evidence during ${phase} rolls back the entire response`, async () => {
      const f = fixture(db, event === "submit" ? 300000 : 900000);
      if (event !== "submit") await f.submit();
      const before = {
        application: a.applicationOf(db, f.id),
        events: a.eventsOf(db, f.id),
        dossier: a.dossierOf(db, f.id),
      };
      const change = () => {
        f.state.profile.sector = "изменён во время проверки";
        f.save();
      };
      if (phase === "core") {
        const original = f.deps.core.score;
        f.deps.core.score = async (input) => {
          change();
          return original(input);
        };
      } else if (phase === "compliance") {
        const original = f.deps.compliance;
        f.deps.compliance = async (input) => {
          change();
          return original(input);
        };
      } else {
        const original = f.deps.bki;
        f.deps.bki = async (inn) => {
          change();
          return original(inn);
        };
      }
      const payload =
        event === "submit"
          ? { consent: true }
          : event === "accept_alternative"
            ? { option_id: "q4-option" }
            : { confirmed_fields: { contract_main_customer: true } };
      const key = crypto.randomUUID();
      const command = f.command(event, payload);
      await assert.rejects(
        a.executeApplicationEvent(db, command, key, "f2", f.deps),
        { status: 409 },
      );
      assert.deepEqual(a.applicationOf(db, f.id), before.application);
      assert.deepEqual(a.eventsOf(db, f.id), before.events);
      assert.deepEqual(a.dossierOf(db, f.id), before.dossier);
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM application_idempotency WHERE key=?",
          )
          .get(key)!.n,
        0,
      );
      // The same key succeeds once its new evidence has actually been scored.
      await a.executeApplicationEvent(db, command, key, "f2", f.deps);
    });
  }
}

test("non-evidence chat changes and unconfirmed uploads do not cancel a current score", async () => {
  const f = fixture(db);
  const original = f.deps.core.score;
  f.deps.core.score = async (input) => {
    f.state.notifications.push({
      id: "unrelated",
      text: "уведомление",
      read: false,
      createdAt: "2026-10-23",
    } as any);
    f.state.documents.push({
      ...f.state.documents[0],
      id: "unconfirmed",
      confirmed: false,
    });
    f.save();
    return original(input);
  };
  await f.submit();
  assert.equal(a.applicationOf(db, f.id).status, "offered");
});

test("accepted catalogue terms survive a request for more evidence and a later client update", async () => {
  const f = fixture(db, 900000, "кассовый разрыв");
  await f.submit();
  const original = f.deps.core.score;
  f.deps.core.score = async (input) => {
    const result = await original(input);
    (result.core_result.core as any).missing = ["contract_main_customer"];
    return result;
  };
  await a.transitionApplication(
    db,
    f.command("accept_alternative", { option_id: "q4-option" }),
    f.deps,
  );
  assert.equal(a.applicationOf(db, f.id).status, "info_requested");
  f.deps.core.score = original;
  await a.transitionApplication(
    db,
    f.command("client_update", {
      confirmed_fields: { contract_main_customer: true },
    }),
    f.deps,
  );
  const offer = offerOf(db, f.id);
  assert.equal(f.seen.at(-1).need.asked_for, "ALFA_RCL_UNSEC");
  assert.equal(offer.rate, 0.235);
  assert.equal(offer.schedule[0].payment, 5875);
  assert.equal(offer.schedule.at(-1).principal, 300000);
  assert.equal(
    offer.schedule.reduce((n: number, row: any) => n + row.principal, 0),
    300000,
  );
});

test("live array oracle rejects a product outside the permitted golden set", () => {
  assert.throws(() =>
    liveInstrumentAssertion("ALFA_OVERDRAFT", ["ALFA_LUMP_UNSEC"]),
  );
});

test("contracted request_info journals payload.text when the legacy reason is blank", async () => {
  const f = fixture(db, 900000);
  const manager = fixture(db);
  db.prepare("UPDATE users SET role='manager' WHERE id=?").run(manager.uid);
  await f.submit();
  await a.transitionApplication(
    db,
    {
      ...f.command("escalate_disagreed", {
        client_objections: "Обсудим условия",
      }),
      actorRole: "system",
      actorId: null,
    },
    f.deps,
  );
  await a.transitionApplication(
    db,
    {
      ...f.command("request_info", {
        hole: "statement",
        text: "Пришлите выписку",
      }),
      actorRole: "manager",
      actorId: manager.uid,
      reason: "",
    },
    f.deps,
  );
  assert.equal(a.eventsOf(db, f.id).at(-1)!.reason, "Пришлите выписку");
});
