import type { Metric } from "../shared/cabinet";
import { ContextHelp } from "./ContextHelp";
import { metricScale } from "./metric-scale";
import { presentTechnicalText, safeDisplayText } from "./application-client";
export function MetricExplanation({ metric: m }: { metric: Metric }) {
  const scale = metricScale(m);
  return (
    <>
      <p>{presentTechnicalText(m.meaning)}</p>
      <dl>
        <div>
          <dt>Формула</dt>
          <dd>{presentTechnicalText(m.formula)}</dd>
        </div>
        <div>
          <dt>Исходные данные</dt>
          <dd>{presentTechnicalText(m.inputs)}</dd>
        </div>
        <div>
          <dt>Источник и период</dt>
          <dd>
            {presentTechnicalText(m.source)}
            <br />
            {m.period}
          </dd>
        </div>
      </dl>
      <p>{safeDisplayText(m.reason)}</p>
      <p className="scale-explanation">{scale.note}</p>
    </>
  );
}
export function FinancialIndicators({ metrics }: { metrics: Metric[] }) {
  return (
    <section
      className="unified-indicators"
      data-tour="metrics"
      id="financial-metrics"
    >
      <div className="cv-card-head">
        <h2>Финансовые показатели</h2>
      </div>
      <div className="cv-metrics">
        {metrics.map((m) => {
          const scale = metricScale(m);
          return (
            <div key={m.id} className={"cv-metric " + m.tone}>
              <div>
                <small>{m.name}</small>
                <ContextHelp label={"О показателе: " + m.name}>
                  <MetricExplanation metric={m} />
                </ContextHelp>
              </div>
              <b>
                {m.value === null
                  ? "—"
                  : m.value.toLocaleString("ru-RU", {
                      maximumFractionDigits: 2,
                    }) + m.unit}
              </b>
              <span>{m.assessment}</span>
              <div
                className={
                  "metric-scale " +
                  scale.kind +
                  (scale.position === null ? " no-data" : "")
                }
                role="img"
                aria-label={
                  m.value === null
                    ? m.name + ": недостаточно данных"
                    : m.name +
                      ": " +
                      m.value.toLocaleString("ru-RU") +
                      m.unit +
                      ". " +
                      scale.note
                }
              >
                <div className="metric-scale-track">
                  {scale.position !== null && (
                    <i style={{ left: scale.position + "%" }} />
                  )}
                </div>
                {scale.position !== null && (
                  <div className="metric-scale-labels">
                    <small>{scale.left}</small>
                    <small>{scale.right}</small>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
