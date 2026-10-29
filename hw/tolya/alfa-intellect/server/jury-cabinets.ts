import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DemoPersona } from "../shared/demo-personas";
import { db, stateOf, saveState } from "./store";
import { demoReporting } from "../shared/demo-reporting";

// Компания жюри проходит настоящий путь через свой же сервер и ядро: анкета → реестр → выписка → решение,
// при одобрении договор и выдача. Второй вход открывает ту же компанию, а не новую заявку.
db.exec(
  "CREATE TABLE IF NOT EXISTS jury_cabinets(persona TEXT PRIMARY KEY,user_id TEXT NOT NULL)",
);
const pending = new Map<string, Promise<string>>();

const answers = {
  industry: "Производство",
  purpose: "Текущие расходы",
  term: 12,
  usage: "Всё сразу",
  repayment: "Регулярная выручка",
};

// Возраст и диапазон суммы берутся из самой персоны, а не из общего шаблона.
function age(registeredAt: string) {
  const months = (Date.now() - Date.parse(registeredAt)) / (30.44 * 864e5);
  return months < 6 ? "Менее 6 месяцев" : months < 12 ? "6–12 месяцев" : months < 36 ? "1–3 года" : "Более 3 лет";
}
function range(amount: number) {
  const steps: [number, string][] = [
    [300e3, "До 300 тыс. ₽"],
    [500e3, "300–500 тыс. ₽"],
    [1e6, "500 тыс.–1 млн ₽"],
    [3e6, "1–3 млн ₽"],
    [5e6, "3–5 млн ₽"],
    [7e6, "5–7 млн ₽"],
  ];
  return steps.find(([top]) => amount < top)?.[1] ?? "Более 7 млн ₽";
}

