import test from "node:test";
import assert from "node:assert/strict";
import {
  findCompany,
  RegistryError,
  registryProvider,
} from "../server/registry";
const fake = (data: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(data), { status })) as typeof fetch;

test("real registry providers require explicit selection even with keys", async () => {
  for (const provider of [undefined, "", "mock", "unknown"]) {
    const env = {
      EGR_PROVIDER: provider,
      FNS_API_KEY: "x",
      DADATA_API_KEY: "y",
    };
    assert.equal(registryProvider(env), "mock");
    assert.equal(
      (
        await findCompany("9900000001", env, (async () => {
          throw new Error("Network forbidden");
        }) as typeof fetch)
      ).demo,
      true,
    );
  }
  assert.equal(
    registryProvider({ EGR_PROVIDER: "api-fns", DADATA_API_KEY: "y" }),
    "api-fns",
  );
  assert.equal(
    registryProvider({ EGR_PROVIDER: "dadata", FNS_API_KEY: "x" }),
    "dadata",
  );
});
test("Поиск ИНН: неполный номер и неизвестный мок не подменяются компанией", async () => {
  await assert.rejects(
    findCompany("770421370", {}),
    (e: any) => e.status === 422,
  );
  await assert.rejects(
    findCompany("7712345678", {}),
    (e: any) => e.status === 404,
  );
});
test("Мок ЕГР: ООО и ИП, статусы, ОКВЭД, без внешних вызовов", async () => {
  const noNetwork = (async () => {
    throw new Error("Внешний вызов запрещён");
  }) as typeof fetch;
  for (const env of [
    {},
    { EGR_PROVIDER: "mock", FNS_API_KEY: "unused", DADATA_API_KEY: "unused" },
  ]) {
    const records = await Promise.all(
      ["9900000001", "9900000002", "990000000001", "990000000002"].map((inn) =>
        findCompany(inn, env, noNetwork),
      ),
    );
    assert.deepEqual(
      new Set(records.map((r) => r.form)),
      new Set(["ООО", "ИП"]),
    );
    assert.deepEqual(
      new Set(records.map((r) => r.status)),
      new Set(["ACTIVE", "LIQUIDATED"]),
    );
    for (const record of records) {
      assert.equal(record.demo, true);
      assert.match(record.source, /синтетические данные \(мок\)/);
      assert.ok(record.okved);
    }
  }
});
test("API-ФНС: серверный POST, точное совпадение ИНН, поля ЮЛ и ИП", async () => {
  const response = {
    items: [
      {
        ЮЛ: {
          ИНН: "7707083893",
          НаимСокрЮЛ: "ПАО «Тест»",
          ДатаРег: "2000-01-01",
          Статус: "Действующее",
          Адрес: { АдресПолн: "г. Москва, ул. Примерная" },
          ОснВидДеят: { Код: "62.01", Текст: "Разработка ПО" },
        },
      },
    ],
  };
  const result = await findCompany(
    "7707083893",
    { EGR_PROVIDER: "api-fns", FNS_API_KEY: "test-secret" },
    (async (url, init) => {
      assert.equal(url, "https://api-fns.ru/api/egr");
      assert.equal(init?.method, "POST");
      assert.equal(
        new URLSearchParams(String(init?.body)).get("key"),
        "test-secret",
      );
      return new Response(JSON.stringify(response));
    }) as typeof fetch,
  );
  assert.equal(result.demo, false);
  assert.equal(result.form, "ПАО");
  assert.equal(result.region, "г. Москва");
  assert.equal(result.registeredAt, "2000-01-01");
  assert.equal(result.activity, "Разработка ПО");
  const ip = await findCompany(
    "123456789012",
    { EGR_PROVIDER: "api-fns", FNS_API_KEY: "x" },
    fake({
      items: [
        {
          ИП: {
            ИННФЛ: "123456789012",
            ФИОПолн: "Тестовый Тест",
            Статус: "Прекратило деятельность",
          },
        },
      ],
    }),
  );
  assert.equal(ip.form, "ИП");
  assert.equal(ip.name, "ИП Тестовый Тест");
  assert.equal(ip.registeredAt, undefined);
});
test("DaData: головная организация, источник реестра, без подмены отсутствующего результата", async () => {
  const result = await findCompany(
    "7707083893",
    { EGR_PROVIDER: "dadata", DADATA_API_KEY: "x" },
    (async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).branch_type, "MAIN");
      return new Response(
        JSON.stringify({
          suggestions: [
            {
              value: "ООО Тест",
              data: {
                inn: "7707083893",
                type: "LEGAL",
                opf: { short: "ООО" },
                state: { status: "LIQUIDATED" },
                okved: "62.01",
              },
            },
          ],
        }),
      );
    }) as typeof fetch,
  );
  assert.equal(result.status, "LIQUIDATED");
  assert.equal(result.demo, false);
  await assert.rejects(
    findCompany(
      "7707083893",
      { EGR_PROVIDER: "dadata", DADATA_API_KEY: "x" },
      fake({ suggestions: [] }),
    ),
    (e: any) => e.status === 404,
  );
});
test("Ошибки и лимиты провайдера не становятся 'не найдено' и не раскрывают ключ", async () => {
  for (const request of [
    fake({ error: "invalid key: secret" }),
    fake({}, 429),
    (async () => {
      throw new Error("secret");
    }) as typeof fetch,
  ]) {
    await assert.rejects(
      findCompany(
        "7707083893",
        { EGR_PROVIDER: "api-fns", FNS_API_KEY: "secret" },
        request,
      ),
      (e: unknown) =>
        e instanceof RegistryError &&
        e.status === 502 &&
        !e.message.includes("secret"),
    );
  }
  await assert.rejects(
    findCompany(
      "7707083893",
      { EGR_PROVIDER: "api-fns", FNS_API_KEY: "x" },
      fake({ items: [{ ЮЛ: { ИНН: "9999999999" } }] }),
    ),
    (e: any) => e.status === 404,
  );
});
