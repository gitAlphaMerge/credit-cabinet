import test from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {demoReporting} from "../shared/demo-reporting";
import {cabinetSnapshot} from "../shared/cabinet";
import {publicPreview} from "../server/preview";
import {trainingCabinet} from "../shared/cabinet-training";
import {CompanyInsights,ForecastTimeline} from "../src/CompanyInsights";
import {WorkspaceContext,type Workspace} from "../src/context";
import {publicModelName} from "../server/agent-identity";

test("model identity shows the real model without cloud folder identifiers",()=>{
  assert.equal(publicModelName("gpt://internal-folder/qwen3.6-35b-a3b/latest"),"qwen3.6-35b-a3b/latest");
  assert.equal(publicModelName("qwen/qwen3-235b"),"qwen/qwen3-235b");
});

test("each demo gets distinct labelled accounting data without replacing its loan or original documents",()=>{
  const base=trainingCabinet(publicPreview()),before=JSON.stringify(base),now=new Date();
  const all=["green","gap","document","young","review"].map(key=>demoReporting(base,key,now));
  assert.equal(JSON.stringify(base),before);
  assert.equal(new Set(all.map(s=>s.documents.find(d=>d.name.includes("ОФР и"))?.fields.revenue)).size,5);
  for(const s of all){assert.equal(s.cabinet?.facility,base.cabinet?.facility);assert.ok(s.documents.some(d=>d.id==="training-pnl"));assert.match(s.cabinet!.coverage!.source,/Учеб/);}
  assert.equal(demoReporting(base,"ordinary-user",now),base);
});

test("current demo reports supply finite cash, growth and margin while forecast keeps real credit payments",()=>{
  const base=trainingCabinet(publicPreview());delete base.cabinet!.plan;delete base.cabinet!.coverage;base.documents=[];
  const s=demoReporting(base,"green"),snapshot=cabinetSnapshot(s,undefined,true);
  assert.notEqual(snapshot.cash.net,null);
  assert.equal(s.cabinet!.plan!.balance,s.documents.find(d=>d.category==="statement")!.records!.at(-1)!.balance);
  assert.ok(snapshot.metrics.filter(m=>m.value!==null).length>=3);
  assert.equal(snapshot.forecast.available,true);
  assert.ok(snapshot.forecast.timeline.every(p=>Number.isFinite(p.balance)));
  const html=renderToStaticMarkup(<WorkspaceContext.Provider value={{state:s} as Workspace}><CompanyInsights/></WorkspaceContext.Provider>);
  assert.match(html,/Учебные данные/);assert.match(html,/не бухгалтерская прибыль/);assert.match(html,/\/api\/documents\//);
  assert.match(renderToStaticMarkup(<ForecastTimeline timeline={snapshot.forecast.timeline}/>),/type="range"/);
});

test("report refresh is idempotent and preserves user-entered forecast assumptions",()=>{
  const s=demoReporting(publicPreview(),"green"),doc=s.documents[0];doc.id+="-owner";
  assert.equal(demoReporting(s,"green"),s);
  const older=structuredClone(s);older.documents[0].period="2020-01-01 - 2020-01-31";older.cabinet!.plan!.source="Внесено бухгалтером";
  assert.equal(demoReporting(older,"green").cabinet!.plan,older.cabinet!.plan);
});
