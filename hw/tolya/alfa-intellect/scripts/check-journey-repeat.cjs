// Playwright CLI expression. Disposable server/database on 4175 only.
// Clear cookies once; repeat submissions with the same browser context afterward.
// prettier-ignore
async page => {
  const base='http://localhost:4175', runs=[], errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const field=name=>page.getByLabel(name,{exact:true});
  const button=name=>page.getByRole('button',{name,exact:true});
  const heading=name=>page.getByRole('heading',{name,exact:true}).waitFor();
  const check=(value,message)=>{if(!value)throw Error(message);};
  const get=async path=>{const r=await page.request.get(base+'/api'+path);check(r.ok(),path+' '+r.status());return r.json();};
  await page.context().clearCookies();
  await page.setViewportSize({width:1440,height:984});
  for(let i=0;i<4;i++) {
    await page.goto(base+'/onboarding');
    await heading('Расскажите о бизнесе');
    check(await field('В какой сфере работает бизнес?').inputValue()==='', 'Previous answers restored on a new pass');
    const owner=(await get('/config')).workspaceId;
    check(!runs.some(r=>r.owner===owner),'Previous owner reused');
    await field('В какой сфере работает бизнес?').selectOption('Производство');
    await field('Как давно работает бизнес?').selectOption('Более 3 лет');
    await button('Продолжить').click();
    await heading('Ваша задача');
    await field('Для чего нужны деньги?').selectOption('Текущие расходы');
    const amount=1000000+i*100000;
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/journey/onboarding')&&r.request().postDataJSON()?.answers.amount===amount&&r.ok());
    await field('Какая сумма необходима?').fill(String(amount));await saved;
    await page.reload();await heading('Ваша задача');
    check(Number((await field('Какая сумма необходима?').inputValue()).replace(/\D/g,''))===amount,'Draft reload lost amount');
    check((await get('/config')).workspaceId===owner,'Draft reload restarted the journey');
    await button('Продолжить').click();
    await heading('Как вы планируете использовать деньги?');
    await field('Как планируете использовать финансирование?').selectOption('Всё сразу');
    await field('За счёт каких поступлений будете возвращать деньги?').selectOption('Регулярная выручка');
    await button('Продолжить').click();await heading('Оборотный кредит');
    const position=await get('/journey'), a=await get('/mvp2/applications/'+position.applicationId);
    check(!runs.some(r=>r.id===a.id),'Previous application overwritten');
    check(a.questionnaire.amount===amount,'New answers were lost');
    // Submit incomplete data deliberately: this must be a real missing-data result,
    // not a fixture decision or a reason to prohibit the next onboarding.
    const submit=await page.request.post(base+'/api/mvp2/applications/'+a.id+'/submit',{data:{version:a.version}});
    check(submit.status()===202,'Submission rejected: '+await submit.text());
    let result;
    for(let n=0;n<100;n++) {
      result=await get('/mvp2/applications/'+a.id);
      if(!['SUBMITTED','PROCESSING'].includes(result.lifecycle))break;
      await page.waitForTimeout(100);
    }
    check(result.decision==='ADDITIONAL_DATA_REQUIRED','Expected missing-data decision');
    runs.push({owner,id:a.id,amount,decision:result.decision});
    await page.reload();await heading('Необходимо дополнить заявку');
  }
  await page.goto(base+'/onboarding');await heading('Расскажите о бизнесе');
  check((await get('/journey')).applicationId===null,'Old application pinned the new journey');
  check(await field('В какой сфере работает бизнес?').inputValue()==='','Last pass not fresh');
  for(const old of runs)check((await page.request.get(base+'/api/mvp2/applications/'+old.id)).status()===404,'Fresh session can access prior owner data');
  await page.screenshot({path:'output/playwright/repeat-fresh-onboarding.png',fullPage:true});
  check(errors.length===0,errors.join('; '));
  return {checks:'PASS',runs,fifthPass:'empty onboarding without clearing cookies',errors};
}
