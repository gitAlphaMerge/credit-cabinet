import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  MessageSquare,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { api, money, date, ApiError, workspaceHeaders } from "./api";
import { RestartJourney } from "./RestartJourney";
import { Button, Brand } from "./ui";
import { NumericInput } from "./NumericInput";
import { OnboardingAmount } from "./OnboardingAmount";
import { DataConsent } from "./DataConsent";
import { DateInput } from "./DateInput";
import { MeetingBooking, type MeetingSlot } from "./CalendarPicker";
import { CompanyCard } from "./CompanyCard";
import { ClientDossier } from "./ClientDossier";
import { StatementUpload } from "./StatementUpload";
import { innError } from "../shared/inn";
import { industryFromOkved } from "../shared/company";
import { day, addDays } from "../shared/cabinet";
import { ApplicationAgent } from "./ApplicationAgent";
import {
  ApplicationWorkspace,
  sectionDescriptions,
} from "./ApplicationWorkspace";
import { JourneyProgress } from "./JourneyProgress";
import { journeyView, journeySection } from "../shared/journey-view";
import { MissingDataStep } from "./MissingDataStep";
import { CreditContract } from "./CreditDocument";
import { CreditMotion, CreditTransition } from "./CreditMotion";
import { labelCode, safeDisplayText, visibleError } from "./application-client";
import {
  emptyOnboarding,
  onboardingStepValid,
} from "../shared/onboarding-state";
import { useWorkspace, WorkspaceContext } from "./context";
import { Chat } from "./Chat";
import {
  Illustration,
  ProductIllustration,
  StatusIllustration,
} from "./Illustration";
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
  productTerms,
  nearestProductTerm,
  questionnaireErrors,
  normalizeQuestionnaire,
  neededOptions,
  amountBand,
  catalogAmount,
  type OnboardingAnswers,
  type MvpApplication,
  type Product,
  type Questionnaire,
  type MissingField,
} from "../shared/mvp2";
import "./mvp2.css";

