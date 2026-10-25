// A separate browser context and QA database only; fixtures through public APIs.
// prettier-ignore
async page => {
  const base='http://localhost:4175', context=await page.context().browser().newContext();
  try {
    const client=context.request, p=await context.newPage();
    const json=async(method,path,data)=>{const r=await client[method](base+'/api'+path,{data});if(!r.ok())throw Error(path+': '+await r.text());return r.json();};
    await json('post','/journey/session',{});
    const answers={industry:'Производство',age:'Более 3 лет',purpose:'Текущие расходы',amountRange:'1–3 млн ₽',amount:1000000,term:12,usage:'Всё сразу',repayment:'Регулярная выручка'};
    const a=await json('post','/journey/complete',{answers});
    // A still valid autosave contains the previous form section. Explicit
    // navigation has already committed the next section in the same version.
    await json('put','/journey/draft',{applicationId:a.id,version:a.version,questionnaire:a.questionnaire,section:0,sequence:1});
    await json('put','/journey/position',{applicationId:a.id,view:'questionnaire',section:1});
    await p.goto(base+'/apply');
    await p.getByRole('heading',{name:'Финансы',exact:true}).waitFor();
    await p.getByLabel('Банк',{exact:true}).waitFor();
    await p.reload();await p.getByRole('heading',{name:'Финансы',exact:true}).waitFor();
    return {checks:'PASS',scenario:'explicit saved navigation outranks stale autosave section'};
  } finally {await context.close();}
}
