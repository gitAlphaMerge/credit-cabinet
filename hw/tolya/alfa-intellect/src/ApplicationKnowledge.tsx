import type { MvpApplication } from "../shared/mvp2";
import { money } from "./api";

export type KnowledgeItem = { title: string; source: string; section: number };
export function applicationKnowledge(a: MvpApplication) {
  const confirmed: KnowledgeItem[] = [], assumptions: KnowledgeItem[] = [];
  if (a.company && a.questionnaire.companyConfirmed) confirmed.push({title: a.company.name, source: a.company.demo ? "Демонстрационная запись реестра, подтверждена заявителем" : `${a.company.source}. Подтверждено заявителем`, section: 0});
  const statements = (a.questionnaire.accounts || []).filter(account => account.documentId);
  if (statements.length) confirmed.push({title: `Выписки по счетам: ${statements.length}`, source: "Загруженные документы. Полноту операций подтверждает заявитель", section: 1});
  if (a.financial) {
    assumptions.push({title: `Свободный поток: ${money(a.financial.flow)} в месяц`, source: `Сохранённый расчёт по выпискам за ${a.financial.months} мес.`, section: 1});
    assumptions.push({title: `Покрытие платежа: ${a.financial.dscr.toFixed(2)}`, source: "Расчётный коэффициент, не гарантия будущих поступлений", section: 2});
  }
  const q = a.questionnaire;
  if (q.seasonality !== "unknown") assumptions.push({title: q.seasonality === "yes" ? "Есть сезонность" : "Сезонность не указана", source: "Со слов заявителя. Можно уточнить в анкете", section: 3});
  const missing = (a.missing || []).filter(item => item.status !== "accepted" && item.status !== "skipped").map(item => ({title: item.title || item.label, source: item.status === "uploaded" ? "Загружено, ожидает проверки" : item.why || "Нужно уточнить для рассмотрения заявки", section: item.section}));
  return {confirmed, assumptions, missing};
}

export function ApplicationKnowledge({ application, onEdit, editable = false }: { application: MvpApplication; onEdit?(section: number): void; editable?: boolean }) {
  const groups = applicationKnowledge(application);
  return <section className="application-knowledge" aria-label="Источники и полнота данных заявки">
    <header><span className="eyebrow">ВАША ЗАЯВКА В ДЕТАЛЯХ</span><h3>Что известно, что рассчитано и чего не хватает</h3><p>Показываем сведения этого кабинета. Загрузка документа сама по себе не означает проверку банком.</p></header>
    <div className="knowledge-grid">{([
      ["confirmed", "Подтверждено в кабинете", groups.confirmed, "Подтверждённых сведений пока нет."],
      ["assumptions", "Расчёт и предположения", groups.assumptions, "Расчёт появится после обработки данных."],
      ["missing", "Нужно уточнить", groups.missing, "Открытых запросов сведений сейчас нет."],
    ] as const).map(([kind,title,items,empty]) => <article key={kind} data-kind={kind}><h4>{title}<span>{items.length}</span></h4>{items.length ? items.map((item,i) => <div className="knowledge-item" key={i}><strong>{item.title}</strong><small>{item.source}</small>{editable && onEdit && <button type="button" onClick={() => onEdit(item.section)}>{kind === "missing" ? "Дополнить" : "Проверить сведения"} →</button>}</div>) : <p>{empty}</p>}</article>)}</div>
  </section>;
}
