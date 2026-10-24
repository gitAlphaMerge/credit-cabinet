// Run with Playwright CLI against a disposable database on 4175 and CORE_ID=liza.
// No real customer data, external LLM, signature or bank transfer.
// prettier-ignore
async page => {
  const base="http://localhost:4175";
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const button=name=>page.getByRole("button",{name,exact:true}),field=name=>page.getByLabel(name,{exact:true});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(base+"/onboarding");
  await field("В какой сфере работает бизнес?").selectOption("Производство");
  await field("Как давно работает бизнес?").selectOption("Более 3 лет");
  await button("Продолжить").click();
  await field("Для чего нужны деньги?").selectOption("Текущие расходы");
  await field("Какая сумма необходима?").selectOption("1–3 млн ₽");
  await button("Продолжить").click();
  await field("Как будете использовать деньги?").selectOption("Всё сразу");
  await field("За счёт чего будете возвращать?").selectOption("Регулярная выручка");
  await button("Продолжить").click();
  await field("Номер телефона").fill("7"+String(Date.now()).slice(-10));
  await field("Пароль").fill("Synthetic-MVP2-only-123");
  await button("Создать аккаунт").click();
  await page.getByRole("heading",{name:"Оборотный кредит",exact:true}).waitFor({timeout:20000});
  check(await page.getByText("ПРЕДВАРИТЕЛЬНЫЙ ПОДБОР · НЕ ОДОБРЕНИЕ").count()===1,"Recommendation missing");
  await page.request.patch(base+"/api/preferences",{data:{tourDone:true}});
  await button("Посмотреть все продукты").click();check(await page.locator(".mvp-products article").count()===6,"Catalog incomplete");
  await page.locator(".mvp-products article").filter({has:page.getByRole("heading",{name:"Возобновляемая кредитная линия",exact:true})}).getByRole("button",{name:"Выбрать",exact:true}).click();
  await button("Посмотреть все продукты").click();await page.locator(".mvp-products article").filter({has:page.getByRole("heading",{name:"Оборотный кредит",exact:true})}).getByRole("button",{name:"Выбрать",exact:true}).click();
  await button("Проверить доступность и продолжить").click();await button("Начать заполнение").click();
  await button("Сохранить и продолжить").click();check(await page.getByRole("alert").count()>0,"Empty fields accepted without inline errors");
  await field("Проверка компании в синтетическом реестре").check();await field("Обработка и финансовый анализ загруженных CSV").check();await field("Проверка синтетической кредитной истории").check();
  await field("ИНН компании").fill("9900000001");await button("Найти компанию").click();await page.getByRole("heading",{name:"ООО «Мок Мастерская»",exact:true}).waitFor();
  await field("Сведения компании верны").check();await field("Я уполномочен оформлять заявку от имени компании").check();await button("Сохранить и продолжить").click();
  await field("Банк").fill("Учебный банк");
  await field("CSV-выписка счёта 1").setInputFiles("fixtures/mvp2-cashflow.csv");
  await page.getByText(/60 операций · проверено/).waitFor();
  await field("Все основные поступления и расходы есть в выписках?").selectOption("Да");await button("Сохранить и продолжить").click();
  await field("Есть действующие кредиты или линии?").selectOption("Нет");await button("Сохранить и продолжить").click();await button("Сохранить и продолжить").click();
  await field("Точная сумма").fill("3000000");await field("Точный срок").fill("12");await button("Проверить заявку").click();
  await page.screenshot({path:"output/playwright/mvp2-dossier.png",fullPage:true});
  await button("Подать заявку на рассмотрение").click();await page.getByRole("heading",{name:"Ваш кредит одобрен",exact:true}).waitFor({timeout:45000});
  const a=(await (await page.request.get(base+"/api/mvp2/applications")).json())[0];
  check(a.decision==="APPROVED"&&a.questionnaire.amount===3000000,"Wrong decision at boundary");
  check(a.stages.every(s=>s.status==="done"),"Backend stages not complete");
  await page.reload();await page.getByRole("heading",{name:"Ваш кредит одобрен",exact:true}).waitFor();
  await button("Обсудить с агентом").click();await button("Вернуться к решению").waitFor();check(await field("Сообщение финансовому помощнику").count()===1,"Not existing full chat");await button("Вернуться к решению").click();
  await page.setViewportSize({width:390,height:844});check(await page.locator("main").evaluate(el=>el.scrollWidth<=el.clientWidth+1),"Mobile overflow");await page.screenshot({path:"output/playwright/mvp2-decision-mobile.png",fullPage:true});await page.setViewportSize({width:1440,height:1000});
  await button("Перейти к подписанию").click();await field("Подписант").fill("Синтетический Представитель");await field("Основание полномочий").fill("Устав учебной организации");await field("Счёт получателя (20 цифр)").fill("40702810000000000001");await field("Банк получателя").fill("Учебный банк");await button("Сформировать договор").click();
  await page.getByTitle("Кредитный договор",{exact:true}).waitFor();check((await page.request.get(base+`/api/mvp2/applications/${a.id}/documents/contract`)).headers()["x-frame-options"]==="SAMEORIGIN","PDF frame blocked");
  await page.screenshot({path:"output/playwright/mvp2-contract.png",fullPage:true});
  await field("Ознакомился с договором и условиями обслуживания").check();await button("Подписать электронной подписью").click();await page.getByRole("heading",{name:"Кредитный договор подписан",exact:true}).waitFor();
  await button("Получить деньги").click();await page.waitForURL(base+"/cabinet");await page.getByRole("heading",{name:"Документы",exact:true}).count();await page.getByRole("link",{name:"Подписанный договор PDF",exact:true}).waitFor();
  check((await (await page.request.get(base+"/api/state")).json()).cabinet.facility.applicationId===a.id,"Active facility not integrated");
  await page.screenshot({path:"output/playwright/mvp2-cabinet.png",fullPage:true});
  check(errors.length===0,errors.join("; "));
  return {checks:"PASS",applicationId:a.id,core:"real liza /score",scenarios:["7-question onboarding","catalog/manual selection","inline errors","CSV","persisted dossier","exact 3m approval","reload","existing chat","mobile","PDF preview","signature","one disbursement","existing cabinet"],errors};
}
