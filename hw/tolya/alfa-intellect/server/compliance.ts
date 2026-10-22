/**
 * v2 контракт: комплаенс-шлагбаум ДО скоринга. Владелец реализации: пакет P1.
 * Это заглушка базы: типы заморожены, тело заменит P1. Пакет P2 импортирует только типы
 * и функцию runComplianceGate через Dependencies, поэтому заглушка ведёт себя как сегодняшний код:
 * все три мок-проверки ok, значит pass.
 */
import { runChecks } from "./checks";

export type GateStatus = "pass" | "info_requested" | "hard_stop";
export type ComplianceCheckKey = "egrul" | "fns" | "bankruptcy" | "aml";
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

export const runComplianceGate: ComplianceGate = async ({ inn, now }) => {
  const r = await runChecks(inn);
  const at = now.toISOString();
  const ok = [r.aml, r.fns].every((c) => c.status === "ok");
  return {
    gate: ok ? "pass" : "info_requested",
    checks: [
      {
        key: "aml",
        status: r.aml.status,
        managerText:
          "status" in r.aml && r.aml.status !== "ok" ? r.aml.managerText : "ok",
        source: r.aml.source,
        checkedAt: at,
      },
      {
        key: "fns",
        status: r.fns.status,
        managerText:
          "status" in r.fns && r.fns.status !== "ok" ? r.fns.managerText : "ok",
        source: r.fns.source,
        checkedAt: at,
      },
    ],
    documents: [],
    reasons: [],
    holes: ok ? [] : ["compliance"],
    enrichment: {},
  };
};
