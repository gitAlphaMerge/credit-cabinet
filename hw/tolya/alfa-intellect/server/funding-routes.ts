import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, stateOf, saveState, getUser, notify } from "./store";
import { fundingInput, transparentFundingEngine } from "./funding-engine";
import { fundingBusinessData } from "../shared/financing-business";
import {
  fundingCatalog,
  fundingWarningRequired,
  type FundingVersion,
} from "../shared/financing";
import type { Selection } from "../shared/types";

db.exec(
  "CREATE TABLE IF NOT EXISTS funding_applications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),selection_id TEXT NOT NULL,version INTEGER NOT NULL,dossier TEXT NOT NULL,UNIQUE(user_id,selection_id,version)); INSERT OR IGNORE INTO migrations VALUES(2);",
);
export const fundingRouter = Router();
fundingRouter.get("/financing/context", (_req, res) => {
  const s = stateOf(res.locals.userId);
  res.json({ data: fundingBusinessData(s), catalog: fundingCatalog });
});
const versionOf = (s: Selection): FundingVersion => ({
  version: s.version,
  createdAt: s.updatedAt || s.createdAt,
  input: s.input,
  assessment: s.assessment,
  calculation: s.calculation,
  product: s.product,
  status: s.status,
});
fundingRouter.post("/selections", (req, res, next) => {
  if (req.body.engine !== "mvp-2") return next();
  const body = z
      .object({
        engine: z.literal("mvp-2"),
        input: fundingInput,
        parentId: z.string().max(128).optional(),
        expectedVersion: z.number().int().positive().optional(),
      })
      .strict()
      .parse(req.body),
    s = stateOf(res.locals.userId),
    old = body.parentId
      ? s.selections.find((x) => x.id === body.parentId)
      : undefined;
  if (body.parentId && !old) {
    res.status(404).json({ error: "Подбор не найден" });
    return;
  }
  if (old && body.expectedVersion !== old.version) {
    res.status(409).json({
      error:
        "Подбор уже изменён. Откройте последнюю версию и повторите изменение.",
    });
    return;
  }
  if (old && old.version >= 500) {
    res.status(422).json({
      error: "В этом подборе сохранено 500 версий. Создайте новый запрос.",
    });
    return;
  }
  const now = new Date().toISOString(),
    result = transparentFundingEngine.evaluate(body.input, s),
    item: Selection = {
      ...result,
      id: old?.id || randomUUID(),
      createdAt: old?.createdAt || now,
      updatedAt: now,
      version: old ? old.version + 1 : 1,
      versions: old?.versions ? [...old.versions] : old ? [versionOf(old)] : [],
    };
  item.versions!.push(versionOf(item));
  if (old) s.selections[s.selections.findIndex((x) => x.id === old.id)] = item;
  else s.selections.unshift(item);
  saveState(res.locals.userId, s);
  res.json(item);
});
export function fundingNeedsAcknowledgement(item: Selection) {
  return fundingWarningRequired(item);
}
export function customerApplication(item: Selection, name: string) {
  return {
    company: name,
    product: item.product,
    purpose: item.purpose,
    amount: item.calculation.amount,
    term: item.calculation.term,
    rate: "Уточняется банком",
    repayFrom: item.repayFrom,
    usage: item.input?.usage || "once",
    cycleDays: item.assessment?.cycleDays,
    selectionId: item.id,
    version: item.version,
    demo: true,
  };
}
fundingRouter.get("/selections/:id/application-preview", (req, res) => {
  const s = stateOf(res.locals.userId),
    item = s.selections.find((x) => x.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "Подбор не найден" });
    return;
  }
  res.json({
    application: customerApplication(item, s.profile.name),
    needsAcknowledgement: fundingNeedsAcknowledgement(item),
  });
});
fundingRouter.post("/selections/:id/application", (req, res) => {
  const { expectedVersion, acknowledgeRisks } = z
      .object({
        expectedVersion: z.number().int().positive(),
        acknowledgeRisks: z.boolean().default(false),
      })
      .strict()
      .parse(req.body),
    uid = res.locals.userId,
    s = stateOf(uid),
    item = s.selections.find((x) => x.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: "Подбор не найден" });
    return;
  }
  if (expectedVersion !== item.version) {
    res.status(409).json({
      error: "Условия изменились. Повторно проверьте последнюю версию заявки.",
    });
    return;
  }
  if (fundingNeedsAcknowledgement(item) && !acknowledgeRisks) {
    res.status(422).json({
      error:
        "Подтвердите ознакомление с предупреждением перед демонстрационной подачей.",
    });
    return;
  }
  const previous = s.leads.find(
    (l) => l.selectionId === item.id && l.version === item.version,
  );
  if (previous) {
    res.json(previous);
    return;
  }
  const application = customerApplication(item, s.profile.name),
    lead = {
      id: randomUUID(),
      selectionId: item.id,
      version: item.version,
      phone: getUser(uid)!.phone,
      createdAt: new Date().toISOString(),
      status: "Демо-заявка создана" as const,
      application,
    };
  const dossier = {
    demo: true,
    engine: item.assessment?.engine || "legacy-demo",
    capturedAt: lead.createdAt,
    application,
    profile: s.profile,
    input: item.input,
    assessment: item.assessment,
    calculation: item.calculation,
    catalog: fundingCatalog.find((p) => p.id === item.assessment?.selectedId),
    risks: item.risks,
    recommendations: item.assessment?.reasons,
    disclaimer: "В банк не отправлено. Не скоринг и не банковское решение.",
  };
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO funding_applications VALUES(?,?,?,?,?)").run(
      lead.id,
      uid,
      item.id,
      item.version,
      JSON.stringify(dossier),
    );
    s.leads.push(lead);
    notify(
      s,
      "funding-application:" + lead.id,
      "Демо-заявка создана",
      "Сохранены условия версии " +
        item.version +
        ". В банк ничего не отправлено.",
      "financing",
    );
    saveState(uid, s);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json(lead);
});
