import {useState} from "react";
import {money} from "./api";
import {useWorkspace} from "./context";
import {validDate} from "../shared/cabinet";

/** Inspect the existing dated forecast; the range control also supports keyboard and touch. */
export function ForecastTimeline({timeline}:{timeline:{date:string;balance:number}[]}){
  const [index,setIndex]=useState(0);if(!timeline.length)return null;
  const i=Math.min(index,timeline.length-1),min=Math.min(0,...timeline.map(p=>p.balance)),max=Math.max(1,...timeline.map(p=>p.balance));
  const path=timeline.map((p,n)=>`${n?"L":"M"}${20+n/Math.max(1,timeline.length-1)*760},${170-(p.balance-min)/Math.max(1,max-min)*140}`).join(" ");
  return <section className="forecast-timeline" aria-label="Прогноз остатка денег"><h3>Остаток денег по дням</h3><svg viewBox="0 0 800 200" role="img" aria-label="Прогноз из сохранённого датированного плана"><path d={path} fill="none" stroke="var(--theme-chart-primary)" strokeWidth="4"/><circle cx={20+i/Math.max(1,timeline.length-1)*760} cy={170-(timeline[i].balance-min)/Math.max(1,max-min)*140} r="7" fill="var(--theme-chart-primary)"/></svg><label>Дата прогноза<input type="range" min="0" max={timeline.length-1} value={i} onChange={e=>setIndex(Number(e.target.value))}/></label><output>{timeline[i].date} · {money(timeline[i].balance)}</output><small>Остаток = начальные деньги + плановые поступления − расходы − кредитные платежи. Сценарий зависит от полноты плана.</small></section>;
}

/** Values come from this workspace's documents; month selection works by touch and keyboard. */
export function CompanyInsights(){
  const {state}=useWorkspace(),[selected,setSelected]=useState("");
  const docs=state.documents.filter(d=>d.confirmed),statement=docs.filter(d=>d.category==="statement").sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const groups=new Map<string,{income:number;expense:number}>();
  for(const r of statement?.records||[]){if(!validDate(String(r.date))||typeof r.amount!=="number"||!Number.isFinite(r.amount))continue;const key=String(r.date).slice(0,7),v=groups.get(key)||{income:0,expense:0};if(r.amount>=0)v.income+=r.amount;else v.expense-=r.amount;groups.set(key,v);}
  const months=[...groups].sort(([a],[b])=>a.localeCompare(b)).slice(-6),active=months.find(([m])=>m===selected)||months.at(-1),maximum=Math.max(1,...months.flatMap(([,v])=>[v.income,v.expense]));
  const demo=state.profile.source?.includes("Синтетическ")||docs.some(d=>d.id.startsWith("demo-reporting-"));
  return <section className="company-insights" aria-label="Компания и финансовая динамика"><header><div><span className="eyebrow">РАБОЧЕЕ МЕСТО БУХГАЛТЕРА</span><h2>{state.profile.name||"Ваш бизнес"}</h2><p>{state.profile.sector||"Деятельность не указана"} · {state.profile.form}</p></div>{demo&&<span className="badge">Учебные данные</span>}</header>
    <dl className="company-facts"><div><dt>ИНН</dt><dd>{state.profile.inn||"Не указан"}</dd></div><div><dt>Регистрация</dt><dd>{state.profile.registeredAt||"Не указана"}</dd></div><div><dt>Документы</dt><dd>{docs.length} подтверждено в кабинете</dd></div></dl>
    {demo&&<p className="company-disclosure">Учебные отчёты и план показывают работу интерфейса. Они отделены от исходных данных скоринга и не являются банковскими сведениями.</p>}
    {months.length>0?<><div className="company-chart-heading"><h3>Движение денег по месяцам</h3><span>Поступления <i/> · списания <i className="expense"/></span></div><div className="company-bars" role="group" aria-label="Выберите месяц для разбора">{months.map(([m,v])=><button type="button" key={m} aria-pressed={active?.[0]===m} onClick={()=>setSelected(m)} aria-label={`${m}: поступления ${money(v.income)}, списания ${money(v.expense)}`}><span className="company-bar-pair"><i style={{height:Math.max(3,v.income/maximum*100)+"%"}}/><i className="expense" style={{height:Math.max(3,v.expense/maximum*100)+"%"}}/></span><span>{new Date(m+"-01T00:00:00").toLocaleDateString("ru-RU",{month:"short",year:"2-digit"})}</span></button>)}</div>{active&&<div className="company-month-result" role="status"><span>{active[0]} · поступления {money(active[1].income)}</span><span>Списания {money(active[1].expense)}</span><strong>Чистое движение: {money(active[1].income-active[1].expense)}</strong></div>}<details><summary>Формула, источник и документы</summary><p>Чистое движение = сумма поступлений − сумма списаний. Это движение денег, не бухгалтерская прибыль. Источник: {statement?.name}, {statement?.period}.</p></details></>:<p>Подтвердите выписку, чтобы построить динамику.</p>}
    <details className="company-documents"><summary>Открыть документы компании</summary>{docs.length?docs.map(d=><a key={d.id} href={`/api/documents/${encodeURIComponent(d.id)}/download`} download>{d.name}<small>{d.period} · скачать источник</small></a>):<p>Документы ещё не добавлены.</p>}</details>
  </section>;
}
