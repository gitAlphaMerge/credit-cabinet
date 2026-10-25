import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { products, defaultContractDetails, type MvpApplication } from "../shared/mvp2";
import { addDays, day } from "../shared/cabinet";
import { makeSchedule, dateMonth } from "./cabinet";
import { ApplicationError } from "./applications";
import { mvpGet, recordMvpTransition, stateFor } from "./mvp2";

const rub = (n: number) =>
  n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const font = () =>
  [
    process.env.CONTRACT_FONT,
    fileURLToPath(new URL("./assets/fonts/DejaVuSans.ttf", import.meta.url)),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ].find((p): p is string => !!p && existsSync(p));
const boldFont = (regular: string) => {
  const bold = fileURLToPath(new URL("./assets/fonts/DejaVuSans-Bold.ttf", import.meta.url));
  return regular === fileURLToPath(new URL("./assets/fonts/DejaVuSans.ttf", import.meta.url)) && existsSync(bold)
    ? bold : regular;
};
export function contractSchedule(a: MvpApplication) {
  const q = a.questionnaire,
    p = products.find((x) => x.id === q.productId)!;
  return p.kind === "loan"
    ? makeSchedule(
        q.amount,
        p.rate,
        q.term,
        dateMonth(a.contract?.date ?? day(), 1),
      )
    : [];
}
/** Fixed wording from the supplied MVP template. Only placeholders/mechanics vary. */
export function contractParagraphs(a: MvpApplication): string[] {
  const q = a.questionnaire,
    p = products.find((x) => x.id === q.productId)!,
    c = a.company!,
    n = a.contract!;
  return [
    `КРЕДИТНЫЙ ДОГОВОР № ${n.number}`,
    `Учебная система. Дата ${n.date.split("-").reverse().join(".")}`,
    `Условный кредитор учебного MVP, именуемый «Кредитор», и ${c.name}, ИНН ${c.inn}, ${c.form}, именуемый «Заёмщик», в лице ${q.signatory}, действующего на основании ${q.authority}, заключили настоящий договор о нижеследующем.`,
    "1. Предмет договора",
    "1.1. Кредитор предоставляет Заёмщику кредит на условиях настоящего договора, а Заёмщик обязуется возвратить полученные денежные средства и уплатить проценты за пользование кредитом.",
    `1.2. Кредитный продукт: ${p.name}. Цель финансирования: ${q.purpose}.`,
    "2. Основные условия",
    `Сумма кредита или лимит: ${rub(q.amount)} руб. ${p.kind === "overdraft" ? "Срок действия лимита 12 мес." : p.kind === "line" ? `Срок действия лимита ${q.term} мес.` : `Срок кредита ${q.term} мес.`} Фиксированная ставка: ${p.rate} % годовых.`,
    `Способ предоставления: ${p.kind === "loan" ? "единовременное перечисление" : p.id === "RCL" ? "возобновляемый лимит" : p.id === "NCL" ? "невозобновляемый лимит, выдача траншами" : "овердрафт по счёту"}. ${p.kind === "overdraft" ? `Каждая задолженность погашается не позднее ${q.overdraftRepaymentDays} дней с даты возникновения.` : `Условия погашения: ${p.repayment}.`}`,
    `Дата окончания: ${maturity(n.date, q.term)}. Договор не предусматривает залог в рамках демонстрационной модели.`,
    "3. Предоставление кредита",
    "3.1. По продуктам с единовременной выдачей сумма предоставляется одним перечислением. По кредитным линиям и овердрафту устанавливается лимит, а использование денежных средств производится в пределах предусмотренных продуктом условий.",
    `3.2. Счёт Заёмщика: ${q.receivingAccount}. Банк счёта: ${q.receivingBank}.`,
    "3.3. Выдача или активация лимита в рамках учебного прототипа моделируется после демонстрационного подписания и отдельного подтверждения Заёмщика.",
    ...(p.id === "REFI"
      ? [
          "Целевое назначение: рефинансирование. Внешний реальный кредит не считается погашенным операцией в MVP.",
        ]
      : []),
    "4. Проценты и погашение",
    `4.1. Проценты начисляются на фактический остаток задолженности по фиксированной ставке. ${p.kind === "loan" ? "Расчётная модель: месячная ставка равна годовой / 12; точные платежи приведены в Приложении № 1." : "При фактической выборке: остаток долга × годовая ставка / 100 × дни использования / 365. До выборки задолженность и проценты равны нулю."}`,
    p.kind === "loan"
      ? "4.2. Платежи по кредиту определяются графиком в Приложении № 1."
      : "4.2. Для лимита Приложение № 1 содержит параметры и правила погашения. Аннуитетный график до фактической выборки не формируется.",
    "4.3. Заёмщик вправе инициировать досрочное погашение в порядке, определённом условиями продукта. Проценты рассчитываются за фактическое время пользования денежными средствами.",
    "5. Права и обязанности сторон",
    "5.1. Кредитор обязуется предоставить кредит или открыть лимит в соответствии с условиями договора и отражать сведения о задолженности и платежах.",
    "5.2. Заёмщик обязуется использовать кредит по заявленной цели, своевременно погашать задолженность и предоставлять необходимые достоверные сведения.",
    "5.3. Стороны вправе уточнять реквизиты и условия исключительно путём формирования и согласования обновлённой версии документа.",
    "6. Ответственность сторон",
    "6.1. Неисполнение обязательств влечёт последствия, установленные применимым законодательством и согласованными условиями. Конкретные размеры штрафов, пеней и комиссий в демонстрационной модели не устанавливаются и автоматически не добавляются.",
    "7. Заключительные положения",
    "7.1. Настоящий документ подготовлен исключительно для демонстрации работы учебного MVP кредитного кабинета, не представляет собой предложение реального банковского продукта и не создаёт действительных кредитных обязательств.",
    "7.2. В прототипе используется имитация электронной подписи. Отметка SIGNED_DEMO не является юридически значимой электронной подписью.",
    "7.3. Приложение № 1 «График платежей / условия использования лимита» является частью демонстрационного комплекта документов.",
    "8. Реквизиты и отметки о подписании",
    `Кредитор: условный кредитор учебного MVP. Заёмщик: ${c.name}; ИНН ${c.inn}. Подписант: ${q.signatory}.`,
    signatureText(a),
  ].map((paragraph) => paragraph.replaceAll("\u2014", "."));
}
function maturity(date: string, months: number) {
  const d = new Date(date + "T00:00:00Z"),
    last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0),
    );
  last.setUTCDate(Math.min(d.getUTCDate(), last.getUTCDate()));
  return day(last);
}
function signatureText(a: MvpApplication) {
  return a.signature
    ? `Демонстрационная электронная подпись. SIGNED_DEMO. Время ${a.signature.at}. Идентификатор ${a.signature.id}. Версия ${a.signature.version}. SHA-256 исходного комплекта ${a.signature.hash}.`
    : "НЕ ПОДПИСАН. Демонстрационный документ; не является действующим договором с банком.";
}
export async function renderContractPdf(
  a: MvpApplication,
  kind: "contract" | "schedule",
): Promise<Buffer> {
  const fontPath = font();
  if (!fontPath)
    throw new ApplicationError(
      503,
      "Не найден шрифт для PDF. Настройте CONTRACT_FONT (TTF с кириллицей).",
    );
  const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: kind === "contract" ? "Кредитный договор" : "График платежей",
        Author: "Учебный MVP",
      },
    }),
    chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(fontPath).fontSize(10).fillColor("black");
  if (kind === "contract") {
    const paragraphs = contractParagraphs(a);
    for (const [i, p] of paragraphs.entries()) {
      doc.font(i === 0 || /^\d\. /.test(p) ? boldFont(fontPath) : fontPath);
      doc.fontSize(i === 0 ? 14 : 10);
      const h =
        doc.heightOfString(p, { lineGap: 3 }) +
        (/^\d\. /.test(p) && paragraphs[i + 1]
          ? doc.heightOfString(paragraphs[i + 1], { lineGap: 3 }) + 14
          : 0);
      if (doc.y + h + 12 > doc.page.height - doc.page.margins.bottom)
        doc.addPage();
      doc
        .fontSize(i === 0 ? 14 : 10)
        .text(p, { lineGap: 3 })
        .moveDown(0.65);
    }
  } else {
    const q = a.questionnaire,
      p = products.find((x) => x.id === q.productId)!;
    doc
      .font(boldFont(fontPath))
      .fontSize(14)
      .text("ПРИЛОЖЕНИЕ № 1")
      .text(p.kind === "loan" ? "График платежей" : "Условия использования лимита")
      .moveDown();
    doc
      .font(fontPath)
      .fontSize(10)
      .text(
        `К договору № ${a.contract!.number} от ${a.contract!.date}. ${p.name}; ${rub(q.amount)} руб.; ${p.rate}% годовых; ${p.kind === "loan" ? "срок кредита" : "срок лимита"} ${q.term} мес.`,
      )
      .moveDown();
    const rows = contractSchedule(a);
    if (rows.length) {
      const widths = [84, 100, 100, 95, 100],
        xs = [48, 132, 232, 332, 427];
      const draw = (cells: string[], header = false) => {
        if (doc.y > 752) doc.addPage();
        const y = doc.y;
        cells.forEach((t, i) =>
          doc
            .fontSize(header ? 9 : 8)
            .text(t, xs[i], y, { width: widths[i], lineBreak: false }),
        );
        doc.y = y + 22;
        doc
          .moveTo(48, doc.y - 3)
          .lineTo(547, doc.y - 3)
          .strokeColor("#999999")
          .lineWidth(0.3)
          .stroke();
      };
      const head = () =>
        draw(
          ["Дата", "Платёж, руб.", "Основной долг", "Проценты", "Остаток"],
          true,
        );
      head();
      for (const r of rows) {
        if (doc.y > 730) {
          doc.addPage();
          head();
        }
        draw([
          r.date,
          rub(r.principal + r.interest),
          rub(r.principal),
          rub(r.interest),
          rub(r.balance),
        ]);
      }
      doc.x = 48;
      doc
        .moveDown()
        .fontSize(10)
        .text(
          `Итого выплат: ${rub(rows.reduce((s, r) => s + r.principal + r.interest, 0))} руб. Последний платёж полностью закрывает основной долг.`,
        );
    } else {
      doc
        .text(
          `Установленный лимит: ${rub(q.amount)} руб. Срок действия лимита: ${q.term} мес. Дата окончания: ${maturity(a.contract!.date, q.term)}. До фактической выборки задолженность: 0 руб. ${p.kind === "overdraft" ? `Каждая задолженность погашается не позднее ${q.overdraftRepaymentDays} дней с даты возникновения.` : p.repayment + "."}`,
        )
        .moveDown();
      doc
        .text(
          "Проценты: фактический долг × ставка / 100 × количество дней / 365. Фиксированный аннуитет до выборки не формируется.",
        )
        .moveDown();
      doc.text(
        `План использования, со слов заёмщика: ${(q.tranches || `цикл ${q.cycleDays ?? "не указан"} дней`).replaceAll("\u2014", ".")}. Фактические обязательства формируются при согласованной выборке, не автоматически при открытии лимита.`,
      );
    }
    doc.x = 48;
    doc.moveDown().fontSize(9).text(signatureText(a));
  }
  doc.end();
  return result;
}
export async function prepareContract(
  db: DatabaseSync,
  uid: string,
  id: string,
  version: number,
) {
  const a = mvpGet(db, id, uid);
  if (a.contract) return a;
  if (a.version !== version)
    throw new ApplicationError(409, "Версия заявки изменилась");
  if (
    a.decision !== "APPROVED" ||
    !["DECIDED", "MANAGER_APPROVED"].includes(a.lifecycle)
  )
    throw new ApplicationError(
      409,
      "Договор доступен только после окончательного одобрения",
    );
  const q = a.questionnaire;
  if (!a.company)
    throw new ApplicationError(422, "Данные компании не найдены. Найдите компанию по ИНН в анкете или проверьте сведения в ЕГРЮЛ/ЕГРИП на сайте ФНС.");
  const defaults = defaultContractDetails(a.company, q.accounts, stateFor(db, uid).profile);
  for (const key of ["signatory", "authority", "receivingAccount", "receivingBank"] as const)
    if (!q[key]) q[key] = defaults[key];
  if (
    !q.signatory.trim() ||
    !q.authority.trim() ||
    !/^\d{20}$/.test(q.receivingAccount) ||
    !q.receivingBank.trim()
  )
    throw new ApplicationError(
      422,
      "Не хватает реквизитов для договора. Проверьте руководителя в выписке ЕГРЮЛ или ФИО ИП в ЕГРИП на сайте ФНС, а расчётный счёт в кабинете Альфа-Банка; затем нажмите «Изменить».",
    );
  a.contract = {
    number: "MVP-" + id.slice(0, 8).toUpperCase(),
    date: day(),
    hash: "",
    version: a.version,
  };
  const [contract, schedule] = await Promise.all([
    renderContractPdf(a, "contract"),
    renderContractPdf(a, "schedule"),
  ]);
  a.contract.hash = sha(Buffer.concat([contract, schedule]));
  a.lifecycle = "CONTRACT_READY";
  db.exec("BEGIN IMMEDIATE");
  try {
    const fresh = mvpGet(db, id, uid);
    if (fresh.contract) {
      db.exec("ROLLBACK");
      return fresh;
    }
    if (fresh.version !== version)
      throw new ApplicationError(
        409,
        "Заявка изменилась при подготовке договора",
      );
    for (const [kind, b] of [
      ["contract", contract],
      ["schedule", schedule],
    ] as const)
      db.prepare("INSERT INTO mvp2_documents VALUES(?,?,?,?,?,?)").run(
        id,
        version,
        kind,
        0,
        sha(b),
        b,
      );
    recordMvpTransition(db, a, "mvp2_contract_ready");
    db.exec("COMMIT");
    return a;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
export async function signMvp(
  db: DatabaseSync,
  uid: string,
  id: string,
  documentHash: string,
  confirmed: boolean,
) {
  const a = mvpGet(db, id, uid);
  if (a.signature) {
    if (a.signature.hash !== documentHash)
      throw new ApplicationError(409, "Хеш подписанного документа отличается");
    return a;
  }
  if (
    !confirmed ||
    a.decision !== "APPROVED" ||
    a.lifecycle !== "CONTRACT_READY" ||
    !a.contract ||
    a.contract.hash !== documentHash
  )
    throw new ApplicationError(
      409,
      "Подтвердите ознакомление с актуальным договором",
    );
  a.signature = {
    id: randomUUID(),
    at: new Date().toISOString(),
    hash: a.contract.hash,
    version: a.contract.version,
  };
  a.lifecycle = "SIGNED_DEMO";
  const buffers = await Promise.all([
    renderContractPdf(a, "contract"),
    renderContractPdf(a, "schedule"),
  ]);
  db.exec("BEGIN IMMEDIATE");
  try {
    const fresh = mvpGet(db, id, uid);
    if (fresh.signature) {
      db.exec("ROLLBACK");
      return fresh;
    }
    if (
      fresh.lifecycle !== "CONTRACT_READY" ||
      fresh.contract?.hash !== documentHash
    )
      throw new ApplicationError(409, "Договор изменился");
    for (const [i, kind] of ["contract", "schedule"].entries())
      db.prepare("INSERT INTO mvp2_documents VALUES(?,?,?,?,?,?)").run(
        id,
        a.contract.version,
        kind,
        1,
        sha(buffers[i]),
        buffers[i],
      );
    recordMvpTransition(db, a, "mvp2_signed_demo");
    db.exec("COMMIT");
    return a;
  } catch (e) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw e;
  }
}
