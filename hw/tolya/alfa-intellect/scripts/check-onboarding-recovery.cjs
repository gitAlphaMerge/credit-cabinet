// Dedicated QA server on 4175; the 14 mandatory onboarding regressions.
// prettier-ignore
async page => {
 const base='http://localhost:4175',checks=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const f=n=>page.getByLabel(n,{exact:true}),b=n=>page.getByRole('button',{name:n,exact:true});
 const ok=(v,m)=>{if(!v)throw Error(m);},get=async()=> (await(await page.request.get(base+'/api/journey')).json());
 const h=async text=>page.getByRole('heading',{name:text,exact:true}).waitFor();
 const click=async name=>{await b(name).click();};
 await page.unrouteAll();await page.goto('about:blank');await page.context().clearCookies();await page.setViewportSize({width:1440,height:900});
 await page.goto(base+'/onboarding');await h('Расскажите о бизнесе');checks.push(1);
 await f('В какой сфере работает бизнес?').selectOption('Производство');await f('Как давно работает бизнес?').selectOption('Более 3 лет');
 let fail=true;
 await page.route('**/api/journey/onboarding',async route=>{if(fail&&route.request().postDataJSON()?.step===1)await route.abort();else await route.continue();});
 await click('Продолжить');await page.getByRole('alert').waitFor();await h('Расскажите о бизнесе');ok((await get()).onboardingStep===0,'Failed transition advanced backend');
 await page.screenshot({path:'output/playwright/recovery-save-error.png',fullPage:true});
 fail=false;await click('Продолжить');await h('Ваша задача');ok((await get()).onboardingStep===1,'Visible step is not persisted');checks.push(2);
 await f('Для чего нужны деньги?').selectOption('Текущие расходы');await f('Какая сумма необходима?').fill('3478123');
 await click('Продолжить');await h('Как вы планируете использовать деньги?');checks.push(3);
 await click('Назад');await h('Ваша задача');ok((await f('Какая сумма необходима?').inputValue()).replace(/\D/g,'')==='3478123','Back lost exact amount');checks.push(8);
 await page.reload();await h('Ваша задача');ok((await f('Какая сумма необходима?').inputValue()).replace(/\D/g,'')==='3478123','Reload lost step 2');checks.push(9);
 await click('Назад');await h('Расскажите о бизнесе');ok(await f('Как давно работает бизнес?').inputValue()==='Более 3 лет','Back lost first answers');checks.push(5);
 await f('В какой сфере работает бизнес?').selectOption('IT');await h('Расскажите о бизнесе');checks.push(6);
 await click('Продолжить');await h('Ваша задача');checks.push(7);
 await click('Продолжить');await h('Как вы планируете использовать деньги?');
 await f('Как планируете использовать финансирование?').selectOption('Всё сразу');
 const finalAnswer=page.waitForResponse(r=>r.url().endsWith('/api/journey/onboarding')&&r.request().postDataJSON()?.answers.repayment==='Регулярная выручка'&&r.status()===200);
 await f('За счёт каких поступлений будете возвращать деньги?').selectOption('Регулярная выручка');
 // Persist all fields before reloading the third screen.
 await finalAnswer;
 await page.reload();await h('Как вы планируете использовать деньги?');checks.push(10);
 await click('Назад');await h('Ваша задача');await click('Назад');await h('Расскажите о бизнесе');
 await page.unrouteAll();let blocked;const gate=new Promise(r=>blocked=r);
 await page.route('**/api/journey/onboarding',async route=>{if(route.request().postDataJSON()?.step===1)await gate;await route.continue();});
 await b('Продолжить').evaluate(el=>{el.click();el.click();el.click();});await page.waitForTimeout(150);
 await h('Расскажите о бизнесе');blocked();await h('Ваша задача');ok((await get()).onboardingStep===1,'Burst skipped screen');checks.push(11);
 await page.unrouteAll();
 // Delay acknowledgement of an older save while a newer edit is already visible.
 let release;const oldReply=new Promise(r=>release=r);
 await page.route('**/api/journey/onboarding',async route=>{const response=await route.fetch();if(route.request().postDataJSON()?.answers.amount===2000000){await oldReply;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Устаревший запрос не подтверждён'})});}else await route.fulfill({response});});
 await f('Какая сумма необходима?').fill('2000000');await f('Какая сумма необходима?').fill('2999999');release();
 await click('Продолжить');await h('Как вы планируете использовать деньги?');ok((await get()).onboarding.amount===2999999,'Delayed restore rolled back current answers');ok(await page.getByRole('alert').count()===0,'Obsolete failed save overwrote current successful status');checks.push(12);
 await page.unrouteAll();await click('Продолжить');await page.getByRole('heading',{name:'Оборотный кредит',exact:true}).waitFor();checks.push(4);
 const position=await get();const id=position.applicationId;
 await b('Изменить условия').click();await f('Для чего нужны деньги?').selectOption('Оборудование/транспорт');
 await b('Применить изменения').click();await page.getByRole('heading',{name:'Инвестиционный кредит',exact:true}).waitFor();
 ok((await get()).applicationId===id,'Recommendation edit replaced application');checks.push(14);
 await page.screenshot({path:'output/playwright/recovery-onboarding-result.png',fullPage:true});
 await page.goto('about:blank');await page.context().clearCookies();await page.goto(base+'/apply');await h('Расскажите о бизнесе');ok((await get()).applicationId===null,'Incomplete direct result created an application');checks.push(13);
 ok(errors.length===0,errors.join('; '));return {checks:'PASS',mandatory:checks.sort((a,b)=>a-b),applicationId:id,errors};
}
