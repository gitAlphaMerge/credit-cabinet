// Playwright CLI, isolated QA database on 4175, actual unchanged Liza core.
// Preparatory data uses HTTP endpoints, never patched decisions or UI flags.
// prettier-ignore
async (page, managerCookie = null) => {
  const base = "http://localhost:4175";
  const check = (ok, text) => {
    if (!ok) throw new Error(text);
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const answers = {
    industry: "Производство",
    age: "Более 3 лет",
    purpose: "Текущие расходы",
    amountRange: "1–3 млн ₽",
    term: 12,
    usage: "Всё сразу",
    repayment: "Регулярная выручка",
  };
  async function post(path, data) {
    const r = await page.request.post(base + "/api" + path, { data });
    check(r.ok(), path + " " + (await r.text()));
    return r.json();
  }
  async function put(path, data) {
    const r = await page.request.put(base + "/api" + path, { data });
    check(r.ok(), path + " " + (await r.text()));
    return r.json();
  }
  async function result(id) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const a = await (
        await page.request.get(base + "/api/mvp2/applications/" + id)
      ).json();
      if (!["SUBMITTED", "PROCESSING"].includes(a.lifecycle)) return a;
      await page.waitForTimeout(100);
    }
    throw new Error("Backend processing timeout");
  }
  async function prepare(
    amount,
    inn = "9900000001",
    csv = true,
    lowFlow = false,
  ) {
    await page.context().clearCookies();
    await page.goto(base + "/");
    await button("Подобрать финансирование").waitFor();
    let a = await post("/journey/complete", { answers });
    const q = {
      ...a.questionnaire,
      amount,
      inn,
      authorized: true,
      consents: { registry: true, financial: true, bki: true },
      complete: "yes",
      loans: "no",
      leasing: "no",
    };
    q.accounts[0].bank = "Учебный банк";
    a = await put("/mvp2/applications/" + a.id, {
      version: a.version,
      questionnaire: q,
    });
    a = await post("/mvp2/applications/" + a.id + "/registry", {
      version: a.version,
    });
    a = await put("/mvp2/applications/" + a.id, {
      version: a.version,
      questionnaire: { ...a.questionnaire, companyConfirmed: true },
    });
    if (csv) {
      const upload = await page.request.post(
        base + "/api/mvp2/applications/" + a.id + "/statements",
        {
          multipart: {
            version: String(a.version),
            accountId: a.questionnaire.accounts[0].id,
            file: {
              name: "cash.csv",
              mimeType: "text/csv",
              buffer: lowFlow
                ? Buffer.from(
                    (
                      await (
                        await page.request.get(
                          base + "/fixtures/mvp2-cashflow.csv",
                        )
                      ).text()
                    ).replaceAll(
                      ",500000,ООО Покупатель",
                      ",150000,ООО Покупатель",
                    ),
                  )
                : await (
                    await page.request.get(base + "/fixtures/mvp2-cashflow.csv")
                  ).body(),
            },
          },
        },
      );
      check(upload.ok(), "CSV upload");
      a = await upload.json();
    }
    await post("/mvp2/applications/" + a.id + "/submit", {
      version: a.version,
    });
    await page.goto(base + "/apply");
    return result(a.id);
  }
  async function closed() {
    check(
      (await (await page.request.get(base + "/api/config")).json())
        .cabinetAvailable === false,
      "Premature access",
    );
    check(
      (
        await page.request.get(base + "/cabinet", { maxRedirects: 0 })
      ).status() === 303,
      "Cabinet URL open",
    );
    check(
      (await page.locator(".app-header").count()) === 0,
      "Service shell before disbursement",
    );
  }
  const checks = [];
  let a = await prepare(3000001);
  check(a.decision === "MANAGER_REVIEW_REQUIRED", JSON.stringify(a));
  await button("Записаться на встречу").click();
  await page.reload();
  await page.getByRole("heading",{name:"Запись на встречу",exact:true}).waitFor();
  await page.locator(".mvp-products").getByRole("button").first().waitFor();
  await page.locator(".mvp-products").getByRole("button").first().click();
  await page.getByText(/Встреча:/).waitFor();
  await closed();
  await page.screenshot({
    path: "output/playwright/mvp2-manager-corrected.png",
    fullPage: true,
  });
  if(managerCookie) {
    const manager=await page.context().browser().newContext();
    try {
      await manager.addCookies([managerCookie]);
      const managerPage=await manager.newPage();await managerPage.goto(base+'/bank');
      const form=managerPage.locator('form[data-application-id="'+a.id+'"]');
      await form.locator('select[name=decision]').selectOption('APPROVED');
      await form.locator('textarea[name=reason]').fill('Проверены документы и результаты оценки; одобрено менеджером.');
      const decision=managerPage.waitForResponse(r=>r.url().includes('/mvp2/manager/'+a.id+'/decision')&&r.status()===200);
      await form.getByRole('button',{name:'Зафиксировать решение',exact:true}).click();await decision;
      await page.reload();await page.getByRole('heading',{name:'Ваш кредит одобрен',exact:true}).waitFor();
      const approved=await result(a.id);check(approved.lifecycle==='MANAGER_APPROVED'&&approved.decision==='APPROVED','Manager decision not persisted');
      await page.screenshot({path:'output/playwright/recovery-manager-approved.png',fullPage:true});
    } finally {await manager.close();}
    checks.push('manager UI records decision; client resumes same application');
  }
  checks.push("manager booking; no contract or cabinet before final decision");
  a = await prepare(3000000, "9900000001", false);
  check(a.decision === "ADDITIONAL_DATA_REQUIRED", JSON.stringify(a));
  await button("Дополнить сведения").click();
  check(
    (await page.getByLabel("ИНН компании", { exact: true }).count()) === 0,
    "Repeated company question",
  );
  await page
    .getByLabel("CSV-выписка счёта 1", { exact: true })
    .setInputFiles("fixtures/mvp2-cashflow.csv");
  await page.getByText(/60 операций · проверено/).waitFor();
  await button("Отправить на повторную проверку").click();
  await page
    .getByRole("heading", { name: "Ваш кредит одобрен", exact: true })
    .waitFor({ timeout: 45000 });
  await closed();
  checks.push("missing CSV only; supplemented and re-evaluated");
  a = await prepare(5000000, "9900000001", true, true);
  check(
    a.decision === "DECLINED" && a.alternatives.length > 0,
    "Expected verified alternative: " + JSON.stringify(a),
  );
  const version = a.version;
  await button("Рассмотреть альтернативу").click();
  a = await result(a.id);
  check(a.version > version, "No new evaluation version");
  check(
    ["APPROVED", "MANAGER_REVIEW_REQUIRED"].includes(a.decision),
    JSON.stringify(a),
  );
  await closed();
  checks.push(
    "negative 5m request is declined, not positive manager routing; verified alternative and fresh evaluation",
  );
  a = await prepare(3000000, "9900000002");
  check(
    a.decision === "DECLINED" && a.alternatives.length === 0,
    JSON.stringify(a),
  );
  await page
    .getByRole("heading", { name: "Заявка не одобрена", exact: true })
    .waitFor();
  check(
    (await button("Рассмотреть альтернативу").count()) === 0,
    "Compliance bypass alternative",
  );
  await button("Обсудить с агентом").click();
  await page
    .getByLabel("Сообщение финансовому помощнику", { exact: true })
    .fill("Что делать дальше по этой заявке?");
  await button("Отправить сообщение").click();
  await page
    .locator(".agent-unavailable")
    .filter({ hasText: /Вопрос сохранён/ })
    .waitFor();
  await button("Вернуться к решению").click();
  await closed();
  checks.push(
    "compliance decline without bypass; contextual chat, honest offline and return",
  );
  return {
    checks: "PASS",
    scenarios: checks,
    core: "real Liza",
    registration: false,
  };
}
