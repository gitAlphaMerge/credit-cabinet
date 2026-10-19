// Run only on the isolated temporary database at 4174, not the user's account.
// prettier-ignore
async page => {
  const base = "http://localhost:4174", check = (v, message) => { if (!v) throw new Error(message); };
  if (!page.url().startsWith(base)) throw new Error("Use isolated 4174 only");
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const today = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Moscow"}).format(new Date()),
    year = Number(today.slice(0, 4)), russian = iso => iso.split("-").reverse().join("."),
    next = new Date(Date.parse(today) + 3 * 86400000).toISOString().slice(0, 10);
  check((await page.request.post(base + "/api/auth/register", {data:{phone:"+7" + String(Date.now()).slice(-10),password:"Date-picker-test18",profile:{name:"Проверка календарей",form:"ООО",stage:"operating",sector:"Услуги",registered:true,ageBand:"3–5 лет",result:"Прибыль",debt:"Нет",intent:"Подобрать финансирование"}}})).ok(), "Registration failed");
  await page.request.patch(base + "/api/preferences", {data:{tourDone:true}});
  let payload; page.on("request", request => { if (request.url().endsWith("/api/cabinet/facility") && request.method() === "POST") payload = request.postDataJSON(); });
  await page.setViewportSize({width:1440,height:1000}); await page.goto(base + "/cabinet");
  await page.getByRole("button",{name:"Добавить кредит",exact:true}).click();
  const modal = page.getByRole("dialog",{name:"Добавить действующий кредит",exact:true}),
    field = name => modal.getByLabel(name,{exact:true}),
    issued = field("Дата выдачи кредита"), payment = field("Дата ближайшего платежа"),
    popup = () => page.locator(".date-input-popup:popover-open"),
    launch = name => modal.getByRole("button",{name:"Открыть календарь: " + name,exact:true}),
    screenshot = async name => { await page.screenshot({path:"output/playwright/dates-" + name + ".png"}); },
    fits = async () => {
      const box = await popup().boundingBox(), size = page.viewportSize();
      check(box && box.x >= 10 && box.y >= 10 && box.x + box.width <= size.width - 10 && box.y + box.height <= size.height - 10, "Calendar is clipped outside viewport");
      check(await modal.evaluate(el => el.scrollWidth <= el.clientWidth), "Form overflows horizontally");
    };
  check(await modal.locator('input[type="date"]').count() === 0, "Native date controls remain");
  check(await modal.locator("select").count() === 0, "Schedule source selector remains");
  check(!(await modal.innerText()).includes("Откуда взять график"), "Schedule source text remains");
  for (const input of [issued,payment]) {
    check(await input.getAttribute("placeholder") === "ДД.ММ.ГГГГ", "Russian date hint missing");
    check(await input.inputValue() === "", "Arbitrary dates prefilled");
  }
  await issued.fill("31022026"); check(await issued.inputValue() === "31.02.2026", "Mask not applied");
  check(await issued.getAttribute("aria-invalid") === "true", "Impossible date accepted");
  await issued.fill("2024-02-29"); check(await issued.inputValue() === "29.02.2024", "ISO paste not displayed in Russian");
  await issued.fill(""); await issued.pressSequentially("29022024"); check(await issued.inputValue() === "29.02.2024", "Typing digits lost separators or caret");
  await launch("Дата выдачи кредита").click(); await popup().waitFor(); await fits();
  await launch("Дата выдачи кредита").click(); check(await popup().count() === 0, "Calendar icon does not toggle picker closed");
  await launch("Дата выдачи кредита").click(); await popup().waitFor();
  check(await popup().getByText("Пн",{exact:true}).count() === 1 && await popup().getByText("Вс",{exact:true}).count() === 1, "Russian weekdays missing");
  check(await popup().locator(".date-input-grid > *").count() === 49, "Calendar does not keep six fixed weeks");
  await popup().getByRole("button",{name:"Год",exact:true}).click();
  await popup().getByRole("option",{name:String(year),exact:true}).click();
  await popup().getByRole("button",{name:"Месяц",exact:true}).click();
  await page.keyboard.press("Escape"); check(await popup().count() === 1, "Escape closed form instead of month menu");
  await page.keyboard.press("Escape"); check(await popup().count() === 0, "Escape did not close picker");
  check(await modal.isVisible(), "Escape dismissed credit form");
  await launch("Дата выдачи кредита").click();
  await popup().getByRole("button",{name:"Год",exact:true}).click(); await popup().getByRole("option",{name:"2024",exact:true}).click();
  await popup().getByRole("button",{name:"Месяц",exact:true}).click(); await popup().getByRole("option",{name:"февраль",exact:true}).click();
  await popup().locator('[data-date="2024-02-29"]').click(); check(await issued.inputValue() === "29.02.2024", "Leap day not selected");
  await launch("Дата выдачи кредита").click(); await screenshot("issued-desktop");
  await modal.getByRole("button",{name:"Сохранить кредит",exact:true}).focus(); await page.keyboard.press("Tab");
  check(await modal.getByRole("button",{name:"Закрыть",exact:true}).evaluate(el => el === document.activeElement), "Tab escaped parent modal with picker open");
  await popup().locator('[data-date="2024-02-29"]').focus();
  await popup().locator('[data-date="2024-02-29"]').focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  check(await issued.inputValue() === "01.03.2024", "Keyboard navigation did not cross month boundary");
  await issued.fill(""); await issued.press("ArrowDown"); await popup().waitFor();
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0,10);
  if (tomorrow.slice(0,7) === today.slice(0,7)) check(await popup().locator(`[data-date="${tomorrow}"]`).isDisabled(), "Future issue date enabled");
  check(await popup().getByRole("button",{name:"Следующий месяц",exact:true}).isDisabled(), "Can navigate beyond issue boundary");
  await page.keyboard.press("Escape");
  await launch("Дата ближайшего платежа").click(); await popup().waitFor(); await fits();
  const before = await popup().boundingBox(); await popup().getByRole("button",{name:"Следующий месяц",exact:true}).click(); const after = await popup().boundingBox();
  check(Math.abs(before.y-after.y) <= 1 && Math.abs(before.height-after.height) <= 1, "Calendar jumps on month navigation");
  await popup().getByRole("button",{name:"Год",exact:true}).click(); await popup().getByRole("option",{name:String(year+1),exact:true}).click();
  await popup().getByRole("button",{name:"Месяц",exact:true}).click(); await screenshot("payment-month-menu"); await page.keyboard.press("Escape");
  await popup().getByRole("button",{name:"Сегодня",exact:true}).click();
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0,10);
  if (yesterday.slice(0,7) === today.slice(0,7)) check(await popup().locator(`[data-date="${yesterday}"]`).isDisabled(), "Past payment date enabled");
  await popup().locator(`[data-date="${today}"]`).click(); check(await payment.inputValue() === russian(today), "Payment selection not reflected in input");
  for (const size of [{width:807,height:707},{width:390,height:844}]) {
    await page.setViewportSize(size);
    for (const name of ["Дата выдачи кредита","Дата ближайшего платежа"]) {
      await launch(name).click(); await popup().waitFor(); await fits();
      await popup().getByRole("button",{name:"Год",exact:true}).click(); await screenshot(size.width+"-"+(name.includes("выдачи")?"issued":"payment"));
      await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); check(await modal.isVisible(), "Narrow screen picker closed the form");
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await launch("Дата выдачи кредита").click(); await field("Первоначальная сумма, ₽").click(); check(await popup().count() === 0, "Outside click did not dismiss picker");
  check(!payload, "Picker controls accidentally submitted form");
  await field("Название договора").fill("Кредит на оборудование"); await field("Первоначальная сумма, ₽").fill("1000000");
  await field("Остаток основного долга сегодня, ₽").fill("500000"); await field("Годовая ставка, %").fill("18"); await field("Оставшийся срок, месяцев").fill("24");
  await issued.fill("29.02.2024"); await payment.fill(russian(next)); await screenshot("form-ready");
  await modal.getByRole("button",{name:"Сохранить кредит",exact:true}).click(); await modal.waitFor({state:"detached"});
  check(payload.issuedDate === "2024-02-29" && payload.firstDate === next, "Display format leaked into API");
  check(!("documentId" in payload), "Removed schedule source still submitted");
  const state = await (await page.request.get(base + "/api/state")).json();
  check(state.cabinet.facility.events[0].date === next && state.cabinet.facility.issuedAt === "2024-02-29", "Schedule or issue date was not persisted");
  check(errors.length === 0, errors.join(";"));
  return {checks:"PASS",dates:"Russian mask, ISO API, leap day, invalid drafts, limits",calendar:"custom month/year, fixed weeks, keyboard, nested Escape, outside dismiss",sizes:[1440,807,390],save:"automatic schedule, no document source",errors};
}
