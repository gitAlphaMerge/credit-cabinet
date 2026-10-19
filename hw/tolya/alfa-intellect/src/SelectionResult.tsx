import {
  ArrowRight,
  SlidersHorizontal,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Check,
} from "lucide-react";
import { Badge, Button } from "./ui";
import { money, date } from "./api";
import type { Selection } from "../shared/types";
import {
  financialLabels,
  fundingCatalog,
  requirementText,
} from "../shared/financing";
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
      c.flow !== null && c.flow > 0 && c.existing !== null
        ? Math.round(
            (((s.assessment?.peakPayment ?? c.monthlyPayment) + c.existing) /
              c.flow) *
              100,
          )
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
    a = item.assessment,
    result = selectionSummary(item),
    tone = !result.known
      ? "unknown"
      : result.comfortable
        ? "positive"
        : "caution",
    Icon = !result.known
      ? Info
      : result.comfortable
        ? CheckCircle2
        : AlertTriangle,
    selected = fundingCatalog.find((p) => p.id === a?.selectedId),
    recommended = fundingCatalog.find((p) => p.id === a?.recommendedId),
    reasons = a?.reasons || [
      "Инструмент выбран для задачи бизнеса.",
      "Расчёт сохранён в предыдущей версии прототипа; источники можно уточнить при новом расчёте.",
    ],
    title = a?.title || result.title;
  return (
    <section
      className={
        "funding-surface result-panel result-v2 " + tone + " funding-result"
      }
    >
      <div className="funding-result-head">
        <span className="eyebrow">
          <Sparkles size={15} />{" "}
          {a && a.selectedId !== a.recommendedId
            ? "Выбранный вами инструмент"
            : "Рекомендуемый инструмент"}
        </span>
        <Badge>{a?.level || "Ориентировочная"}</Badge>
      </div>
      <h2>{item.product}</h2>
      <p className="funding-result-purpose">
        {item.purpose} · {item.repayFrom}
      </p>
      {recommended && a?.selectedId !== a?.recommendedId && (
        <p className="funding-source">
          Исходная рекомендация: {recommended.name}. Выбор изменён
          пользователем.
        </p>
      )}
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
          <strong>
            {result.known ? money(c.maxAmount) : "Недостаточно данных"}
          </strong>
          {result.known ? (
            <div className="capacity-track capacity-model">
              <i style={{ width: (c.maxAmount! / result.scale) * 100 + "%" }} />
            </div>
          ) : (
            <span className="funding-capacity-unknown">
              Нужны актуальный поток и обязательства
            </span>
          )}
        </div>
      </div>
      <p className="funding-scale-hint">
        Индикатор сравнивает суммы, не вероятность выдачи. Это расчётный
        ориентир, не лимит банка.
      </p>
      <div className="funding-result-metrics">
        <div>
          <small>
            {selected?.kind === "overdraft" ? "Срок лимита" : "Срок"}
          </small>
          <b>{c.term} мес.</b>
        </div>
        <div>
          <small>Сценарная ставка</small>
          <b>{c.rate}% годовых</b>
        </div>
        <div>
          <small>{a?.paymentLabel || "Платёж в месяц"}</small>
          <b>{money(c.monthlyPayment)}</b>
        </div>
        <div>
          <small>
            {a?.finalPayment !== undefined && selected?.kind !== "loan"
              ? "Возврат в конце цикла"
              : "Доля потока на все кредиты"}
          </small>
          <b>
            {a?.finalPayment !== undefined && selected?.kind !== "loan"
              ? money(a.finalPayment)
              : result.burden === null
                ? "Нет данных"
                : result.burden + "%"}
          </b>
        </div>
      </div>
      <div className="funding-verdict">
        <Icon size={22} />
        <div>
          <h3>{title}</h3>
          <p>
            {a?.decision === "unnecessary"
              ? "Вы указали достаточно свободных денег после обязательных расходов. Сравните вариант без нового долга."
              : a?.decision === "rethink"
                ? "Указанный эффект покупки не положительный. Обсудите экономику проекта до привлечения долга."
                : a?.missing.length
                  ? a.missing.join(" · ")
                  : "Посильность, соответствие продукта и полнота данных проверяются отдельно. Решение по выдаче принимает банк."}
          </p>
        </div>
      </div>
      <div className="funding-why">
        <h3>Почему выбран этот вариант?</h3>
        <ul>
          {reasons.slice(0, 4).map((reason) => (
            <li key={reason}>
              <Check size={15} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>
      <details className="funding-assessment">
        <summary>Подробнее об оценке</summary>
        <h3>Соответствие сценарию каталога</h3>
        {a ? (
          <div className="funding-checks">
            {a.checks.map((check) => (
              <div key={check.label}>
                <span>{check.label}</span>
                <Badge
                  tone={
                    check.state === "unmet"
                      ? "red"
                      : check.state === "met"
                        ? "green"
                        : "neutral"
                  }
                >
                  {requirementText(check.state)}
                </Badge>
                <small>{check.detail}</small>
              </div>
            ))}
          </div>
        ) : (
          <p>
            Для старого расчёта подробные проверки не сохранены. Пересчитайте
            условия.
          </p>
        )}
        <h3>Исходные данные и источники</h3>
        {a && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th>Значение</th>
                  <th>Источник и период</th>
                </tr>
              </thead>
              <tbody>
                {a.data.map((d) => (
                  <tr key={d.key}>
                    <td>{financialLabels[d.key]}</td>
                    <td>{d.value === null ? "Нет данных" : money(d.value)}</td>
                    <td>
                      {d.source}
                      <small>
                        {d.period} · {d.currency} ·{" "}
                        {d.kind === "fact"
                          ? "Исторические данные"
                          : d.kind === "forecast"
                            ? "Прогноз"
                            : "Ввод пользователя"}{" "}
                        · {d.asOf}
                        {d.stale ? " · Устарело" : ""}
                        {d.conflict ? " · Конфликт" : ""}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="text-button" onClick={onDocuments}>
          Уточнить документы бизнеса <ArrowRight size={15} />
        </button>
        <h3>Математика расчёта</h3>
        <div className="funding-formulas">
          {(a?.formula || [c.formula]).map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
        <dl className="funding-detail-values">
          {[
            ["Поток для оценки", money(a?.flow ?? c.flow)],
            [
              "Действующие платежи после изменений",
              money(a ? a.existingAfter : c.existing),
            ],
            ["Пиковый платёж", money(a?.peakPayment ?? c.monthlyPayment)],
            ["DSCR, модель", String(c.dscr ?? "Недостаточно данных")],
            [
              "Стресс: поток −30%",
              String(c.stressDscr ?? "Недостаточно данных"),
            ],
            ["Проценты за весь сценарий", money(c.interest)],
            ["Выплаты за весь сценарий", money(c.total)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {a?.paybackMonths !== null && a?.paybackMonths !== undefined && (
          <p>
            Простая окупаемость по указанному эффекту: {a.paybackMonths} мес. =
            стоимость покупки ÷ эффект в месяц. Это не инвестиционная оценка с
            налогами и дисконтированием.
          </p>
        )}
        <h3>Допущения и ограничения</h3>
        <ul>
          {(a?.assumptions || [c.source]).map((text) => (
            <li key={text}>{text}</li>
          ))}
          {item.risks.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <details className="funding-schedule">
          <summary>Расчётный график · {c.schedule.length} платежей</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Платёж</th>
                  <th>Основной долг</th>
                  <th>Проценты</th>
                  <th>Остаток</th>
                </tr>
              </thead>
              <tbody>
                {c.schedule.map((r) => (
                  <tr key={r.date}>
                    <td>{date(r.date)}</td>
                    <td>{money(r.payment)}</td>
                    <td>{money(r.principal)}</td>
                    <td>{money(r.interest)}</td>
                    <td>{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </details>
      {!!a?.alternatives.length && (
        <div className="funding-alternatives">
          <h3>Что ещё сравнить</h3>
          {a.alternatives.map((p) => (
            <div key={p.id}>
              <b>{p.name}</b>
              <span>{p.reason}</span>
            </div>
          ))}
        </div>
      )}
      {a?.checks.some((c) => c.state === "unmet") && (
        <p className="funding-catalog-warning">
          <AlertTriangle size={16} /> Есть несоответствия условиям сценарного
          каталога. Подробности — в оценке; это не банковский отказ.
        </p>
      )}
      <p className="funding-source">
        Каталог {a?.catalogVersion || "demo-1"} · ставки и ограничения
        синтетические, не предложение Альфа-Банка.{" "}
        {a?.level === "Ориентировочная"
          ? "Добавление пригодных данных позволит оценить посильность."
          : "Для расширенной оценки нужны актуальная история потоков, сопоставимые обязательства и сценарии."}
      </p>
      <div className="funding-result-actions">
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
