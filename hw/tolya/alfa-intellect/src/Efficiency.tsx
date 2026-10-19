import { ArrowLeft, ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { useWorkspace } from "./context";
import { Button } from "./ui";
import { money } from "./api";
import {
  DSCR_TARGET,
  efficiencyBasis,
  efficiencyMetrics,
} from "../shared/efficiency";
import type { AppState } from "../shared/types";
const decimal = (n: number | null, unit = "") =>
  n === null
    ? "—"
    : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + unit;
export function EfficiencyPanel({
  state,
  onOpen,
}: {
  state: AppState;
  onOpen?: () => void;
}) {
  const basis = efficiencyBasis(state),
    m = efficiencyMetrics(basis.calculation);
  return (
    <section className="panel efficiency-panel">
      <div className="panel-title">
        <h2>Эффективность кредитной нагрузки</h2>
        <ChartNoAxesCombined size={20} />
      </div>
      <div className="efficiency-grid">
        <div>
          <small>Покрытие платежей · DSCR</small>
          <strong>{decimal(m.dscr, "×")}</strong>
          <span>Ориентир модели: от 1,25×</span>
        </div>
        <div>
          <small>Платежи / свободный поток</small>
          <strong>{decimal(m.burden, "%")}</strong>
          <span>Нагрузка на денежный поток</span>
        </div>
        <div>
          <small>Запас ежемесячного платежа</small>
          <strong>{m.reserve === null ? "—" : money(m.reserve)}</strong>
          <span>До порога DSCR 1,25</span>
        </div>
        <div>
          <small>Покрытие при снижении потока</small>
          <strong>{decimal(m.stressDscr, "×")}</strong>
          <span>Стресс-сценарий: поток −30%</span>
        </div>
      </div>
      <div className="efficiency-bottom">
        <p>
          {basis.calculation
            ? basis.label
            : "Добавьте денежный поток и сохраните подбор — здесь появятся показатели нагрузки."}
        </p>
        {onOpen && (
          <button className="text-button" onClick={onOpen}>
            Разобрать показатели <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
export function EfficiencyPage() {
  const w = useWorkspace(),
    basis = efficiencyBasis(w.state),
    c = basis.calculation,
    m = efficiencyMetrics(c);
  const threshold = DSCR_TARGET.toLocaleString("ru-RU");
  return (
    <main className="page-wrap efficiency-page">
      <button
        className="text-button muted"
        onClick={() => w.go(w.cabinetPath || "/cabinet")}
      >
        <ArrowLeft size={16} /> Кредитный кабинет
      </button>
      <div className="page-heading">
        <h1>Эффективность кредитных средств</h1>
        <p>Насколько денежный поток покрывает платежи и где остаётся запас.</p>
      </div>
      <EfficiencyPanel state={w.state} />
      <div className="efficiency-detail-grid">
        <section className="panel">
          <h2>Исходные данные</h2>
          <dl className="profile-table">
            <div>
              <dt>Основание</dt>
              <dd>{c ? basis.label : "Расчёт ещё не сохранён"}</dd>
            </div>
            <div>
              <dt>Свободный поток в месяц</dt>
              <dd>{money(m.flow)}</dd>
            </div>
            <div>
              <dt>Платёж по расчёту</dt>
              <dd>{money(c?.monthlyPayment)}</dd>
            </div>
            <div>
              <dt>Другие платежи в месяц</dt>
              <dd>{money(c?.existing)}</dd>
            </div>
            <div>
              <dt>Всего на обслуживание долга</dt>
              <dd>{money(m.debt)}</dd>
            </div>
            <div>
              <dt>Проценты за весь срок / сумма кредита</dt>
              <dd>{decimal(m.interestShare, "%")}</dd>
            </div>
          </dl>
          <p className="fine-print">
            {c?.source ||
              "Загрузите выписку или укажите денежный поток в подборе."}
          </p>
        </section>
        <section className="panel efficiency-explanation">
          <h2>Как читать показатели</h2>
          <p>
            <b>DSCR</b> = свободный поток / все ежемесячные платежи. Значение{" "}
            {threshold} означает: поток на 25% выше платежей. Это порог модели,
            а не гарантия решения банка.
          </p>
          <p>
            <b>Запас платежа</b> = поток / {threshold} − все платежи.
            Отрицательное значение показывает, на сколько нужно уменьшить
            ежемесячную нагрузку, чтобы достичь порога при том же потоке.
          </p>
          <p>
            <b>Стресс-покрытие</b> = поток × 0,7 / все платежи. Проверяет
            устойчивость к снижению свободного потока на 30%.
          </p>
          <p>
            <b>Стоимость за срок</b> не является годовой ставкой или
            рентабельностью проекта. Для ROI нужны отдельные данные о
            дополнительных доходах и затратах проекта.
          </p>
        </section>
      </div>
      <section className="panel efficiency-next">
        <h2>Оптимизация нагрузки</h2>
        <p>
          {m.dscr === null
            ? "Пока недостаточно данных для вывода. Сохраните подбор с денежным потоком: затем можно сравнивать суммы и сроки."
            : m.dscr < DSCR_TARGET
              ? "Текущая нагрузка выше порога модели. В подборе сравните меньшую сумму или другой срок и проверьте общий объём процентов."
              : m.stressDscr! < DSCR_TARGET
                ? "Базовый расчёт проходит порог, но в стресс-сценарии запас сокращается. Сравните варианты с меньшим платежом."
                : "Расчёт сохраняет покрытие выше порога модели и в стресс-сценарии. Сравнивайте новые варианты по платежу и общей стоимости, а не только по ставке."}
        </p>
        <Button onClick={() => w.go("/financing")}>
          Сравнить варианты финансирования <ArrowRight size={16} />
        </Button>
      </section>
    </main>
  );
}
