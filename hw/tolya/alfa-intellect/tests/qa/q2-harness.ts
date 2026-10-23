import assert from "node:assert/strict";
import request from "supertest";
import type { Profile } from "../../shared/types";
process.env.DATABASE_PATH = ":memory:";
process.env.EGR_PROVIDER = "mock";
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
export const { app } = await import("../../server/app");
export const store = await import("../../server/store");
export const applications = await import("../../server/applications");
export const seed = Number(process.env.Q2_SEED ?? 2302) >>> 0;
export const profile: Profile = {
  name: "QA ООО",
  form: "ООО",
  stage: "operating",
  sector: "Услуги",
  registered: true,
  ageBand: "3–5 лет",
  result: "Прибыль",
  debt: "Нет",
  intent: "Подбор",
  inn: "9900000001",
};
export function csv(rows = 36) {
  const now = new Date();
  const operations = Array.from({ length: rows }, (_, i) => {
    const at = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + (i % 12), 1),
    );
    return `${at.toISOString().slice(0, 10)},${i % 3 === 0 ? -100 : 1000},Client,Service,${i % 3 === 0 ? "debt" : "operating"}`;
  });
  return "date,amount,counterparty,purpose,kind\n" + operations.join("\n");
}
export function healthyCore() {
  return {
    core: {
      stops_fired: [],
      missing: [],
      limit_now_rub: 1_000_000,
      limit_after_rub: 1_000_000,
      reasons: [],
      status: "можно подавать",
      instrument: "кредит",
    },
  };
}
export function configure() {
  applications.configureApplications({
    core: applications.httpCoreClient,
    clock: () => new Date(),
  });
}
let sequence = 0;
export async function customer() {
  const agent = request.agent(app);
  // Persisted session is real; direct creation avoids measuring password scrypt in fault tests.
  const id = `q2-${seed}-${++sequence}`;
  store.db
    .prepare(
      "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)",
    )
    .run(
      id,
      id,
      "unused",
      JSON.stringify(store.initialState(profile)),
      "client",
    );
  const cookie = "alfa_session=" + store.session(id);
  return { agent, id, cookie };
}
export async function prepare(owner: Awaited<ReturnType<typeof customer>>) {
  const upload = await owner.agent
    .post("/api/documents")
    .set("Cookie", owner.cookie)
    .attach("file", Buffer.from(csv()), "statement.csv")
    .expect(200);
  await owner.agent
    .post(`/api/documents/${upload.body.id}/confirm`)
    .set("Cookie", owner.cookie)
    .send({})
    .expect(200);
  const selected = await owner.agent
    .post("/api/selections")
    .set("Cookie", owner.cookie)
    .send({
      purpose: "Кассовый разрыв",
      amount: 10000,
      term: 12,
      repayFrom: "Выручка",
    })
    .expect(200);
  const created = await owner.agent
    .post("/api/applications")
    .set("Cookie", owner.cookie)
    .send({
      selectionId: selected.body.id,
      selectionVersion: selected.body.version ?? 1,
    })
    .expect(201);
  return created.body.application.id as string;
}
export function submit(
  owner: Awaited<ReturnType<typeof customer>>,
  id: string,
  key = `q2-${id}`,
) {
  return owner.agent
    .post(`/api/applications/${id}/events`)
    .set("Cookie", owner.cookie)
    .set("Idempotency-Key", key)
    .send({ event: "submit", expectedVersion: 1, payload: { consent: true } });
}
export function snapshot(id: string) {
  return {
    application: applications.applicationOf(store.db, id),
    events: applications.eventsOf(store.db, id),
    dossier: applications.dossierOf(store.db, id),
  };
}
export function shuffled<T>(values: T[]) {
  let state = seed || 1;
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function noLeak(body: unknown) {
  assert.doesNotMatch(
    JSON.stringify(body),
    /SECRET_Q2|at .*\.ts:\d|stack|ECONNREFUSED/,
    `seed=${seed}`,
  );
}
