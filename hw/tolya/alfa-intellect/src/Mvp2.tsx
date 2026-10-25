import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  MessageSquare,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { api, money, date, ApiError } from "./api";
import { Button, Brand } from "./ui";
import { NumericInput } from "./NumericInput";
import { OnboardingAmount } from "./OnboardingAmount";
import { ApplicationAgent } from "./ApplicationAgent";
import { useWorkspace, WorkspaceContext } from "./context";
import { Chat } from "./Chat";
import { Illustration } from "./Illustration";
import {
  industries,
  managerRequestedFields,
  ages,
  purposes,
  uses,
  repayments,
  initialQuestionnaire,
  recommend,
  productIssues,
  questionnaireErrors,
  type OnboardingAnswers,
  type MvpApplication,
  type Product,
  type Questionnaire,
  type MissingField,
} from "../shared/mvp2";
import "./mvp2.css";

const defaults: OnboardingAnswers = {
  industry: "",
  age: "",
  purpose: "",
  amountRange: "",
  term: 12,
  usage: "",
  repayment: "",
};
function Choice({
  label,
  value,
  options,
  onChange,
  invalid = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Выберите</option>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );
}
export function OnboardingFields({
  value,
  onChange,
  group,
}: {
  value: OnboardingAnswers;
  onChange: (v: OnboardingAnswers) => void;
  group?: number;
}) {
  const field = (
    key: keyof OnboardingAnswers,
    label: string,
    options: string[],
  ) => (
    <Choice
      key={key}
      label={label}
      value={String(value[key])}
      options={options}
      onChange={(v) => onChange({ ...value, [key]: v })}
    />
  );
  return (
    <div className="mvp-fields">
      {(group === undefined || group === 0) && (
        <>
          {field("industry", "В какой сфере работает бизнес?", industries)}
          {field("age", "Как давно работает бизнес?", ages)}
        </>
      )}
      {(group === undefined || group === 1) && (
        <>
          {field("purpose", "Для чего нужны деньги?", purposes)}
          <OnboardingAmount
            value={value.amountRange}
            onChange={(amountRange) => onChange({ ...value, amountRange })}
          />
          <label className="field mvp-span">
            <span>
              Срок финансирования:{" "}
              {value.term === 1 ? "до месяца" : `${value.term} мес.`}
            </span>
            <input
              aria-label="Срок финансирования"
              type="range"
              min={1}
              max={60}
              value={value.term}
              onChange={(e) =>
                onChange({ ...value, term: Number(e.target.value) })
              }
            />
            <small>
              От 1 до 60 месяцев. Точный доступный срок зависит от продукта.
            </small>
          </label>
        </>
      )}
      {(group === undefined || group === 2) && (
        <>
          {field("usage", "Как будете использовать деньги?", uses)}
          {field("repayment", "За счёт чего будете возвращать?", repayments)}
        </>
      )}
    </div>
  );
}
export function MvpOnboarding({
  initial,
  initialStep = 0,
  onProgress,
  busy = false,
  onDone,
  go,
}: {
  initial?: OnboardingAnswers;
  initialStep?: number;
  busy?: boolean;
  onProgress?: (v: OnboardingAnswers, step: number) => void;
  onDone: (v: OnboardingAnswers) => void | Promise<void>;
  go: (p: string) => void;
}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => {
      try {
        return initial || defaults;
      } catch {
        return defaults;
      }
    }),
    [step, setStep] = useState(initialStep);
  function move(next: number) {
    setStep(next);
    onProgress?.(answers, next);
  }
  function update(a: OnboardingAnswers) {
    setAnswers(a);
    onProgress?.(a, step);
  }
  const valid =
    step === 0
      ? !!answers.industry && !!answers.age
      : step === 1
        ? !!answers.purpose && !!answers.amountRange
        : !!answers.usage && !!answers.repayment;
  return (
    <div className="onboarding">
      <header className="public-header">
        <button className="unstyled" onClick={() => go("/")}>
          <Brand />
        </button>
      </header>
      <main className="onboard-grid">
        <section className="onboard-main">
          <small>Знакомство · {step + 1} из 3</small>
          <progress
            className="journey-onboarding-progress"
            max={3}
            value={step + 1}
            aria-label="Прогресс знакомства"
          />
          <h1>
            {
              [
                "Расскажите о бизнесе",
                "Ваша задача",
                "Как устроить финансирование?",
              ][step]
            }
          </h1>
          <p className="lead">
            Предварительно подберём инструмент. Это ещё не оценка
            платёжеспособности и не одобрение.
          </p>
          <OnboardingFields value={answers} onChange={update} group={step} />
          <div className="mvp-actions">
            <Button
              secondary
              disabled={busy}
              onClick={() => (step ? move(step - 1) : go("/"))}
            >
              Назад
            </Button>
            <Button
              disabled={!valid || busy}
              onClick={() => (step < 2 ? move(step + 1) : void onDone(answers))}
            >
              Продолжить <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
const labels = {
  APPROVED: "Ваш кредит одобрен",
  MANAGER_REVIEW_REQUIRED: "Предварительная оценка пройдена",
  ADDITIONAL_DATA_REQUIRED: "Необходимо дополнить заявку",
  DECLINED: "Заявка не одобрена",
};
const sectionTitles = [
  "Компания",
  "Финансы",
  "Обязательства",
  "Особенности",
  "Финансирование",
];
const yesNo = ["Да", "Нет", "Не уверен"];
const triValue = (v: string) =>
  v === "yes" ? "Да" : v === "no" ? "Нет" : "Не уверен";
const triCode = (v: string) =>
  v === "Да" ? "yes" : v === "Нет" ? "no" : "unknown";
function Summary({ a, products }: { a: MvpApplication; products: Product[] }) {
  const q = a.questionnaire,
    p = products.find((p) => p.id === q.productId);
  return (
    <dl className="mvp-summary">
      <div>
        <dt>Продукт</dt>
        <dd>{p?.name}</dd>
      </div>
      <div>
        <dt>{a.decision === "APPROVED" ? "Одобрено" : "Запрошено"}</dt>
        <dd>{money(q.amount)}</dd>
      </div>
      <div>
        <dt>Срок</dt>
        <dd>{q.term} мес.</dd>
      </div>
      <div>
        <dt>Ставка каталога</dt>
        <dd>{p?.rate}%</dd>
      </div>
    </dl>
  );
}
function QuestionnaireFields({
  q,
  setQ,
  section,
  missing,
  upload,
  statements,
  registry,
  company,
  busy,
  errors,
  catalog,
}: {
  q: Questionnaire;
  setQ: (q: Questionnaire) => void;
  section?: number;
  missing?: MissingField[];
  upload: (file: File, accountId: string) => void;
  statements: any[];
  registry: () => void;
  company?: MvpApplication["company"];
  busy: boolean;
  errors: Record<string, string>;
  catalog: Product[];
}) {
  const patch = (k: keyof Questionnaire, v: unknown) => setQ({ ...q, [k]: v });
  const show = (k: string, s: number) =>
    missing ? missing.some((m) => m.key === k) : section === s;
  const wrap = (
    key: keyof Questionnaire,
    label: string,
    node: React.ReactNode,
  ) => (
    <label className="field" key={key}>
      <span>{label}</span>
      {node}
      {errors[key] && (
        <small role="alert" className="mvp-error">
          {errors[key]}
        </small>
      )}
    </label>
  );
  const text = (k: keyof Questionnaire, label: string, s: number) =>
    show(k, s)
      ? wrap(
          k,
          label,
          <input
            aria-label={label}
            aria-invalid={!!errors[k]}
            value={String(q[k] ?? "")}
            maxLength={k === "receivingAccount" ? 20 : 500}
            onChange={(e) => patch(k, e.target.value)}
          />,
        )
      : null;
  const number = (
    k: keyof Questionnaire,
    label: string,
    s: number,
    unit = "₽",
    max = 1e12,
  ) =>
    show(k, s)
      ? wrap(
          k,
          label,
          <NumericInput
            aria-label={label}
            value={typeof q[k] === "number" ? (q[k] as number) : ""}
            onValueChange={(v) => patch(k, v === "" ? null : Number(v))}
            min={0}
            max={max}
            unit={unit}
            decimals={unit === "мес." || unit === "дн." ? 0 : 2}
            aria-invalid={!!errors[k]}
          />,
        )
      : null;
  const tri = (
    k: "loans" | "complete" | "seasonality",
    label: string,
    s: number,
  ) =>
    show(k, s) ? (
      <Choice
        key={k}
        label={label}
        invalid={!!errors[k]}
        value={triValue(q[k])}
        options={yesNo}
        onChange={(v) => patch(k, triCode(v))}
      />
    ) : null;
  const check = (
    k: "authorized" | "companyConfirmed" | "debtReconciled",
    label: string,
    s: number,
  ) =>
    show(k, s) ? (
      <label className="mvp-check" key={k}>
        <input
          type="checkbox"
          aria-invalid={!!errors[k]}
          checked={q[k]}
          onChange={(e) => patch(k, e.target.checked)}
        />
        <span>{label}</span>
      </label>
    ) : null;
  return (
    <div className="mvp-fields">
      {show("inn", 0) && (
        <div className="mvp-span">
          {text("inn", "ИНН компании", 0)}
          <Button
            secondary
            type="button"
            disabled={busy || !q.consents.registry}
            onClick={registry}
          >
            Найти компанию
          </Button>
          <small>
            Для учебной проверки можно использовать ИНН 9900000001. Источник —
            синтетический реестр.
          </small>
        </div>
      )}
      {company &&
        (section === 0 ||
          missing?.some((m) =>
            ["inn", "companyConfirmed", "actualIndustry"].includes(m.key),
          )) && (
          <div className="mvp-span mvp-company">
            <h3>{company.name}</h3>
            <p>
              ИНН {company.inn} · {company.form} · ОКВЭД {company.okved} ·{" "}
              {company.registeredAt} ·{" "}
              {company.status === "ACTIVE"
                ? "Действует"
                : "Статус требует проверки"}
            </p>
            <small>Источник: {company.source}</small>
          </div>
        )}
      {check("companyConfirmed", "Сведения компании верны", 0)}
      {text(
        "registryError",
        "Сообщить об ошибке в найденных сведениях (если есть)",
        0,
      )}
      {check(
        "authorized",
        "Я уполномочен оформлять заявку от имени компании",
        0,
      )}
      {show("consents", 0) && (
        <fieldset className="mvp-span">
          <legend>Согласия для учебного сценария</legend>
          {(
            [
              ["registry", "Проверка компании в синтетическом реестре"],
              ["financial", "Обработка и финансовый анализ загруженных CSV"],
              ["bki", "Проверка синтетической кредитной истории"],
            ] as const
          ).map(([key, label]) => (
            <label className="mvp-check" key={key}>
              <input
                type="checkbox"
                checked={q.consents[key]}
                onChange={(e) =>
                  setQ({
                    ...q,
                    consents: { ...q.consents, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
          <small>
            Это не юридически утверждённые банковские формы согласий.
          </small>
        </fieldset>
      )}
      {text(
        "actualIndustry",
        "Фактическая деятельность (если отличается от ОКВЭД)",
        0,
      )}
      {show("accounts", 1) && (
        <div className="mvp-span">
          <h3>Расчётные счета · {q.accounts.length}</h3>
          <p>
            По каждому счёту загрузите CSV. Желательно 12 полных месяцев,
            минимум 6 для базовой проверки; ядро может запросить более полную
            историю. Допустимы два счёта в одном банке.
          </p>
          {q.accounts.map((account, i) => (
            <section key={account.id} className="mvp-account">
              <h4>Счёт {i + 1}</h4>
              <div className="mvp-fields">
                <label className="field">
                  <span>Банк</span>
                  <input
                    value={account.bank}
                    maxLength={160}
                    onChange={(e) =>
                      patch(
                        "accounts",
                        q.accounts.map((x) =>
                          x.id === account.id
                            ? { ...x, bank: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Идентификатор счёта</span>
                  <input
                    value={account.number}
                    maxLength={40}
                    onChange={(e) =>
                      patch(
                        "accounts",
                        q.accounts.map((x) =>
                          x.id === account.id
                            ? { ...x, number: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>CSV-выписка счёта {i + 1}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy || !q.consents.financial}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(f, account.id);
                      e.target.value = "";
                    }}
                  />
                </label>
                {statements
                  .filter((s) => s.accountId === account.id)
                  .map((s) => (
                    <p key={s.id}>
                      {s.name}
                      <br />
                      <small>
                        {s.period} · {s.operations} операций · проверено
                      </small>
                    </p>
                  ))}
              </div>
              {q.accounts.length > 1 && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    patch(
                      "accounts",
                      q.accounts.filter((x) => x.id !== account.id),
                    )
                  }
                >
                  Убрать счёт
                </button>
              )}
            </section>
          ))}
          <Button
            secondary
            type="button"
            disabled={q.accounts.length >= 20}
            onClick={() =>
              patch("accounts", [
                ...q.accounts,
                {
                  id: crypto.randomUUID(),
                  bank: "",
                  number: "",
                  documentId: "",
                },
              ])
            }
          >
            <Plus size={16} /> Добавить счёт
          </Button>
        </div>
      )}
      {tri(
        "complete",
        "Все основные поступления и расходы есть в выписках?",
        1,
      )}
      {(q.complete === "no" ||
        missing?.some((m) => m.key.startsWith("outside"))) && (
        <>
          {text("outsideType", "Какие операции не отражены?", 1)}
          {number(
            "outsideIn",
            "Поступления вне CSV в месяц (неподтверждённые)",
            1,
          )}
          {number(
            "outsideOut",
            "Расходы вне CSV в месяц (неподтверждённые)",
            1,
          )}
        </>
      )}
      {tri("loans", "Есть действующие кредиты или линии?", 2)}
      {(q.loans === "yes" ||
        missing?.some((m) => ["debt", "monthlyDebt"].includes(m.key))) && (
        <>
          {number("debt", "Остаток долга", 2)}
          {number("monthlyDebt", "Регулярный платёж по кредитам в месяц", 2)}
          {number("balloon", "Крупное разовое погашение (если предстоит)", 2)}
          {q.balloon
            ? text("balloonPeriod", "Когда нужно крупное погашение?", 2)
            : null}
        </>
      )}
      {show("leasing", 2) && (
        <Choice
          label="Есть действующий лизинг?"
          value={q.leasing === "yes" ? "Да" : "Нет"}
          options={["Да", "Нет"]}
          onChange={(v) => patch("leasing", v === "Да" ? "yes" : "no")}
        />
      )}
      {(q.leasing === "yes" ||
        missing?.some((m) => m.key === "monthlyLeasing")) &&
        number("monthlyLeasing", "Платёж по лизингу в месяц", 2)}
      {missing?.some((m) => m.key === "debtReconciled") &&
        check(
          "debtReconciled",
          "Подтверждаю итоговую нагрузку: найденные в CSV платежи не нужно учитывать дважды",
          2,
        )}
      {tri("seasonality", "Есть выраженная сезонность?", 3)}
      {show("future", 3) && (
        <Choice
          label="Ожидаются крупные нестандартные операции?"
          value={
            {
              none: "Нет",
              income: "Поступления",
              expense: "Расходы",
              both: "Оба",
              unknown: "Не знаю",
            }[q.future]
          }
          options={["Нет", "Поступления", "Расходы", "Оба", "Не знаю"]}
          onChange={(v) =>
            patch(
              "future",
              (
                {
                  Нет: "none",
                  Поступления: "income",
                  Расходы: "expense",
                  Оба: "both",
                  "Не знаю": "unknown",
                } as Record<string, string>
              )[v],
            )
          }
        />
      )}
      {(["income", "both"].includes(q.future) ||
        missing?.some((m) => m.key === "futureIn")) &&
        number("futureIn", "Будущие поступления", 3)}
      {(["expense", "both"].includes(q.future) ||
        missing?.some((m) => m.key === "futureOut")) &&
        number("futureOut", "Будущие расходы", 3)}
      {q.future !== "none" &&
        text("futurePeriod", "Период будущих операций", 3)}
      {section === 3 && (
        <small className="mvp-span">
          Будущие операции сохраняются как дополнительные сведения. Они не
          увеличивают подтверждённую платёжеспособность без расчёта ядра.
        </small>
      )}
      {text("purpose", "Конкретное назначение средств", 4)}
      {missing && (
        <>
          {number(
            "customerContractAmount",
            "Сумма договора с основным заказчиком",
            4,
          )}
          {number(
            "customerContractMonths",
            "Срок договора с заказчиком",
            4,
            "мес.",
            120,
          )}
          {text(
            "reconciliationReference",
            "Номер и дата акта сверки с заказчиком",
            4,
          )}
          <small className="mvp-span">
            Эти сведения сохраняются как подтверждённые вами, не как банковская
            проверка документа. Они не увеличивают одобренный лимит за счёт
            будущих поступлений.
          </small>
        </>
      )}
      {number("amount", "Точная сумма", 4)}
      {number("term", "Точный срок", 4, "мес.", 120)}
      {text("neededAt", "Когда нужны средства?", 4)}
      {show("productId", 4) && (
        <label className="field">
          <span>Выбранный продукт</span>
          <select
            aria-label="Выбранный продукт"
            value={q.productId}
            onChange={(e) => patch("productId", e.target.value)}
          >
            {catalog.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {show("usage", 4) && (
        <Choice
          label="Способ использования"
          value={q.usage}
          options={uses}
          onChange={(v) => patch("usage", v)}
        />
      )}
      {show("repayment", 4) && (
        <Choice
          label="Источник погашения"
          value={q.repayment}
          options={repayments}
          onChange={(v) => patch("repayment", v)}
        />
      )}
      {q.productId === "INVEST" && (
        <>
          {number("projectCost", "Стоимость проекта", 4)}
          {number("economicEffect", "Ожидаемый доход или экономия в месяц", 4)}
        </>
      )}
      {["RCL", "OVERDRAFT"].includes(q.productId) &&
        number(
          "cycleDays",
          "Длительность использования / цикла",
          4,
          "дн.",
          q.productId === "OVERDRAFT" ? 60 : 365,
        )}
      {q.productId === "NCL" &&
        text("tranches", "План траншей: суммы и сроки", 4)}
      {q.productId === "REFI" && (
        <>
          {number("oldBalance", "Остаток старого кредита", 4)}
          {number("oldRate", "Ставка старого кредита", 4, "%", 100)}
          {number("oldPayment", "Платёж старого кредита", 4)}
        </>
      )}
    </div>
  );
}
export function Mvp2({
  applicationOnly = false,
}: {
  applicationOnly?: boolean;
}) {
  const w = useWorkspace(),
    [items, setItems] = useState<MvpApplication[]>([]),
    [a, setA] = useState<MvpApplication | null>(null),
    [q, setQ] = useState<Questionnaire | null>(null),
    [answers, setAnswers] = useState<OnboardingAnswers>(
      w.state.profile.mvp2Answers || defaults,
    ),
    [products, setProducts] = useState<Product[]>([]),
    [view, setView] = useState("loading"),
    [section, setSection] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [statements, setStatements] = useState<any[]>([]),
    [slots, setSlots] = useState<any[]>([]),
    [tab, setTab] = useState<"contract" | "schedule">("contract"),
    [read, setRead] = useState(false),
    [chatId, setChatId] = useState(""),
    [chatSending, setChatSending] = useState(false),
    [editAnswers, setEditAnswers] = useState(false);
  const lock = useRef(false),
    aRef = useRef(a),
    dirty = useRef(false);
  aRef.current = a;
  const adopt = (next: MvpApplication) => {
    aRef.current = next;
    setA(next);
    setQ(structuredClone(next.questionnaire));
    setAnswers(next.onboarding);
    dirty.current = false;
    return next;
  };
  const derivedView = (next: MvpApplication) =>
    next.error
      ? "decision"
      : next.lifecycle === "ACTIVE"
        ? "decision"
        : next.lifecycle === "SIGNED_DEMO"
          ? "receive"
          : next.contract
            ? "contract"
            : ["PROCESSING", "SUBMITTED"].includes(next.lifecycle)
              ? "processing"
              : next.decision
                ? "decision"
                : "recommendation";
  const loadStatements = async (id: string) =>
    setStatements(await api(`/mvp2/applications/${id}/statements`));
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setErrors({});
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function open(next: MvpApplication) {
    adopt(next);
    setView(derivedView(next));
    if (next.lifecycle === "ACTIVE") {
      w.go("/cabinet");
      return;
    }
    const position = await api("/journey");
    if (position.applicationId === next.id) {
      setSection(position.section ?? 0);
      if (
        next.lifecycle === "DRAFT" &&
        [
          "recommendation",
          "catalog",
          "intro",
          "questionnaire",
          "dossier",
        ].includes(position.view)
      )
        setView(position.view);
      else if (
        next.decision === "ADDITIONAL_DATA_REQUIRED" &&
        position.view === "supplement"
      )
        setView("supplement");
      else if (next.decision && position.view === "chat") setView("chat");
    }
    const serverBuffer = await api(`/journey/draft/${next.id}`);
    if (
      serverBuffer &&
      (next.lifecycle === "DRAFT" ||
        next.decision === "ADDITIONAL_DATA_REQUIRED")
    ) {
      setQ(serverBuffer.questionnaire);
      setSection(serverBuffer.section);
      dirty.current = true;
      setView(next.decision ? "supplement" : "questionnaire");
    }
    try {
      const buffer = JSON.parse(
        sessionStorage.getItem(`mvp2:${next.businessId}:${next.id}`) || "null",
      );
      if (
        !serverBuffer &&
        buffer?.version === next.version &&
        (next.lifecycle === "DRAFT" ||
          next.decision === "ADDITIONAL_DATA_REQUIRED")
      ) {
        setQ(buffer.questionnaire);
        if (buffer.onboarding && next.lifecycle === "DRAFT")
          setAnswers(buffer.onboarding);
        setSection(buffer.section ?? 0);
        setView(next.decision ? "supplement" : "questionnaire");
        dirty.current = true;
        await api(
          "/journey/draft",
          {
            applicationId: next.id,
            version: next.version,
            questionnaire: buffer.questionnaire,
            section: buffer.section ?? 0,
          },
          "PUT",
        );
        sessionStorage.removeItem(`mvp2:${next.businessId}:${next.id}`);
      }
    } catch {}
    await loadStatements(next.id);
  }
  function draftQ(value: Questionnaire) {
    dirty.current = true;
    setQ(value);
  }
  useEffect(() => {
    if (!a || !q || !dirty.current || busy) return;
    const timer = setTimeout(() => {
      void api(
        "/journey/draft",
        { applicationId: a.id, version: a.version, questionnaire: q, section },
        "PUT",
      ).catch((e) => setError("Не удалось сохранить черновик: " + e.message));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, section, busy, a?.version]);
  useEffect(() => {
    if (!a || busy || ["loading", "start"].includes(view)) return;
    const timer = setTimeout(() => {
      void api(
        "/journey/position",
        { applicationId: a.id, view, section },
        "PUT",
      ).catch((e) => setError(e.message));
    }, 150);
    return () => clearTimeout(timer);
  }, [a?.id, view, section, busy]);
  useEffect(() => {
    void run(async () => {
      const [catalog, list] = await Promise.all([
        api("/mvp2/catalog"),
        api<MvpApplication[]>("/mvp2/applications"),
      ]);
      setProducts(catalog.products);
      setItems(list);
      if (list.length)
        await open(await api(`/mvp2/applications/${list[0].id}`));
      else if (w.state.profile.mvp2Answers) {
        const next = await api<MvpApplication>("/mvp2/applications", {
          onboarding: w.state.profile.mvp2Answers,
        });
        await open(next);
        setItems([next]);
        await w.refresh();
      } else setView("start");
    });
  }, []);
  useEffect(() => {
    if (
      !a ||
      (view !== "processing" &&
        !(view === "decision" && a.lifecycle === "MEETING_SCHEDULED"))
    )
      return;
    const id = a.id;
    const timer = setInterval(
      () => {
        void api<MvpApplication>(`/mvp2/applications/${id}`)
          .then((next) => {
            adopt(next);
            if (!["SUBMITTED", "PROCESSING"].includes(next.lifecycle))
              setView(derivedView(next));
          })
          .catch((e) => setError(e.message));
      },
      view === "processing" ? 700 : 5000,
    );
    return () => clearInterval(timer);
  }, [view, a?.id, a?.lifecycle]);
  async function save() {
    if (!a || !q) throw new Error("Заявка ещё не создана");
    const next = await api<MvpApplication>(
      `/mvp2/applications/${a.id}`,
      {
        version: a.version,
        questionnaire: q,
        ...(a.lifecycle === "DRAFT" ? { onboarding: answers } : {}),
      },
      "PUT",
    );
    try {
      sessionStorage.removeItem(`mvp2:${a.businessId}:${a.id}`);
    } catch {}
    return adopt(next);
  }
  async function create() {
    await run(async () => {
      const next = await api<MvpApplication>("/mvp2/applications", {
        onboarding: answers,
      });
      adopt(next);
      setView("recommendation");
      setItems([next, ...items]);
      await w.refresh();
    });
  }
  const submit = () =>
    run(async () => {
      const current = view === "supplement" ? await save() : a!;
      const next = await api<MvpApplication>(
        `/mvp2/applications/${current.id}/submit`,
        { version: current.version },
      );
      adopt(next);
      setView("processing");
    });
  const upload = (file: File, accountId: string) =>
    void run(async () => {
      const saved = await save(),
        body = new FormData();
      body.append("version", String(saved.version));
      body.append("accountId", accountId);
      body.append("file", file);
      adopt(await api(`/mvp2/applications/${saved.id}/statements`, body));
      await loadStatements(saved.id);
    });
  const registry = () =>
    void run(async () => {
      const saved = await save();
      adopt(
        await api(`/mvp2/applications/${saved.id}/registry`, {
          version: saved.version,
        }),
      );
    });
  const openDiscussion = async () => {
    if (!a) return;
    setView("chat");
  };
  const discuss = () => run(openDiscussion);
  if (view === "chat" && a)
    return (
      <div className="mvp-full-chat">
        <Button secondary onClick={() => setView(derivedView(a))}>
          Вернуться к решению
        </Button>
        {a.financial && !a.signature && (
          <Button secondary onClick={() => setView("scenario")}>
            Проверить другие условия
          </Button>
        )}
        <p>
          {a.decision ? labels[a.decision] : sectionTitles[section]} ·{" "}
          {money(a.questionnaire.amount)} · Контекст заявки сохранён
        </p>
        <ApplicationAgent application={a} section={section} full />
      </div>
    );
  const p = q && products.find((p) => p.id === q.productId),
    path = a ? `/mvp2/applications/${a.id}` : "";
  return (
    <main className="financing-page page-wrap funding-mvp mvp2">
      <header className="journey-stage">
        <small>ОФОРМЛЕНИЕ КРЕДИТА</small>
        <h1>
          {{
            recommendation: "Предварительный подбор",
            catalog: "Каталог продуктов",
            intro: "Перед заполнением анкеты",
            questionnaire: sectionTitles[section],
            dossier: "Кредитное досье",
            processing: "Рассмотрение заявки",
            decision: "Кредитное решение",
            supplement: "Дополнение сведений",
            meeting: "Встреча с менеджером",
            details: "Данные для договора",
            contract: "Кредитный договор",
            receive: "Получение финансирования",
            scenario: "Новые условия",
          }[view] || "Оформление финансирования"}
        </h1>
        <p>Ответы и текущий этап сохраняются автоматически в этой сессии.</p>
      </header>
      {error && (
        <div className="mvp-error" role="alert">
          {error}
          <Button
            secondary
            onClick={() =>
              void run(async () => {
                if (a) await open(await api(path));
                else location.reload();
              })
            }
          >
            Обновить данные
          </Button>
        </div>
      )}
      {view === "loading" && (
        <section className="funding-surface" role="status">
          Загружаем сохранённую заявку…
        </section>
      )}
      {view === "start" && (
        <section className="funding-surface">
          <h2>Сначала задача — затем условия</h2>
          <p>
            Уточним семь ответов и подберём один из шести инструментов.
            Финансовую доступность проверим отдельно.
          </p>
          <OnboardingFields value={answers} onChange={setAnswers} />
          <div className="mvp-actions">
            <span>Условия каталога синтетические, не банковские тарифы.</span>
            <Button
              disabled={busy || Object.values(answers).some((v) => !v)}
              onClick={() => void create()}
            >
              Подобрать продукт <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      )}
      {a && q && view === "recommendation" && (
        <section className="funding-surface">
          <small>ПРЕДВАРИТЕЛЬНЫЙ ПОДБОР · НЕ ОДОБРЕНИЕ</small>
          <h2>{p?.name}</h2>
          <p>{p?.description}</p>
          <Summary a={a} products={products} />
          <p>
            {p?.repayment}. Диапазон: {money(p?.min)}–{money(p?.max)},{" "}
            {p?.minTerm}–{p?.maxTerm} мес. Требуются ИП/ООО, подтверждённый
            поток и прохождение проверок.
          </p>
          <ul>
            <li>
              Цель: {answers.purpose}.{" "}
              {recommend(answers) === q.productId
                ? "Выбран подходящий по назначению инструмент."
                : "Вы выбрали другой инструмент — проверьте соответствие цели."}
            </li>
            <li>
              {productIssues(q).join(" ") ||
                "Сумма и срок находятся в диапазоне продукта."}
            </li>
            <li>
              Использование: {answers.usage}; источник возврата:{" "}
              {answers.repayment}.{" "}
              {answers.usage === "Не знаю"
                ? "Механику нужно уточнить."
                : "Условия обслуживания показаны выше."}
            </li>
          </ul>
          <div className="mvp-actions">
            <div>
              <Button secondary onClick={() => setEditAnswers(!editAnswers)}>
                Изменить условия
              </Button>{" "}
              <Button secondary onClick={() => setView("catalog")}>
                Посмотреть все продукты
              </Button>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await save();
                  setView("intro");
                })
              }
            >
              Проверить доступность и продолжить <ArrowRight size={16} />
            </Button>
          </div>
          {editAnswers && (
            <div className="mvp-edit">
              <OnboardingFields value={answers} onChange={setAnswers} />
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const next = initialQuestionnaire(answers);
                    adopt(
                      await api(
                        path,
                        {
                          version: a.version,
                          onboarding: answers,
                          questionnaire: {
                            ...q,
                            purpose: answers.purpose,
                            amount: next.amount,
                            term: answers.term,
                            usage: answers.usage,
                            repayment: answers.repayment,
                            productId: recommend(answers),
                          },
                        },
                        "PUT",
                      ),
                    );
                    setEditAnswers(false);
                  })
                }
              >
                Применить изменения
              </Button>
            </div>
          )}
        </section>
      )}
      {a && q && view === "catalog" && (
        <section className="funding-surface">
          <h2>Все продукты</h2>
          <p>
            Фиксированные синтетические условия MVP. Выбор продукта не означает
            одобрение.
          </p>
          <div className="mvp-products">
            {products.map((product) => (
              <article className="mvp-account" key={product.id}>
                <h3>{product.name}</h3>
                <strong>{product.rate}% годовых</strong>
                <p>{product.description}</p>
                <p>
                  {money(product.min)}–{money(product.max)} · {product.minTerm}–
                  {product.maxTerm} мес.
                </p>
                <small>{product.repayment}</small>
                <Button
                  secondary
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      adopt(
                        await api(
                          path,
                          {
                            version: a.version,
                            questionnaire: { ...q, productId: product.id },
                          },
                          "PUT",
                        ),
                      );
                      setView("recommendation");
                    })
                  }
                >
                  Выбрать
                </Button>
              </article>
            ))}
          </div>
          <Button secondary onClick={() => setView("recommendation")}>
            Вернуться
          </Button>
        </section>
      )}
      {a &&
        q &&
        ["intro", "questionnaire", "dossier", "supplement"].includes(view) && (
          <div className="mvp-layout">
            <section className="funding-surface">
              {view === "intro" ? (
                <>
                  <h2>Проверим доступность финансирования</h2>
                  <p>
                    Подтвердите компанию по ИНН, добавьте CSV по расчётным
                    счетам и уточните обязательства. Ответы знакомства уже
                    сохранены.
                  </p>
                  <p>
                    Автоматический анализ поддерживает CSV банковских выписок.
                    ИИ объясняет поля и расчёты, но решение формирует сервер
                    после проверок.
                  </p>
                  <Button
                    onClick={() => {
                      setSection(0);
                      setView("questionnaire");
                    }}
                  >
                    Начать заполнение
                  </Button>
                </>
              ) : view === "dossier" ? (
                <>
                  <h2>Проверьте вашу заявку</h2>
                  <Summary a={a} products={products} />
                  <h3>Компания</h3>
                  <p>
                    {a.company?.name || "Компания не найдена"} · ИНН {q.inn} ·{" "}
                    {a.company?.form} · {answers.industry} / ОКВЭД{" "}
                    {a.company?.okved}
                  </p>
                  <h3>Ключевые ответы</h3>
                  <p>
                    {q.purpose}; {q.usage}; возврат: {q.repayment}. Счетов:{" "}
                    {q.accounts.length}. Кредиты: {triValue(q.loans)}; лизинг:{" "}
                    {q.leasing === "yes" ? "Да" : "Нет"}.
                  </p>
                  <h3>Документы</h3>
                  {q.accounts.map((account) => (
                    <p key={account.id}>
                      {account.bank || "Банк не указан"} ·{" "}
                      {statements.find((s) => s.id === account.documentId)
                        ?.period || "CSV не загружен"}
                    </p>
                  ))}
                  <details>
                    <summary>Посмотреть все сведения</summary>
                    <p>
                      Долг: {money(q.debt)}; платёж по кредитам:{" "}
                      {money(q.monthlyDebt)}; лизинг: {money(q.monthlyLeasing)}.
                      Сезонность: {triValue(q.seasonality)}.
                    </p>
                    <p>
                      Когда нужны средства: {q.neededAt}. Неподтверждённые
                      операции: {q.outsideType || "не указаны"}. Будущие
                      операции: {q.futurePeriod || "не указаны"}.
                    </p>
                    <p>
                      Отрасль: {answers.industry}. Возраст: {answers.age}.
                      Использование: {q.usage}; источник погашения:{" "}
                      {q.repayment}.
                    </p>
                    <dl className="mvp-summary">
                      {[
                        [
                          "Фактическая деятельность",
                          q.actualIndustry || "Не уточнялась",
                        ],
                        ["Полнота выписок", triValue(q.complete)],
                        ["Поступления вне выписок", money(q.outsideIn)],
                        ["Расходы вне выписок", money(q.outsideOut)],
                        ["Крупное погашение долга", money(q.balloon)],
                        ["Когда погашение", q.balloonPeriod || "Не указано"],
                        ["Будущие поступления", money(q.futureIn)],
                        ["Будущие расходы", money(q.futureOut)],
                        ["Стоимость проекта", money(q.projectCost)],
                        ["Эффект в месяц", money(q.economicEffect)],
                        [
                          "Цикл использования",
                          q.cycleDays === null
                            ? "Не указан"
                            : `${q.cycleDays} дн.`,
                        ],
                        ["План траншей", q.tranches || "Не указан"],
                        [
                          "Остаток рефинансируемого кредита",
                          money(q.oldBalance),
                        ],
                        [
                          "Текущая ставка",
                          q.oldRate === null ? "Не указана" : `${q.oldRate}%`,
                        ],
                        ["Текущий платёж", money(q.oldPayment)],
                        [
                          "Договор с заказчиком",
                          money(q.customerContractAmount),
                        ],
                        [
                          "Срок договора с заказчиком",
                          q.customerContractMonths === null
                            ? "Не указан"
                            : `${q.customerContractMonths} мес.`,
                        ],
                        [
                          "Акт сверки",
                          q.reconciliationReference || "Не запрашивался",
                        ],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      Полномочия представителя:{" "}
                      {q.authorized ? "подтверждены" : "не подтверждены"}.
                      Согласия на реестр, финансовый анализ и кредитную историю:{" "}
                      {Object.values(q.consents).every(Boolean)
                        ? "получены"
                        : "не все получены"}
                      .
                    </p>
                  </details>
                  <div className="mvp-actions">
                    {a.lifecycle !== "DRAFT" ? (
                      <Button secondary onClick={() => setView("decision")}>
                        Вернуться к решению
                      </Button>
                    ) : (
                      <>
                        <Button
                          secondary
                          onClick={() => setView("questionnaire")}
                        >
                          Изменить сведения
                        </Button>
                        <Button disabled={busy} onClick={() => void submit()}>
                          Подать заявку на рассмотрение
                        </Button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="mvp-stepnav">
                    {view === "supplement" ? (
                      <h2>Только недостающие сведения</h2>
                    ) : (
                      sectionTitles.map((title, i) => (
                        <button
                          type="button"
                          aria-current={i === section ? "step" : undefined}
                          className={i === section ? "active" : ""}
                          disabled={busy}
                          key={title}
                          onClick={() =>
                            void run(async () => {
                              await save();
                              setSection(i);
                            })
                          }
                        >
                          {i + 1}. {title}
                        </button>
                      ))
                    )}
                  </div>
                  {view === "supplement" &&
                    a.missing.map((m) => <p key={m.key}>{m.label}</p>)}
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (view !== "supplement") {
                        const problems = questionnaireErrors(q, section);
                        if (Object.keys(problems).length) {
                          setErrors(problems);
                          setError("Проверьте выделенные поля.");
                          return;
                        }
                      }
                      void run(async () => {
                        await save();
                        if (view === "supplement") {
                          const current = aRef.current!;
                          adopt(
                            await api(path + "/submit", {
                              version: current.version,
                            }),
                          );
                          setView("processing");
                        } else if (section < 4) setSection(section + 1);
                        else setView("dossier");
                      });
                    }}
                  >
                    <h2>
                      {view === "supplement"
                        ? "Дополните заявку"
                        : sectionTitles[section]}
                    </h2>
                    {Object.values(errors).map((message, i) => (
                      <p key={i} className="mvp-error" role="alert">
                        {message}
                      </p>
                    ))}
                    {section === 0 && view !== "supplement" && (
                      <details>
                        <summary>Сфера и возраст бизнеса из онбординга</summary>
                        <OnboardingFields
                          value={answers}
                          onChange={setAnswers}
                          group={0}
                        />
                      </details>
                    )}
                    <QuestionnaireFields
                      catalog={products}
                      q={q}
                      setQ={draftQ}
                      section={section}
                      missing={view === "supplement" ? a.missing : undefined}
                      upload={upload}
                      registry={registry}
                      statements={statements}
                      company={a.company}
                      busy={busy}
                      errors={errors}
                    />
                    {section === 4 &&
                      productIssues(q).map((issue) => (
                        <p className="mvp-error" key={issue}>
                          {issue}
                        </p>
                      ))}
                    <div className="mvp-actions">
                      <Button
                        type="button"
                        secondary
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await save();
                            if (section > 0) setSection(section - 1);
                            else setView("intro");
                          })
                        }
                      >
                        Назад
                      </Button>
                      <Button disabled={busy} type="submit">
                        {view === "supplement"
                          ? "Отправить на повторную проверку"
                          : section === 4
                            ? "Проверить заявку"
                            : "Сохранить и продолжить"}{" "}
                        <ArrowRight size={16} />
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </section>
            <aside className="mvp-context">
              <ApplicationAgent application={a} section={section} />
            </aside>
          </div>
        )}
      {a && view === "processing" && (
        <section className="funding-surface mvp-processing" aria-live="polite">
          <div
            className="preparation-sphere journey-sphere"
            role="progressbar"
            aria-label="Рассмотрение заявки"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              (a.stages.filter((s) => s.status === "done").length /
                Math.max(a.stages.length, 1)) *
                100,
            )}
            style={
              {
                "--progress": `${(a.stages.filter((s) => s.status === "done").length / Math.max(a.stages.length, 1)) * 100}%`,
              } as React.CSSProperties
            }
          >
            <div className="sphere-liquid">
              <i />
              <i />
            </div>
            <div className="sphere-number">
              <strong>
                {Math.round(
                  (a.stages.filter((s) => s.status === "done").length /
                    Math.max(a.stages.length, 1)) *
                    100,
                )}
                <small>%</small>
              </strong>
            </div>
          </div>
          <h2>Рассматриваем заявку</h2>
          <p>
            Этапы выполняются на сервере. Можно обновить страницу — результат
            сохранится.
          </p>
          <progress
            max={a.stages.length || 1}
            value={a.stages.filter((s) => s.status === "done").length}
          />
          <ol>
            {a.stages.map((s) => (
              <li key={s.id} className={s.status}>
                {s.status === "done" ? (
                  <Check size={16} />
                ) : s.status === "running" ? (
                  <span className="mvp-spinner" />
                ) : null}
                {s.label} ·{" "}
                {
                  {
                    pending: "ожидает",
                    running: "выполняется",
                    done: "готово",
                    error: "ошибка",
                  }[s.status]
                }
              </li>
            ))}
          </ol>
        </section>
      )}
      {a && q && view === "decision" && (
        <section className="funding-surface">
          <small>РЕЗУЛЬТАТ РАССМОТРЕНИЯ</small>
          <h2>
            {a.lifecycle === "ACTIVE"
              ? "Финансирование оформлено"
              : a.decision
                ? labels[a.decision]
                : "Рассмотрение не завершено"}
          </h2>
          <Summary a={a} products={products} />
          {a.reasons.map((r) => (
            <p key={r}>{r}</p>
          ))}
          {a.error && <p className="mvp-error">{a.error}</p>}
          {a.financial && (
            <p>
              Расчётный платёж: {money(a.financial.payment)} в месяц.{" "}
              {p?.kind !== "loan"
                ? "Для лимита это оценка нагрузки, не фиксированный график выборки."
                : "Точный график будет в договоре."}
            </p>
          )}
          {a.meeting && (
            <p role="status">
              Встреча:{" "}
              {new Date(a.meeting.at).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}{" "}
              МСК · {a.meeting.manager}.{" "}
              {a.lifecycle === "MEETING_SCHEDULED"
                ? "Ожидаем окончательного решения менеджера."
                : ""}
            </p>
          )}
          <div className="mvp-actions">
            <Button secondary disabled={busy} onClick={() => void discuss()}>
              Обсудить с агентом
            </Button>
            <div>
              {a.lifecycle === "ACTIVE" ? (
                <Button onClick={() => w.go("/cabinet")}>
                  В кредитный кабинет
                </Button>
              ) : a.decision === "APPROVED" ? (
                <Button
                  onClick={() => setView(a.contract ? "contract" : "details")}
                >
                  Перейти к подписанию
                </Button>
              ) : a.decision === "ADDITIONAL_DATA_REQUIRED" ? (
                <Button onClick={() => setView("supplement")}>
                  Дополнить сведения
                </Button>
              ) : a.decision === "MANAGER_REVIEW_REQUIRED" ? (
                <Button
                  disabled={busy || a.lifecycle === "MEETING_SCHEDULED"}
                  onClick={() =>
                    void run(async () => {
                      setSlots(await api("/mvp2/slots"));
                      setView("meeting");
                    })
                  }
                >
                  {a.meeting
                    ? "Вы записаны на встречу"
                    : "Записаться на встречу"}
                </Button>
              ) : a.error ? (
                <Button disabled={busy} onClick={() => void submit()}>
                  Повторить рассмотрение
                </Button>
              ) : (
                <Button secondary onClick={() => setView("dossier")}>
                  Проверить данные
                </Button>
              )}
            </div>
          </div>
          {a.alternatives.length > 0 && (
            <div>
              <h3>Проверенные альтернативы</h3>
              {a.alternatives.map((o) => (
                <article className="mvp-account" key={o.id}>
                  <h3>{products.find((p) => p.id === o.productId)?.name}</h3>
                  <p>
                    {money(o.amount)} · {o.term} мес. · {o.rate}% ·{" "}
                    {money(o.payment)} в месяц
                  </p>
                  <p>{o.reason}. Это не окончательное одобрение.</p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        adopt(
                          await api(path + "/alternative", {
                            version: a.version,
                            optionId: o.id,
                          }),
                        );
                        setView("processing");
                      })
                    }
                  >
                    Рассмотреть альтернативу
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {a && q && view === "meeting" && (
        <section className="funding-surface">
          <h2>Запись на встречу</h2>
          <p>
            Учебный календарь с синтетическими слотами. Запись сохраняется в
            заявке.
          </p>
          <div className="mvp-products">
            {slots.map((s) => (
              <Button
                secondary
                key={s.id}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    adopt(
                      await api(path + "/meeting", {
                        version: a.version,
                        slotId: s.id,
                      }),
                    );
                    setView("decision");
                  })
                }
              >
                {new Date(s.at).toLocaleString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })}{" "}
                МСК
              </Button>
            ))}
          </div>
          <Button secondary onClick={() => setView("decision")}>
            Вернуться к решению
          </Button>
        </section>
      )}
      {a && q && view === "scenario" && (
        <section className="funding-surface">
          <h2>Проверить другие условия</h2>
          <p>
            Новый запрос пройдёт финансовый расчёт и проверки на сервере. Старое
            решение не переносится автоматически.
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                adopt(
                  await api(path + "/recalculate", {
                    version: a.version,
                    terms: {
                      amount: q.amount,
                      term: q.term,
                      productId: q.productId,
                    },
                  }),
                );
                setView("processing");
              });
            }}
          >
            <div className="mvp-fields">
              <label className="field">
                <span>Сумма нового запроса</span>
                <NumericInput
                  value={q.amount}
                  onValueChange={(v) => draftQ({ ...q, amount: Number(v) })}
                  min={1}
                  max={1e12}
                />
              </label>
              <label className="field">
                <span>Срок нового запроса</span>
                <NumericInput
                  unit="мес."
                  decimals={0}
                  value={q.term}
                  onValueChange={(v) => draftQ({ ...q, term: Number(v) })}
                  min={1}
                  max={120}
                />
              </label>
              <label className="field">
                <span>Продукт нового запроса</span>
                <select
                  value={q.productId}
                  onChange={(e) =>
                    draftQ({
                      ...q,
                      productId: e.target.value as Questionnaire["productId"],
                    })
                  }
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mvp-actions">
              <Button
                secondary
                type="button"
                onClick={() => {
                  adopt(a);
                  setView("decision");
                }}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={busy}>
                Пересчитать на сервере
              </Button>
            </div>
          </form>
        </section>
      )}
      {a && q && view === "details" && (
        <section className="funding-surface">
          <h2>Реквизиты для договора</h2>
          <p>Подтвердите подписанта и счёт. Не создаём реквизиты вместо вас.</p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                adopt(
                  await api(path + "/contract-details", {
                    version: a.version,
                    details: {
                      signatory: q.signatory,
                      authority: q.authority,
                      receivingAccount: q.receivingAccount,
                      receivingBank: q.receivingBank,
                    },
                  }),
                );
                setView("contract");
              });
            }}
          >
            <div className="mvp-fields">
              {(
                [
                  ["signatory", "Подписант"],
                  ["authority", "Основание полномочий"],
                  ["receivingAccount", "Счёт получателя (20 цифр)"],
                  ["receivingBank", "Банк получателя"],
                ] as const
              ).map(([k, label]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input
                    value={q[k]}
                    maxLength={k === "receivingAccount" ? 20 : 160}
                    aria-invalid={!!errors[k]}
                    onChange={(e) => setQ({ ...q, [k]: e.target.value })}
                  />
                  {errors[k] && (
                    <small className="mvp-error">{errors[k]}</small>
                  )}
                </label>
              ))}
            </div>
            <div className="mvp-actions">
              <Button
                type="button"
                secondary
                onClick={() => setView("decision")}
              >
                Назад
              </Button>
              <Button type="submit" disabled={busy}>
                Сформировать договор
              </Button>
            </div>
          </form>
        </section>
      )}
      {a && q && view === "contract" && (
        <section className="funding-surface">
          <h2>Подписание кредитного договора</h2>
          <Summary a={a} products={products} />
          <div className="mvp-document-tools">
            <Button secondary onClick={() => setTab("contract")}>
              Договор
            </Button>
            <Button secondary onClick={() => setTab("schedule")}>
              График платежей
            </Button>
            <a href={`/api${path}/documents/contract?download=1`}>
              Скачать договор PDF
            </a>
            <a href={`/api${path}/documents/schedule?download=1`}>
              Скачать график PDF
            </a>
          </div>
          <iframe
            className="mvp-document"
            title={tab === "contract" ? "Кредитный договор" : "График платежей"}
            src={`/api${path}/documents/${tab}${a.signature ? "?signed=1" : ""}`}
          />
          <p>
            Подписание — неюридическая имитация электронной подписи в учебном
            MVP.
          </p>
          <label className="mvp-check">
            <input
              type="checkbox"
              checked={read}
              onChange={(e) => setRead(e.target.checked)}
            />
            Ознакомился с договором и условиями обслуживания
          </label>
          <div className="mvp-actions">
            <Button secondary onClick={() => setView("decision")}>
              Вернуться к решению
            </Button>
            <Button
              disabled={busy || !read}
              onClick={() =>
                void run(async () => {
                  adopt(
                    await api(path + "/sign", {
                      hash: a.contract!.hash,
                      confirmed: read,
                    }),
                  );
                  setView("receive");
                })
              }
            >
              {busy ? "Подписываем…" : "Подписать электронной подписью"}
            </Button>
          </div>
        </section>
      )}
      {a && q && view === "receive" && (
        <section className="funding-surface">
          <Check size={48} />
          <h2>Кредитный договор подписан</h2>
          <p>
            Демонстрационная подпись сохранена на сервере. Юридических
            обязательств и реального перевода денег не возникает.
          </p>
          <Summary a={a} products={products} />
          <p>
            Получатель: {a.company?.name}.{" "}
            {p?.kind === "loan"
              ? "Будет смоделирована выдача суммы."
              : "Будет открыт лимит; задолженность до выборки равна нулю."}
          </p>
          <div className="mvp-actions">
            <Button secondary onClick={() => setView("contract")}>
              Открыть подписанный договор
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  adopt(await api(path + "/activate", {}));
                  await w.refresh();
                  w.go("/cabinet");
                })
              }
            >
              Получить деньги <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
