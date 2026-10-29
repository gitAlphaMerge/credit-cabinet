import {addDays,day} from "./cabinet";
import type {AppState,Doc} from "./types";

const examples:Record<string,[number,number,number,number]>={green:[18000000,16000000,.14,620000],gap:[9600000,10100000,.065,190000],document:[14400000,12800000,.11,410000],young:[4800000,3600000,.08,140000],review:[12600000,11900000,.09,280000]};
/** Separate labelled accounting fixtures. They never replace an application's scoring inputs. */
export function demoReporting(state:AppState,key:string,now=new Date()):AppState {
  const values=examples[key];if(!values)return state;
  const today=day(now),prefix=`demo-reporting-${key}`,existing=state.documents.find(d=>d.id.startsWith(prefix+"-statement"));
  if(existing?.period.endsWith(today)&&existing.fields.reportingVersion===2)return state;
  const [revenue,previous,margin,opening]=values,monthly=revenue/12;
  const records:NonNullable<Doc["records"]>=[];
  let balance=opening;
  for(let m=5;m>=0;m--)for(let n=0;n<4;n++){
    const date=addDays(today,-m*30-(3-n)*7),amount=Math.round(monthly*(n%2===0?.5:-(1-margin)*.5)*(1-m*.025));
    balance+=amount;records.push({date,amount,balance,kind:"operating",purpose:amount>0?"Учебная выручка":"Учебные операционные расходы"});
  }
  const year=Number(today.slice(0,4))-1,stamp=now.toISOString();
  const common={confirmed:true,createdAt:stamp,currency:"RUB",mime:"text/csv"};
  const docs:Doc[]=[{...common,id:prefix+"-statement",category:"statement",name:"Демо: движение денег.csv",period:`${records[0].date} - ${today}`,fields:{reportingVersion:2},records},{...common,id:prefix+"-pnl",category:"pnl",name:"Демо: ОФР и сравнение лет.csv",period:`${year-1} и ${year}`,fields:{revenue,previousRevenue:previous,salesProfit:Math.round(revenue*margin),expenses:Math.round(revenue*(1-margin)),profit:Math.round(revenue*margin*.8),periodStart:`${year}-01-01`,periodEnd:`${year}-12-31`,previousStart:`${year-1}-01-01`,previousEnd:`${year-1}-12-31`}}];
  const cfads=Math.round(monthly*margin),source="Учебная финмодель демо-компании, не банковские сведения";
  return {...state,documents:[...state.documents.filter(d=>!d.id.startsWith(prefix)),...docs],cabinet:{...state.cabinet,plan:state.cabinet?.plan&&!state.cabinet.plan.source.startsWith("Учебная")?state.cabinet.plan:{balance,balanceDate:today,through:addDays(today,59),source,confirmedAt:stamp,items:Array.from({length:8},(_,i)=>({id:prefix+"-plan-"+i,date:addDays(today,2+i*7),amount:Math.round(i%2===0?monthly/2:-monthly*(1-margin)/2),label:i%2===0?"Учебный план поступлений":"Учебный план расходов"}))},coverage:state.cabinet?.coverage&&!state.cabinet.coverage.source.startsWith("Учебная")?state.cabinet.coverage:{amount:cfads,start:today,end:addDays(today,29),source,methodology:"Учебное допущение CFADS: месячная выручка × операционная маржа. Налоги и оборотный капитал отдельно не моделируются; это не банковская оценка.",confirmedAt:stamp}}};
}
