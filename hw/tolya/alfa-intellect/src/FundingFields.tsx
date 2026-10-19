import { Field } from "./ui";
import { NumericInput } from "./NumericInput";
import { DateInput } from "./DateInput";
import { day, addDays, validDate } from "../shared/cabinet";
import type { FundingRequest } from "../shared/financing";

export function FundingChoices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="funding-choice-field">
      <span>{label}</span>
      <div className="funding-choices" role="group" aria-label={label}>
        {options.map(([v, t]) => (
          <button
            type="button"
            key={v}
            aria-pressed={v === value}
            onClick={() => onChange(v)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
export function FundingDetails({
  request,
  onChange,
}: {
  request: FundingRequest;
  onChange: (r: FundingRequest) => void;
}) {
  const d = request.details,
    set = (key: string, value: string | number | boolean | null) =>
      onChange({ ...request, details: { ...d, [key]: value } }),
    money = (key: string, label: string, unit = "₽", signed = false) => (
      <Field label={label}>
        <NumericInput
          aria-label={label}
          value={typeof d[key] === "number" ? String(d[key]) : ""}
          signed={signed}
          unit={unit}
          decimals={unit === "мес." ? 0 : 2}
          min={signed ? undefined : unit === "мес." ? 1 : 0}
          max={unit === "%" ? 100 : unit === "мес." ? 120 : 1e12}
          placeholder="Если известно"
          onValueChange={(v) => {
            if (v === "") set(key, null);
            else if (Number.isFinite(Number(v))) set(key, Number(v));
          }}
        />
      </Field>
    ),
    date = (key: string, label: string) => (
      <Field label={label}>
        <DateInput
          aria-label={label}
          min={addDays(day(), -365)}
          max={addDays(day(), 3650)}
          value={String(d[key] || "")}
          aria-invalid={
            !!d[key] &&
            (!validDate(String(d[key])) ||
              String(d[key]) < addDays(day(), -365) ||
              String(d[key]) > addDays(day(), 3650))
          }
          onValueChange={(v) => set(key, v)}
        />
      </Field>
    ),
    choice = (
      key: string,
      label: string,
      options: readonly (readonly [string, string])[],
    ) => (
      <FundingChoices
        label={label}
        value={
          key === "debtIncluded"
            ? d[key] === true
              ? "yes"
              : d[key] === false
                ? "no"
                : String(d[key] || "")
            : String(d[key] || "")
        }
        options={options}
        onChange={(v) => set(key, v)}
      />
    );
  return (
    <div className="funding-branch" key={request.purpose}>
      <div className="funding-section-title">
        <h3>Уточним вашу задачу</h3>
        <small>Можно пропустить неизвестное</small>
      </div>
      {d.recordSource && (
        <p className="funding-source">
          Предзаполнено: {String(d.recordSource)}. Параметры можно исправить.
        </p>
      )}
      <div className="funding-fields">
        {["Оборотные средства", "Закупка товаров и материалов"].includes(
          request.purpose,
        ) && (
          <>
            {choice("frequency", "Как часто нужны закупки?", [
              ["once", "Разовая закупка"],
              ["monthly", "Каждый месяц"],
              ["seasonal", "Сезонно"],
            ])}
            {date("receiptsDate", "Когда ожидаются поступления?")}
          </>
        )}
        {request.purpose === "Оборудование" && (
          <>
            {money("purchaseCost", "Стоимость оборудования или транспорта")}
            {money(
              "effect",
              "Дополнительный доход или экономия в месяц",
              "₽",
              true,
            )}
          </>
        )}
        {["Развитие", "Запуск"].includes(request.purpose) && (
          <>
            {money("projectCost", "Разовые затраты проекта")}
            {date("receiptsDate", "Когда начнутся поступления?")}
            {money("ownFunds", "Собственные средства на этот проект")}
          </>
        )}
        {request.purpose === "Кассовый разрыв" && (
          <>
            {date("expenseDate", "Дата обязательного расхода")}
            {date("receiptsDate", "Дата ожидаемого поступления")}
            {choice("confidence", "Насколько определённо поступление?", [
              ["confirmed", "Подтверждено"],
              ["likely", "Ожидается"],
              ["uncertain", "Под вопросом"],
            ])}
          </>
        )}
        {request.purpose === "Исполнение контракта" && (
          <>
            {money("contractAmount", "Сумма контракта")}
            {money("contractCosts", "Расходы на исполнение")}
            {date("receiptsDate", "Когда заказчик оплатит контракт?")}
          </>
        )}
        {request.purpose === "Рефинансирование" && (
          <>
            {money("currentBalance", "Остаток рефинансируемого долга")}
            {money("currentRate", "Текущая годовая ставка", "%")}
            {money("currentPayment", "Текущий платёж в месяц")}
            {money("currentMonths", "Оставшийся срок текущего кредита", "мес.")}
            {choice(
              "debtIncluded",
              "Этот платёж включён в действующие обязательства?",
              [
                ["yes", "Да"],
                ["no", "Нет"],
                ["unknown", "Не уверен"],
              ],
            )}
          </>
        )}
        {request.purpose === "Другая цель" && (
          <Field label="Что поможет решить финансирование?">
            <input
              aria-label="Что поможет решить финансирование?"
              maxLength={400}
              value={String(d.other || "")}
              onChange={(e) => set("other", e.target.value)}
              placeholder="Коротко опишите ожидаемый результат"
            />
          </Field>
        )}
      </div>
    </div>
  );
}
