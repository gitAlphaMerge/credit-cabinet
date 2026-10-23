/**
 * v2 контракт: комплаенс-шлагбаум ДО скоринга. Владелец реализации: пакет P1.
 * Четыре синтетических источника и свежесть документов. Недоступность требует уточнения.
 */
import {
  checkAml,
  checkBankruptcy,
  checkTransparentBusiness,
  type CheckResult,
} from "./checks";
import { findCompany, RegistryError } from "./registry";

export type GateStatus = "pass" | "info_requested" | "hard_stop";
export type ComplianceCheckKey = "egrul" | "fns" | "bankruptcy" | "aml";
const CHECK_LABEL: Record<ComplianceCheckKey, string> = {
  egrul: "ЕГРЮЛ/ЕГРИП",
  fns: "ФНС",
  bankruptcy: "Банкротство",
  aml: "115-ФЗ",
};
export type ComplianceCheck = {
  key: ComplianceCheckKey;
  status: "ok" | "bad" | "unavailable";
  /** Код причины из docs/v2-contract.md, только при bad/unavailable. */
  reasonCode?: string;
  /** Текст для досье менеджера. */
  managerText: string;
  /** Текст клиенту: что именно уточнить или догрузить. */
  clientText?: string;
  source: string;
  checkedAt: string;
};
export type DocumentFreshness = {
  category: string;
  /** ISO-дата документа (для выписки: последняя операция), null если неизвестна. */
  documentDate: string | null;
  ageDays: number | null;
  status: "fresh" | "expired" | "unknown";
  ttlDays: number;
};
export type ScoringEnrichment = {
  form?: "ИП" | "ООО";
  registeredAt?: string;
  monthsActive?: number;
  okved?: string;
};
export type ComplianceReport = {
  gate: GateStatus;
  checks: ComplianceCheck[];
  documents: DocumentFreshness[];
  /** Коды причин в порядке важности; первый попадает в reason события. */
  reasons: string[];
  /** Ключи дыр для чеклиста N из M и для карточки клиента. */
  holes: string[];
  enrichment: ScoringEnrichment;
};
export type ComplianceInput = {
  inn: string;
  documents: {
    category: string;
    confirmed: boolean;
    documentDate: string | null;
  }[];
  now: Date;
};
export type ComplianceGate = (
  input: ComplianceInput,
) => Promise<ComplianceReport>;

