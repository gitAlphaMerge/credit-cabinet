import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Profile } from "../shared/types";
import { db, getUser, saveState, stateOf } from "./store";
import { extract } from "./documents";
import {
  creditRevision,
  documentMetadata,
  documentSource,
} from "./document-policy";

export type DocumentImport = {
  buffer: Buffer;
  name: string;
  mime: string;
  provider: string;
  source: string;
};
// A real adapter must return the same normalized, unconfirmed document payload.
export interface DocumentConnector {
  pull(category: string, profile: Profile, now: Date): Promise<DocumentImport>;
}
export const mockDocumentConnector: DocumentConnector = {
  async pull(category, profile, now) {
    const source = documentSource(category, profile.form, profile.registered);
    if (!source) throw new Error("Источник для этого документа не подключён");
    const year = now.getUTCFullYear() - 1;
    const day = now.toISOString().slice(0, 10);
    const text =
      category === "statement"
        ? `date,amount,kind,purpose\n${day},100000,operating,мок\n${day},-70000,operating,мок`
        : category === "balance"
          ? `category,balance\nperiod,${year}\nassets,1000000\nliabilities,400000\nequity,600000`
          : `category,pnl\nperiod,${year}\nrevenue,1200000\nexpenses,900000\nprofit,300000`;
    const label = "мок, в проде: " + source;
    return {
      buffer: Buffer.from(
        text + (category === "statement" ? "" : "\nsource," + label),
      ),
      name: `${category}-${day}-мок.csv`,
      mime: "text/csv",
      provider: "mock",
      source: label,
    };
  },
};
export function createDocumentConnectorRouter(
  connector: DocumentConnector = mockDocumentConnector,
) {
  const router = Router();
  router.post("/documents/import", async (req, res) => {
    const uid: string = res.locals.userId;
    if (getUser(uid)?.role !== "client") {
      res.status(403).json({ error: "Документы подтягивает клиент" });
      return;
    }
    const state = stateOf(uid);
    const category = req.body?.category;
    if (
      typeof category !== "string" ||
      !documentSource(category, state.profile.form, state.profile.registered)
    ) {
      res
        .status(422)
        .json({ error: "Источник для этого документа не подключён" });
      return;
    }
    const now = new Date();
    const imported = await connector.pull(category, state.profile, now);
    const parsed = await extract(imported.buffer, imported.name, category);
    if (parsed.category !== category) {
      res.status(422).json({ error: "Источник вернул другой тип документа" });
      return;
    }
    // The adapter may await I/O. Re-read state so concurrent chat/profile writes survive.
    const latest = stateOf(uid);
    if (
      !documentSource(category, latest.profile.form, latest.profile.registered)
    ) {
      res.status(409).json({ error: "Профиль изменился, обновите страницу" });
      return;
    }
    const doc = {
      id: randomUUID(),
      ...parsed,
      name: imported.name,
      mime: imported.mime,
      source: imported.source,
      provider: imported.provider,
      confirmed: false,
      createdAt: now.toISOString(),
      creditRevision: creditRevision(latest),
    };
    Object.assign(doc, documentMetadata(doc));
    db.prepare("INSERT INTO files VALUES(?,?,?,?,?)").run(
      doc.id,
      uid,
      doc.name,
      doc.mime,
      imported.buffer,
    );
    latest.documents.unshift(doc);
    saveState(uid, latest);
    res.json(doc);
  });
  return router;
}
