import type { MvpApplication } from "../shared/mvp2";
import { products } from "../shared/mvp2";
import { money } from "./api";
import { StatusIllustration } from "./Illustration";
import { Button } from "./ui";

/** Display only a recorded, signed activation; this view never issues credit itself. */
export function FundingComplete({ application: a, onCredit, onBusiness }: {
  application: MvpApplication;
  onCredit(): void;
  onBusiness(): void;
}) {
  const confirmed = a.lifecycle === "ACTIVE" && a.activatedAt && a.signature?.hash &&
    a.signature.hash === a.contract?.hash && a.signature.version === a.contract?.version;
  if (!confirmed || !a.activatedAt) return <section className="funding-surface" role="status"><h2>Подтверждения выдачи пока нет</h2><p>Статус и подписанный договор должны быть сохранены в заявке.</p></section>;
  const product = products.find(item => item.id === a.questionnaire.productId);
  const loan = product?.kind === "loan";
  const refinancing = a.questionnaire.productId === "REFI";
  return <section className="funding-surface funding-complete" aria-label="Подтверждение получения финансирования">
    <div className="funding-complete-heading"><StatusIllustration status="disbursed" size={96} decorative/><div><span className="badge">Демонстрационный сценарий</span><h2>{refinancing ? "Целевое финансирование отражено" : loan ? "Кредит зачислен" : "Кредитный лимит открыт"}</h2><p>{a.company?.name || "Ваш бизнес"}</p></div></div>
    <strong className="funding-complete-amount">{money(a.questionnaire.amount)}</strong>
    <p>{refinancing ? "Отражено целевое перечисление. Погашение внешнего кредита нужно подтвердить отдельно." : loan ? "Выдача сохранена в заявке. График и состояние кредита доступны в кредитном кабинете." : "Лимит доступен в кредитном кабинете. До выборки средств задолженность равна нулю."}</p>
    <dl className="funding-complete-details"><div><dt>Продукт</dt><dd>{product?.name || a.questionnaire.productId}</dd></div><div><dt>Договор</dt><dd>{a.contract?.number}</dd></div><div><dt>Дата</dt><dd>{new Date(a.activatedAt).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"})} МСК</dd></div>{loan && a.questionnaire.receivingAccount && <div><dt>Счёт получения</dt><dd>•••• {a.questionnaire.receivingAccount.slice(-4)}</dd></div>}</dl>
    <p className="funding-complete-note">В прототипе отражена демонстрационная выдача. Реального перевода денег нет.</p>
    <div className="mvp-actions"><Button onClick={onCredit}>Перейти в кредитный кабинет</Button><Button secondary onClick={onBusiness}>Обзор бизнеса</Button></div>
  </section>;
}