export function MvpManager() {
  const [items, setItems] = useState<MvpApplication[]>([]),
    [error, setError] = useState("");
  const load = () =>
    api<MvpApplication[]>("/mvp2/manager")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="funding-surface mvp-manager">
      <h2>Встречи по заявкам MVP 2</h2>
      {error && <p role="alert">{error}</p>}
      {!items.length && <p>Нет заявок, ожидающих решения после встречи.</p>}
      {items.map((a) => (
        <form
          key={a.id}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void api(`/mvp2/manager/${a.id}/decision`, {
              version: a.version,
              decision: f.get("decision"),
              reason: f.get("reason"),
              missingKey: f.get("missingKey"),
            })
              .then(load)
              .catch((e) => setError(e.message));
          }}
        >
          <h3>
            {a.company?.name} · {money(a.questionnaire.amount)}
          </h3>
          <p>
            {a.meeting &&
              new Date(a.meeting.at).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}{" "}
            МСК
          </p>
          <p>
            Платёж: {money(a.financial?.payment)}; поток:{" "}
            {money(a.financial?.flow)}. Предварительная оценка пройдена.
          </p>
          <label className="field">
            <span>Решение менеджера</span>
            <select name="decision">
              <option value="APPROVED">Одобрить</option>
              <option value="ADDITIONAL_DATA_REQUIRED">Нужны сведения</option>
              <option value="DECLINED">Отказать</option>
            </select>
          </label>
          <label className="field">
            <span>Пояснение клиенту / конкретные сведения</span>
            <textarea name="reason" minLength={5} maxLength={500} required />
          </label>
          <label className="field">
            <span>Если нужны сведения — какое поле уточнить?</span>
            <select name="missingKey">
              {managerRequestedFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Зафиксировать решение</Button>
        </form>
      ))}
    </section>
  );
}
