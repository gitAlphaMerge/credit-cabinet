import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { AppState } from "../shared/types";
import { demoPersonas, type DemoPersona } from "../shared/demo-personas";
import { db, hashPassword, initialState } from "../server/store";
import { ensureDemoSchema } from "../server/demo-personas";
import { calculate } from "../server/finance";
import {
  applicationsDependencies,
  createApplication,
  dossierOf,
  eventsOf,
  transitionApplication,
  type Application,
  type Event,
  type CoreClient,
} from "../server/applications";

// CSV банка: служебные строки пропускаются, даты и суммы переводятся без разметки ответов.
export function statementRecords(source: string) {
  const records: Record<string, string | number>[] = [];
  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const cells: string[] = [];
    let cell = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === ";" && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    if (quoted) throw new Error("G2: незакрытая кавычка в выписке");
    cells.push(cell);
    const date = cells[0]?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!date) continue;
    const amount = Number(cells[4]?.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(amount))
      throw new Error("G2: некорректная сумма выписки");
    records.push({
      date: `${date[3]}-${date[2]}-${date[1]}`,
      amount,
      counterparty: cells[2],
      purpose: cells[3],
    });
  }
  if (!records.length) throw new Error("G2: пустая выписка");
  return records;
}

function personaState(persona: DemoPersona, now: Date): AppState {
  const state = initialState({
    name: persona.company,
    inn: persona.inn,
    form: persona.form,
    stage: "operating",
    sector: persona.sector,
    registered: true,
    registeredAt: persona.registeredAt,
    ageBand: persona.years,
    result: persona.questionnaire?.trend ?? "Прибыль",
    debt: "Нет",
    intent: persona.questionnaire?.purpose ?? "Рабочее место менеджера",
    source: "Синтетические демонстрационные данные (мок)",
    registryRecord: { okved: persona.okved, source: "мок" },
  });
  state.preferences.tourDone = true;
  state.profile.onboardedAt = now.toISOString();
  state.chats = [
    {
      id: `g2-chat-${persona.key}`,
      title: "Демонстрационная заявка",
      messages: [],
    },
  ];
  if (!persona.statement || !persona.questionnaire) return state;
  const records = statementRecords(
    readFileSync(
      process.env.DEMO_DATA_ROOT
        ? resolve(
            process.env.DEMO_DATA_ROOT,
            persona.statement.slice("data/".length),
          )
        : new URL(`../../../../${persona.statement}`, import.meta.url),
      "utf8",
    ),
  );
  // Воспроизводимое окно: сохраняем все операции и сдвигаем календарь целыми месяцами.
  const latest = records
    .map((r) => String(r.date))
    .sort()
    .at(-1)!;
  const latestDate = new Date(latest);
  const delta =
    now.getUTCFullYear() * 12 +
    now.getUTCMonth() -
    1 -
    (latestDate.getUTCFullYear() * 12 + latestDate.getUTCMonth());
  for (const record of records) {
    const date = new Date(String(record.date));
    const first = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1),
    );
    const lastDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    record.date = first.toISOString().slice(0, 10);
  }
  state.documents = [
    {
      id: `g2-statement-${persona.key}`,
      category: "statement",
      name: "Синтетическая выписка (мок).csv",
      period: `${records.map((r) => String(r.date)).sort()[0]} - ${records
        .map((r) => String(r.date))
        .sort()
        .at(-1)}`,
      fields: {},
      confirmed: true,
      createdAt: now.toISOString(),
      currency: "RUB",
      mime: "text/csv",
      records,
    },
  ];
  const { products } = JSON.parse(
    readFileSync(
      process.env.PRODUCTS_CATALOG ||
        new URL("../../../../data/catalog/products.json", import.meta.url),
      "utf8",
    ),
  );
  const product = products.find(
    (p: { product_family: string }) => p.product_family === "overdraft",
  );
  if (!product) throw new Error("G2: в каталоге нет овердрафта");
  const q = persona.questionnaire;
  state.selections = [
    {
      id: `g2-selection-${persona.key}`,
      version: 1,
      createdAt: now.toISOString(),
      purpose: q.purpose,
      repayFrom: q.repayFrom,
      ownFunds: 0,
      product: product.id,
      calculation: calculate(
        { amount: q.amount, term: q.term, rate: 0, flow: null, existing: 0 },
        now,
      ),
      risks: [],
      alternatives: [],
      status: "ready",
    },
  ];
  return state;
}

