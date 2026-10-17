import {
  ArrowRight,
  SlidersHorizontal,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Badge, Button, CalculationView } from "./ui";
import { money } from "./api";
import type { Selection } from "../shared/types";
export function selectionSummary(s: Selection) {
  const c = s.calculation,
    known = c.maxAmount !== null,
    comfortable = known && c.maxAmount! >= c.amount;
  return {
    known,
    comfortable,
    scale: Math.max(c.amount, c.maxAmount ?? 0),
    coverage: known ? Math.round((c.maxAmount! / c.amount) * 100) : null,
    title: !known
      ? "Недостаточно данных для оценки"
      : comfortable
        ? "По текущему потоку сумма выглядит посильной"
        : "Запрос превышает предварительно посильную сумму",
    burden:
      c.flow !== null && c.flow > 0
        ? Math.round(((c.monthlyPayment + c.existing) / c.flow) * 100)
        : null,
  };
}
export function SelectionResult({
  item,
  onRevise,
  onDiscuss,
  onApply,
  onDocuments,
}: {
  item: Selection;
  onRevise: () => void;
  onDiscuss: () => void;
  onApply: () => void;
  onDocuments: () => void;
}) {
  const c = item.calculation,
    result = selectionSummary(item),
    tone = !result.known
      ? "unknown"
      : result.comfortable
        ? "positive"
        : "caution";
  const Icon = !result.known
    ? Info
    : result.comfortable
      ? CheckCircle2
      : AlertTriangle;
  return (
    <section className={"panel result-panel result-v2 " + tone}>
      <div className="recommendation-heading">
        <span className="eyebrow">Рекомендованный инструмент</span>
        <Badge>Расчётный ориентир · не одобрение</Badge>
      </div>
      <h2>{item.product}</h2>
      <p className="recommendation-why">
        Для задачи «{item.purpose.toLowerCase()}» с возвратом из источника «
        {item.repayFrom.toLowerCase()}». Соответствие условиям ещё требуется
        проверить.
      </p>
      <div className="capacity-comparison">
        <div>
          <small>Вы запрашиваете</small>
          <strong>{money(c.amount)}</strong>
          <div className="capacity-track">
            <i style={{ width: (c.amount / result.scale) * 100 + "%" }} />
          </div>
        </div>
        <div>
          <small>Предварительно посильная сумма</small>
          <strong>{result.known ? money(c.maxAmount) : "Нет данных"}</strong>
          {result.known ? (
            <div className="capacity-track capacity-model">
              <i style={{ width: (c.maxAmount! / result.scale) * 100 + "%" }} />
            </div>
          ) : (
            <p>Укажите свободный денежный поток.</p>
          )}
        </div>
      </div>
      {result.known && (
        <p className="comparison-caption">
          Масштаб полос: 100% = {money(result.scale)} — большая из двух сумм.
          Оценка {result.coverage! < 100 ? "покрывает" : "составляет"}{" "}
          {result.coverage}% запроса (посильная сумма ÷ запрос × 100). Это
          отношение сумм, не вероятность выдачи.
        </p>
      )}
      <div className="result-key-metrics">
        <div>
          <small>Срок</small>
          <b>{c.term} мес.</b>
        </div>
        <div>
          <small>Ставка из демокаталога</small>
          <b>{c.rate}% годовых</b>
        </div>
        <div>
          <small>Платёж в месяц</small>
          <b>{money(c.monthlyPayment)}</b>
        </div>
        <div>
          <small>Доля потока на все кредиты</small>
          <b>{result.burden === null ? "Нет данных" : result.burden + "%"}</b>
        </div>
      </div>
      <div className="result-verdict">
        <Icon size={23} />
        <div>
          <h3>{result.title}</h3>
          <p>
            {item.status}. Модель DSCR ≥ 1,25; посильная сумма не является
            лимитом банка и не гарантирует кредит.
          </p>
        </div>
      </div>
      <div className="result-explanation">
        <div>
          <h3>На чём основан вывод</h3>
          <ul>
            <li>
              Свободный поток по параметрам сценария: {money(c.flow)} в месяц.
            </li>
            <li>
              Действующие платежи: {money(c.existing)}. DSCR:{" "}
              {c.dscr ?? "не определён"}.
            </li>
            <li>
              Поток −30%: DSCR {c.stressDscr ?? "не определён"}. Собственные
              средства {money(item.ownFunds)} учитываются отдельно.
            </li>
          </ul>
          {item.risks.length > 0 && (
            <details>
              <summary>
                Ограничения данных и условий ({item.risks.length})
              </summary>
              <ul>
                {item.risks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div>
          <h3>Следующие шаги</h3>
          <ol>
            <li>
              {!result.known
                ? "Добавьте выписку или укажите денежный поток."
                : result.comfortable
                  ? "Проверьте документы и будущие обязательные расходы."
                  : "Сравните меньшую сумму или более длинный срок."}
            </li>
            <li>
              {item.alternatives[0] ||
                "Уточните условия инструмента с менеджером."}
            </li>
            <li>Подготовьте досье и обсудите ограничения с менеджером.</li>
          </ol>
          <button className="text-button" onClick={onDocuments}>
            Открыть документы <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <CalculationView c={c} showStats={false} />
      <p className="fine-print">
        Демонстрационные условия каталога demo-1, не предложение Альфа-Банка.
        Комиссии и страхование не включены. Источник денежных показателей —
        параметры этого сценария; достоверность документов требует проверки.
      </p>
      <div className="result-actions">
        <Button secondary onClick={onRevise}>
          <SlidersHorizontal size={17} /> Изменить параметры
        </Button>
        <Button secondary onClick={onDiscuss}>
          <MessageSquare size={17} /> Обсудить с агентом
        </Button>
        <Button onClick={onApply}>
          Перейти к оформлению <ArrowRight size={17} />
        </Button>
      </div>
    </section>
  );
}
