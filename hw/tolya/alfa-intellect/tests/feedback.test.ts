import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
process.env.DATABASE_PATH = join(await mkdtemp(join(tmpdir(),"feedback-")),"test.sqlite");
const { app, redactExport } = await import("../server/app");
const { db, stateOf, saveState } = await import("../server/store");
const parse = (text:string) => text.trim() ? text.trim().split("\n").map(line => JSON.parse(line)) : [];

test("feedback ownership, validation, upsert, dismissal and incremental redacted exports", async () => {
  const a=request.agent(app), b=request.agent(app);
  await a.post("/api/auth/demo").send({}).expect(200);
  await b.post("/api/auth/demo").send({}).expect(200);
  const uid=(await a.get("/api/config")).body.workspaceId;
  const state=stateOf(uid), chat=state.chats[0];
  chat.messages = [
    {id:"user-1",role:"user",text:"Паспорт 45 08 123456, ИНН 7712345678, СНИЛС 123-456-789 01, карта 4111 1111 1111 1111, +7 (999) 123-45-67, test@example.ru",createdAt:"2026-01-01T00:00:00Z"},
    {id:"agent-1",role:"assistant",text:"Расчёт",mode:"team-agent",createdAt:"2026-01-01T00:00:01Z",...{status:"ready"}},
    {id:"later",role:"user",text:"После оценки",createdAt:"2026-01-01T00:00:02Z"},
  ];
  saveState(uid,state);
  const url=`/api/chats/${chat.id}/feedback`;
  const value={kind:"message",message_id:"agent-1",rating:"down",reasons:["G","L"],text:"test@example.ru"};
  await request(app).post(url).send(value).expect(401);
  await b.post(url).send(value).expect(404);
  await b.get(url).expect(404);
  await a.post(url).send({...value,message_id:"user-1"}).expect(404);
  await a.post(url).send({...value,message_id:"missing"}).expect(404);
  for(const patch of [{reasons:["wrong"]},{text:"x".repeat(1001)},{rating:7},{rating:"up",reasons:["G"]}])
    await a.post(url).send({...value,...patch}).expect(422);
  const first=(await a.post(url).send(value).expect(200)).body[0];
  const updated=(await a.post(url).send({...value,reasons:["M","P","V","F","other"]}).expect(200)).body;
  assert.equal(updated.length,1); assert.equal(updated[0].id,first.id);
  await a.post(url).send({kind:"conversation",rating:8}).expect(422);
  await a.post(url).send({kind:"conversation",rating:null}).expect(200);
  await a.post(url).send({kind:"conversation",rating:7,text:"Проще"}).expect(200);
  assert.equal((await a.get(url)).body.filter((f:any)=>f.kind==="conversation").length,1);
  delete process.env.FEEDBACK_EXPORT_TOKEN;
  for(const endpoint of ["history","feedback"]) await request(app).get(`/api/admin/${endpoint}.jsonl`).expect(404);
  process.env.FEEDBACK_EXPORT_TOKEN="export-test";
  for(const endpoint of ["history","feedback"]) {
    await request(app).get(`/api/admin/${endpoint}.jsonl`).expect(401);
    await request(app).get(`/api/admin/${endpoint}.jsonl`).set("Authorization","Bearer wrong").expect(401);
  }
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(async()=>{throw new Error("agent down");}) as typeof fetch;
  const get=(endpoint:string)=>request(app).get(`/api/admin/${endpoint}.jsonl`).set("Authorization","Bearer export-test");
  try {
    const history=await get("history").expect(200), rows=parse(history.text), row=rows.find(c=>c.chat_id===chat.id);
    assert.equal(row.user,createHash("sha256").update(uid).digest("hex"));
    assert.equal(row.status,"ready"); assert.equal(row.agent_trace,null);
    assert.equal(row.messages.length,3); assert.equal(row.feedback.length,2);
    assert.ok(rows.some(c=>c.feedback.length===0));
    // Check the submitted phone, not a three-digit fragment that can occur in a random UUID.
    for(const pii of ["45 08 123456","7712345678","123-456-789 01","4111 1111","+7 (999) 123-45-67","test@example.ru",uid]) assert.ok(!history.text.includes(pii),pii);
    assert.ok(history.text.includes("[скрыто]"));
    const feedback=parse((await get("feedback").expect(200)).text);
    assert.equal(feedback.find(f=>f.id===first.id).messages.length,2);
    const future="2999-01-01T00:00:00Z";
    for(const endpoint of ["history","feedback"]) assert.equal((await get(endpoint).query({since:future}).expect(200)).text,"");
    await get("history").query({since:"invalid"}).expect(422);
    globalThis.fetch=(async()=>new Response(JSON.stringify({[chat.id]:{trace:[{need:"test@example.ru"}],need:{phone:"secret"},history:[]}}))) as typeof fetch;
    const traced=parse((await get("history").expect(200)).text).find(c=>c.chat_id===chat.id);
    assert.equal(traced.agent_trace.trace[0].need,"[скрыто]");
    assert.equal(traced.agent_trace.need.phone,undefined);
    await a.post(url).send({...value,rating:null,reasons:[],text:""}).expect(200);
    assert.equal(parse((await get("feedback")).text).some(f=>f.id===first.id),false);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM migrations WHERE version=3").get() as any).n,1);
  } finally {globalThis.fetch=originalFetch;delete process.env.FEEDBACK_EXPORT_TOKEN;}
  assert.deepEqual(redactExport({statement_csv:"secret",phone:"secret",nested:["123456789012"]}),{nested:["[скрыто]"]});
});