type SeedOptions = {
  reset?: boolean;
  clock?: () => Date;
  core?: CoreClient;
  log?: (text: string) => void;
};

export async function seedDemo(
  database: DatabaseSync = db,
  options: SeedOptions = {},
) {
  if (process.env.DEMO_PERSONAS !== "1")
    throw new Error("G2: подготовка доступна только при DEMO_PERSONAS=1");
  ensureDemoSchema(database);
  const log = options.log ?? console.log;
  const existing = demoPersonas.map((p) =>
    database
      .prepare("SELECT * FROM users WHERE id=? OR phone=?")
      .all(p.userId, p.phone),
  );
  for (const [index, rows] of existing.entries()) {
    const p = demoPersonas[index];
    if (
      rows.length &&
      (rows.length !== 1 ||
        rows[0].id !== p.userId ||
        rows[0].phone !== p.phone ||
        rows[0].is_demo !== 1 ||
        rows[0].role !== p.role)
    )
      throw new Error(
        `G2 ${p.key}: идентификатор или телефон занят обычной учётной записью`,
      );
  }
  const currentApplications = () =>
    demoPersonas
      .filter((p) => p.role === "client")
      .map(
        (p) =>
          database
            .prepare(
              "SELECT * FROM applications WHERE user_id=? AND selection_id=? ORDER BY created_at LIMIT 1",
            )
            .get(p.userId, `g2-selection-${p.key}`) as Application | undefined,
      );
  if (
    !options.reset &&
    existing.every((rows) => rows.length === 1) &&
    currentApplications().every(Boolean)
  ) {
    log(
      "G2: 6 персон уже подготовлены; для возврата в начало используйте --reset.",
    );
    return currentApplications() as Application[];
  }
  // Сначала полностью проверяем новое демо в отдельной БД. При сбое ядра живое демо сохраняется.
  const staged = new DatabaseSync(":memory:");
  const deps = {
    ...applicationsDependencies(),
    clock: options.clock ?? (() => new Date()),
    ...(options.core ? { core: options.core } : {}),
  };
  try {
    const schemas = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    for (const schema of schemas) staged.exec(String(schema.sql));
    const now = deps.clock();
    for (const [index, p] of demoPersonas.entries()) {
      const password =
        existing[index][0]?.password ??
        hashPassword(randomBytes(32).toString("base64url"));
      staged
        .prepare(
          "INSERT INTO users(id,phone,password,state,role,is_demo) VALUES(?,?,?,?,?,1)",
        )
        .run(
          p.userId,
          p.phone,
          String(password),
          JSON.stringify(personaState(p, now)),
          p.role,
        );
    }
    for (const p of demoPersonas.filter((p) => p.role === "client")) {
      let a = createApplication(
        staged,
        p.userId,
        { selectionId: `g2-selection-${p.key}`, selectionVersion: 1 },
        deps,
      ).application;
      const send = async (
        event: Event,
        payload: Record<string, unknown>,
        role: "system" | "manager" = "system",
      ) => {
        a = (
          await transitionApplication(
            staged,
            {
              applicationId: a.id,
              expectedVersion: a.version,
              event,
              actorRole: role,
              actorId: role === "manager" ? "g2-manager" : null,
              payload,
            },
            deps,
          )
        ).application;
      };
      await send("submit", { consent: true });
      if (p.branch === "silent" || p.branch === "manager_document") {
        await send("agent_nudge", {
          text: "Демо: просим дополнить документы (мок).",
        });
        await send("escalate_silent", {});
        if (p.branch === "manager_document")
          await send(
            "request_info",
            {
              hole: "contract_main_customer",
              text: "Дослать договор с основным покупателем и акт сверки.",
              return_to_manager: true,
            },
            "manager",
          );
      }
      const dossier = dossierOf(staged, a.id);
      const core = dossier && JSON.parse(dossier.core_result).core;
      if (
        a.status !== p.expectedStatus ||
        !core ||
        !Number.isFinite(core.limit_now_rub)
      )
        throw new Error(
          `G2 ${p.key}: ожидался ${p.expectedStatus} с расчётом ядра, получен ${a.status}; проверьте демо-моки и ядро`,
        );
      if (p.branch === "alternatives" && !dossier?.alternatives?.length)
        throw new Error("G2 gap: ядро не сформировало альтернативы");
      if (p.branch === "young" && !core.stops_fired.includes("TOO_YOUNG"))
        throw new Error(
          "G2 young: возраст должен подтверждаться реестром и ядром",
        );
      const state = JSON.parse(
        String(
          staged.prepare("SELECT state FROM users WHERE id=?").get(p.userId)!
            .state,
        ),
      ) as AppState;
      state.financials = {
        freeFlow: core.flow_month_rub,
        months: core.evidence.months,
        inflow: state.documents[0].records!.reduce(
          (s, r) => s + Math.max(0, Number(r.amount)),
          0,
        ),
        outflow: state.documents[0].records!.reduce(
          (s, r) => s + Math.max(0, -Number(r.amount)),
          0,
        ),
      };
      const offer = eventsOf(staged, a.id).find(
        (e) => e.event === "make_offer",
      );
      if (offer) {
        const payload = JSON.parse(String(offer.payload));
        state.selections[0].calculation = calculate(
          {
            amount: payload.amount,
            term: payload.term_months,
            rate: payload.rate * 100,
            flow: core.flow_month_rub,
            existing: 0,
          },
          now,
        );
      }
      staged
        .prepare("UPDATE users SET state=? WHERE id=?")
        .run(JSON.stringify(state), p.userId);
      log(
        `G2 ${p.key}: ${a.status}, лимит ${core.limit_now_rub}, поток ${core.flow_month_rub}`,
      );
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      const ids = demoPersonas.map((p) => p.userId);
      const slots = ids.map(() => "?").join(",");
      const apps = `SELECT id FROM applications WHERE user_id IN (${slots})`;
      for (const table of ["dossiers", "application_events"])
        database
          .prepare(`DELETE FROM ${table} WHERE application_id IN (${apps})`)
          .run(...ids);
      // Сброс касается только разрешённых демо-пользователей. Обычные клиенты сохраняются.
      for (const table of database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='users'",
        )
        .all()) {
        const name = String(table.name);
        if (!/^[a-z_]+$/.test(name)) continue;
        if (
          database
            .prepare(`PRAGMA table_info(${name})`)
            .all()
            .some((c) => c.name === "user_id") &&
          name !== "sessions"
        )
          database
            .prepare(`DELETE FROM ${name} WHERE user_id IN (${slots})`)
            .run(...ids);
      }
      for (const p of demoPersonas) {
        const row = staged
          .prepare("SELECT * FROM users WHERE id=?")
          .get(p.userId)!;
        database
          .prepare(
            "INSERT INTO users(id,phone,password,state,role,is_demo) VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET state=excluded.state",
          )
          .run(
            String(row.id),
            String(row.phone),
            String(row.password),
            String(row.state),
            String(row.role),
          );
      }
      for (const table of ["applications", "application_events", "dossiers"]) {
        for (const row of staged.prepare(`SELECT * FROM ${table}`).all()) {
          const columns = Object.keys(row).filter(
            (key) => !(table === "application_events" && key === "id"),
          );
          database
            .prepare(
              `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
            )
            .run(...columns.map((key) => row[key]));
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    log(
      "G2: подготовлено 5 клиентов и менеджер. Данные синтетические (мок), пароли не выводятся.",
    );
    return currentApplications() as Application[];
  } finally {
    staged.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await seedDemo(db, { reset: process.argv.includes("--reset") });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "G2: ошибка подготовки",
    );
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
