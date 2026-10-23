import test, { after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATABASE_PATH = ":memory:";
process.env.EGR_PROVIDER = "mock";
const { app, stopSilenceSweep } = await import("../../server/app");
const { db, createUser, session } = await import("../../server/store");
const { publicPreview } = await import("../../server/preview");
const { documentMetadata, documentStatus, creditRevision } =
  await import("../../server/document-policy");
const owner = createUser(
  "79000000111",
  "test-password",
  publicPreview().profile,
);
const other = createUser(
  "79000000222",
  "test-password",
  publicPreview().profile,
);
const cookie = "alfa_session=" + session(owner);
const foreign = "alfa_session=" + session(other);
// Use the cookie name actually issued by this app.
const cookieName = (
  await request(app).post("/api/auth/login").send({
    phone: "79000000111",
    password: "test-password",
  })
).headers["set-cookie"]![0].split("=")[0];
const ownCookie = cookie.replace("alfa_session", cookieName);
const otherCookie = foreign.replace("alfa_session", cookieName);
after(() => {
  stopSilenceSweep();
  db.close();
});

test("G1 freshness rules are based on coverage, not re-upload time, and react to a new credit", () => {
  const make = (category: string, period: string, fields = {}) => ({
    category,
    period,
    fields,
    createdAt: "2026-10-24T10:00:00Z",
  });
  assert.deepEqual(
    documentMetadata(make("statement", "2026-07-01 - 2026-07-31")),
    {
      periodFrom: "2026-07-01",
      periodTo: "2026-07-31",
      validUntil: "2026-08-30",
    },
  );
  assert.equal(
    documentMetadata(make("balance", "2025")).validUntil,
    "2027-03-31",
  );
  assert.equal(documentMetadata(make("pnl", "2025")).validUntil, "2027-03-31");
  assert.equal(
    documentMetadata(
      make("pnl", "", { periodStart: "2026-01-01", periodEnd: "2026-06-30" }),
    ).validUntil,
    "2026-09-28",
  );
  assert.equal(documentMetadata(make("model", "")).validUntil, "2027-01-22");
  assert.equal(documentMetadata(make("plan", "")).validUntil, "2027-01-22");
  assert.equal(
    documentMetadata(make("statement", "2026-02-30 - 2026-03-01")).validUntil,
    null,
  );
  const state = publicPreview();
  const revision = creditRevision(state);
  const schedule = {
    ...make("schedule", "2026-11-01 - 2027-11-01"),
    id: "schedule",
    name: "schedule.csv",
    confirmed: true,
    currency: "RUB",
    mime: "text/csv",
    creditRevision: revision,
  };
  assert.equal(documentMetadata(schedule).validUntil, "2026-11-23");
  assert.equal(
    documentStatus(
      schedule,
      "ООО",
      "schedule",
      new Date("2026-10-24"),
      revision,
    ).code,
    "fresh",
  );
  state.credit = { ...state.credit!, id: "another-loan" };
  assert.equal(
    documentStatus(
      schedule,
      "ООО",
      "schedule",
      new Date("2026-10-24"),
      creditRevision(state),
    ).code,
    "stale",
  );
});

test("G1 confirming a replacement retains the old version, fields and downloadable bytes", async () => {
  const upload = async (value: number) =>
    (
      await request(app)
        .post("/api/documents")
        .set("Cookie", ownCookie)
        .field("category", "statement")
        .attach(
          "file",
          Buffer.from(
            `date,amount,kind\n2026-07-01,${value},operating\n2026-07-31,-10,operating`,
          ),
          "test.csv",
        )
        .expect(200)
    ).body;
  const first = await upload(100);
  await request(app)
    .post(`/api/documents/${first.id}/confirm`)
    .set("Cookie", ownCookie)
    .send({})
    .expect(200);
  const second = await upload(200);
  const state = (
    await request(app)
      .post(`/api/documents/${second.id}/confirm`)
      .set("Cookie", ownCookie)
      .send({})
      .expect(200)
  ).body;
  const current = state.documents.find(
    (d: any) => d.category === "statement" && d.confirmed,
  );
  assert.equal(current.id, second.id);
  assert.equal(
    current.versions?.length,
    1,
    "previous confirmed version must survive",
  );
  assert.equal(current.versions[0].id, first.id);
  assert.equal(current.versions[0].fields.inflow, 100);
  assert.equal(current.periodFrom, "2026-07-01");
  assert.equal(current.periodTo, "2026-07-31");
  assert.equal(current.validUntil, "2026-08-30");
  await request(app)
    .get(`/api/documents/${first.id}/download`)
    .set("Cookie", ownCookie)
    .expect(200);
  await request(app)
    .get(`/api/documents/${first.id}/download`)
    .set("Cookie", otherCookie)
    .expect(404);
  await request(app)
    .post(`/api/documents/${second.id}/confirm`)
    .set("Cookie", otherCookie)
    .send({})
    .expect(404);
  assert.equal(
    (await request(app).get("/api/state").set("Cookie", otherCookie)).body
      .documents.length,
    0,
  );
});

test("G1 mock import creates a marked unconfirmed document and refuses unsupported sources", async () => {
  const response = await request(app)
    .post("/api/documents/import")
    .set("Cookie", ownCookie)
    .send({ category: "balance" })
    .expect(200);
  assert.equal(response.body.confirmed, false);
  assert.equal(response.body.provider, "mock");
  assert.match(response.body.source, /мок, в проде: ГИР БО/);
  assert.equal(
    response.body.periodFrom,
    `${new Date().getUTCFullYear() - 1}-01-01`,
  );
  assert.ok(response.body.validUntil);
  await request(app)
    .get(`/api/documents/${response.body.id}/download`)
    .set("Cookie", otherCookie)
    .expect(404);
  await request(app)
    .post("/api/documents/import")
    .set("Cookie", ownCookie)
    .send({ category: "plan" })
    .expect(422);
  await request(app)
    .post("/api/documents/import")
    .send({ category: "balance" })
    .expect(401);
});
