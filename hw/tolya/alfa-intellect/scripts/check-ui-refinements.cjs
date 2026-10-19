// playwright-cli run-code --filename=scripts/check-ui-refinements.cjs
// prettier-ignore
async (page) => {
  const results = [];
  const origin = "http://localhost:4174";
  if (!page.url().startsWith(origin))
    throw new Error("Use isolated test server 4174");
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  const registration = await page.request.post(origin + "/api/auth/register", {
    data: {
      phone: "+7" + String(Date.now()).slice(-10),
      password: "Smoke-test-1710",
      profile: {
        name: "Проверка интерфейса",
        form: "ООО",
        registered: true,
        stage: "operating",
        sector: "Производство",
        ageBand: "3–5 лет",
        result: "Прибыль",
        debt: "Нет",
        intent: "Подобрать финансирование",
      },
    },
  });
  assert(registration.ok(), "Temporary account setup failed");
  await page.goto(origin + "/cabinet");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (width === 390)
      await page.getByRole("button", { name: "Обучение", exact: true }).click();
    for (const [i, target] of [
      "summary",
      "payment",
      "forecast",
      "chat-panel",
      "financing",
      "profile",
    ].entries()) {
      const dialog = page.getByRole("dialog", {
        name: "Знакомство с продуктом",
      });
      await dialog.getByText(`${i + 1} из 6`, { exact: true }).waitFor();
      await page.waitForFunction((key) => {
        const t = document
          .querySelector(`[data-tour="${key}"]`)
          ?.getBoundingClientRect();
        const h = document
          .querySelector(".guided-highlight")
          ?.getBoundingClientRect();
        return (
          t &&
          h &&
          t.width > 0 &&
          h.left <= t.left &&
          h.right >= t.right &&
          Math.abs(h.top - Math.max(4, t.top - 4)) < 2
        );
      }, target);
      const rect = await dialog.boundingBox();
      assert(
        rect &&
          rect.x >= 0 &&
          rect.x + rect.width <= width + 1 &&
          rect.y + rect.height <= (width === 390 ? 844 : 900) + 1,
        "Tour card outside viewport",
      );
      if (i >= 4)
        await page.screenshot({
          path: `hw/tolya/alfa-intellect/output/playwright/refinement-tour-${target}-${width}.png`,
        });
      await dialog
        .getByRole("button", { name: i === 5 ? "Завершить" : "Далее" })
        .click();
    }
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const state = await (await page.request.get(origin + "/api/state")).json();
    assert(
      state.credit === null && Object.keys(state.financials).length === 0,
      "Tour persisted preview figures",
    );
    const body = await page.locator("body").innerText();
    assert(
      !body.includes("Сводка, платежи") &&
        !body.includes("Обратиться к сотруднику") &&
        !body.includes("Учебный пример"),
      "Removed cabinet copy remains",
    );
    assert(
      (await page.locator(".credit-only").count()) === 1,
      "Cabinet not full width by default",
    );
    await page.locator(".cabinet-scroll").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `hw/tolya/alfa-intellect/output/playwright/refinement-cabinet-${width}.png`,
    });
    results.push({ width, tour: "6/6", previewNotSaved: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-tour="profile"]').click();
  await page
    .getByRole("heading", { name: "Общие сведения", exact: true })
    .waitFor();
  const inn = page.getByRole("textbox", { name: "ИНН", exact: true });
  await inn.fill("770421370");
  await page.getByRole("button", { name: "Найти по ИНН" }).click();
  await page
    .getByRole("alert")
    .getByText(/Сейчас введено 9/)
    .waitFor();
  assert(
    await inn.evaluate((el) => el.validity.valid),
    "Native English pattern validation is active",
  );
  await inn.fill("7707083893");
  await page.getByRole("button", { name: "Найти по ИНН" }).click();
  await page
    .getByRole("alert")
    .getByText(/нужно настроить ключ/)
    .waitFor();
  assert(
    (await page
      .getByRole("link", { name: /официальный поиск ФНС/ })
      .getAttribute("href")) === "https://egrul.nalog.ru/index.html",
    "Missing official FNS link",
  );
  await page.screenshot({
    path: "hw/tolya/alfa-intellect/output/playwright/refinement-inn.png",
  });
  await page
    .getByRole("button", { name: "Кредитный кабинет", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Разобрать показатели" }).click();
  await page
    .getByRole("heading", { name: "Эффективность кредитных средств" })
    .waitFor();
  assert(
    !(await page.locator("body").innerText()).includes("NaN"),
    "NaN in efficiency",
  );
  await page.screenshot({
    path: "hw/tolya/alfa-intellect/output/playwright/refinement-efficiency-empty.png",
  });
  const selection = await page.request.post(origin + "/api/selections", {
    data: {
      purpose: "Оборудование",
      amount: 1000000,
      term: 36,
      flow: 150000,
      existing: 10000,
      repayFrom: "Выручка",
      ownFunds: 0,
    },
  });
  assert(selection.ok(), "Test financing calculation failed");
  await page.reload();
  await page
    .getByText("Последний сохранённый расчёт · не действующий кредит")
    .first()
    .waitFor();
  assert(
    (await page.locator(".efficiency-grid strong").first().innerText()) !== "—",
    "Metrics not calculated",
  );
  await page.screenshot({
    path: "hw/tolya/alfa-intellect/output/playwright/refinement-efficiency.png",
  });
  for (const width of [1440, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Page overflow " + width,
    );
    const overflow = await page.locator(".app-header").evaluate((root) =>
      [...root.querySelectorAll("button")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1);
        })
        .map((el) => el.textContent),
    );
    assert(!overflow.length, "Header overflow " + width + ": " + overflow);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Чат", exact: true }).click();
  await page
    .locator(".composer-row textarea")
    .fill("Какие документы нужны для подбора?");
  await page
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await page
    .getByText("Демо · программный сценарий", { exact: true })
    .waitFor();
  const chatText = await page.locator("body").innerText();
  assert(
    !chatText.includes("ИИ не подключён") &&
      !chatText.includes("Обратиться к сотруднику"),
    "Removed chat copy remains",
  );
  await page.screenshot({
    path: "hw/tolya/alfa-intellect/output/playwright/refinement-chat.png",
  });
  await page.goto(origin + "/");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Public brand overflow on mobile");
  await page.screenshot({ path: "hw/tolya/alfa-intellect/output/playwright/refinement-landing-mobile.png" });
  assert(runtimeErrors.length === 0, "Browser runtime errors: " + runtimeErrors.join(", "));
  console.log(
    JSON.stringify({
      results,
      inn: "Russian validation + explicit missing-key state",
      efficiency: "empty and saved selection",
      responsive: [1440, 1100, 768, 390],
    }),
  );
}
