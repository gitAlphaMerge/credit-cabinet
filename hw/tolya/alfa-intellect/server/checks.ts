/**
 * Локальные синтетические проверки, без запросов во внешние сервисы.
 * БКИ упрощено: openLoans - открытые кредиты; overdue30Plus12m и
 * overdue90Plus12m - число кредитов с такими просрочками за 12 месяцев
 * (90+ входит в 30+); debtBurdenRatio - доля платежей в месячном доходе.
 * Это учебные поля мока, а не формат отчёта БКИ или банковское решение.
 */
import { readFileSync } from "node:fs";
import { Router } from "express";
import { RegistryError } from "./registry";

const source = "синтетические данные (мок)" as const;
export type CreditHistory = {
  openLoans: number;
  overdue30Plus12m: number;
  overdue90Plus12m: number;
  debtBurdenRatio: number;
};
export type CheckResult<T> = { source: typeof source } & (
  | { status: "ok"; data: T }
  | { status: "bad"; reasonCode: string; managerText: string; data: T }
  | { status: "unavailable"; managerText: string }
);
type FixtureResult<T> =
  CheckResult<T> extends infer R
    ? R extends { source: typeof source }
      ? Omit<R, "source">
      : never
    : never;
type CheckData = {
  bankruptcy: { active: boolean };
  bki: CreditHistory;
  aml: { requiresReview: boolean };
  fns: { taxDebtRub: number; unreliableDetails: boolean };
};
type Fixture = { inn: string } & {
  [K in keyof CheckData]: FixtureResult<CheckData[K]>;
};
const fixtures = JSON.parse(
  readFileSync(
    new URL("../fixtures/checks-mock.json", import.meta.url),
    "utf8",
  ),
) as Fixture[];

/** Проверяет формат ИНН и требует точного совпадения с локальным сценарием. */
function fixtureFor(inn: string): Fixture {
  if (!/^(\d{10}|\d{12})$/.test(inn))
    throw new RegistryError(
      422,
      "Введите ИНН целиком: 10 цифр для организации или 12 для ИП.",
    );
  const fixture = fixtures.find((item) => item.inn === inn);
  if (!fixture)
    throw new RegistryError(
      404,
      "ИНН отсутствует в локальном моке проверок. Используйте 9900000001, 9900000002, 990000000001 или 990000000002; дополнительные сценарии: fixtures/checks-mock.json.",
    );
  return fixture;
}

/** Возвращает независимую копию результата с явной маркировкой мока. */
function result<K extends keyof CheckData>(
  inn: string,
  key: K,
): CheckResult<CheckData[K]> {
  const fixture = fixtureFor(inn)[key];
  if (!fixture)
    return {
      status: "unavailable",
      managerText: "Результат отсутствует в локальном моке.",
      source,
    };
  return { ...structuredClone(fixture), source } as CheckResult<CheckData[K]>;
}

/** Читает синтетическую кредитную историю. */
export async function checkCreditHistory(inn: string) {
  return result(inn, "bki");
}
/** Читает синтетический флаг необходимости проверки по 115-ФЗ. */
export async function checkAml(inn: string) {
  return result(inn, "aml");
}
/** Читает синтетические сведения ФНС «Прозрачный бизнес». */
export async function checkTransparentBusiness(inn: string) {
  return result(inn, "fns");
}
/** Читает синтетические сведения о действующем банкротстве. */
export async function checkBankruptcy(inn: string) {
  return result(inn, "bankruptcy");
}
/** Собирает три результата; недоступность хранится как исход проверки. */
export async function runChecks(inn: string) {
  const [bki, aml, fns] = await Promise.all([
    checkCreditHistory(inn),
    checkAml(inn),
    checkTransparentBusiness(inn),
  ]);
  return { bki, aml, fns };
}

export const checksRouter = Router();
checksRouter.get("/:inn", async (req, res) => {
  // Store загружается только для HTTP: чистые проверки не открывают базу.
  const { db, sessionUser } = await import("./store");
  const token =
    req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("alfa_session="))
      ?.slice(13) || "";
  const user = sessionUser(token);
  if (!user) {
    res.status(401).json({ error: "Войдите в аккаунт" });
    return;
  }
  const hasRole = db
    .prepare("PRAGMA table_info(users)")
    .all()
    .some((column) => column.name === "role");
  // TODO(role): убрать fallback на сессию после обязательного внедрения миграции роли в задаче B.
  if (hasRole) {
    const account = db
      .prepare("SELECT role FROM users WHERE id=?")
      .get(user.user_id);
    if (account?.role !== "manager") {
      res.status(403).json({ error: "Проверки доступны только менеджеру" });
      return;
    }
  }
  try {
    res.json(await runChecks(req.params.inn));
  } catch (error) {
    if (!(error instanceof RegistryError)) throw error;
    res.status(error.status).json({ error: error.message });
  }
});