function statement(persona: DemoPersona) {
  const own = persona.statement
    ? process.env.DEMO_DATA_ROOT
      ? resolve(process.env.DEMO_DATA_ROOT, persona.statement.slice("data/".length))
      : new URL(`../../../../${persona.statement}`, import.meta.url)
    : null;
  if (!own || !existsSync(own))
    return readFileSync(new URL("../fixtures/mvp2-cashflow.csv", import.meta.url));
  // Выгрузка банка «Дата;Номер;Контрагент;Назначение;Сумма» → чистый CSV, календарь сдвинут к прошлому месяцу.
  const rows = readFileSync(own, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) => line.split(";"))
    .filter((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c[0] ?? ""));
  const month = (d: string) => Number(d.slice(6)) * 12 + Number(d.slice(3, 5)) - 1;
  const last = Math.max(...rows.map((c) => month(c[0])));
  const now = new Date();
  const delta = now.getUTCFullYear() * 12 + now.getUTCMonth() - 1 - last;
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((c) => {
    const m = month(c[0]) + delta;
    const y = Math.floor(m / 12),
      mm = (m % 12) + 1;
    const day = Math.min(Number(c[0].slice(0, 2)), new Date(Date.UTC(y, mm, 0)).getUTCDate());
    const date = `${y}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const amount = c[4].replace(/\s/g, "").replace(",", ".");
    return [date, amount, cell(c[2]), cell(c[3])].join(",");
  });
  return Buffer.from(["date,amount,counterparty,purpose", ...lines].join("\n"), "utf8");
}

async function walk(persona: DemoPersona, base: string) {
  let cookie = "";
  const call = async (path: string, init: RequestInit = {}, ok = [200, 202]) => {
    const response = await fetch(base + path, {
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const body = await response.json().catch(() => ({}));
    if (!ok.includes(response.status))
      throw new Error(`jury ${persona.key}: ${path} → ${response.status} ${body?.error ?? ""}`);
    return body;
  };
  const json = (method: string, path: string, body: unknown) =>
    call(path, { method, body: JSON.stringify(body) });
  const session = await json("POST", "/api/journey/session", {});
  const uid = String(session.workspaceId);
  const q = persona.questionnaire;
  const amount = q?.amount ?? 1000000;
  let a = await json("POST", "/api/journey/complete", {
    answers: {
      ...answers,
      age: age(persona.registeredAt),
      amountRange: range(amount),
      term: q?.term ?? 12,
    },
  });
  const draft = {
    ...a.questionnaire,
    amount,
    inn: persona.inn,
    authorized: true,
    consents: { registry: true, financial: true, bki: true },
    complete: "yes",
    loans: "no",
    leasing: "no",
  };
  draft.accounts[0].bank = "Альфа-Банк";
  a = await json("PUT", `/api/mvp2/applications/${a.id}`, { version: a.version, questionnaire: draft });
  a = await json("POST", `/api/mvp2/applications/${a.id}/registry`, { version: a.version });
  a = await json("PUT", `/api/mvp2/applications/${a.id}`, {
    version: a.version,
    questionnaire: { ...a.questionnaire, companyConfirmed: true },
  });
  const form = new FormData();
  form.set("version", String(a.version));
  form.set("accountId", a.questionnaire.accounts[0].id);
  form.set("file", new Blob([statement(persona)], { type: "text/csv" }), "statement.csv");
  a = await call(`/api/mvp2/applications/${a.id}/statements`, { method: "POST", body: form });
  await json("POST", `/api/mvp2/applications/${a.id}/submit`, { version: a.version });
  for (let i = 0; i < 60; i++) {
    a = await call(`/api/mvp2/applications/${a.id}`);
    if (!["SUBMITTED", "PROCESSING"].includes(a.lifecycle)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (a.decision === "APPROVED") {
    a = await json("POST", `/api/mvp2/applications/${a.id}/contract-details`, {
      version: a.version,
      details: {
        signatory: "Демонстрационный представитель",
        authority: "Устав",
        receivingAccount: "40702810000000000001",
        receivingBank: "Альфа-Банк",
      },
    });
    a = await json("POST", `/api/mvp2/applications/${a.id}/sign`, {
      hash: a.contract.hash,
      confirmed: true,
    });
    await json("POST", `/api/mvp2/applications/${a.id}/activate`, {});
  }
  // «Документы у менеджера» и «клиент молчит»: клиент пропускает запрошенное, заявка уходит менеджеру.
  if (
    a.decision === "ADDITIONAL_DATA_REQUIRED" &&
    ["manager_document", "silent", "young"].includes(persona.branch)
  )
    for (const item of a.missing.filter((m: { status?: string }) => (m.status ?? "todo") === "todo"))
      a = await json("POST", `/api/mvp2/applications/${a.id}/missing/${item.id}/skip`, {
        version: a.version,
      });
  // Спорная заявка записывается на встречу: так она попадает в очередь менеджера на /bank.
  if (a.decision === "MANAGER_REVIEW_REQUIRED" && a.lifecycle === "DECIDED") {
    const [slot] = await call("/api/mvp2/slots");
    if (slot)
      await json("POST", `/api/mvp2/applications/${a.id}/meeting`, {
        version: a.version,
        slotId: slot.id,
      });
  }
  const s = stateOf(uid);
  s.profile.name = persona.company;
  s.profile.form = persona.form;
  s.profile.sector = persona.sector;
  s.profile.registeredAt = persona.registeredAt;
  s.profile.inn = persona.inn;
  s.profile.source = "Синтетический демонстрационный сценарий";
  s.preferences.tourDone = true;
  saveReporting(uid, persona.key, s);
  db.prepare("INSERT OR REPLACE INTO jury_cabinets VALUES(?,?)").run(persona.key, uid);
  return uid;
}

/** Готовая компания жюри: один раз проходит путь, дальше отдаётся та же. */
export function juryCabinet(persona: DemoPersona, base: string) {
  const saved = db
    .prepare("SELECT user_id FROM jury_cabinets WHERE persona=?")
    .get(persona.key) as { user_id: string } | undefined;
  if (saved && preparedJuryCabinet(saved.user_id)) {
    // Кабинеты, собранные до появления ИНН в профиле, дописываются при входе.
    const s = stateOf(saved.user_id);
    if (!s.profile.inn) {
      s.profile.inn = persona.inn;
      saveState(saved.user_id, s);
    }
    saveReporting(saved.user_id, persona.key, stateOf(saved.user_id));
    return Promise.resolve(saved.user_id);
  }
  let run = pending.get(persona.key);
  if (!run) {
    run = walk(persona, base).finally(() => pending.delete(persona.key));
    pending.set(persona.key, run);
  }
  return run;
}

/** A demo left as a draft gets a separate prepared workspace; its previous history survives. */
export function preparedJuryCabinet(uid: string) {
  const row = db.prepare("SELECT d.data FROM mvp2_dossiers d JOIN applications a ON a.id=d.application_id WHERE a.user_id=? ORDER BY a.created_at DESC LIMIT 1").get(uid);
  return !!row && JSON.parse(String(row.data)).lifecycle !== "DRAFT";
}

/** Reopen the saved result, including a booked call or completed demo disbursement. */
export const juryDestination = (_uid: string) => "/apply";

/** Only the explicitly selected synthetic jury workspace receives example reports. */
function saveReporting(uid:string,key:string,state:ReturnType<typeof stateOf>) {
  const next=demoReporting(state,key);
  if(next===state)return;
  db.exec("BEGIN IMMEDIATE");
  try {
    for(const doc of next.documents.filter(d=>d.id.startsWith(`demo-reporting-${key}-`))){
      const csv=doc.records ? "date,amount,balance,purpose\n"+doc.records.map(r=>[r.date,r.amount,r.balance,r.purpose].join(",")).join("\n") : "field,value\n"+Object.entries(doc.fields).map(([k,v])=>`${k},${v}`).join("\n");
      db.prepare("INSERT OR REPLACE INTO files(id,user_id,name,mime,data) VALUES(?,?,?,?,?)").run(doc.id+"-"+uid,uid,doc.name,doc.mime,Buffer.from(csv));
      doc.id+="-"+uid;
    }
    // Keep fixture IDs stable per owner and day, avoiding cross-company document access.
    saveState(uid,next);db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e;}
}

/** Ordinary users are untouched; only an existing jury mapping authorizes fixture refresh. */
export function ensureJuryReporting(uid:string){
  const mapping=db.prepare("SELECT persona FROM jury_cabinets WHERE user_id=?").get(uid);
  if(mapping)saveReporting(uid,String(mapping.persona),stateOf(uid));
}
