import type { ReactNode, ButtonHTMLAttributes } from "react";
import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import type { Calculation } from "../shared/types";
import { money } from "./api";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        А<span />
      </span>
      <span>
        Альфа<span className="brand-light">—Интеллект</span>
        <small>ДЛЯ БИЗНЕСА</small>
      </span>
    </span>
  );
}
export function Button({
  children,
  secondary = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      className={(secondary ? "button secondary" : "button") + " " + className}
      {...rest}
    >
      {children}
    </button>
  );
}
export function IconButton({
  children,
  label,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      className={"icon-button " + className}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const root = useRef<HTMLElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>("button,input,textarea")
        ?.focus(),
    );
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const nodes = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],input:not([hidden]),select,textarea",
          ) || [],
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("keydown", keyboard);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            onClick={onClose}
            className="icon-button"
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function LineChart({
  values,
  labels = [],
  color = "#ef3124",
  height = 150,
  description = "Динамика остатка основного долга",
}: {
  values: number[];
  labels?: string[];
  color?: string;
  height?: number;
  description?: string;
}) {
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    range = max - min;
  const points = values
    .map(
      (v, i) =>
        `${20 + (i / (values.length - 1 || 1)) * 560},${height - 25 - ((v - min) / range) * (height - 45)}`,
    )
    .join(" ");
  return (
    <div className="line-chart">
      <svg viewBox={`0 0 600 ${height}`} role="img" aria-label={description}>
        <defs>
          <linearGradient
            id={"fade" + color.slice(1)}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop stopColor={color} stopOpacity=".16" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.5, 0.8].map((v) => (
          <line
            key={v}
            x1="20"
            x2="580"
            y1={height * v}
            y2={height * v}
            stroke="#e9ecf1"
            strokeDasharray="4 5"
          />
        ))}
        <polygon
          points={`20,${height - 15} ${points} 580,${height - 15}`}
          fill={`url(#fade${color.slice(1)})`}
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.length > 0 && (
          <circle
            cx="580"
            cy={height - 25 - ((values.at(-1)! - min) / range) * (height - 45)}
            r="5"
            fill={color}
          />
        )}
      </svg>
      {labels.length > 0 && (
        <div className="chart-labels">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
export function CalculationView({
  c,
  open = false,
  showStats = true,
}: {
  c: Calculation;
  open?: boolean;
  showStats?: boolean;
}) {
  return (
    <div className="calculation">
      {showStats && (
        <div className="calc-stats">
          <div>
            <small>Сумма</small>
            <strong>{money(c.amount)}</strong>
          </div>
          <div>
            <small>Срок</small>
            <strong>{c.term} мес.</strong>
          </div>
          <div>
            <small>Демо-ставка</small>
            <strong>{c.rate}%</strong>
          </div>
          <div>
            <small>Платёж в месяц</small>
            <strong>{money(c.monthlyPayment)}</strong>
          </div>
        </div>
      )}
      <details open={open || undefined}>
        <summary>
          Показать расчёт <ChevronDown size={16} />
        </summary>
        <div className="calculation-detail">
          <p className="formula">{c.formula}</p>
          <div className="info-grid">
            <div>
              <small>Поток / месяц</small>
              <b>{money(c.flow)}</b>
            </div>
            <div>
              <small>Другие платежи</small>
              <b>{money(c.existing)}</b>
            </div>
            <div>
              <small>Стоимость по модели</small>
              <b>{money(c.interest)}</b>
            </div>
            <div>
              <small>DSCR / стресс</small>
              <b>
                {c.dscr ?? "Нет данных"} / {c.stressDscr ?? "Нет данных"}
              </b>
            </div>
          </div>
          <p className="fine-print">
            {c.source}. Не включает комиссии, страхование и индивидуальные
            условия. Ориентир, не ПСК договора.
          </p>
          <LineChart
            values={c.schedule.map((p) => p.balance)}
            labels={["Начало срока", "Середина", "Погашение"]}
          />
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
                {c.schedule.map((p) => (
                  <tr key={p.month}>
                    <td>{p.date}</td>
                    <td>{money(p.payment)}</td>
                    <td>{money(p.principal)}</td>
                    <td>{money(p.interest)}</td>
                    <td>{money(p.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
export function BenefitIcons() {
  return (
    <>
      <ShieldCheck />
      <Sparkles />
      <TrendingUp />
      <ArrowUpRight />
    </>
  );
}
export { ArrowRight, Check };
