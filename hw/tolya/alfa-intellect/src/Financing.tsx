import { useState, useEffect } from "react";
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
  Download,
  ShieldCheck,
  SlidersHorizontal,
  History,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, Badge, Field, CalculationView, Modal, LineChart } from "./ui";
import { money, date } from "./api";
import type { Selection } from "../shared/types";
import type { FinancingForm } from "./financing-draft";
import { RangeField } from "./RangeField";
import { SelectionResult } from "./SelectionResult";
const purposes = [
  [
    "Оборотные средства",
    "Запасы, расчёты с поставщиками и текущие расходы",
    WalletCards,
  ],
  ["Оборудование", "Техника и производственные мощности", Factory],
  ["Развитие", "Новые направления и масштабирование", TrendingUp],
  [
    "Исполнение контракта",
    "Расходы до поступления оплаты от заказчика",
    FileCheck,
  ],
  ["Рефинансирование", "Изучить альтернативы действующему долгу", RefreshCw],
  ["Запуск", "Экономика проекта и варианты финансирования", Rocket],
] as const;
export function Financing() {
  const w = useWorkspace(),
    [tab, setTab] = useState<"new" | "history">(w.financingDraft.tab || "new"),
    [step, setStep] = useState(w.financingDraft.step ?? -1),
    [selected, setSelected] = useState<string | null>(
      w.financingDraft.selected ?? null,
    ),
    [parentId, setParentId] = useState<string | undefined>(
      w.financingDraft.parentId,
    ),
    [dossier, setDossier] = useState(false),
    [contact, setContact] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<FinancingForm>({
      purpose: "Оборудование",
      amount: 3000000,
      term: 36,
      repayFrom: "Текущая деятельность",
      ownFunds: 0,
      flow: w.state.financials.freeFlow ?? "",
      existing: w.state.financials.existing ?? 0,
      ...w.financingDraft.form,
    });
  useEffect(() => {
    w.cacheFinancingDraft({ tab, step, selected, parentId, form });
  }, [tab, step, selected, parentId, form]);
  useEffect(() => {
    if (w.state.financials.freeFlow !== undefined)
      setForm((f) =>
        f.flow === "" ? { ...f, flow: w.state.financials.freeFlow } : f,
      );
  }, [w.state.financials.freeFlow]);
  const item = w.state.selections.find((s) => s.id === selected),
    parent = w.state.selections.find((s) => s.id === item?.parentId);
  function reset() {
    setSelected(null);
    setStep(-1);
    setParentId(undefined);
    setTab("new");
    setForm({
      purpose: "Оборудование",
      amount: 3000000,
      term: 36,
      repayFrom: "Текущая деятельность",
      ownFunds: 0,
      flow: w.state.financials.freeFlow ?? "",
      existing: w.state.financials.existing ?? 0,
    });
  }
  async function calculate() {
    setBusy(true);
    try {
      const s = await w.act("/selections", {
        ...form,
        flow: form.flow === "" ? null : Number(form.flow),
        parentId,
      });
      setSelected(s.id);
      setStep(-1);
    } finally {
      setBusy(false);
    }
  }
  async function discuss(s: Selection) {
    const c = await w.act("/chats", { selectionId: s.id });
    w.setActiveChatId(c.id);
    w.setDraft(
      "Объясни выбранный инструмент, нагрузку и ограничения этого подбора.",
    );
    w.go("/chat");
  }
  function revise(s: Selection) {
    setParentId(s.id);
    setForm({
      purpose: s.purpose,
      amount: s.calculation.amount,
      term: s.calculation.term,
      repayFrom: s.repayFrom,
      ownFunds: s.ownFunds,
      flow: s.calculation.flow ?? "",
      existing: s.calculation.existing,
    });
    setSelected(null);
    setStep(1);
    setTab("new");
  }
  return (
    <main className="financing-page page-wrap">
      <div className="page-heading">
        <span className="eyebrow">ОТ ЗАДАЧИ К РЕШЕНИЮ</span>
        <h1>Подбор финансирования</h1>
        <p>
          Проверим параметры, оценим нагрузку и подготовим понятный следующий
          шаг.
        </p>
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
          <History size={16} /> История подборов{" "}
          <Badge>{w.state.selections.length}</Badge>
        </button>
      </div>
      {tab === "history" ? (
        <section className="panel history-panel">
          <div className="panel-title">
            <h2>Сохранённые расчёты</h2>
            <Button secondary onClick={reset}>
              Новый подбор <Plus size={16} />
            </Button>
          </div>
          {w.state.selections.length ? (
            w.state.selections.map((s) => (
              <button
                className="selection-row"
                key={s.id}
                onClick={() => {
                  setSelected(s.id);
                  setTab("new");
                }}
              >
                <span className="icon-tile red">
                  <WalletCards size={22} />
                </span>
                <div>
                  <b>{s.purpose}</b>
                  <small>
                    {date(s.createdAt)} · Версия {s.version}
                  </small>
                </div>
                <div>
                  <b>{money(s.calculation.amount)}</b>
                  <small>
                    {s.calculation.term} мес. · {s.calculation.rate}% демо
                  </small>
                </div>
                <Badge>{s.status}</Badge>
                <ArrowRight size={19} />
              </button>
            ))
          ) : (
            <div className="small-empty">
              <History size={35} />
              <h3>История начнётся с вашего запроса</h3>
              <p>Все расчёты и их версии будут сохранены здесь.</p>
              <Button onClick={reset}>Начать подбор</Button>
            </div>
          )}
        </section>
      ) : item ? (
        <>
          <div className="result-toolbar">
            <button className="text-button" onClick={reset}>
              <ArrowLeft size={16} /> Новый запрос
            </button>
            <Badge>
              Версия {item.version} · {date(item.createdAt)}
            </Badge>
          </div>
          <SelectionResult
            item={item}
            onRevise={() => revise(item)}
            onDiscuss={() => void discuss(item)}
            onApply={() => {
              setConfirmed(false);
              setDossier(true);
            }}
            onDocuments={() => w.go("/profile")}
          />
          {parent && (
            <section className="panel version-comparison">
              <h2>Что изменилось относительно версии {parent.version}</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Показатель</th>
                      <th>Версия {parent.version}</th>
                      <th>Версия {item.version}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        "Сумма",
                        parent.calculation.amount,
                        item.calculation.amount,
                      ],
                      [
                        "Платёж / месяц",
                        parent.calculation.monthlyPayment,
                        item.calculation.monthlyPayment,
                      ],
                      [
                        "Проценты по модели",
                        parent.calculation.interest,
                        item.calculation.interest,
                      ],
                    ].map(([label, a, b]) => (
                      <tr key={String(label)}>
                        <td>{label}</td>
                        <td>{money(Number(a))}</td>
                        <td>{money(Number(b))}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Срок</td>
                      <td>{parent.calculation.term} мес.</td>
                      <td>{item.calculation.term} мес.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : step < 0 ? (
        <>
          <section className="financing-intro panel">
            <div>
              <Badge tone="red">Под вашу задачу</Badge>
              <h2>
                У каждого плана
                <br />
                есть финансовая сторона.
              </h2>
              <p>
                Поможем подобрать инструмент и оценить, какой платёж бизнес
                сможет обслуживать. Известные данные уже сохранены — повторяться
                не придётся.
              </p>
              <div className="hero-actions">
                <Button onClick={() => setStep(0)}>
                  Начать подбор <ArrowRight size={18} />
                </Button>
                <button
                  className="text-button"
                  onClick={() => {
                    w.setDraft(
                      "Помоги уточнить задачу финансирования моего бизнеса.",
                    );
                    w.go("/chat");
                  }}
                >
                  <MessageSquare size={17} /> Задать вопрос в чате
                </button>
              </div>
            </div>
            <div className="finance-visual">
              <div className="finance-circle">
                <span className="circle-inner">
                  <WalletCards size={42} />
                </span>
              </div>
              <div className="float-label one">
                <Check size={14} /> Цель бизнеса
              </div>
              <div className="float-label two">
                <TrendingUp size={14} /> Посильный платёж
              </div>
              <div className="float-label three">
                <ShieldCheck size={14} /> Понятные условия
              </div>
            </div>
          </section>
          <div className="financing-benefits">
            {[
              [
                "Что вы получите",
                "Тип инструмента, ориентировочный платёж, график и ограничения.",
              ],
              [
                "Как это работает",
                "Цель → параметры → денежные показатели → расчёт.",
              ],
              [
                "Что учитываем",
                "Стадию бизнеса, собственные средства, текущие обязательства и источник возврата.",
              ],
            ].map(([t, p]) => (
              <article className="panel" key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="panel selection-wizard">
          <div className="draft-status" role="status">
            <span>
              {w.financingDraftStored
                ? "Черновик сохранён в этой вкладке — обновление страницы его не удалит."
                : "Черновик доступен до обновления страницы: хранилище вкладки недоступно."}
            </span>
            <button type="button" className="text-button" onClick={reset}>
              Сбросить черновик
            </button>
          </div>
          <div className="wizard-progress">
            {["Задача бизнеса", "Параметры", "Денежный контекст"].map(
              (t, i) => (
                <span className={i <= step ? "active" : ""} key={t}>
                  <b>{i < step ? <Check size={14} /> : i + 1}</b>
                  {t}
                </span>
              ),
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) setStep(step + 1);
              else void calculate();
            }}
          >
            {step === 0 ? (
              <>
                <h2>На что нужны деньги?</h2>
                <p className="muted">
                  Выберите основную цель — так проще подобрать тип инструмента.
                </p>
                <div className="purpose-grid">
                  {purposes.map(([value, hint, Icon]) => (
                    <button
                      type="button"
                      key={value}
                      className={
                        "purpose " + (form.purpose === value ? "selected" : "")
                      }
                      onClick={() => setForm({ ...form, purpose: value })}
                    >
                      <span className="icon-tile red">
                        <Icon size={23} />
                      </span>
                      <div>
                        <b>{value}</b>
                        <small>{hint}</small>
                      </div>
                      <span className="radio">
                        {form.purpose === value && <Check size={12} />}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : step === 1 ? (
              <>
                <h2>Выберите параметры кредита или займа</h2>
                <p className="muted">
                  Сумму и срок можно изменить после расчёта. Границы ниже
                  технические, не банковские лимиты.
                </p>
                <div className="form-grid">
                  <RangeField
                    label="Запрашиваемая сумма"
                    suffix="₽"
                    value={form.amount}
                    min={10000}
                    max={100000000}
                    step={10000}
                    onChange={(amount) => setForm({ ...form, amount })}
                  />
                  <RangeField
                    label="Срок кредита"
                    suffix="мес."
                    value={form.term}
                    min={1}
                    max={120}
                    onChange={(term) => setForm({ ...form, term })}
                  />
                  <Field label="Из чего будете возвращать">
                    <select
                      value={form.repayFrom}
                      onChange={(e) =>
                        setForm({ ...form, repayFrom: e.target.value })
                      }
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
                  <Field
                    label="Собственные средства, ₽"
                    hint="Показываются в досье отдельно. Запрашиваемая сумма не уменьшается автоматически."
                  >
                    <input
                      type="number"
                      min="0"
                      max="1000000000"
                      required
                      value={form.ownFunds}
                      onChange={(e) =>
                        setForm({ ...form, ownFunds: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <h2>Какую нагрузку может нести бизнес?</h2>
                <p className="muted">
                  Свободный поток — деньги после операционных расходов, до
                  кредитных платежей. Это не бухгалтерская прибыль.
                </p>
                <div className="form-grid">
                  <Field
                    label="Свободный денежный поток в месяц, ₽"
                    hint={
                      w.state.financials.freeFlow
                        ? "Предзаполнено из подтверждённых данных. Можно уточнить для этого сценария."
                        : "Если данных нет, оставьте пустым: точная посильная сумма не будет показана."
                    }
                  >
                    <input
                      type="number"
                      min="-1000000000"
                      max="1000000000"
                      value={String(form.flow)}
                      onChange={(e) =>
                        setForm({ ...form, flow: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Действующие кредитные платежи в месяц, ₽">
                    <input
                      type="number"
                      min="0"
                      max="1000000000"
                      required
                      value={String(form.existing)}
                      onChange={(e) =>
                        setForm({ ...form, existing: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="alert">
                  <FileCheck size={20} />
                  <span>
                    Документы необязательны для предварительного подбора. Можно{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => w.go("/profile")}
                    >
                      добавить их в профиль
                    </button>{" "}
                    для более надёжного контекста.
                  </span>
                </div>
              </>
            )}
            <div className="wizard-actions">
              <Button
                type="button"
                secondary
                onClick={() => (step ? setStep(step - 1) : reset())}
              >
                <ArrowLeft size={16} /> Назад
              </Button>
              <Button disabled={busy}>
                {busy
                  ? "Рассчитываем…"
                  : step === 2
                    ? "Рассчитать финансирование"
                    : "Продолжить"}{" "}
                <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        </section>
      )}
      {dossier && item && (
        <Modal
          title="Досье для демонстрационной заявки"
          onClose={() => setDossier(false)}
          wide
        >
          <Badge tone="red">
            Демонстрационный сценарий · в банк не отправляется
          </Badge>
          <div className="dossier-summary">
            <h3>{w.state.profile.name}</h3>
            <p>
              {item.purpose} · {money(item.calculation.amount)} ·{" "}
              {item.calculation.term} мес.
            </p>
            <p>
              Источник сведений:{" "}
              {w.state.profile.source || "Со слов пользователя"}. Подтверждённых
              документов: {w.state.documents.filter((d) => d.confirmed).length}.
            </p>
            <p>
              Условия и расчёт — синтетический каталог. Достоверность внешними
              реестрами не гарантируется.
            </p>
          </div>
          <a className="button secondary" href={"/api/dossier/" + item.id}>
            <Download size={16} /> Выгрузить досье JSON
          </a>
          {w.state.leads.some((l) => l.selectionId === item.id) ? (
            <div className="success-state">
              <Check size={26} />
              <h3>Демозаявка сохранена</h3>
              <p>
                Досье хранится локально. Реальных банковских действий не
                выполнено.
              </p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!confirmed) return;
                await w.act("/leads", { selectionId: item.id, phone: contact });
              }}
            >
              <Field label="Контактный телефон">
                <input
                  type="tel"
                  required
                  value={contact}
                  placeholder="+7 999 123-45-67"
                  onChange={(e) => setContact(e.target.value)}
                />
              </Field>
              <label className="checkbox-row">
                <input
                  required
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Я проверил досье и понимаю, что это локальная демонстрационная
                заявка.
              </label>
              <Button disabled={!confirmed}>
                Сохранить демозаявку <ArrowRight size={16} />
              </Button>
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}
