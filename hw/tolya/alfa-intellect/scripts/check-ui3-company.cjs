// Reference composition BEFORE adapting the remaining four sections. Isolated 4175 only.
// prettier-ignore
async page => {
  const base="http://localhost:4175", check=(v,m)=>{if(!v)throw Error(m);};
  await page.context().clearCookies();
  await page.goto(base+"/onboarding");
  await page.getByLabel("В какой сфере работает бизнес?",{exact:true}).waitFor();
  const created=await page.request.post(base+"/api/journey/complete",{data:{answers:{industry:"Производство",age:"Более 3 лет",purpose:"Текущие расходы",amountRange:"1–3 млн ₽",amount:1000000,term:12,usage:"Всё сразу",repayment:"Регулярная выручка"}}});
  check(created.ok(),await created.text());
  await page.goto(base+"/apply");
  await page.getByRole("button",{name:"Проверить доступность и продолжить",exact:true}).click();
  await page.getByRole("button",{name:"Начать заполнение",exact:true}).click();
  await page.getByLabel("ИНН компании",{exact:true}).fill("9900000001");
  await page.getByRole("heading",{name:"ООО «Мок Мастерская»",exact:true}).waitFor();
  const geometry=[];
  for(const [width,height] of [[1440,900],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.locator(".credit-form-scroll").evaluate(el=>el.scrollTop=0);
    const rects=await page.locator(".credit-workspace").evaluate(el=>Array.from(el.children).map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};}));
    check(Math.abs(rects[0].w/(rects[0].w+rects[1].w)-.6)<.01,"Not 60/40");
    check(rects.every(r=>r.h>height*.72&&r.bottom<=height),"Panels do not fill available height");
    const footer=await page.locator(".credit-form-actions").boundingBox();
    await page.locator(".credit-form-scroll").evaluate(el=>el.scrollTop=el.scrollHeight);
    const footerAfter=await page.locator(".credit-form-actions").boundingBox();
    check(Math.abs(footer.y-footerAfter.y)<1,"Actions scroll out of view");
    await page.locator(".credit-form-scroll").evaluate(el=>el.scrollTop=0);
    check(await page.getByRole("heading",{name:"Компания",exact:true}).count()===1,"Duplicate company headings");
    check(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth),"Horizontal overflow");
    await page.screenshot({path:"output/playwright/ui3-company-"+width+".png",fullPage:true});
    geometry.push({width,height,panels:rects});
  }
  return {checks:"PASS",geometry};
}
