import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import type { AppState } from "../shared/types";
import { db, hashPassword, initialState } from "../server/store";
import {
  applicationOf,
  createApplication,
  dossierOf,
  eventsOf,
  httpCoreClient,
  transitionApplication,
  type Application,
  type CoreClient,
  type Event,
} from "../server/applications";

export const DEMO_CASES = [
  {
    key: "silent",
    inn: "9900050018",
    form: "ООО",
    name: "Демо Q5 Мебель",
    sector: "Производство мебели",
    amount: 300000,
    months: 12,
    concentrated: true,
    years: "больше трёх лет",
  },
  {
    key: "disagreed",
    inn: "990005000140",
    form: "ИП",
    name: "Демо Q5 Пекарня",
    sector: "Пекарня",
    amount: 90000000,
    months: 12,
    concentrated: false,
    years: "больше трёх лет",
  },
  {
    key: "document",
    inn: "9900050025",
    form: "ООО",
    name: "Демо Q5 Текстиль",
    sector: "Швейное производство",
    amount: 400000,
    months: 8,
    concentrated: false,
    years: "больше трёх лет",
  },
  {
    key: "borderline",
    inn: "990005000214",
    form: "ИП",
    name: "Демо Q5 Сервис",
    sector: "Ремонт оборудования",
    amount: 500000,
    months: 12,
    concentrated: false,
    years: "",
  },
] as const;

// Explicit synthetic operations relative to the clock, never real customer data.
export function demoState(c: (typeof DEMO_CASES)[number], now: Date): AppState {
  const state = initialState({
    name: c.name,
    inn: c.inn,
    form: c.form,
    stage: "operating",
    sector: c.sector,
    registered: true,
    ageBand: c.years,
    result: "Стабильно",
    debt: "Нет",
    intent: "Кассовый разрыв",
  });
  const records: Record<string, string | number>[] = [];
  for (let m = c.months; m > 0; m--) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 15),
    )
      .toISOString()
      .slice(0, 10);
    for (let i = 0; i < 4; i++)
      records.push({
        date,
        amount: 250000,
        counterparty: c.concentrated
          ? "ООО Демо Покупатель"
          : `ООО Демо Покупатель ${i}`,
        purpose: "Оплата товаров",
      });
    records.push({
      date,
      amount: -200000,
      counterparty: "ООО Демо Арендодатель",
      purpose: "Аренда",
    });
    records.push({
      date,
      amount: -200000,
      counterparty: "ООО Демо Поставщик",
      purpose: "Материалы",
    });
  }
  records.push({
    date: new Date(now.getTime() - 86400000).toISOString().slice(0, 10),
    amount: 1000,
    counterparty: "ООО Демо Покупатель",
    purpose: "Оплата товаров",
  });
  state.documents = [
    {
      id: "q5-statement",
      category: "statement",
      name: "Демо-выписка Q5.csv",
      period: `${c.months} месяцев и текущий месяц`,
      fields: {},
      confirmed: true,
      createdAt: now.toISOString(),
      currency: "RUB",
      mime: "text/csv",
      records,
    },
  ];
  state.selections = [
    {
      id: `q5-${c.key}`,
      version: 1,
      createdAt: now.toISOString(),
      purpose: "Кассовый разрыв",
      repayFrom: "Выручка",
      ownFunds: 0,
      product: "ALFA_OVERDRAFT",
      risks: [],
      alternatives: [],
      status: "ready",
      calculation: {
        amount: c.amount,
        term: 12,
        rate: 0,
        monthlyPayment: 0,
        interest: 0,
        total: 0,
        flow: null,
        existing: null,
        maxAmount: null,
        dscr: null,
        stressDscr: null,
        schedule: [],
        source: "Синтетический запрос Q5, расчёт при submit",
        formula: "",
      },
    },
  ];
  return state;
}