export const runComplianceGate: ComplianceGate = async ({
  inn,
  now,
  documents,
}) => {
  const at = now.toISOString();
  const checks: ComplianceCheck[] = [];
  const findings: { code: string; hard: boolean }[] = [];
  const holes = new Set<string>();
  let enrichment: ScoringEnrichment = {};
  function reason(key: string, code: string, hard = false) {
    findings.push({ code, hard });
    holes.add(key);
  }
  function add(
    key: ComplianceCheckKey,
    status: ComplianceCheck["status"],
    managerText: string,
    clientText: string,
    codes: string[] = [],
  ) {
    checks.push({
      key,
      status,
      managerText,
      clientText,
      source: "синтетические данные (мок)",
      checkedAt: at,
      ...(codes[0] ? { reasonCode: codes[0] } : {}),
    });
    for (const code of codes)
      reason(
        key,
        code,
        code === "COMPLIANCE_BANKRUPTCY" ||
          code === "COMPLIANCE_EGRUL_INACTIVE",
      );
  }

  try {
    // Explicit mock environment: even real-provider settings cannot enable network here.
    const company = await findCompany(inn, { EGR_PROVIDER: "mock" });
    if (company.status !== "ACTIVE") {
      add(
        "egrul",
        "bad",
        `ЕГРЮЛ/ЕГРИП: статус ${company.status}.`,
        "В реестре бизнес отмечен как недействующий. Проверьте статус и свяжитесь с банком.",
        ["COMPLIANCE_EGRUL_INACTIVE"],
      );
    } else {
      add(
        "egrul",
        "ok",
        "ЕГРЮЛ/ЕГРИП: бизнес действует.",
        "Регистрационные данные проверены.",
      );
      const registered = Date.parse(company.registeredAt ?? "");
      const date = new Date(registered);
      const months =
        (now.getUTCFullYear() - date.getUTCFullYear()) * 12 +
        now.getUTCMonth() -
        date.getUTCMonth() -
        (now.getUTCDate() < date.getUTCDate() ? 1 : 0);
      enrichment = {
        ...(company.form === "ИП" || company.form === "ООО"
          ? { form: company.form }
          : {}),
        registeredAt: company.registeredAt,
        ...(Number.isFinite(registered)
          ? { monthsActive: Math.max(0, months) }
          : {}),
        okved: company.okved,
      };
    }
  } catch (error) {
    const notFound =
      error instanceof RegistryError &&
      (error.status === 404 || error.status === 422);
    const code = !inn.trim()
      ? "COMPLIANCE_INN_MISSING"
      : notFound
        ? "COMPLIANCE_EGRUL_NOT_FOUND"
        : "COMPLIANCE_SOURCE_UNAVAILABLE";
    add(
      "egrul",
      notFound ? "bad" : "unavailable",
      "ЕГРЮЛ/ЕГРИП: регистрационные данные не подтверждены.",
      "Проверьте ИНН и приложите актуальную выписку из реестра.",
      [code],
    );
  }

  async function read<T>(
    check: (inn: string) => Promise<CheckResult<T>>,
  ): Promise<CheckResult<T>> {
    try {
      return await check(inn);
    } catch {
      return {
        status: "unavailable",
        source: "синтетические данные (мок)",
        managerText: "Результат отсутствует в локальном моке.",
      };
    }
  }
  const [fns, bankruptcy, aml] = await Promise.all([
    read(checkTransparentBusiness),
    read(checkBankruptcy),
    read(checkAml),
  ]);
  for (const [key, result] of [
    ["fns", fns],
    ["bankruptcy", bankruptcy],
    ["aml", aml],
  ] as const) {
    if (result.status === "unavailable") {
      add(
        key,
        "unavailable",
        result.managerText,
        "Не удалось получить сведения. Повторите проверку позже или свяжитесь с банком.",
        ["COMPLIANCE_SOURCE_UNAVAILABLE"],
      );
      continue;
    }
    const codes: string[] = [];
    let clientText =
      "Сведения проверены, дополнительных действий не требуется.";
    if (key === "fns") {
      if (fns.status !== "unavailable" && fns.data.unreliableDetails)
        codes.push("COMPLIANCE_FNS_UNRELIABLE");
      if (fns.status !== "unavailable" && fns.data.taxDebtRub > 0)
        codes.push("COMPLIANCE_FNS_TAX_DEBT");
      if (codes.length)
        clientText =
          "Уточните регистрационные данные и приложите сведения об уплате или сверке налоговой задолженности.";
    } else if (key === "bankruptcy") {
      if (bankruptcy.status !== "unavailable" && bankruptcy.data.active)
        codes.push("COMPLIANCE_BANKRUPTCY");
      if (codes.length)
        clientText =
          "В сведениях о бизнесе указано действующее банкротство. Свяжитесь с банком для уточнения.";
    } else {
      if (aml.status !== "unavailable" && aml.data.requiresReview)
        codes.push("COMPLIANCE_AML_REVIEW");
      if (codes.length)
        clientText =
          "Поясните назначение операций и приложите подтверждающие договоры или счета.";
    }
    // Inconsistent mock data must also fail closed.
    if (result.status === "bad" && !codes.length) {
      codes.push("COMPLIANCE_SOURCE_UNAVAILABLE");
      clientText =
        "Не удалось подтвердить сведения. Повторите проверку позже или свяжитесь с банком.";
    }
    add(
      key,
      codes.length ? "bad" : "ok",
      result.status === "bad"
        ? result.managerText
        : `${CHECK_LABEL[key]}: синтетические сведения проверены.`,
      clientText,
      codes,
    );
  }

  const configuredTtl = process.env.STATEMENT_TTL_DAYS;
  const parsedTtl = Number(configuredTtl);
  const ttlDays =
    configuredTtl?.trim() && Number.isFinite(parsedTtl) && parsedTtl >= 0
      ? parsedTtl
      : 30;
  const freshness: DocumentFreshness[] = documents
    .filter((d) => d.category === "statement" && d.confirmed)
    .map((d) => {
      const time = d.documentDate ? Date.parse(d.documentDate) : NaN;
      const age = (now.getTime() - time) / 86400000;
      const known = Number.isFinite(age) && age >= 0;
      const status = !known ? "unknown" : age > ttlDays ? "expired" : "fresh";
      if (status !== "fresh")
        reason(
          "statement_fresh",
          status === "expired"
            ? "COMPLIANCE_DOC_EXPIRED"
            : "COMPLIANCE_DOC_DATE_UNKNOWN",
        );
      return {
        category: d.category,
        documentDate: known ? d.documentDate : null,
        ageDays: known ? age : null,
        status,
        ttlDays,
      };
    });
  findings.sort((a, b) => Number(b.hard) - Number(a.hard));
  const hard = findings.some((r) => r.hard);
  return {
    gate: hard ? "hard_stop" : findings.length ? "info_requested" : "pass",
    checks,
    documents: freshness,
    reasons: [...new Set(findings.map((r) => r.code))],
    holes: [...holes],
    enrichment: hard ? {} : enrichment,
  };
};
