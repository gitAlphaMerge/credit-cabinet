import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  WalletCards,
  Factory,
  TrendingUp,
  FileCheck,
  RefreshCw,
  Rocket,
  Check,
  MessageSquare,
  History,
  Plus,
  AlertTriangle,
  Upload,
  Package,
  Clock3,
  MoreHorizontal,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, Badge, Field, Modal } from "./ui";
import { money, date } from "./api";
import { day, validDate, addDays } from "../shared/cabinet";
import {
  blankFundingRequest,
  financialLabels,
  fundingCatalog,
  fundingPurposes,
  fundingWarningRequired,
  type FinancialKey,
  type FundingRequest,
} from "../shared/financing";
import { fundingBusinessData } from "../shared/financing-business";
import type { Selection } from "../shared/types";
import { RangeField } from "./RangeField";
import { SelectionResult } from "./SelectionResult";
import { NumericInput } from "./NumericInput";
import { DateInput } from "./DateInput";
import { FundingChoices, FundingDetails } from "./FundingFields";

const icons = [
  WalletCards,
  Package,
  Factory,
  TrendingUp,
  Clock3,
  FileCheck,
  RefreshCw,
  Rocket,
  MoreHorizontal,
];
const hints = [
  "Текущие расходы и расчёты с поставщиками",
  "Запасы для продаж и производства",
  "Техника, транспорт и мощности",
  "Новое направление или масштабирование",
  "Расход раньше ожидаемого поступления",
  "Работы до оплаты заказчиком",
  "Пересмотр существующего долга",
  "От идеи к первым поступлениям",
  "Разберём задачу по вашим условиям",
];
function initialRequest(state: import("../shared/types").AppState) {
  const r = blankFundingRequest(),
    model = state.documents.find(
      (d) => d.confirmed && d.category === "model" && d.currency === "RUB",
    );
  if (model && typeof model.fields.investment === "number")
    r.details = {
      purchaseCost: model.fields.investment,
      recordSource: model.name + " · прогноз",
    };
  return r;
}
export function requestFrom(s: Selection): FundingRequest {
  return s.input
    ? {
        ...structuredClone(s.input),
        cycleDays: s.assessment?.cycleDays ?? s.input.cycleDays,
      }
    : {
        ...blankFundingRequest(),
        purpose: fundingPurposes.includes(s.purpose as any)
          ? (s.purpose as FundingRequest["purpose"])
          : "Другая цель",
        amount: s.calculation.amount,
        term: s.calculation.term,
        repayFrom: s.repayFrom,
        financials: {
          flow: s.calculation.flow,
          existing:
            s.calculation.existing && s.calculation.existing > 0
              ? s.calculation.existing
              : null,
        },
      };
}
/** Group legacy parent chains too; opening history does not create a selection. */
export function selectionHistory(items: Selection[]) {
  const root = (s: Selection): string => {
    const visited = new Set<string>();
    while (s.parentId && !visited.has(s.id)) {
      visited.add(s.id);
      const parent = items.find((x) => x.id === s.parentId);
      if (!parent) break;
      s = parent;
    }
    return s.id;
  };
  const grouped = new Map<string, Selection>();
  for (const s of items) {
    const id = root(s),
      previous = grouped.get(id);
    if (!previous || s.version > previous.version) grouped.set(id, s);
  }
  return [...grouped.values()].sort((a, b) =>
    (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
  );
}
export function Financing() {
  const w = useWorkspace(),
    initial = w.financingDraft;
  const [tab, setTab] = useState<"new" | "history">(initial.tab || "new"),
    [step, setStep] = useState(Math.max(0, initial.step ?? 0)),
    [selected, setSelected] = useState<string | null>(initial.selected ?? null),
    [request, setRequest] = useState<FundingRequest>(
      initial.request ||
        (initial.form
          ? {
              ...blankFundingRequest(),
              purpose: initial.form.purpose as FundingRequest["purpose"],
              amount: initial.form.amount,
              term: initial.form.term,
              repayFrom: initial.form.repayFrom,
              financials: {
                flow:
                  initial.form.flow === "" ? null : Number(initial.form.flow),
                existing:
                  Number(initial.form.existing) > 0
                    ? Number(initial.form.existing)
                    : null,
              },
            }
          : initialRequest(w.state)),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [application, setApplication] = useState(false),
    [warning, setWarning] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [viewVersion, setViewVersion] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null),
    root = useRef<HTMLElement>(null),
    progress = useRef(0),
    title = useRef<HTMLHeadingElement>(null);
  const item = w.state.selections.find((s) => s.id === selected),
    data = useMemo(
      () => fundingBusinessData(w.state, request.financials),
      [w.state, request.financials],
    ),
    history = selectionHistory(w.state.selections),
    stage = item ? 3 : step === 2 ? 2 : 1;
  const version =
      viewVersion && item?.versions?.find((v) => v.version === viewVersion),
    shown: Selection | undefined =
      item && version ? { ...item, ...version, id: item.id } : item;
  const hasRisk = item ? fundingWarningRequired(item) : false;
  useEffect(() => {
    w.cacheFinancingDraft({ tab, step, selected, request });
  }, [tab, step, selected, request]);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    root.current?.scrollTo({ top: 0 });
  }, [step, selected, tab, application]);
  const update = (patch: Partial<FundingRequest>) => {
    setRequest((r) => ({ ...r, ...patch }));
    setError("");
  };
  const reset = () => {
    setSelected(null);
    setStep(0);
    setTab("new");
    setRequest(initialRequest(w.state));
    setEditing(false);
    setApplication(false);
    setViewVersion(null);
    setError("");
    progress.current = 0;
  };
  const detailPurpose = (purpose: FundingRequest["purpose"]) => {
    const details: FundingRequest["details"] = {};
    if (purpose === "Рефинансирование") {
      const f = w.state.cabinet?.facility;
      if (f && f.quality !== "synthetic") {
        const next = f.events.find(
          (e) => e.status !== "paid" && e.date >= day(),
        );
        Object.assign(details, {
          currentBalance: f.balance,
          currentRate: f.rate,
          currentMonths: f.term,
          currentPayment: next
            ? next.principal + next.interest + next.fees
            : null,
          debtIncluded: "yes",
          recordSource: "Кредитный кабинет · " + f.name,
        });
      }
    }
    if (purpose === "Оборудование") {
      const model = w.state.documents.find(
        (d) => d.confirmed && d.category === "model" && d.currency === "RUB",
      );
      if (model && typeof model.fields.investment === "number")
        Object.assign(details, {
          purchaseCost: model.fields.investment,
          recordSource: model.name + " · прогноз",
        });
    }
    update({ purpose, details });
  };
  const validate = () => {
    const invalid = root.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], input:invalid',
    );
    if (invalid) {
      const disclosure = invalid.closest("details");
      if (disclosure) disclosure.open = true;
      invalid.focus();
      setError("Проверьте выделенные поля.");
      return false;
    }
    if (
      !Number.isFinite(request.amount) ||
      request.amount < 10000 ||
      request.amount > 1e12
    ) {
      setError("Укажите сумму от 10 000 до 1 000 000 000 000 ₽.");
      return false;
    }
    if (
      step > 0 &&
      request.needed === "date" &&
      (!request.neededDate ||
        !validDate(request.neededDate) ||
        request.neededDate < day())
    ) {
      setError(
        "Выберите существующую дату получения средств не раньше сегодня.",
      );
      return false;
    }
    for (const [key, v] of Object.entries(request.details))
      if (/Date$/.test(key) && v && !validDate(String(v))) {
        setError("Проверьте даты в уточнениях задачи: используйте ДД.ММ.ГГГГ.");
        return false;
      }
    return true;
  };
  async function calculate(
    input = request,
    parent: Selection | undefined = undefined,
  ) {
    if (busy || !validate()) return;
    setBusy(true);
    setError("");
    try {
      const normalized = {
        ...input,
        details: {
          ...input.details,
          ...(input.purpose === "Рефинансирование"
            ? {
                debtIncluded:
                  input.details.debtIncluded === "yes" ||
                  input.details.debtIncluded === true
                    ? true
                    : input.details.debtIncluded === "no" ||
                        input.details.debtIncluded === false
                      ? false
                      : null,
              }
            : {}),
        },
      };
      const result = await w.act("/selections", {
        engine: "mvp-2",
        input: normalized,
        ...(parent
          ? { parentId: parent.id, expectedVersion: parent.version }
          : {}),
      });
      setSelected(result.id);
      setViewVersion(null);
      setEditing(false);
      setApplication(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discuss(s: Selection) {
    try {
      const chat = await w.act("/chats", { selectionId: s.id });
      w.setActiveChatId(chat.id);
      w.setHistoryOpen(true);
      w.setDraft(
        `Объясни выбранный инструмент, расчёт и ограничения подбора, версия ${s.version}.`,
      );
      w.go("/chat");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function revise(s: Selection) {
    setRequest(requestFrom(s));
    setViewVersion(null);
    setEditing(true);
    setError("");
  }
  function apply() {
    setAcknowledged(false);
    if (hasRisk) setWarning(true);
    else setApplication(true);
  }
  const subProgress =
    step === 0
      ? 12
      : step === 1
        ? Math.round(
            ((request.needed === "date"
              ? 3 + (validDate(request.neededDate || "") ? 1 : 0)
              : 4) /
              4) *
              50,
          )
        : 70;
  progress.current = item ? 100 : Math.max(progress.current, subProgress);
  const actionFooter = (
    <div className="funding-form-actions">
      <Button
        secondary
        type="button"
        onClick={() => {
          setError("");
          setStep((s) => Math.max(0, s - 1));
        }}
      >
        <ArrowLeft size={16} /> Назад
      </Button>
      <Button disabled={busy}>
        {busy
          ? "Рассчитываем…"
          : step === 2
            ? "Рассчитать финансирование"
            : "Продолжить"}
        <ArrowRight size={16} />
      </Button>
    </div>
  );
  const parameters = (edit = false) => (
    <div className="funding-fields funding-parameters">
      {edit && (
        <Field label="Финансовый инструмент">
          <select
            aria-label="Финансовый инструмент"
            value={request.productId || item?.assessment?.selectedId || ""}
            onChange={(e) => update({ productId: e.target.value })}
          >
            {fundingCatalog.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <RangeField
        label="Запрашиваемая сумма"
        suffix="₽"
        value={request.amount}
        min={10000}
        max={50000000}
        inputMax={1e12}
        clampInput={false}
        step={10000}
        onChange={(amount) => update({ amount })}
        hint="Ползунок до 50 млн ₽. Большую потребность можно ввести вручную — не скрываем её за лимитами продуктов."
      />
      <div>
        <FundingChoices
          label="Желаемый срок"
          value={request.term === null ? "auto" : "manual"}
          options={[
            ["auto", "Подберите срок"],
            ["manual", "Укажу сам"],
          ]}
          onChange={(v) => update({ term: v === "auto" ? null : 36 })}
        />
        {request.term !== null && (
          <RangeField
            label="Срок финансирования"
            suffix="мес."
            value={request.term}
            min={1}
            max={120}
            clampInput={false}
            onChange={(term) => update({ term })}
          />
        )}
      </div>
      <FundingChoices
        label="Как будете использовать средства?"
        value={request.usage}
        options={[
          ["once", "Сразу"],
          ["parts", "Частями"],
          ["regular", "Регулярно"],
        ]}
        onChange={(usage) => update({ usage })}
      />
      {edit && request.productId === "overdraft" && (
        <RangeField
          label="Цикл возврата овердрафта"
          suffix="дн."
          value={request.cycleDays}
          min={1}
          max={90}
          clampInput={false}
          onChange={(cycleDays) =>
            update({
              cycleDays,
              details: { ...request.details, cycleManual: true },
            })
          }
          hint="Сценарная длительность одной задолженности, не срок кредитного лимита."
        />
      )}
    </div>
  );
  return (
    <main ref={root} className="financing-page page-wrap funding-mvp">
      <div className="funding-page-heading">
        <div>
          <span className="eyebrow">ОТ ЗАДАЧИ К РЕШЕНИЮ</span>
          <h1 ref={title} tabIndex={-1}>
            Подбор финансирования
          </h1>
          <p>Подходящий инструмент, понятная нагрузка и следующий шаг.</p>
        </div>
        <span className="funding-business-name">{w.state.profile.name}</span>
      </div>
      <div className="page-tabs">
        <button
          className={tab === "new" ? "active" : ""}
          onClick={() => setTab("new")}
        >
          <Plus size={16} /> Новый подбор
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <History size={16} /> История подборов <Badge>{history.length}</Badge>
        </button>
      </div>
      {error && !editing && (
        <p role="alert" className="funding-error">
          {error}
        </p>
      )}
      {tab === "history" ? (
        <section className="funding-surface">
          <div className="funding-section-title">
            <h2>Ваши финансовые задачи</h2>
            <Button secondary onClick={reset}>
              Новый подбор <Plus size={16} />
            </Button>
          </div>
          {history.length ? (
            history.map((s) => (
              <button
                key={s.id}
                className="funding-history-row"
                onClick={() => {
                  setSelected(s.id);
                  setViewVersion(null);
                  setApplication(false);
                  setTab("new");
                }}
              >
                <span className="funding-purpose-icon">
                  <WalletCards size={22} />
                </span>
                <span>
                  <b>{s.purpose}</b>
                  <small>
                    {date(s.createdAt)} · {s.product}
                  </small>
                </span>
                <span>
                  <b>{money(s.calculation.amount)}</b>
                  <small>
                    {s.calculation.term} мес. · Версия {s.version}
                  </small>
                </span>
                <Badge>
                  {w.state.leads.some(
                    (l) => l.selectionId === s.id && l.version === s.version,
                  )
                    ? "Демо-заявка создана"
                    : s.status}
                </Badge>
                <ArrowRight size={18} />
              </button>
            ))
          ) : (
            <div className="small-empty">
              <History size={32} />
              <h3>История начнётся с вашей задачи</h3>
              <p>Условия, версии и обсуждения сохранятся здесь.</p>
              <Button onClick={reset}>Начать подбор</Button>
            </div>
          )}
        </section>
      ) : application && item ? (
        <section className="funding-surface funding-application">
          <button className="text-button" onClick={() => setApplication(false)}>
            <ArrowLeft size={16} /> К результату
          </button>
          <Badge tone="red">Демонстрационное оформление</Badge>
          <h2>Проверьте заявление</h2>
          <p>Сохраним выбранные условия. В банк ничего не отправляется.</p>
          <dl>
            {[
              ["Компания", w.state.profile.name],
              ["Продукт", item.product],
              ["Цель", item.purpose],
              ["Сумма", money(item.calculation.amount)],
              ["Срок", item.calculation.term + " мес."],
              ["Ставка", "Уточняется банком"],
              ["Источник погашения", item.repayFrom],
              [
                "Использование",
                item.input?.usage === "parts"
                  ? "Частями"
                  : item.input?.usage === "regular"
                    ? "Регулярно"
                    : "Сразу",
              ],
              ["Версия условий", String(item.version)],
              ...(item.assessment?.cycleDays
                ? [["Цикл возврата", item.assessment.cycleDays + " дн."]]
                : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {w.state.leads.some(
            (l) => l.selectionId === item.id && l.version === item.version,
          ) ? (
            <div className="funding-success" role="status">
              <Check size={28} />
              <h3>Демо-заявка создана</h3>
              <p>
                Заявление версии {item.version} сохранено. Реальной подачи в
                банк не было.
              </p>
              <Button secondary onClick={() => setTab("history")}>
                К истории подборов <ArrowRight size={16} />
              </Button>
            </div>
          ) : (
            <>
              <p className="funding-source">
                Используем контакт из регистрации — повторно вводить телефон не
                нужно.
              </p>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await w.act(`/selections/${item.id}/application`, {
                      expectedVersion: item.version,
                      acknowledgeRisks: acknowledged,
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Сохраняем…" : "Отправить заявление"}
                <ArrowRight size={16} />
              </Button>
            </>
          )}
        </section>
      ) : item && shown ? (
        <>
          <div className="funding-result-toolbar">
            <button className="text-button" onClick={reset}>
              <Plus size={16} /> Новый запрос
            </button>
            <span>
              Версия {shown.version} · {date(item.updatedAt || item.createdAt)}
            </span>
          </div>
          <SelectionResult
            item={shown}
            onRevise={() => revise(item)}
            onDiscuss={() => void discuss(item)}
            onApply={apply}
            onDocuments={() => w.go("/profile")}
          />
          {viewVersion && viewVersion !== item.version && (
            <div className="funding-old-version">
              Открыта сохранённая версия {viewVersion}. Изменение, обсуждение и
              оформление используют последнюю версию {item.version}.{" "}
              <button
                className="text-button"
                onClick={() => setViewVersion(null)}
              >
                Открыть последнюю
              </button>
            </div>
          )}
          <details className="funding-surface funding-versions">
            <summary>
              История условий · {item.versions?.length || 1} версий
            </summary>
            {(
              item.versions || [
                {
                  version: item.version,
                  createdAt: item.createdAt,
                  calculation: item.calculation,
                  product: item.product,
                },
              ]
            ).map((v) => (
              <button
                key={v.version}
                aria-pressed={shown.version === v.version}
                onClick={() => setViewVersion(v.version)}
              >
                <span>
                  Версия {v.version} · {date(v.createdAt)}
                </span>
                <b>{v.product}</b>
                <span>
                  {money(v.calculation.amount)} · {v.calculation.term} мес.
                </span>
              </button>
            ))}
          </details>
        </>
      ) : (
        <section className="funding-surface funding-wizard">
          <div className="funding-step-label">
            <span>Шаг {stage} из 3</span>
            <small>
              {w.financingDraftStored
                ? "Черновик сохранён в этой вкладке"
                : "Черновик доступен в текущем сеансе"}
            </small>
          </div>
          <div
            className="funding-progress"
            role="progressbar"
            aria-label="Прогресс подбора"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.current}
          >
            <i style={{ width: progress.current + "%" }} />
          </div>
          <ol className="funding-stages">
            {["Финансовая задача", "Проверка бизнеса", "Результат"].map(
              (s, i) => (
                <li className={i < stage ? "active" : ""} key={s}>
                  <b>{i + 1}</b>
                  {s}
                </li>
              ),
            )}
          </ol>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!validate()) return;
              if (step < 2) setStep(step + 1);
              else void calculate();
            }}
          >
            {step === 0 ? (
              <>
                <h2>Для чего нужны деньги?</h2>
                <p>Выберите задачу — уточним только то, что важно для неё.</p>
                <div className="funding-purpose-grid">
                  {fundingPurposes.map((purpose, i) => {
                    const Icon = icons[i];
                    return (
                      <button
                        type="button"
                        key={purpose}
                        className={request.purpose === purpose ? "chosen" : ""}
                        aria-pressed={request.purpose === purpose}
                        onClick={() => detailPurpose(purpose)}
                      >
                        <span className="funding-purpose-icon">
                          <Icon size={22} />
                        </span>
                        <b>{purpose}</b>
                        <small>{hints[i]}</small>
                        <span className="funding-choice-check">
                          {request.purpose === purpose && <Check size={12} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Field label="Расскажите подробнее — необязательно">
                  <textarea
                    aria-label="Расскажите подробнее — необязательно"
                    maxLength={1000}
                    rows={2}
                    value={request.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Что хотите изменить в бизнесе?"
                  />
                </Field>
                <div className="funding-form-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      w.setDraft(
                        "Помоги уточнить задачу финансирования моего бизнеса.",
                      );
                      w.go("/chat");
                    }}
                  >
                    <MessageSquare size={16} /> Помощь агента
                  </button>
                  <Button>
                    Продолжить <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            ) : step === 1 ? (
              <>
                <h2>Сколько и когда?</h2>
                <p>
                  {request.purpose}. Срок и параметры можно будет изменить после
                  расчёта.
                </p>
                {parameters()}
                <div className="funding-fields">
                  <FundingChoices
                    label="Когда нужны средства?"
                    value={request.needed}
                    options={[
                      ["urgent", "Срочно"],
                      ["month", "До месяца"],
                      ["later", "Позже"],
                      ["date", "Выбрать дату"],
                    ]}
                    onChange={(needed) => update({ needed })}
                  />
                  {request.needed === "date" && (
                    <Field label="Дата получения средств">
                      <DateInput
                        aria-label="Дата получения средств"
                        min={day()}
                        max={addDays(day(), 3650)}
                        value={request.neededDate || ""}
                        aria-invalid={
                          !!request.neededDate &&
                          (!validDate(request.neededDate) ||
                            request.neededDate < day())
                        }
                        onValueChange={(neededDate) => update({ neededDate })}
                      />
                    </Field>
                  )}
                </div>
                <FundingDetails request={request} onChange={setRequest} />
                {actionFooter}
              </>
            ) : (
              <>
                <h2>Проверяем возможности бизнеса</h2>
                <p>
                  Известное уже подставлено. Неизвестное можно оставить пустым —
                  получите ориентировочный результат.
                </p>
                <div className="funding-profile">
                  <span className="funding-purpose-icon">
                    <FileCheck size={22} />
                  </span>
                  <div>
                    <b>{w.state.profile.name}</b>
                    <small>
                      {w.state.profile.form} · {w.state.profile.sector} ·{" "}
                      {w.state.profile.ageBand || "Возраст не указан"}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => w.go("/profile")}
                  >
                    Профиль и документы <ArrowRight size={15} />
                  </button>
                </div>
                <div className="funding-business-fields">
                  {(
                    [
                      "incoming",
                      "expenses",
                      "existing",
                      "available",
                    ] as FinancialKey[]
                  ).map((key) => {
                    const d = data.find((d) => d.key === key)!;
                    return (
                      <div key={key} className="funding-data-field">
                        <label htmlFor={"funding-" + key}>
                          {financialLabels[key]}, ₽
                        </label>
                        <Badge
                          tone={
                            d.conflict || d.stale
                              ? "red"
                              : d.value !== null
                                ? "green"
                                : "neutral"
                          }
                        >
                          {d.conflict || d.stale
                            ? "Нужно уточнить"
                            : d.value !== null
                              ? "Есть данные"
                              : "Нет данных"}
                        </Badge>
                        <NumericInput
                          id={"funding-" + key}
                          aria-label={financialLabels[key] + ", ₽"}
                          min={0}
                          max={1e12}
                          value={d.value === null ? "" : String(d.value)}
                          placeholder="Неизвестно"
                          onValueChange={(v) =>
                            update({
                              financials: {
                                ...request.financials,
                                [key]: v === "" ? null : Number(v),
                              },
                            })
                          }
                        />
                        <small>
                          {key === "available"
                            ? "Именно свободные деньги после ближайших обязательных расходов, не весь остаток счёта."
                            : d.source}
                          {d.value !== null && key !== "available"
                            ? " · " + d.period
                            : ""}
                        </small>
                      </div>
                    );
                  })}
                </div>
                {data.find((d) => d.key === "flow")?.value !== null && (
                  <p className="funding-net-flow">
                    Операционный поток:{" "}
                    <b>{money(data.find((d) => d.key === "flow")!.value)}</b>
                    <small>
                      Это не прибыль. Источник:{" "}
                      {data.find((d) => d.key === "flow")!.source}.
                    </small>
                  </p>
                )}
                <details className="funding-extra">
                  <summary>Ожидаемые изменения и источник погашения</summary>
                  <div className="funding-fields">
                    <Field label="Ожидаемое изменение потока в месяц, ₽">
                      <NumericInput
                        aria-label="Ожидаемое изменение потока в месяц, ₽"
                        signed
                        min={-1e12}
                        max={1e12}
                        value={String(request.financials.changes ?? "")}
                        onValueChange={(v) => {
                          if (v === "" || Number.isFinite(Number(v)))
                            update({
                              financials: {
                                ...request.financials,
                                changes: v === "" ? null : Number(v),
                              },
                            });
                        }}
                      />
                    </Field>
                    <Field label="Предполагаемый источник погашения">
                      <select
                        aria-label="Предполагаемый источник погашения"
                        value={request.repayFrom}
                        onChange={(e) => update({ repayFrom: e.target.value })}
                      >
                        {[
                          "Текущая деятельность",
                          "Доход нового проекта",
                          "Оплата по контракту",
                          "Нужно обсудить",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </details>
                <div className="funding-upload">
                  <Upload size={22} />
                  <div>
                    <b>Есть выписка или график?</b>
                    <p>
                      Загрузите нужный документ и подтвердите извлечённые
                      данные. Полный пакет не требуется.
                    </p>
                  </div>
                  <Button
                    type="button"
                    secondary
                    disabled={w.uploading}
                    onClick={() => file.current?.click()}
                  >
                    {w.uploading ? "Загружаем…" : "Добавить документ"}
                  </Button>
                  <input
                    hidden
                    ref={file}
                    type="file"
                    accept=".csv,.xlsx,.docx,.pdf"
                    onChange={(e) => {
                      if (e.target.files?.[0]) void w.upload(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                {actionFooter}
              </>
            )}
          </form>
        </section>
      )}
      {editing && item && (
        <Modal
          title="Изменить условия финансирования"
          wide
          onClose={() => setEditing(false)}
        >
          <form
            className="funding-edit-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const invalid = e.currentTarget.querySelector<HTMLElement>(
                '[aria-invalid="true"]',
              );
              if (invalid) {
                const disclosure = invalid.closest("details");
                if (disclosure) disclosure.open = true;
                invalid.focus();
                return;
              }
              void calculate(request, item);
            }}
          >
            <p>
              Создадим новую версию этого же подбора. Все инструменты доступны
              для сравнения; ограничения будут проверены заново.
            </p>
            {parameters(true)}
            {error && (
              <p className="funding-error" role="alert">
                {error}
              </p>
            )}
            {request.needed === "date" && (
              <Field label="Дата получения средств">
                <DateInput
                  aria-label="Дата получения средств"
                  min={day()}
                  max={addDays(day(), 3650)}
                  value={request.neededDate || ""}
                  aria-invalid={
                    !!request.neededDate &&
                    (!validDate(request.neededDate) ||
                      request.neededDate < day())
                  }
                  onValueChange={(neededDate) => update({ neededDate })}
                />
              </Field>
            )}
            <details className="funding-extra">
              <summary>Данные задачи и бизнеса</summary>
              <FundingDetails request={request} onChange={setRequest} />
              <div className="funding-fields">
                {(
                  [
                    "incoming",
                    "expenses",
                    "existing",
                    "available",
                  ] as FinancialKey[]
                ).map((key) => {
                  const d = data.find((d) => d.key === key)!;
                  return (
                    <Field label={financialLabels[key] + ", ₽"} key={key}>
                      <NumericInput
                        aria-label={financialLabels[key] + ", ₽"}
                        min={0}
                        max={1e12}
                        value={d.value === null ? "" : String(d.value)}
                        onValueChange={(v) =>
                          update({
                            financials: {
                              ...request.financials,
                              [key]: v === "" ? null : Number(v),
                            },
                          })
                        }
                      />
                    </Field>
                  );
                })}
              </div>
            </details>
            <div className="funding-form-actions">
              <Button secondary type="button" onClick={() => setEditing(false)}>
                Отмена
              </Button>
              <Button disabled={busy}>
                {busy ? "Пересчитываем…" : "Пересчитать и сохранить"}
                <RefreshCw size={16} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {warning && item && (
        <Modal
          title="Проверьте риски перед продолжением"
          onClose={() => setWarning(false)}
        >
          <div className="funding-risk-message">
            <AlertTriangle size={28} />
            <p>
              {item.assessment?.title}. Есть финансовые риски или несоответствия
              условиям продукта.
            </p>
          </div>
          <p>
            Это не означает гарантированный отказ банка. Можно продолжить только
            демонстрационное оформление — реальная заявка отправлена не будет.
          </p>
          <div className="funding-form-actions">
            <Button secondary onClick={() => setWarning(false)}>
              Вернуться
            </Button>
            <Button
              onClick={() => {
                setAcknowledged(true);
                setWarning(false);
                setApplication(true);
              }}
            >
              Понимаю, продолжить <ArrowRight size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