export async function seedManager(
  database: DatabaseSync = db,
  options: {
    core?: CoreClient;
    clock?: () => Date;
    log?: (line: string) => void;
  } = {},
) {
  const deps = {
    core: options.core ?? httpCoreClient,
    clock: options.clock ?? (() => new Date()),
  };
  const log = options.log ?? console.log;
  const account = (
    id: string,
    phone: string,
    role: string,
    state: AppState,
  ) => {
    const existing = database
      .prepare("SELECT id,role FROM users WHERE phone=? OR id=?")
      .all(phone, id) as { id: string; role: string }[];
    if (existing.length) {
      if (
        existing.length !== 1 ||
        existing[0].id !== id ||
        existing[0].role !== role
      )
        throw new Error("Q5: демо-телефон занят другой учётной записью");
      return;
    }
    const password = randomBytes(18).toString("base64url");
    database
      .prepare(
        "INSERT INTO users(id,phone,password,state,role) VALUES(?,?,?,?,?)",
      )
      .run(id, phone, hashPassword(password), JSON.stringify(state), role);
    log(`Q5 ${role}: телефон ${phone}, пароль ${password}`);
  };
  account(
    "q5-manager",
    "79990000500",
    "manager",
    demoState(DEMO_CASES[0], deps.clock()),
  );
  const result: Application[] = [];
  for (const [index, c] of DEMO_CASES.entries()) {
    const userId = `q5-client-${c.key}`;
    account(
      userId,
      `7999000050${index + 1}`,
      "client",
      demoState(c, deps.clock()),
    );
    let a = database
      .prepare("SELECT * FROM applications WHERE user_id=? AND selection_id=?")
      .get(userId, `q5-${c.key}`) as Application | undefined;
    if (!a)
      a = createApplication(
        database,
        userId,
        { selectionId: `q5-${c.key}`, selectionVersion: 1 },
        deps,
      ).application;
    if (eventsOf(database, a.id).some((e) => e.to_status === "queued")) {
      result.push(a);
      continue;
    }
    const send = async (event: Event, payload: Record<string, unknown>) => {
      a = (
        await transitionApplication(
          database,
          {
            applicationId: a!.id,
            expectedVersion: a!.version,
            event,
            actorRole: "system",
            actorId: null,
            payload,
          },
          deps,
        )
      ).application;
    };
    if (a.status === "draft") {
      try {
        await send("submit", { consent: true });
      } catch (error) {
        throw new Error(
          `Q5 ${c.key}: скоринг/ядро недоступны, повторите сид после восстановления. ${error instanceof Error ? error.message : "Ошибка"}`,
          { cause: error },
        );
      }
      if ((a as Application).status !== "info_requested")
        throw new Error(
          `Q5 ${c.key}: ожидалась красная заявка, получено ${a.status}`,
        );
    }
    if (a.status === "info_requested") {
      const dossier = dossierOf(database, a.id);
      const scored = dossier && JSON.parse(dossier.core_result).core;
      if (!scored || !Number.isFinite(scored.limit_now_rub))
        throw new Error(
          `Q5 ${c.key}: скоринг не выполнен, проверьте локальные реестры и ядро`,
        );
      if (c.key === "disagreed")
        await send("escalate_disagreed", {
          client_objections:
            "Клиенту нужна вся сумма, уменьшение суммы не подходит.",
        });
      else {
        await send("agent_nudge", {
          text: "Демо: просим дослать недостающие сведения, клиент не ответил.",
        });
        await send("escalate_silent", {});
      }
    }
    result.push(applicationOf(database, a.id));
  }
  log(
    `Q5: обработано ${result.length} демо-заявок; существующие пароли и решения сохранены.`,
  );
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Do not load optional LLM or external-provider credentials from dotenv.
  try {
    if (process.argv.includes("--sweep-silent")) {
      const { applicationsDependencies } =
        await import("../server/applications");
      const { sweepSilentApplications } =
        await import("../server/application-silence");
      console.log(
        await sweepSilentApplications(db, applicationsDependencies()),
      );
    } else {
      await seedManager();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Q5 seed failed");
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