const defaults = emptyOnboarding;
function Choice({
  label,
  value,
  options,
  onChange,
  invalid = false,
  fieldKey,
  error,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  invalid?: boolean;
  fieldKey?: string;
  error?: string;
}) {
  const id = useId();
  const labelFor = (value: string) =>
    (
      ({
        "Всё сразу": "Всю сумму сразу",
        Частями: "Несколькими частями",
        "Многократная выборка и возврат":
          "Брать и возвращать по мере необходимости",
        "Не уверен": "Не знаю",
      }) as Record<string, string>
    )[value] ?? value;
  if (options.every((x) => ["Да", "Нет", "Не знаю", "Не уверен"].includes(x)))
    return (
      <fieldset
        className="segmented-choice"
        data-field={fieldKey}
        aria-invalid={invalid}
        role="group"
        aria-label={label}
      >
        <legend>{label}</legend>
        <div>
          {options.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={id}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              <span>{labelFor(option)}</span>
            </label>
          ))}
        </div>
        {error && (
          <small className="mvp-error" role="alert">
            {error}
          </small>
        )}
      </fieldset>
    );
  return (
    <label className="field" data-field={fieldKey}>
      <span>{label}</span>
      <select
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled hidden>
          Выберите...
        </option>
        {options.map((x) => (
          <option key={x} value={x}>
            {labelFor(x)}
          </option>
        ))}
      </select>
      {error && (
        <small className="mvp-error" role="alert">
          {error}
        </small>
      )}
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
    <div className={"mvp-fields" + (group === 1 ? " mvp-onboarding-task" : "")}>
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
            value={value.amount ?? null}
            unknown={value.amountRange === "Не знаю"}
            onChange={(amount, unknown) =>
              onChange({
                ...value,
                amount,
                amountRange: unknown
                  ? "Не знаю"
                  : amount === null
                    ? ""
                    : amountBand(amount),
              })
            }
          />
          <label className="field mvp-span">
            <span>
              Срок финансирования:{" "}
              {value.term === 1 ? "до месяца" : `${value.term} мес.`}
            </span>
            <input
              aria-label="Срок финансирования"
              type="range"
              className="mvp-range"
              style={
                {
                  "--mvp-range-progress": `${((value.term - 1) / 59) * 100}%`,
                } as React.CSSProperties
              }
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
          {field("usage", "Как планируете использовать финансирование?", uses)}
          {field(
            "repayment",
            "За счёт каких поступлений будете возвращать деньги?",
            repayments,
          )}
        </>
      )}
    </div>
  );
}
export function MvpOnboarding({
  value: answers,
  step,
  onChange,
  onMove,
  busy = false,
  go,
}: {
  value: OnboardingAnswers;
  step: number;
  busy?: boolean;
  onChange: (v: OnboardingAnswers) => void;
  onMove: (step: number) => void | Promise<void>;
  go: (p: string) => void;
}) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);
  const valid = onboardingStepValid(answers, step);
  return (
    <div className="onboarding journey-onboarding">
      <header className="public-header">
        <button className="unstyled" onClick={() => go("/")}>
          <Brand />
        </button>
        <RestartJourney />
      </header>
      <main className="onboard-grid">
        <JourneyProgress current={0} />
        <section className="onboard-main">
          <Illustration
            group="docs"
            name={
              step === 0
                ? "questionnaire"
                : step === 1
                  ? "business-plan"
                  : "debt-schedule"
            }
            size={48}
            decorative
          />
          <small>Вопросы о задаче · {step + 1} из 3</small>
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
                "Как вы планируете использовать деньги?",
              ][step]
            }
          </h1>
          {step === 2 && (
            <p className="lead">
              Расскажите, как хотите получать и возвращать средства. Это поможет
              подобрать подходящий кредитный инструмент.
            </p>
          )}
          <fieldset disabled={busy} className="onboarding-fieldset">
            <OnboardingFields
              value={answers}
              onChange={onChange}
              group={step}
            />
          </fieldset>
          <div className="mvp-actions">
            <Button
              secondary
              disabled={busy}
              onClick={(e) => {
                if (e.detail < 2) step ? void onMove(step - 1) : go("/");
              }}
            >
              Назад
            </Button>
            <Button
              disabled={!valid || busy}
              onClick={(e) => {
                if (e.detail < 2) void onMove(step + 1);
              }}
            >
              Продолжить <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
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
        <dd>{labelCode(p?.id)}</dd>
      </div>
      <div>
        <dt>Сумма заявки</dt>
        <dd>{q.amount > 0 ? money(q.amount) : "Уточните сумму в анкете"}</dd>
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
  registryStatus,
  uploadErrors,
  catalogIndustry,
  onInnPaste,
  removeStatement,
  uploadingAccount,
  onConsent,
  onDiscrepancy,
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
  registryStatus: { status: string; message: string };
  uploadErrors: Record<string, string>;
  catalogIndustry: string;
  onInnPaste: () => void;
  removeStatement: (id: string) => void;
  uploadingAccount: string;
  onConsent: () => void;
  onDiscrepancy: () => void;
}) {
  const [editingRequest, setEditingRequest] = useState(false);
  const requestKeys = [
    "purpose",
    "amount",
    "term",
    "productId",
    "usage",
    "repayment",
  ];
  useLayoutEffect(() => {
    if (section === 4 && requestKeys.some((key) => errors[key]))
      setEditingRequest(true);
  }, [section, errors]);
  const patch = (k: keyof Questionnaire, v: unknown) => {
    if (k === "productId") {
      const product = catalog.find((item) => item.id === v);
      if (product) {
        setQ({
          ...q,
          productId: product.id,
          term: nearestProductTerm(product, q.term),
        });
        return;
      }
    }
    setQ({ ...q, [k]: v });
  };
  const calendar = (
    key: "balloonPeriod" | "neededDate",
    label: string,
    s: number,
  ) =>
    show(key, s)
      ? wrap(
          key,
          label,
          <DateInput
            aria-label={label}
            value={q[key]}
            min={day()}
            max={addDays(day(), 3650)}
            aria-invalid={!!errors[key]}
            onValueChange={(value) => patch(key, value)}
          />,
        )
      : null;
  const show = (k: string, s: number) =>
    missing
      ? missing.some((m) => m.key === k)
      : section === s &&
        !(section === 4 && !editingRequest && requestKeys.includes(k));
  const wrap = (
    key: keyof Questionnaire,
    label: string,
    node: React.ReactNode,
  ) => (
    <label className="field" key={key} data-field={key}>
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
            decimals={
              k === "amount" || unit === "мес." || unit === "дн." ? 0 : 2
            }
            aria-invalid={!!errors[k]}
          />,
        )
      : null;
  const tri = (
    k: "loans" | "complete" | "seasonality" | "balloonExpected",
    label: string,
    s: number,
  ) =>
    show(k, s) ? (
      <Choice
        key={k}
        label={label}
        fieldKey={k}
        error={errors[k]}
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
      <label className="mvp-check" key={k} data-field={k}>
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
    <div className={"mvp-fields mvp-fields-section-" + section}>
      {show("inn", 0) && (
        <div className="mvp-span">
          <label className="field field-inn" data-field="inn">
            <span>ИНН компании</span>
            <input
              aria-label="ИНН компании"
              inputMode="numeric"
              autoComplete="off"
              value={q.inn}
              maxLength={12}
              aria-invalid={
                !!errors.inn ||
                ["invalid", "not-found"].includes(registryStatus.status)
              }
              onPaste={onInnPaste}
              onChange={(e) =>
                patch("inn", e.target.value.replace(/\D/g, "").slice(0, 12))
              }
            />
          </label>
          <p
            className={"registry-status " + registryStatus.status}
            role={
              ["invalid", "error", "not-found"].includes(registryStatus.status)
                ? "alert"
                : "status"
            }
          >
            {registryStatus.message}
          </p>
          {["error", "not-found"].includes(registryStatus.status) && (
            <Button
              secondary
              type="button"
              disabled={busy || !!innError(q.inn)}
              onClick={registry}
            >
              Повторить поиск
            </Button>
          )}
        </div>
      )}
      {company &&
        (section === 0 ||
          missing?.some((m) =>
            ["inn", "companyConfirmed", "actualIndustry"].includes(m.key),
          )) && (
          <div className="mvp-span mvp-company">
            <CompanyCard company={company} />
          </div>
        )}
      {company && check("companyConfirmed", "Это моя компания", 0)}
      {company && show("registryError", 0) && (
        <details className="mvp-span">
          <summary>Сведения неверны</summary>
          {text(
            "registryError",
            "Сообщить об ошибке в найденных сведениях (если есть)",
            0,
          )}
        </details>
      )}
      {company &&
        check(
          "authorized",
          "Я уполномочен оформлять заявку от имени компании",
          0,
        )}
      {company && show("consents", 0) && (
        <DataConsent
          value={q.consents}
          onChange={(consents) => setQ({ ...q, consents })}
          error={errors.consents}
        />
      )}
      {company &&
        company.okved &&
        industryFromOkved(company.okved) !== catalogIndustry && (
          <p className="mvp-span mvp-notice">
            Вы указали сферу «{catalogIndustry}», в реестре указано «
            {company.activity || industryFromOkved(company.okved)}». Уточните
            фактическую деятельность ниже.
          </p>
        )}
      {company &&
        (q.actualIndustry ||
          (company.okved &&
            industryFromOkved(company.okved) !== catalogIndustry)) &&
        text(
          "actualIndustry",
          "Фактическая деятельность (если отличается от ОКВЭД)",
          0,
        )}
      {show("accounts", 1) && (
        <div className="mvp-span" data-field="accounts">
          <h2 className="credit-block-title">
            Добавьте выписки по счетам бизнеса
          </h2>
          <p>
            Рекомендуем последние 12 полных месяцев. Поддерживается CSV; при
            недостатке истории можно продолжить и добавить данные позже.
          </p>
          <div className="csv-format-help">
            <a href="/fixtures/mvp2-cashflow.csv" download>
              Скачать образец CSV
            </a>
            <details>
              <summary>Как выгрузить выписку?</summary>
              <p>
                В интернет-банке выберите расчётный счёт, период и экспорт CSV.
                Нужны дата, сумма, контрагент и назначение платежа. Поступления
                со знаком плюс, расходы со знаком минус. PDF не подходит для
                автоматического анализа.
              </p>
            </details>
          </div>
          {q.accounts.map((account, i) => (
            <section key={account.id} className="mvp-account">
              <h4>Счёт {i + 1}</h4>
              <div className="mvp-fields">
                <label className="field">
                  <span>Банк</span>
                  <input
                    value={account.bank}
                    aria-invalid={!!errors.accounts && !account.bank.trim()}
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
                <StatementUpload
                  label={`CSV-выписка счёта ${i + 1}`}
                  statement={statements.find(
                    (s) => s.id === account.documentId,
                  )}
                  disabled={busy || !q.consents.financial}
                  uploading={uploadingAccount === account.id}
                  removingDisabled={busy}
                  onRemove={() => removeStatement(account.documentId)}
                  onDiscrepancy={onDiscrepancy}
                  error={uploadErrors[account.id]}
                  onUpload={(file) => upload(file, account.id)}
                />
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
          {!q.accounts.every((account) => !!account.documentId) && (
            <p className="mvp-notice" role="status">
              Вы пока не загрузили выписки по всем счетам. Без них система не
              сможет завершить финансовую оценку. Можно продолжить заполнение и
              подать неполную заявку. После отправки мы укажем, какие выписки
              нужно добавить.
            </p>
          )}
          {!q.consents.financial && (
            <p className="mvp-notice">
              Чтобы загрузить выписки, подтвердите согласие на обработку данных
              в разделе «Компания».
              <button className="text-button" type="button" onClick={onConsent}>
                Перейти к согласию
              </button>
            </p>
          )}
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
      {tri(
        "loans",
        "Есть ли у бизнеса действующие кредиты или кредитные линии?",
        2,
      )}
      {q.loans === "yes" && (
        <>
          {number("debt", "Остаток долга", 2)}
          {number("monthlyDebt", "Регулярный платёж по кредитам в месяц", 2)}
          {tri(
            "balloonExpected",
            "Предстоит ли крупное разовое погашение по действующим кредитам в ближайшие месяцы?",
            2,
          )}
          {q.balloonExpected === "yes" && (
            <>
              {number("balloon", "Сумма погашения, ₽", 2)}
              {calendar("balloonPeriod", "Планируемая дата погашения", 2)}
            </>
          )}
        </>
      )}
      {show("leasing", 2) && (
        <Choice
          label="Есть ли у бизнеса действующий лизинг?"
          value={q.leasing === "yes" ? "Да" : q.leasing === "no" ? "Нет" : ""}
          invalid={!!errors.leasing}
          fieldKey="leasing"
          error={errors.leasing}
          options={["Да", "Нет", "Не знаю"]}
          onChange={(v) =>
            patch(
              "leasing",
              v === "Да" ? "yes" : v === "Нет" ? "no" : "unknown",
            )
          }
        />
      )}
      {q.leasing === "yes" &&
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
        number("futureIn", "Будущие поступления за указанный период, ₽", 3)}
      {(["expense", "both"].includes(q.future) ||
        missing?.some((m) => m.key === "futureOut")) &&
        number("futureOut", "Будущие расходы за указанный период, ₽", 3)}
      {!["none", "unknown"].includes(q.future) &&
        text("futurePeriod", "Период будущих операций", 3)}
      {section === 3 && (
        <small className="mvp-span">
          Будущие операции основаны на вашей оценке. Они сохраняются отдельно от
          выписок и сами по себе не увеличивают доступную сумму кредита.
        </small>
      )}
      {section === 4 && !missing && (
        <section className="request-summary mvp-span">
          <header>
            <h2>Ваш запрос</h2>
            <button
              className="text-button"
              type="button"
              aria-expanded={editingRequest}
              onClick={() => setEditingRequest(!editingRequest)}
            >
              {editingRequest ? "Свернуть параметры" : "Изменить"}
            </button>
          </header>
          <strong>{labelCode(q.productId)}</strong>
          <dl>
            <div>
              <dt>Сумма</dt>
              <dd>{q.amount > 0 ? money(q.amount) : "Нужно уточнить"}</dd>
            </div>
            <div>
              <dt>Срок</dt>
              <dd>{q.term} мес.</dd>
            </div>
            <div>
              <dt>Цель</dt>
              <dd>{q.purpose}</dd>
            </div>
            <div>
              <dt>Получение</dt>
              <dd>{q.usage}</dd>
            </div>
            <div>
              <dt>Возврат</dt>
              <dd>{q.repayment}</dd>
            </div>
          </dl>
          <small>
            Для выбранного продукта:{" "}
            {money(catalog.find((p) => p.id === q.productId)?.min)}–
            {money(catalog.find((p) => p.id === q.productId)?.max)}. Это
            диапазон продукта, не одобренная сумма.
          </small>
        </section>
      )}
      {show("purpose", 4) && (
        <Choice
          label="Конкретное назначение средств"
          fieldKey="purpose"
          error={errors.purpose}
          value={q.purpose}
          options={purposes}
          onChange={(v) => patch("purpose", v)}
          invalid={!!errors.purpose}
        />
      )}
      {q.purpose === "Не определился" &&
        text("purposeDetails", "Уточните назначение финансирования", 4)}
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
      {show("term", 4) && (
        <label className="field">
          <span>
            Срок{" "}
            {q.productId === "OVERDRAFT" ? "действия лимита" : "финансирования"}
          </span>
          <select
            aria-label="Срок финансирования"
            value={q.term}
            onChange={(e) => patch("term", Number(e.target.value))}
          >
            {productTerms(catalog.find((item) => item.id === q.productId)!).map(
              (term) => (
                <option key={term} value={term}>
                  {term} мес.
                </option>
              ),
            )}
          </select>
          {errors.term && <small className="mvp-error">{errors.term}</small>}
        </label>
      )}
      {show("neededAt", 4) && (
        <Choice
          label="Когда нужны средства?"
          fieldKey="neededAt"
          error={errors.neededAt}
          value={q.neededAt}
          options={neededOptions}
          onChange={(v) => patch("neededAt", v)}
          invalid={!!errors.neededAt}
        />
      )}
      {q.neededAt === "Выбрать дату" &&
        calendar("neededDate", "Дата получения средств", 4)}
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
                {labelCode(p.id)}
              </option>
            ))}
          </select>
        </label>
      )}
      {show("usage", 4) && (
        <Choice
          label="Способ использования"
          fieldKey="usage"
          error={errors.usage}
          value={q.usage}
          options={uses}
          onChange={(v) => patch("usage", v)}
        />
      )}
      {show("repayment", 4) && (
        <Choice
          label="Источник погашения"
          fieldKey="repayment"
          error={errors.repayment}
          value={q.repayment}
          options={repayments}
          onChange={(v) => patch("repayment", v)}
        />
      )}
      {q.productId === "INVEST" && (
        <>
          {number("projectCost", "Стоимость проекта", 4)}
          {number(
            "economicEffect",
            "Дополнительный денежный результат проекта в месяц, ₽",
            4,
          )}
          {(section === 4 ||
            missing?.some((m) => m.key === "economicEffect")) && (
            <small className="mvp-span">
              Например, дополнительная выручка или снижение расходов после
              покупки оборудования. Если пока не можете оценить, оставьте поле
              пустым. Это ваша оценка, она не увеличивает подтверждённый
              свободный денежный поток. Укажите оценку за один месяц.
            </small>
          )}
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
      {q.productId === "OVERDRAFT" && show("overdraftRepaymentDays", 4) && (
        <label className="field">
          <span>Погасить каждую задолженность</span>
          <select
            aria-label="Срок погашения овердрафта"
            value={q.overdraftRepaymentDays}
            onChange={(e) =>
              patch("overdraftRepaymentDays", Number(e.target.value))
            }
          >
            {[30, 60, 90].map((days) => (
              <option key={days} value={days}>
                {days} дней
              </option>
            ))}
          </select>
        </label>
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
    [signing, setSigning] = useState(false),
    [error, setError] = useState(""),
    [registryStatus, setRegistryStatus] = useState({
      status: "empty",
      message: "Введите ИНН, сведения о компании появятся автоматически.",
    }),
    [uploadErrors, setUploadErrors] = useState<Record<string, string>>({}),
    [uploadingAccount, setUploadingAccount] = useState(""),
    [draftStatus, setDraftStatus] = useState("saved"),
    [activeField, setActiveField] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [statements, setStatements] = useState<any[]>([]),
    [slots, setSlots] = useState<MeetingSlot[]>([]),
    [chatId, setChatId] = useState(""),
    [chatSending, setChatSending] = useState(false),
    [editAnswers, setEditAnswers] = useState(false),
    [editingDetails, setEditingDetails] = useState(false),
    [creditNeeded, setCreditNeeded] = useState(false),
    [transitionKind, setTransitionKind] = useState<
      "selection" | "review" | null
    >(null),
    [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  const lock = useRef(false),
    aRef = useRef(a),
    dirty = useRef(false),
    qRef = useRef(q),
    answersRef = useRef(answers),
    lookupPaste = useRef(false),
    lookupInn = useRef(""),
    catalogReturn = useRef("recommendation"),
    draftSequence = useRef(0),
    sectionRef = useRef(section),
    draftQueue = useRef(Promise.resolve()),
    positionQueue = useRef(Promise.resolve()),
    formPanel = useRef<HTMLElement>(null),
    mainPanel = useRef<HTMLElement>(null),
    loaded = useRef(false);
  const activeMissing = a?.missing.find(
    (item) => (item.status ?? "todo") === "todo",
  );
  useEffect(() => {
    if (view !== "supplement") return;
    if (!activeMissing) setView("decision");
    else setSection(activeMissing.section);
  }, [view, activeMissing?.id, activeMissing?.section]);
  aRef.current = a;
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    formPanel.current?.scrollTo({ top: 0, behavior: "instant" });
    mainPanel.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [view, section]);
  qRef.current = q;
  answersRef.current = answers;
  sectionRef.current = section;
  useEffect(() => {
    const preserve = () => {
      const current = aRef.current,
        value = qRef.current;
      if (
        !dirty.current ||
        !current ||
        !value ||
        (current.lifecycle !== "DRAFT" &&
          current.decision !== "ADDITIONAL_DATA_REQUIRED")
      )
        return;
      void fetch("/api/journey/draft", {
        method: "PUT",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...workspaceHeaders() },
        body: JSON.stringify({
          applicationId: current.id,
          version: current.version,
          questionnaire: value,
          ...(current.lifecycle === "DRAFT"
            ? { onboarding: answersRef.current }
            : {}),
          section: sectionRef.current,
          sequence: ++draftSequence.current,
        }),
      }).catch(() => {});
    };
    addEventListener("pagehide", preserve);
    return () => removeEventListener("pagehide", preserve);
  }, []);
  const adopt = (next: MvpApplication) => {
    aRef.current = next;
    setA(next);
    const canonical = normalizeQuestionnaire(
      structuredClone(next.questionnaire),
    );
    setQ(canonical);
    qRef.current = canonical;
    setAnswers(next.onboarding);
    dirty.current = false;
    return next;
  };
  const derivedView = (next: MvpApplication) => journeyView(next);
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
      setError(visibleError(e));
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function open(next: MvpApplication) {
    adopt(next);
    if (next.lifecycle === "ACTIVE") {
      w.go("/cabinet");
      return;
    }
    const position = await api("/journey");
    setView(journeyView(next, position));
    if (journeyView(next, position) === "meeting")
      setSlots(await api("/mvp2/slots"));
    if (position.applicationId === next.id) {
      setSection(position.section ?? 0);
    }
    const serverBuffer = await api(`/journey/draft/${next.id}`);
    if (
      serverBuffer &&
      !next.error &&
      (next.lifecycle === "DRAFT" ||
        next.decision === "ADDITIONAL_DATA_REQUIRED")
    ) {
      setQ(normalizeQuestionnaire(serverBuffer.questionnaire));
      if (serverBuffer.onboarding && next.lifecycle === "DRAFT")
        setAnswers(serverBuffer.onboarding);
      draftSequence.current = Math.max(
        draftSequence.current,
        serverBuffer.sequence ?? 0,
      );
      setSection(journeySection(next.id, position, serverBuffer));
      dirty.current = true;
      if (next.decision) {
        if (position.view === "supplement")
          setView(journeyView(next, position));
      } else if (position.applicationId !== next.id) setView("questionnaire");
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
        setSection(journeySection(next.id, position, buffer));
        setView(
          next.decision
            ? journeyView(next, { applicationId: next.id, view: "supplement" })
            : "questionnaire",
        );
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
    loaded.current = true;
  }
  function draftQ(value: Questionnaire) {
    if (q && value.inn !== q.inn) {
      value = {
        ...value,
        companyConfirmed: false,
        authorized: false,
        consents: { registry: false, financial: false, bki: false },
        registryError: "",
      };
      setA((current) =>
        current ? { ...current, company: undefined } : current,
      );
      lookupInn.current = "";
    }
    value = normalizeQuestionnaire(value);
    qRef.current = value;
    dirty.current = true;
    setDraftStatus("changed");
    setQ(value);
    setError("");
    setErrors((previous) =>
      Object.keys(previous).length
        ? { ...questionnaireErrors(value, section) }
        : {},
    );
  }
  async function flushDraft(value = qRef.current, targetSection = section) {
    const current = aRef.current;
    if (
      !current ||
      !value ||
      !dirty.current ||
      !["DRAFT", "DECIDED", "MEETING_SCHEDULED"].includes(current.lifecycle)
    )
      return;
    const payload = {
      applicationId: current.id,
      version: current.version,
      questionnaire: value,
      ...(current.lifecycle === "DRAFT"
        ? { onboarding: answersRef.current }
        : {}),
      section: targetSection,
      sequence: ++draftSequence.current,
    };
    draftQueue.current = draftQueue.current
      .catch(() => {})
      .then(() => api("/journey/draft", payload, "PUT"))
      .then(() => {});
    setDraftStatus("saving");
    try {
      await draftQueue.current;
      if (qRef.current === value) setDraftStatus("saved");
    } catch (e) {
      setDraftStatus("error");
      throw e;
    }
  }
  async function transition(nextView: string, targetSection = section) {
    const current = aRef.current;
    if (!current) throw new Error("Заявка ещё не создана.");
    await positionQueue.current.catch(() => {});
    await api(
      "/journey/position",
      { applicationId: current.id, view: nextView, section: targetSection },
      "PUT",
    );
    setSection(targetSection);
    setView(nextView);
  }
  useEffect(() => {
    if (!a || !q || !dirty.current || busy) return;
    const timer = setTimeout(() => {
      void flushDraft(q, section).catch((e) => setError(visibleError(e)));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, answers, section, busy, a?.version]);
  useEffect(() => {
    if (!a || !loaded.current || busy || ["loading", "start"].includes(view))
      return;
    const timer = setTimeout(() => {
      positionQueue.current = positionQueue.current
        .catch(() => {})
        .then(() =>
          api(
            "/journey/position",
            { applicationId: a.id, view, section },
            "PUT",
          ),
        )
        .then(() => {});
      void positionQueue.current.catch((e) => setError(visibleError(e)));
    }, 150);
    return () => clearTimeout(timer);
  }, [a?.id, view, section, busy]);
  useEffect(() => {
    void run(async () => {
      const [catalog, list, position] = await Promise.all([
        api("/mvp2/catalog"),
        api<MvpApplication[]>("/mvp2/applications"),
        api("/journey"),
      ]);
      setProducts(catalog.products);
      setItems(list);
      if (list.length) {
        const current =
          list.find((item) => item.id === position.applicationId) ?? list[0];
        await open(await api(`/mvp2/applications/${current.id}`));
      } else if (w.state.profile.mvp2Answers) {
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
    let active = true;
    const timer = setInterval(
      () => {
        void api<MvpApplication>(`/mvp2/applications/${id}`)
          .then((next) => {
            if (
              !active ||
              aRef.current?.id !== id ||
              Date.parse(next.updatedAt) < Date.parse(aRef.current.updatedAt)
            )
              return;
            adopt(next);
            if (!["SUBMITTED", "PROCESSING"].includes(next.lifecycle))
              setView(derivedView(next));
          })
          .catch((e) => {
            if (active) setError(visibleError(e));
          });
      },
      view === "processing" ? 700 : 5000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [view, a?.id, a?.lifecycle]);
  async function save() {
    if (!a || !q) throw new Error("Заявка ещё не создана");
    await draftQueue.current.catch(() => {});
    const next = await api<MvpApplication>(
      `/mvp2/applications/${a.id}`,
      {
        version: a.version,
        questionnaire: normalizeQuestionnaire({
          ...q,
          amount: q.amount ?? 0,
          term: q.term ?? 0,
        }),
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
    if (lock.current) return;
    setTransitionTarget(null);
    setTransitionKind("selection");
    await run(async () => {
      try {
        const next = await api<MvpApplication>("/mvp2/applications", {
          onboarding: answers,
        });
        adopt(next);
        setItems([next, ...items]);
        await w.refresh();
        setTransitionTarget("recommendation");
      } catch (e) {
        setTransitionKind(null);
        throw e;
      }
    });
  }
  const submit = () => {
    if (lock.current) return Promise.resolve();
    setTransitionTarget(null);
    setTransitionKind("review");
    return run(async () => {
      try {
        const current = dirty.current ? await save() : aRef.current!;
        const next = await api<MvpApplication>(
          `/mvp2/applications/${current.id}/submit`,
          { version: current.version },
        );
        adopt(next);
        setTransitionTarget(derivedView(next));
      } catch (e) {
        setTransitionKind(null);
        throw e;
      }
    });
  };
  const upload = (file: File, accountId: string) =>
    void run(async () => {
      setUploadingAccount(accountId);
      setUploadErrors((previous) => ({ ...previous, [accountId]: "" }));
      try {
        const saved = await save(),
          body = new FormData();
        body.append("version", String(saved.version));
        body.append("accountId", accountId);
        body.append("file", file);
        try {
          adopt(await api(`/mvp2/applications/${saved.id}/statements`, body));
        } catch (e) {
          setUploadErrors((previous) => ({
            ...previous,
            [accountId]: visibleError(e),
          }));
          throw e;
        }
        await loadStatements(saved.id);
      } finally {
        setUploadingAccount("");
      }
    });
  const removeFile = (id: string) =>
    void run(async () => {
      const saved = await save();
      adopt(
        await api(
          `/mvp2/applications/${saved.id}/statements/${id}`,
          { version: saved.version },
          "DELETE",
        ),
      );
      await loadStatements(saved.id);
    });
  const registry = () => void lookupCompany();
  async function lookupCompany() {
    const current = aRef.current,
      value = qRef.current;
    if (!current || !value || lock.current || innError(value.inn)) return;
    const inn = value.inn;
    lookupInn.current = inn;
    lock.current = true;
    setBusy(true);
    setRegistryStatus({
      status: "loading",
      message: "Ищем сведения о компании…",
    });
    try {
      await draftQueue.current.catch(() => {});
      const next = await api<MvpApplication>(
        `/mvp2/applications/${current.id}/registry`,
        { version: current.version, inn },
      );
      aRef.current = next;
      setA({
        ...next,
        company: qRef.current?.inn === inn ? next.company : undefined,
      });
      if (qRef.current?.inn === inn) {
        const merged = { ...qRef.current, companyConfirmed: false };
        qRef.current = merged;
        setQ(merged);
        dirty.current = true;
        setRegistryStatus({
          status: "found",
          message: "Компания найдена. Проверьте сведения и подтвердите их.",
        });
      }
    } catch (e) {
      if (qRef.current?.inn === inn)
        setRegistryStatus({
          status:
            e instanceof ApiError && e.status === 404 ? "not-found" : "error",
          message: visibleError(e),
        });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !a ||
      !q ||
      busy ||
      !["questionnaire", "supplement"].includes(view) ||
      (view === "questionnaire" && section !== 0)
    )
      return;
    if (a.company?.inn === q.inn) {
      setRegistryStatus({
        status: "found",
        message: "Компания найдена. Проверьте сведения и подтвердите их.",
      });
      return;
    }
    if (!q.inn) {
      setRegistryStatus({
        status: "empty",
        message: "Введите ИНН, сведения о компании появятся автоматически.",
      });
      return;
    }
    const problem = innError(q.inn);
    if (problem) {
      setRegistryStatus({
        status:
          q.inn.length === 10 || q.inn.length === 12 ? "invalid" : "format",
        message: problem,
      });
      return;
    }
    if (lookupInn.current === q.inn) return;
    setRegistryStatus({ status: "format", message: "Проверяем формат ИНН…" });
    const timeout = setTimeout(
      () => void lookupCompany(),
      lookupPaste.current ? 0 : 450,
    );
    lookupPaste.current = false;
    return () => clearTimeout(timeout);
  }, [q?.inn, a?.id, a?.company?.inn, view, section, busy]);
  const openDiscussion = async () => {
    if (!a) return;
    await transition("chat");
  };
  const discuss = () => run(openDiscussion);
  if (view === "chat" && a)
    return (
      <div className="mvp-full-chat">
        <Button
          secondary
          disabled={busy}
          onClick={() => void run(() => transition("decision"))}
        >
          Вернуться к решению
        </Button>
        {a.financial && !a.signature && (
          <Button secondary onClick={() => setView("scenario")}>
            Проверить другие условия
          </Button>
        )}
        <p>
          {a.decision ? labelCode(a.decision) : sectionTitles[section]} ·{" "}
          {money(a.questionnaire.amount)} · Контекст заявки сохранён
        </p>
        <ApplicationAgent
          application={a}
          section={section}
          view={a.decision ? "decision" : "questionnaire"}
          full
        />
      </div>
    );
  if (transitionKind)
    return (
      <main className="financing-page page-wrap funding-mvp mvp2 mvp-transition-page">
        <CreditTransition
          kind={transitionKind}
          ready={transitionTarget !== null}
          error={error}
          onFinish={() => {
            if (transitionTarget === null) return;
            setView(transitionTarget);
            setTransitionKind(null);
            setTransitionTarget(null);
          }}
        />
      </main>
    );
  const p = q && products.find((p) => p.id === q.productId),
    path = a ? `/mvp2/applications/${a.id}` : "";
  return (
    <main
      ref={mainPanel}
      className={
        "financing-page page-wrap funding-mvp mvp2" +
        (["intro", "questionnaire", "dossier", "supplement"].includes(view)
          ? " mvp-workspace"
          : view === "contract"
            ? " mvp-contract-workspace"
            : "")
      }
    >
      {signing && (
        <div
          className="credit-signing"
          role="status"
          aria-label="Подпись договора"
          aria-busy="true"
        >
          <CreditMotion
            title="Подписываем кредитный договор"
            variant="signature"
            steps={[
              {
                id: "signature",
                label: "Сохраняем подпись и договор",
                status: "running",
              },
            ]}
          />
        </div>
      )}
      <JourneyProgress
        current={
          ["processing"].includes(view)
            ? 2
            : [
                  "decision",
                  "meeting",
                  "details",
                  "contract",
                  "receive",
                ].includes(view)
              ? 3
              : ["recommendation", "catalog", "start", "loading"].includes(view)
                ? 0
                : 1
        }
      />
      {![
        "intro",
        "questionnaire",
        "dossier",
        "supplement",
        "contract",
      ].includes(view) && (
        <header className="journey-stage">
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
        </header>
      )}
      {error &&
        Object.keys(errors).length === 0 &&
        !Object.values(uploadErrors).includes(error) && (
          <div className="mvp-error" role="alert">
            {error}
            <Button
              secondary
              onClick={() =>
                void run(async () => {
                  if (a && dirty.current && q) await flushDraft();
                  else if (a) await open(await api(path));
                  else location.reload();
                })
              }
            >
              Повторить действие
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
          <h2>Сначала задача, затем условия</h2>
          <p>
            Уточним семь ответов и подберём один из шести инструментов.
            Финансовую доступность проверим отдельно.
          </p>
          <OnboardingFields value={answers} onChange={setAnswers} />
          <div className="mvp-actions">
            <span>Условия уточняются при рассмотрении заявки.</span>
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
          <ProductIllustration productId={q.productId} size={64} decorative />
          <small>ПРЕДВАРИТЕЛЬНЫЙ ПОДБОР</small>
          <h2>{labelCode(p?.id)}</h2>
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
                : "Вы выбрали другой инструмент. Проверьте соответствие цели."}
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
              <Button
                secondary
                onClick={() => {
                  catalogReturn.current = "recommendation";
                  void run(() => transition("catalog"));
                }}
              >
                Посмотреть все продукты
              </Button>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await save();
                  await transition("intro");
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
          <p>Выбор продукта запускает проверку условий банком.</p>
          <div className="mvp-products">
            {products.map((product) => (
              <article className="mvp-account" key={product.id}>
                <ProductIllustration
                  productId={product.id}
                  size={48}
                  decorative
                />
                <h3>{labelCode(product.id)}</h3>
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
                      const draft = { ...q, productId: product.id };
                      const currentAnswers = answers;
                      adopt(
                        await api(
                          path,
                          {
                            version: a.version,
                            questionnaire: {
                              ...a.questionnaire,
                              productId: product.id,
                            },
                          },
                          "PUT",
                        ),
                      );
                      setAnswers(currentAnswers);
                      draftQ(draft);
                      await flushDraft(draft, section);
                      await transition(catalogReturn.current);
                    })
                  }
                >
                  Выбрать
                </Button>
              </article>
            ))}
          </div>
          <Button
            secondary
            onClick={() => void run(() => transition(catalogReturn.current))}
          >
            Вернуться
          </Button>
        </section>
      )}
      {a &&
        q &&
        ["intro", "questionnaire", "dossier", "supplement"].includes(view) && (
          <ApplicationWorkspace
            screenKey={view + section}
            scrollRef={formPanel}
            title={
              view === "intro"
                ? "Подготовим заявку"
                : view === "dossier"
                  ? "Проверьте вашу заявку"
                  : view === "supplement"
                    ? "Дополните заявку"
                    : sectionTitles[section]
            }
            description={
              view === "intro"
                ? "Ответы о вашей задаче сохранены. Осталось добавить сведения, необходимые для проверки."
                : view === "dossier"
                  ? "Проверьте сведения перед отправкой. Любой раздел можно изменить."
                  : view === "supplement"
                    ? "Нужны только перечисленные сведения. Остальные ответы уже сохранены."
                    : sectionDescriptions[section]
            }
            navigation={
              view === "questionnaire"
                ? sectionTitles.map((title, i) => (
                    <button
                      type="button"
                      aria-label={i + 1 + ". " + title}
                      aria-current={i === section ? "step" : undefined}
                      disabled={busy}
                      key={title}
                      onClick={() =>
                        void run(async () => {
                          await flushDraft(q, i);
                          setErrors({});
                          setError("");
                          await transition("questionnaire", i);
                        })
                      }
                    >
                      <span className="section-number" aria-hidden="true">
                        {i + 1}.
                      </span>
                      <span className="section-name">{title}</span>
                      <span className="section-short" aria-hidden="true">
                        {
                          [
                            "Компания",
                            "Финансы",
                            "Платежи",
                            "Бизнес",
                            "Условия",
                          ][i]
                        }
                      </span>
                    </button>
                  ))
                : undefined
            }
            agent={
              <ApplicationAgent
                application={a}
                section={section}
                view={view}
                validationFields={Object.keys(errors)}
                activeField={activeField}
              />
            }
            footer={
              <div className="mvp-actions">
                {view === "intro" ? (
                  <>
                    <span>5 разделов · можно возвращаться к ответам</span>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(() => transition("questionnaire", 0))
                      }
                    >
                      Начать заполнение <ArrowRight size={16} />
                    </Button>
                  </>
                ) : view === "dossier" ? (
                  <>
                    <Button
                      secondary
                      onClick={() =>
                        void run(() =>
                          transition(
                            a.lifecycle === "DRAFT"
                              ? "questionnaire"
                              : "decision",
                          ),
                        )
                      }
                    >
                      {a.lifecycle === "DRAFT"
                        ? "Изменить сведения"
                        : "Вернуться к решению"}
                    </Button>
                    {a.lifecycle === "DRAFT" && (
                      <Button disabled={busy} onClick={() => void submit()}>
                        Подать заявку на рассмотрение
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      secondary
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await flushDraft(q, Math.max(0, section - 1));
                          setErrors({});
                          if (section > 0)
                            await transition("questionnaire", section - 1);
                          else await transition("intro");
                        })
                      }
                    >
                      Назад
                    </Button>
                    <small className="credit-save-status" role="status">
                      {
                        {
                          changed: "Есть изменения",
                          saving: "Сохраняем…",
                          saved: "Ответы сохранены",
                          error: "Не удалось сохранить",
                        }[draftStatus]
                      }
                    </small>
                    <Button
                      disabled={busy}
                      type="submit"
                      form={"mvp-questionnaire-" + a.id}
                    >
                      {view === "supplement"
                        ? "Сохранить пункт"
                        : section === 4
                          ? "Проверить заявку"
                          : section === 1 &&
                              q.accounts.some((account) => !account.documentId)
                            ? "Продолжить без выписок"
                            : "Сохранить и продолжить"}{" "}
                      <ArrowRight size={16} />
                    </Button>
                  </>
                )}
              </div>
            }
          >
            {view === "intro" ? (
              <div className="credit-intro">
                <ol>
                  <li>
                    <span>01</span>
                    <div>
                      <h2>Подтвердите компанию</h2>
                      <p>
                        Найдём общедоступные сведения по ИНН. Проверьте их и
                        подтвердите полномочия и согласия.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>02</span>
                    <div>
                      <h2>Добавьте выписки</h2>
                      <p>
                        CSV по каждому расчётному счёту. Они помогут оценить
                        доходы, расходы и действующие платежи.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>03</span>
                    <div>
                      <h2>Уточните обязательства</h2>
                      <p>
                        Кредиты, лизинг и ожидаемые разовые операции.
                        Понадобятся только сведения о вашем бизнесе.
                      </p>
                    </div>
                  </li>
                </ol>
                <p className="mvp-notice">
                  Помощник объяснит вопросы и формат выписок. После проверки
                  покажем результат. Сейчас никаких дополнительных банковских
                  проверок не выполняется.
                </p>
              </div>
            ) : view === "dossier" ? (
              <ClientDossier
                application={{ ...a, questionnaire: q }}
                products={products}
                statements={statements}
                editable={a.lifecycle === "DRAFT"}
                onEdit={(target) =>
                  void run(() => transition("questionnaire", target))
                }
              />
            ) : (
              <form
                id={"mvp-questionnaire-" + a.id}
                onFocusCapture={(e) =>
                  setActiveField(
                    (e.target as HTMLElement).closest<HTMLElement>(
                      "[data-field]",
                    )?.dataset.field ?? "",
                  )
                }
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (view !== "supplement") {
                    const problems = questionnaireErrors(q, section);
                    if (
                      section === 0 &&
                      a.company?.okved &&
                      industryFromOkved(a.company.okved) !== answers.industry &&
                      !q.actualIndustry.trim()
                    )
                      problems.actualIndustry =
                        "Уточните фактическую деятельность: она отличается от сведений реестра.";
                    if (Object.keys(problems).length) {
                      setErrors(problems);
                      requestAnimationFrame(() =>
                        formPanel.current
                          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                          ?.focus(),
                      );
                      return;
                    }
                  }
                  void run(async () => {
                    await save();
                    if (view === "supplement") {
                      const current = aRef.current!;
                      if (
                        !current.missing.some(
                          (item) => (item.status ?? "todo") === "todo",
                        )
                      ) {
                        const next = adopt(
                          await api(path + "/submit", {
                            version: current.version,
                          }),
                        );
                        setView(derivedView(next));
                      } else
                        setSection(
                          current.missing.find(
                            (item) => (item.status ?? "todo") === "todo",
                          )!.section,
                        );
                    } else if (section < 4)
                      await transition("questionnaire", section + 1);
                    else await transition("dossier");
                  });
                }}
              >
                {Object.keys(errors).length > 0 && (
                  <div className="credit-error-summary" role="alert">
                    <strong>Уточните сведения</strong>
                    <ul>
                      {Object.entries(errors).map(([key, message]) => (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => {
                              const group =
                                formPanel.current?.querySelector<HTMLElement>(
                                  '[data-field="' + key + '"]',
                                );
                              const target =
                                group?.querySelector<HTMLElement>(
                                  "input,select,button",
                                ) ??
                                formPanel.current?.querySelector<HTMLElement>(
                                  '[aria-invalid="true"]',
                                );
                              target?.focus();
                              target?.scrollIntoView({ block: "center" });
                            }}
                          >
                            {message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {view === "supplement" && (
                  <MissingDataStep
                    items={a.missing}
                    onSkip={(missingId) =>
                      void run(async () => {
                        const current = aRef.current!;
                        const next = adopt(
                          await api(
                            `${path}/missing/${encodeURIComponent(missingId)}/skip`,
                            {
                              version: current.version,
                            },
                          ),
                        );
                        if (next.decision !== "ADDITIONAL_DATA_REQUIRED")
                          setView(derivedView(next));
                      })
                    }
                  />
                )}
                <QuestionnaireFields
                  catalog={products}
                  q={q}
                  setQ={draftQ}
                  section={
                    view === "supplement" ? activeMissing?.section : section
                  }
                  missing={
                    view === "supplement"
                      ? activeMissing
                        ? [activeMissing]
                        : []
                      : undefined
                  }
                  upload={upload}
                  uploadingAccount={uploadingAccount}
                  removeStatement={removeFile}
                  onConsent={() =>
                    void run(async () => {
                      await flushDraft();
                      await transition("questionnaire", 0);
                      requestAnimationFrame(() =>
                        formPanel.current
                          ?.querySelector<HTMLElement>(
                            '[data-field="consents"] input',
                          )
                          ?.focus(),
                      );
                    })
                  }
                  onDiscrepancy={() =>
                    window.dispatchEvent(
                      new CustomEvent("application-reference-question", {
                        detail: {
                          applicationId: a.id,
                          promptId: "discrepancy",
                        },
                      }),
                    )
                  }
                  registry={registry}
                  registryStatus={registryStatus}
                  uploadErrors={uploadErrors}
                  catalogIndustry={answers.industry}
                  onInnPaste={() => {
                    lookupPaste.current = true;
                  }}
                  statements={statements}
                  company={a.company?.inn === q.inn ? a.company : undefined}
                  busy={busy}
                  errors={errors}
                />
                {section === 4 &&
                  productIssues(q).map((issue) => (
                    <p className="mvp-error" key={issue}>
                      {issue}
                    </p>
                  ))}
                {section === 4 && productIssues(q).length > 0 && (
                  <Button
                    secondary
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await flushDraft();
                        catalogReturn.current = "questionnaire";
                        await transition("catalog");
                      })
                    }
                  >
                    Выбрать другой продукт
                  </Button>
                )}
              </form>
            )}
          </ApplicationWorkspace>
        )}
      {a && view === "processing" && (
        <section className="funding-surface mvp-processing" aria-live="polite">
          <CreditMotion
            title="Рассматриваем заявку"
            steps={a.stages.map((s) => ({
              ...s,
              label:
                (
                  {
                    Скоринг: "Финансовая оценка",
                    "Комплаенс, антифрод и БКИ":
                      "Проверка компании и кредитной истории",
                    "Финансовый анализ CSV": "Анализ выписок",
                    Андеррайтинг: "Проверка условий",
                    "Маршрутизация решения": "Подготовка результата",
                  } as Record<string, string>
                )[s.label] ?? s.label,
            }))}
          />
          <p>
            Заявка и документы сохранены. Можно обновить страницу, рассмотрение
            продолжится на сервере.
          </p>
          <Button
            secondary
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const current = await api<MvpApplication>(path);
                adopt(current);
                setView(derivedView(current));
              })
            }
          >
            Обновить статус
          </Button>
        </section>
      )}
      {a && q && view === "decision" && (
        <section className="funding-surface">
          {a.noCredit &&
            !a.clientDeferred &&
            a.lifecycle === "DECIDED" &&
            !creditNeeded && (
              <aside
                className="mvp-no-credit"
                style={{ background: "#d6e8fc", borderRadius: 16, padding: 24 }}
              >
                <h2>Кредит может не понадобиться</h2>
                <p>
                  Ваших поступлений хватит на {money(a.noCredit.amount)}{" "}
                  примерно за {a.noCredit.weeks} недель. Если брать кредит на{" "}
                  {a.noCredit.term} мес., переплата составит около{" "}
                  {money(a.noCredit.overpayment)}.
                </p>
                <div className="mvp-actions">
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        adopt(
                          await api(`/mvp2/applications/${a.id}/defer-credit`, {
                            version: a.version,
                          }),
                        );
                        await w.refresh();
                        w.go("/cabinet");
                      })
                    }
                  >
                    Обойдусь без кредита
                  </Button>
                  <Button disabled={busy} onClick={() => setCreditNeeded(true)}>
                    Всё равно нужен
                  </Button>
                </div>
              </aside>
            )}
          {a.error ? (
            <Illustration group="empty" name="network" size={64} decorative />
          ) : (
            <StatusIllustration
              status={
                a.lifecycle === "ACTIVE"
                  ? "disbursed"
                  : {
                      APPROVED: "approved",
                      MANAGER_REVIEW_REQUIRED: "queued",
                      ADDITIONAL_DATA_REQUIRED: "info_requested",
                      DECLINED: "rejected",
                    }[a.decision ?? "DECLINED"]
              }
              size={64}
              decorative
            />
          )}
          <small>РЕЗУЛЬТАТ РАССМОТРЕНИЯ</small>
          <h2>
            {a.lifecycle === "ACTIVE"
              ? "Финансирование оформлено"
              : a.decision
                ? labelCode(a.decision)
                : "Рассмотрение не завершено"}
          </h2>
          <Summary a={a} products={products} />
          {a.reasons.slice(0, 3).map((r) => (
            <p key={r}>{safeDisplayText(r)}</p>
          ))}
          {a.reasons.length > 3 && (
            <details className="decision-details">
              <summary>Подробнее о результате</summary>
              {a.reasons.slice(3).map((r) => (
                <p key={r}>{safeDisplayText(r)}</p>
              ))}
            </details>
          )}
          {a.error && (
            <p className="mvp-error">{visibleError(new Error(a.error))}</p>
          )}
          {a.financial && (
            <div className="decision-financial">
              <dl>
                <div>
                  <dt>Рассчитанная доступная сумма</dt>
                  <dd>{money(a.financial.limit)}</dd>
                </div>
                <div>
                  <dt>Расчётный платёж в месяц</dt>
                  <dd>{money(a.financial.payment)}</dd>
                </div>
              </dl>
              <p>
                {p?.kind !== "loan"
                  ? "Для лимита это оценка нагрузки, не фиксированный график выборки."
                  : "Точный график будет в договоре."}
              </p>
              <details>
                <summary>На чём основан расчёт?</summary>
                <p>
                  Данные из выписок за {a.financial.months} мес. и действующие
                  обязательства. Расчётный свободный поток:{" "}
                  {money(a.financial.flow)} в месяц. Коэффициент покрытия
                  платежа: {a.financial.dscr.toFixed(2)}. Это сохранённый
                  результат проверки, не прогноз помощника.
                </p>
              </details>
            </div>
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
                  onClick={() =>
                    void run(() =>
                      transition(a.contract ? "contract" : "details"),
                    )
                  }
                >
                  Перейти к подписанию
                </Button>
              ) : a.decision === "ADDITIONAL_DATA_REQUIRED" ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    activeMissing
                      ? void run(() =>
                          transition("supplement", activeMissing.section),
                        )
                      : void submit()
                  }
                >
                  {activeMissing
                    ? "Дополнить сведения"
                    : "Отправить на повторную проверку"}
                </Button>
              ) : a.decision === "MANAGER_REVIEW_REQUIRED" ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setSlots(await api("/mvp2/slots"));
                      await transition("meeting");
                    })
                  }
                >
                  {a.meeting
                    ? "Открыть запись на звонок"
                    : "Записаться на звонок"}
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
                  <h3>{labelCode(o.productId)}</h3>
                  <p>
                    {money(o.amount)} · {o.term} мес. · {o.rate}% ·{" "}
                    {money(o.payment)} в месяц
                  </p>
                  <p>{safeDisplayText(o.reason)}. Условия проверит банк.</p>
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
          <h2>Звонок с менеджером</h2>
          <MeetingBooking
            slots={slots}
            meeting={a.meeting}
            busy={busy}
            onBook={(slotId) =>
              run(async () => {
                adopt(
                  await api(path + "/meeting", { version: a.version, slotId }),
                );
                setSlots(await api("/mvp2/slots"));
              })
            }
            onCancel={() =>
              run(async () => {
                adopt(
                  await api(path + "/meeting/cancel", { version: a.version }),
                );
                setSlots(await api("/mvp2/slots"));
              })
            }
          />
          <Button secondary onClick={() => setView("decision")}>
            Вернуться к решению
          </Button>
        </section>
      )}
      {a && q && view === "scenario" && (
        <section className="funding-surface">
          <h2>Проверить другие условия</h2>
          <p>
            Новые условия потребуют повторной проверки. Старое решение не
            переносится автоматически.
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
                      overdraftRepaymentDays: q.overdraftRepaymentDays,
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
                <select
                  value={q.term}
                  onChange={(e) =>
                    draftQ({ ...q, term: Number(e.target.value) })
                  }
                >
                  {p &&
                    productTerms(p).map((term) => (
                      <option key={term} value={term}>
                        {term} мес.
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Продукт нового запроса</span>
                <select
                  value={q.productId}
                  onChange={(e) =>
                    draftQ({
                      ...q,
                      productId: e.target.value as Questionnaire["productId"],
                      term: nearestProductTerm(
                        products.find((item) => item.id === e.target.value)!,
                        q.term,
                      ),
                    })
                  }
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {labelCode(p.id)}
                    </option>
                  ))}
                </select>
              </label>
              {q.productId === "OVERDRAFT" && (
                <label className="field">
                  <span>Погашение каждой задолженности</span>
                  <select
                    value={q.overdraftRepaymentDays}
                    onChange={(e) =>
                      draftQ({
                        ...q,
                        overdraftRepaymentDays: Number(e.target.value) as
                          30 | 60 | 90,
                      })
                    }
                  >
                    {[30, 60, 90].map((days) => (
                      <option key={days} value={days}>
                        {days} дней
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
                Проверить новые условия
              </Button>
            </div>
          </form>
        </section>
      )}
      {a && q && view === "details" && (
        <section className="funding-surface">
          <h2>Реквизиты для договора</h2>
          <p>
            Данные подставлены из сведений о компании и счёте. Проверьте их
            перед подписанием.
          </p>
          {(!q.signatory || !q.receivingAccount) && (
            <p role="status">
              Если сведений не хватает, проверьте ФИО руководителя в выписке
              ЕГРЮЛ или ЕГРИП на сайте ФНС, а расчётный счёт в кабинете
              Альфа-Банка. Затем нажмите «Изменить».
            </p>
          )}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                adopt(
                  editingDetails
                    ? await api(path + "/contract-details", {
                        version: a.version,
                        details: {
                          signatory: q.signatory,
                          authority: q.authority,
                          receivingAccount: q.receivingAccount,
                          receivingBank: q.receivingBank,
                        },
                      })
                    : await api(path + "/contract", { version: a.version }),
                );
                setEditingDetails(false);
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
                  {editingDetails ? (
                    <input
                      value={q[k]}
                      maxLength={k === "receivingAccount" ? 20 : 160}
                      aria-invalid={!!errors[k]}
                      onChange={(e) => setQ({ ...q, [k]: e.target.value })}
                    />
                  ) : (
                    <strong>{q[k] || "Нет данных"}</strong>
                  )}
                  {errors[k] && (
                    <small className="mvp-error">{errors[k]}</small>
                  )}
                </label>
              ))}
            </div>
            <div className="mvp-actions">
              {!editingDetails && (
                <Button
                  type="button"
                  secondary
                  onClick={() => setEditingDetails(true)}
                >
                  Изменить
                </Button>
              )}
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
        <CreditContract
          key={a.id + ":" + a.contract?.hash}
          application={a}
          product={p ?? undefined}
          busy={busy}
          summary={<Summary a={a} products={products} />}
          onReturn={() => void run(() => transition("decision"))}
          onReceive={() => void run(() => transition("receive"))}
          onSign={() =>
            void run(async () => {
              setSigning(true);
              try {
                adopt(
                  await api(path + "/sign", {
                    hash: a.contract!.hash,
                    confirmed: true,
                  }),
                );
                await transition("receive");
              } finally {
                setSigning(false);
              }
            })
          }
        />
      )}
      {a && q && view === "receive" && (
        <section className="funding-surface">
          <StatusIllustration status="signed" size={96} decorative />
          <h2>Кредитный договор подписан</h2>
          <p>Подпись сохранена. Проверьте сведения перед получением средств.</p>
          <Summary a={a} products={products} />
          <p>
            Получатель: {a.company?.name}.{" "}
            {p?.kind === "loan"
              ? "Будет смоделирована выдача суммы."
              : "Будет открыт лимит; задолженность до выборки равна нулю."}
          </p>
          <div className="mvp-actions">
            <Button
              secondary
              disabled={busy}
              onClick={() => void run(() => transition("contract"))}
            >
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
              {p?.kind === "loan" ? "Получить деньги" : "Открыть лимит"}{" "}
              <ArrowRight size={16} />
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
      .catch((e) => setError(visibleError(e)));
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="funding-surface mvp-manager">
      <h2>Звонки по заявкам</h2>
      {error && <p role="alert">{error}</p>}
      {!items.length && <p>Нет заявок, ожидающих решения после встречи.</p>}
      {items.map((a) => (
        <form
          key={a.id}
          data-application-id={a.id}
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
              .catch((e) => setError(visibleError(e)));
          }}
        >
          <h3>
            {a.company?.name} · {money(a.questionnaire.amount)}
          </h3>
          <p>
            Звонок с клиентом:{" "}
            {a.meeting &&
              new Date(a.meeting.at).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}{" "}
            МСК. {a.meeting?.manager}
          </p>
          <p>
            Платёж: {money(a.financial?.payment)}; поток:{" "}
            {money(a.financial?.flow)}. Предварительная оценка пройдена.
          </p>
          {a.missing.length > 0 && (
            <div className="mvp-account">
              <h4>Запрошенные сведения</h4>
              <ol>
                {a.missing.map((item) => (
                  <li key={item.id ?? item.key}>
                    {safeDisplayText(item.title ?? item.label)}.{" "}
                    {safeDisplayText(item.why ?? item.label)}.{" "}
                    {safeDisplayText(item.effect ?? "Уточнит расчёт.")}{" "}
                    {item.status === "uploaded"
                      ? "Загружено."
                      : item.status === "skipped"
                        ? "Подано без этого."
                        : item.status === "accepted"
                          ? "Принято."
                          : "Ожидает ответа."}
                  </li>
                ))}
              </ol>
            </div>
          )}
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
            <span>Если нужны сведения, какое поле уточнить?</span>
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
