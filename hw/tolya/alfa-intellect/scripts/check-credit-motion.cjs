// Inspect the actual loading state under a delayed network reply on QA only.
// prettier-ignore
async page => {
  const base='http://localhost:4175', errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const f=n=>page.getByLabel(n,{exact:true}), b=n=>page.getByRole('button',{name:n,exact:true});
  await page.unrouteAll();
  const ok=(v,m)=>{if(!v)throw Error(m);};
  await page.goto(base+'/apply');await b('Начать сначала').waitFor();
  if(await b('Тёмная тема').count() && await b('Тёмная тема').getAttribute('aria-pressed')==='true')await b('Тёмная тема').click();
  await b('Начать сначала').click();await b('Да, начать сначала').click();await page.waitForURL(base+'/');
  await page.goto(base+'/onboarding');
  await f('В какой сфере работает бизнес?').selectOption('Производство');await f('Как давно работает бизнес?').selectOption('Более 3 лет');await b('Продолжить').click();
  await f('Для чего нужны деньги?').selectOption('Текущие расходы');await f('Какая сумма необходима?').fill('1000000');await b('Продолжить').click();
  await f('Как планируете использовать финансирование?').selectOption('Всё сразу');await f('За счёт каких поступлений будете возвращать деньги?').selectOption('Регулярная выручка');
  let release;const gate=new Promise(r=>release=r);
  await page.route('**/api/journey/complete',async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
  await b('Продолжить').click();await page.getByRole('heading',{name:'Подбираем финансирование для вашего бизнеса',exact:true}).waitFor();
  ok(await page.locator('.preparation-sphere').count()===1,'Original sphere missing');
  ok(await page.locator('.preparation-orbit > i').count()===3,'Original orbit layers missing');
  ok(!(await page.locator('.credit-motion').innerText()).includes('%'),'Invented progress percentage');
  ok(await page.locator('.sphere-number strong').evaluate(el=>getComputedStyle(el).color===getComputedStyle(el.parentElement).color),'Stage count lacks readable theme contrast');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'output/playwright/stabilization-selection-light.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  ok(await page.locator('.preparation-orbit > i').first().evaluate(el=>getComputedStyle(el).animationName)==='none','Reduced motion ignored');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));ok(await page.locator('.public-header .brand').isVisible(),'Mobile loading header lost branding');await page.screenshot({path:'output/playwright/stabilization-selection-mobile.png'});
  release();await page.getByRole('heading',{name:'Оборотный кредит',exact:true}).waitFor();await page.unrouteAll();await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1440,height:1000});await b('Обратиться к сотруднику').click();
  await f('Контактный телефон').fill('+79991234567');await f('Что хотите обсудить?').fill('Нужна консультация по кредитной заявке');await page.getByRole('checkbox').check();
  await page.route('**/api/consultations',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Не удалось сохранить обращение'})}));
  await b('Сохранить обращение').click();await page.getByRole('alert').filter({hasText:'Не удалось сохранить обращение'}).waitFor();
  ok(await page.getByRole('textbox',{name:'Что хотите обсудить?',exact:true}).inputValue()==='Нужна консультация по кредитной заявке','Contact error lost input');await page.unroute('**/api/consultations');await b('Сохранить обращение').click();
  await page.getByRole('heading',{name:'Обращение сохранено',exact:true}).waitFor();
  const state=await(await page.request.get(base+'/api/state')).json();ok(state.leads.some(l=>l.selectionId==='consultation'),'Contact not persisted');await page.keyboard.press('Escape');
  ok(errors.length===0,errors.join('; '));return {checks:'PASS',scenarios:['original sphere and orbit layers','real pending request without percentage','reduced motion','desktop/mobile composition','contact error/retry and backend persistence'],errors};
}
