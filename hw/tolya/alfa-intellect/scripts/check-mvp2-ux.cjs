// Real browser + isolated server/database on 4175 + unchanged Liza on 5001.
// Network latency is introduced only in this test to observe the request-bound preparation screen.
// prettier-ignore
async (page) => {
  const base = "http://localhost:4175",
    checks = [],
    errors = [];
  const ok = (value, message) => {
    if (!value) throw Error(message);
  };
  const field = (name) => page.getByLabel(name, { exact: true }),
    button = (name) => page.getByRole("button", { name, exact: true });
  const consent =
    "Даю согласие на обработку данных, проверку компании и кредитной истории, а также анализ выписок.";
  page.on("pageerror", (e) => errors.push(e.message));
  const json = async (path) =>
    (await page.request.get(base + "/api" + path)).json();
  const until = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await page.waitForTimeout(100);
    }
    throw Error("Backend state timeout");
  };
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/onboarding");
  await field("В какой сфере работает бизнес?").selectOption("Производство");
  await field("Как давно работает бизнес?").selectOption("Более 3 лет");
  await button("Продолжить").click();
  await field("Для чего нужны деньги?").selectOption("Текущие расходы");
  await field("Какая сумма необходима?").fill("3478123");
  ok(
    (await field("Какая сумма необходима?").inputValue()).replaceAll(
      " ",
      "",
    ) === "3478123",
    "Exact amount formatting",
  );
  ok(
    (await field("Сумма финансирования — ползунок").getAttribute(
      "aria-valuetext",
    )) !== null,
    "No exact slider value",
  );
  ok(
    (await field("Сумма финансирования — ползунок").inputValue()) === "3478123",
    "Precise manual amount does not reach slider",
  );
  await field("Сумма финансирования — ползунок").fill("3500000");
  ok(
    (await field("Какая сумма необходима?").inputValue()).replaceAll(
      " ",
      "",
    ) === "3500000",
    "Slider/input not synced",
  );
  await field("Пока не знаю сумму").check();
  ok(
    await field("Какая сумма необходима?").isDisabled(),
    "Unknown still active",
  );
  await field("Пока не знаю сумму").uncheck();
  ok(
    (await field("Какая сумма необходима?").inputValue()) === "",
    "Unchecking invented an amount",
  );
  await field("Какая сумма необходима?").fill("3478123");
  await page.screenshot({
    path: "output/playwright/mvp2-ux-exact-onboarding.png",
    fullPage: true,
  });
  await button("Продолжить").click();
  await page
    .getByRole("heading", {
      name: "Как вы планируете использовать деньги?",
      exact: true,
    })
    .waitFor();
  await field("Как планируете использовать финансирование?").selectOption(
    "Всё сразу",
  );
  await field(
    "За счёт каких поступлений будете возвращать деньги?",
  ).selectOption("Регулярная выручка");
  await page.route("**/api/journey/complete",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Временная ошибка сервиса"})}));
  await button("Продолжить").click();await page.getByRole("alert").filter({hasText:"Временная ошибка сервиса"}).waitFor();
  ok(await field("Как планируете использовать финансирование?").inputValue()==="Всё сразу","Answers reset after recommendation request failure");
  await page.unroute("**/api/journey/complete");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/journey/complete", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await button("Продолжить").click();
  try {
    await page
      .getByRole("heading", {
        name: "Подбираем финансирование для вашего бизнеса",
        exact: true,
      })
      .waitFor();
  } finally {
    release();
  }
  await page
    .getByRole("heading", { name: "Оборотный кредит", exact: true })
    .waitFor();
  await page.unroute("**/api/journey/complete");
  const applicationId = (await json("/journey")).applicationId;
  ok(
    (await json("/mvp2/applications/" + applicationId)).questionnaire.amount ===
      3478123,
    "Exact amount lost in backend",
  );
  checks.push(
    "exact amount, unknown, synchronized slider, backend-bound preparation",
  );
  await button("Проверить доступность и продолжить").click();
  await button("Начать заполнение").waitFor();
  ok(
    (await page.locator(".mvp-layout > aside .application-agent").count()) ===
      1,
    "Intro has no embedded agent",
  );
  await page.screenshot({
    path: "output/playwright/mvp2-ux-intro.png",
    fullPage: true,
  });
  await button("Начать заполнение").click();
  await field("ИНН компании").fill("7707083894");
  await page.locator(".registry-status.invalid").waitFor();
  await field("ИНН компании").fill("9900000001");
  await page
    .getByRole("heading", { name: "ООО «Мок Мастерская»", exact: true })
    .waitFor();
  ok(
    !(await field(consent).isChecked()),
    "Registry required or manufactured consent",
  );
  await field("ИНН компании").fill("99000");
  ok(
    (await page.locator(".company-card").count()) === 0,
    "Old company retained after INN change",
  );
  await page.reload();
  await field("ИНН компании").waitFor();
  ok(
    (await field("ИНН компании").inputValue()) === "99000",
    "Last incomplete INN lost on reload",
  );
  await field("ИНН компании").fill("9900000001");
  await page.locator(".company-card").waitFor();
  await field("Сведения верны").check();
  await field("Я уполномочен оформлять заявку от имени компании").check();
  await field(consent).check();
  await page.screenshot({
    path: "output/playwright/mvp2-ux-company.png",
    fullPage: true,
  });
  await button("Сохранить и продолжить").click();
  ok(
    (await field("Идентификатор счёта").count()) === 0,
    "Manual account identifier remains",
  );
  await field("CSV-выписка счёта 1").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("bad,columns\nx,y"),
  });
  await page
    .locator(".statement-upload")
    .getByRole("alert")
    .filter({ hasText: /колонки/ })
    .waitFor();
  ok(
    await field("CSV-выписка счёта 1").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width <= 1 && r.height <= 1;
    }),
    "Native English file picker is visible",
  );
  await button("Сохранить и продолжить").click();
  await field(
    "Есть ли у бизнеса действующие кредиты или кредитные линии?",
  ).waitFor();
  await field(
    "Есть ли у бизнеса действующие кредиты или кредитные линии?",
  ).selectOption("Да");
  await field("Остаток долга").fill("200000");
  await field(
    "Предстоит ли крупное разовое погашение по действующим кредитам в ближайшие месяцы?",
  ).selectOption("Да");
  await field("Сумма погашения, ₽").fill("50000");
  await field("Планируемая дата погашения").fill("30.02.2027");
  await field("Есть ли у бизнеса действующий лизинг?").selectOption("Да");
  await button("Сохранить и продолжить").click();
  ok(
    (await page.getByRole("alert").count()) > 0,
    "Conditional missing values accepted",
  );
  await field(
    "Есть ли у бизнеса действующие кредиты или кредитные линии?",
  ).selectOption("Нет");
  await field("Есть ли у бизнеса действующий лизинг?").selectOption("Нет");
  ok(
    (await field("Планируемая дата погашения").count()) === 0,
    "Balloon date remains in No branch",
  );
  await button("Сохранить и продолжить").click();
  await field("Есть выраженная сезонность?").waitFor();
  await field("Ожидаются крупные нестандартные операции?").selectOption(
    "Поступления",
  );
  await field("Будущие поступления").fill("50000");
  await field("Ожидаются крупные нестандартные операции?").selectOption("Нет");
  await button("Сохранить и продолжить").click();
  await field("Точная сумма").waitFor();
  await field("Точная сумма").fill("6000000");
  await button("Проверить заявку").click();
  ok(
    (await field("Точная сумма").getAttribute("aria-invalid")) === "true",
    "Product amount limit not highlighted",
  );
  await field("Выбранный продукт").selectOption("INVEST");
  await field("Стоимость проекта").fill("7000000");
  ok(
    (await field(
      "Какой дополнительный денежный результат вы ожидаете от проекта?",
    ).count()) === 1,
    "Investment explanation absent",
  );
  await field("Выбранный продукт").selectOption("WORKING");
  await field("Точная сумма").fill("3478123");
  await button("Проверить заявку").click();
  await page.locator(".client-dossier").waitFor();
  ok(
    (await page.locator(".dossier-card").count()) === 4,
    "Dossier does not have four cards",
  );
  await page.locator(".dossier-details summary").click();
  ok(
    (await page
      .locator(".dossier-details")
      .getByText("Стоимость проекта", { exact: true })
      .count()) === 0,
    "Irrelevant product detail exposed",
  );
  await page.screenshot({
    path: "output/playwright/mvp2-ux-dossier.png",
    fullPage: true,
  });
  await until(async () => (await json("/journey")).view === "dossier");
  await page.reload();
  await page.locator(".client-dossier").waitFor();
  ok(
    (await page.locator(".dossier-amount").textContent()) !== null,
    "Dossier lost on reload",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  ok(
    await page
      .locator("main")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    "Mobile horizontal overflow",
  );
  await page.screenshot({
    path: "output/playwright/mvp2-ux-dossier-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push(
    "public automatic INN, input errors, custom CSV upload, inactive loans/leasing/future, catalog limits, four-card dossier",
  );
  await button("Подать заявку на рассмотрение").click();
  await page
    .getByRole("heading", { name: "Рассматриваем заявку", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Необходимо дополнить заявку", exact: true })
    .waitFor({ timeout: 30000 });
  let a = await json("/mvp2/applications/" + applicationId);
  ok(
    a.decision === "ADDITIONAL_DATA_REQUIRED" &&
      a.questionnaire.amount === 3478123,
    "Missing CSV is not a concrete backend follow-up",
  );
  ok(
    a.questionnaire.balloon === null &&
      a.questionnaire.monthlyLeasing === null &&
      a.questionnaire.projectCost === null,
    "Inactive branches leaked to the dossier",
  );
  await button("Дополнить сведения").click();
  await field("Банк").fill("Учебный банк");
  await field("CSV-выписка счёта 1").setInputFiles(
    "fixtures/mvp2-cashflow.csv",
  );
  await page.getByText(/60 операций · проверено/).waitFor();
  await field(
    "Все основные поступления и расходы есть в выписках?",
  ).selectOption("Да");
  await button("Отправить на повторную проверку").click();
  await page
    .getByRole("heading", {
      name: "Предварительная оценка пройдена",
      exact: true,
    })
    .waitFor({ timeout: 45000 });
  a = await json("/mvp2/applications/" + applicationId);
  ok(
    a.financial?.source.includes("Ядро Лизы /score") &&
      a.stages.every((s) => s.status === "done"),
    "No actual engine pipeline",
  );
  ok(
    (await json("/journey")).applicationId === applicationId,
    "Application changed after submission",
  );
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Предварительная оценка пройдена",
      exact: true,
    })
    .waitFor();
  ok(
    (await json("/mvp2/applications")).length === 1,
    "Submission created duplicate applications",
  );
  checks.push(
    "reload during processing, missing CSV recovery, real Liza result, same persisted application",
  );
  ok(errors.length === 0, errors.join("; "));
  return {
    checks: "PASS",
    scenarios: checks,
    applicationId,
    decision: a.decision,
    pageErrors: errors,
  };
}
