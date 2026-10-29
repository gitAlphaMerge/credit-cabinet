import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { FundingComplete } from "../src/FundingComplete";
import { createCabinetConversation } from "../src/CabinetOmega";
import { MeetingBooking } from "../src/CalendarPicker";
import { initialQuestionnaire, type MvpApplication } from "../shared/mvp2";
import type { Workspace } from "../src/context";

/** Signed fixture proves completion depends on persisted activation, not just an approval. */
function funded(): MvpApplication {
  const questionnaire = initialQuestionnaire({industry:"IT",age:"Более 3 лет",purpose:"Текущие расходы",amountRange:"500 тыс.–1 млн ₽",amount:500000,term:12,usage:"Всё сразу",repayment:"Регулярная выручка"});
  return {id:"a",questionnaire,lifecycle:"ACTIVE",activatedAt:"2026-10-29T12:00:00Z",signature:{id:"s",at:"2026-10-29T11:00:00Z",hash:"signed",version:1},contract:{number:"DEMO-42",date:"2026-10-29",hash:"signed",version:1}} as MvpApplication;
}
const render = (a: MvpApplication) => renderToStaticMarkup(<FundingComplete application={a} onCredit={()=>{}} onBusiness={()=>{}}/>);

test("completion shows issuance only for the activated signed contract, never a pending or mismatched one", () => {
  const a = funded();
  assert.match(render(a),/Кредит зачислен/);
  assert.match(render(a),/Перейти в кредитный кабинет/);
  assert.match(render(a),/DEMO-42/);
  assert.match(render(a),/Реального перевода денег нет/);
  for(const invalid of [{...a,lifecycle:"SIGNED_DEMO" as const},{...a,activatedAt:undefined},{...a,signature:{...a.signature!,hash:"old"}}]) {
    assert.doesNotMatch(render(invalid),/Кредит зачислен|Перейти в кредитный кабинет/);
  }
});

test("an opened limit is not presented as cash disbursement or an outstanding debt",()=>{
  const a=funded();a.questionnaire.productId="RCL";
  const html=render(a);
  assert.match(html,/Кредитный лимит открыт/);
  assert.match(html,/До выборки средств задолженность равна нулю/);
  assert.doesNotMatch(html,/Кредит зачислен/);
});

test("business dock creates a separate conversation and does not navigate or auto-send its draft",async()=>{
  const calls:unknown[]=[];
  const w={act:async(path:string,body:unknown)=>{calls.push([path,body]);return {id:"fresh-chat"};},setActiveChatId:(id:string)=>calls.push(["active",id]),setHistoryOpen:(v:boolean)=>calls.push(["history",v]),go:()=>assert.fail("Must stay in business overview"),sendMessage:()=>assert.fail("Draft requires explicit send"),draft:"Сохранённый вопрос",setDraft:()=>assert.fail("Draft must survive opening")};
  await createCabinetConversation(w as unknown as Workspace);
  assert.deepEqual(calls,[["/chats",{}],["active","fresh-chat"],["history",false]]);
  assert.equal(w.draft,"Сохранённый вопрос");
});

test("failed conversation creation leaves the current dialog and history untouched",async()=>{
  await assert.rejects(createCabinetConversation({act:async()=>{throw new Error("offline");},setActiveChatId:()=>assert.fail("Keep old active chat"),setHistoryOpen:()=>assert.fail("Keep history")}),/offline/);
});

test("scheduled call card keeps manager, Moscow time, reschedule and cancel controls",()=>{
  const html=renderToStaticMarkup(<MeetingBooking slots={[]} meeting={{slotId:"slot",at:"2099-10-30T12:00:00+03:00",manager:"Менеджер демо"}} busy={false} onBook={async()=>{}} onCancel={async()=>{}}/>);
  for(const text of ["Менеджер позвонит","12:00","МСК","Ваш менеджер: Менеджер демо","Перенести звонок с менеджером","Отменить звонок с менеджером","Добавить звонок в календарь"])assert.ok(html.includes(text),text);
});

test("an elapsed booking keeps its controls but does not promise a future call",(t)=>{
  t.mock.method(Date,"now",()=>Date.parse("2026-10-29T12:00:00Z"));
  const html=renderToStaticMarkup(<MeetingBooking slots={[]} meeting={{slotId:"slot",at:"2026-10-28T12:00:00+03:00",manager:"Менеджер демо"}} busy={false} onBook={async()=>{}} onCancel={async()=>{}}/>);
  assert.match(html,/Звонок был назначен на/);
  assert.match(html,/Время записи прошло/);
  assert.doesNotMatch(html,/Менеджер позвонит/);
  assert.match(html,/Перенести звонок с менеджером/);
});
