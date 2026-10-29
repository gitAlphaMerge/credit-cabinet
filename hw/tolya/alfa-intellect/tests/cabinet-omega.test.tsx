import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationKnowledge, applicationKnowledge } from "../src/ApplicationKnowledge";
import { CabinetHome } from "../src/CabinetHome";
import { OmegaMicrophone } from "../src/OmegaIdentity";
import { WorkspaceContext, type Workspace } from "../src/context";
import { initialQuestionnaire, type MvpApplication } from "../shared/mvp2";
import { publicPreview } from "../server/preview";

const onboarding = { industry:"Производство", age:"Более 3 лет", purpose:"Текущие расходы", amountRange:"1–3 млн ₽", term:12, usage:"Всё сразу", repayment:"Регулярная выручка" };
function application() {
  return {questionnaire: initialQuestionnaire(onboarding), provenance:{}, missing:[]} as unknown as MvpApplication;
}
test("Knowledge groups preserve unknowns and never claim external checks without data", () => {
  const a = application();
  const groups = applicationKnowledge(a);
  assert.deepEqual(groups, {confirmed:[],assumptions:[],missing:[]});
  const html = renderToStaticMarkup(<ApplicationKnowledge application={a}/>);
  assert.ok(html.includes("Расчёт появится после обработки данных"));
  assert.ok(!html.includes("Налоговых долгов нет"));
  assert.ok(!html.includes("1 015 000"));
});
test("Uploaded evidence remains pending; calculated figures are not verified facts", () => {
  const a = application();
  a.company = {inn:"990005000140",name:"Только эта компания",form:"ИП",status:"ACTIVE",source:"Демо",demo:true};
  a.questionnaire.companyConfirmed = true;
  a.financial = {flow:100000,payment:20000,dscr:5,limit:200000,months:6,debtInCsv:0,uncoveredDebt:0,source:"CSV"};
  a.missing = [{key:"one",label:"Первый документ",section:1,status:"uploaded"},{key:"two",label:"Второй документ",section:2,status:"accepted"},{key:"three",label:"Третий документ",section:3,status:"skipped"}];
  const groups = applicationKnowledge(a);
  assert.equal(groups.confirmed.length,1);
  assert.match(groups.confirmed[0].source,/Демонстрационная/);
  assert.equal(groups.assumptions.length,2);
  assert.equal(groups.missing.length,1);
  assert.equal(groups.missing[0].source,"Загружено, ожидает проверки");
});
test("Dashboard sums only current-company confirmed statement rows; missing figures stay missing", () => {
  const a = publicPreview("ooo"), b = publicPreview("ip");
  a.documents = [{id:"one",category:"statement",confirmed:true,createdAt:"2026-10-28",name:"Выписка этой компании",period:"2026-10",currency:"RUB",mime:"text/csv",fields:{},records:[{date:"2026-10-01",amount:1234000},{date:"2026-10-02",amount:-230000},{date:"invalid",amount:90000000}]}];
  const render = (state: typeof a) => renderToStaticMarkup(<WorkspaceContext.Provider value={{state,draft:"",setDraft:()=>{},go:()=>{}} as unknown as Workspace}><CabinetHome preview/></WorkspaceContext.Provider>);
  const html = render(a).replace(/[\s\u00a0\u202f]/g,"");
  assert.ok(html.includes("1234000")); assert.ok(html.includes("230000")); assert.ok(html.includes("1004000"));
  const other = render(b).replace(/[\s\u00a0\u202f]/g,"");
  assert.ok(!other.includes("1234000")); assert.ok(other.includes("Нетданных"));
});
test("Microphone is an explicit non-submit control and never auto-sends speech", () => {
  const html = renderToStaticMarkup(<OmegaMicrophone disabled onText={()=>assert.fail("Speech must wait for a user gesture")}/>);
  assert.ok(html.includes('type="button"'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes("disabled"));
});
