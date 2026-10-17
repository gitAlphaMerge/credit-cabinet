/** Registry providers are server-only. No synthetic fallback for a real INN. */
export class RegistryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function registryProvider(env: NodeJS.ProcessEnv = process.env) {
  return env.FNS_API_KEY ? "api-fns" : env.DADATA_API_KEY ? "dadata" : null;
}
export async function findCompany(
  inn: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
) {
  if (!/^(\d{10}|\d{12})$/.test(inn))
    throw new RegistryError(
      422,
      "Введите ИНН целиком: 10 цифр для организации или 12 для ИП.",
    );
  const provider = registryProvider(env);
  if (!provider)
    throw new RegistryError(
      503,
      "Автопоиск пока не подключён: администратору нужно настроить ключ API-ФНС или DaData. Вы можете проверить ИНН на сайте ФНС или заполнить сведения вручную.",
    );
  try {
    const response = await request(
      provider === "api-fns"
        ? "https://api-fns.ru/api/egr"
        : "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party",
      {
        method: "POST",
        headers:
          provider === "api-fns"
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
              }
            : {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: "Token " + env.DADATA_API_KEY,
              },
        body:
          provider === "api-fns"
            ? new URLSearchParams({
                req: inn,
                key: env.FNS_API_KEY!,
              }).toString()
            : JSON.stringify({ query: inn, branch_type: "MAIN" }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error("Provider unavailable");
    const data = await response.json();
    // Missing result envelope is an upstream error, never 'company not found'.
    if (provider === "api-fns") {
      if (!Array.isArray(data.items))
        throw new Error("Invalid provider response");
      const item = data.items.find(
        (i: any) =>
          String(i["ЮЛ"]?.["ИНН"] ?? i["ИП"]?.["ИННФЛ"] ?? i["ИП"]?.["ИНН"]) ===
          inn,
      );
      if (!item)
        throw new RegistryError(
          404,
          "По этому ИНН организация или ИП не найдены. Проверьте номер или воспользуйтесь сайтом ФНС.",
        );
      const ip = !!item["ИП"],
        p = item["ИП"] || item["ЮЛ"];
      const name = ip
        ? "ИП " + p["ФИОПолн"]
        : p["НаимСокрЮЛ"] || p["НаимПолнЮЛ"];
      if (!name || name === "ИП undefined")
        throw new Error("Missing company name");
      return {
        inn,
        name: String(name),
        form: ip
          ? "ИП"
          : String(
              p["ОПФ"]?.["Сокр"] ||
                String(name).match(/^(ООО|ПАО|АО|ЗАО|ОАО)(?=\s|«|")/u)?.[1] ||
                "Другое",
            ),
        registeredAt: p["ДатаРег"] || undefined,
        region:
          typeof p["Адрес"]?.["АдресПолн"] === "string"
            ? p["Адрес"]["АдресПолн"].split(",")[0]
            : undefined,
        activity: p["ОснВидДеят"]?.["Текст"] || undefined,
        okved: p["ОснВидДеят"]?.["Код"] || undefined,
        status: p["Статус"] || "Статус не указан в реестре",
        source: "ЕГРЮЛ / ЕГРИП через API-ФНС",
        demo: false,
      };
    }
    if (!Array.isArray(data.suggestions))
      throw new Error("Invalid provider response");
    const party = data.suggestions.find(
      (p: any) => String(p.data?.inn) === inn,
    );
    if (!party)
      throw new RegistryError(
        404,
        "По этому ИНН организация или ИП не найдены. Проверьте номер или воспользуйтесь сайтом ФНС.",
      );
    if (!party.value) throw new Error("Missing company name");
    const p = party.data;
    return {
      name: String(party.value),
      inn,
      form: p.type === "INDIVIDUAL" ? "ИП" : p.opf?.short || "Другое",
      registeredAt: p.state?.registration_date
        ? new Date(p.state.registration_date).toISOString().slice(0, 10)
        : undefined,
      region: p.address?.data?.region_with_type,
      activity: p.okved ? "ОКВЭД " + p.okved : undefined,
      okved: p.okved,
      status: p.state?.status || "Статус не указан в реестре",
      source: "ЕГРЮЛ / ЕГРИП через DaData",
      demo: false,
    };
  } catch (e) {
    if (e instanceof RegistryError) throw e;
    // Provider messages/URLs may contain credentials; never forward them.
    throw new RegistryError(
      502,
      "Реестр временно недоступен. Попробуйте позже или откройте официальный поиск ФНС. Администратору следует проверить ключ и лимиты API.",
    );
  }
}
