// Uses the isolated 4174 account created by check-unified-cabinet.cjs.
// prettier-ignore
async page => {
  const base="http://localhost:4174",check=(v,m)=>{if(!v)throw new Error(m);};
  if(!page.url().startsWith(base))throw new Error("Use isolated 4174 only");
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  const snap=async name=>{await page.waitForTimeout(220);await page.screenshot({path:"output/playwright/unified-"+name+".png"});};
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+"/cabinet");await page.locator(".unified-cabinet").waitFor();
  const next=await page.locator(".cv-next").boundingBox(),graph=await page.locator(".cv-debt-chart").boundingBox();check(Math.abs(next.y-graph.y)<2,"Original two-card layout lost");
  const info=page.getByRole("button",{name:"Что означает прогноз денег после платежа",exact:true});await info.hover();let tip=page.getByRole("tooltip");await tip.getByText("Нужные данные",{exact:true}).waitFor();check((await tip.innerText()).includes("банковская выписка"),"Forecast requirements unclear");await snap("forecast-explanation");await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Календарь платежей",exact:true}).click();let cal=page.getByRole("dialog",{name:"Календарь платежей",exact:true});
  const box=await cal.boundingBox();check(box.width<=380&&box.height<800,"Calendar became fullscreen");check(box.x>=12&&box.y>=12&&box.x+box.width<=1440-12&&box.y+box.height<=1000-12,"Calendar clipped");
  const currentYear=new Date().getFullYear(),year=cal.getByLabel("Год календаря",{exact:true}),month=cal.getByLabel("Месяц календаря",{exact:true});
  check((await year.locator("option").allTextContents()).includes(String(currentYear+3)),"Cannot navigate three years ahead");
  await year.selectOption(String(currentYear+3));await month.selectOption("11");check(await cal.getByRole("button",{name:"Следующий месяц",exact:true}).isDisabled(),"Year boundary not bounded");
  await year.selectOption(String(currentYear));await month.selectOption(String(new Date().getMonth()));
  const payment=cal.getByRole("button",{name:/ · платёж /}).first();await payment.focus();check((await cal.locator(".cv-calendar-detail").innerText()).includes("Плановый платёж"),"Date keyboard details absent");
  await snap("calendar-compact");await page.keyboard.press("Escape");check(await cal.count()===0,"Calendar not closed");check(await page.getByRole("button",{name:"Календарь платежей",exact:true}).evaluate(el=>el===document.activeElement),"Calendar did not restore focus");
  await page.getByRole("button",{name:"Календарь платежей",exact:true}).click();await cal.waitFor();await page.getByRole("heading",{name:"Кредитный кабинет",exact:true}).click();await cal.waitFor({state:"detached"});
  await page.locator(".cv-metrics").scrollIntoViewIfNeeded();check(await page.locator(".cv-metric").count()===4,"Not four inline metrics");check(await page.locator(".metric-scale-track i").count()===3,"Missing values received a marker");await snap("indicators");
  await page.setViewportSize({width:390,height:844});
  const metric=page.getByRole("button",{name:"О показателе: Рентабельность продаж",exact:true});await metric.click();tip=page.getByRole("tooltip");await tip.getByText("Формула",{exact:true}).waitFor();const mobile=await tip.boundingBox();check(mobile.x>=12&&mobile.y>=12&&mobile.x+mobile.width<=378&&mobile.y+mobile.height<=832,"Mobile help clipped");await snap("metric-mobile");await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Календарь платежей",exact:true}).click();await cal.waitFor();const small=await cal.boundingBox();check(small.x>=12&&small.y>=12&&small.x+small.width<=378&&small.y+small.height<=832,"Mobile calendar clipped");await snap("calendar-mobile");await cal.getByRole("button",{name:"Закрыть календарь",exact:true}).click();
  await page.setViewportSize({width:1440,height:1500});await page.locator(".cabinet-scroll").evaluate(el=>el.scrollTop=0);await snap("overview");
  await page.goto(base+"/demo");await page.locator(".unified-cabinet").waitFor();check(await page.locator(".cv-training-label").count()===0,"Public demo incorrectly labelled as onboarding");check(await page.locator(".cv-metric").count()===4,"Demo uses a different cabinet");await snap("public-demo");
  check(errors.length===0,errors.join(";"));return {checks:"PASS",calendar:"anchored, 3 years, keyboard, outside click, Escape, focus return",metrics:"hover, focus, tap, neutral missing values",demo:"same unified cabinet",errors};
}
