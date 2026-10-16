import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Rocket,
  Check,
  ShieldCheck,
} from "lucide-react";
import { Brand, Button, Badge, Field } from "./ui";
import { api } from "./api";
import type { Profile } from "../shared/types";
export const sectors = [
  "Оптовая торговля",
  "Розничная торговля и маркетплейсы",
  "Строительство и недвижимость",
  "Производство",
  "Логистика и перевозки",
  "Услуги для бизнеса и маркетинг",
  "IT и технологии",
  "Общепит",
  "Автобизнес",
  "Образование и услуги населению",
  "Другое",
];
const base: Profile = {
  name: "Мой бизнес",
  stage: "",
  form: "ООО",
  sector: "",
  registered: true,
  ageBand: "",
  result: "",
  debt: "",
  intent: "",
};
type Question = {
  key: keyof Profile;
  title: string;
  hint: string;
  options: { value: string | boolean; label: string; sub?: string }[];
};
export function Onboarding({
  go,
  onAuth,
  login = false,
  demo,
}: {
  go: (p: string) => void;
  onAuth: () => Promise<void>;
  login?: boolean;
  demo: (k: string) => void;
}) {
  const [p, setP] = useState<Profile>(() => {
    try {
      return {
        ...base,
        ...JSON.parse(localStorage.getItem("alfa-onboarding") || "{}"),
      };
    } catch {
      return base;
    }
  });
  const [step, setStep] = useState(0),
    [auth, setAuth] = useState(login),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const options = (a: string[]) => a.map((v) => ({ value: v, label: v }));
  const questions: Question[] = [
    {
      key: "stage",
      title: "На каком этапе ваш бизнес?",
      hint: "Это поможет задать только те вопросы, которые вам подходят.",
      options: [
        {
          value: "operating",
          label: "Бизнес уже работает",
          sub: "Есть деятельность, поступления и расходы",
        },
        {
          value: "planning",
          label: "Планирую запуск бизнеса",
          sub: "От первой идеи до подготовки к открытию",
        },
      ],
    },
    ...(p.stage === "planning"
      ? [
          {
            key: "registered" as const,
            title: "Ваш бизнес уже зарегистрирован?",
            hint: "Если нет — регистрационные вопросы пропустим.",
            options: [
              { value: true, label: "Да, уже зарегистрирован" },
              { value: false, label: "Нет, пока это проект" },
            ],
          },
        ]
      : []),
    ...(p.registered || p.stage === "operating"
      ? [
          {
            key: "form" as const,
            title: "Как зарегистрирован ваш бизнес?",
            hint: "Форма бизнеса влияет на доступные инструменты.",
            options: options(["ИП", "ООО", "АО", "Другое"]),
          },
        ]
      : []),
    {
      key: "sector",
      title:
        p.stage === "planning"
          ? "В какой сфере планируете работать?"
          : "В какой сфере работает ваш бизнес?",
      hint: "Учтём особенности вашей отрасли.",
      options: options(sectors),
    },
    ...(p.stage === "planning"
      ? [
          {
            key: "preparation" as const,
            title: "На каком этапе подготовки проект?",
            hint: "Отличим идею от готового к запуску бизнеса.",
            options: options([
              "Пока только идея",
              "Разрабатываю бизнес-модель и рассчитываю расходы",
              "Готовлюсь к непосредственному запуску",
            ]),
          },
        ]
      : []),
    ...(p.registered || p.stage === "operating"
      ? [
          {
            key: "ageBand" as const,
            title:
              p.stage === "planning"
                ? "Как давно зарегистрирован бизнес?"
                : "Как давно работает ваш бизнес?",
            hint: "Сохраним ответ — повторно вводить не потребуется.",
            options: options(
              p.stage === "planning"
                ? ["Менее 3 месяцев", "3–12 месяцев", "Более года"]
                : [
                    "Менее года",
                    "1–3 года",
                    "3–5 лет",
                    "5–10 лет",
                    "Более 10 лет",
                  ],
            ),
          },
        ]
      : []),
    ...(p.stage === "operating"
      ? [
          {
            key: "result" as const,
            title: "Какой финансовый результат у бизнеса?",
            hint: "Это предварительная оценка с ваших слов, не бухгалтерская отчётность.",
            options: options([
              "Прибыль",
              "Примерно в ноль",
              "Убыток",
              "Пока нет выручки",
              "Затрудняюсь ответить",
            ]),
          },
          {
            key: "debt" as const,
            title: "Есть кредиты или другое заёмное финансирование?",
            hint: "Учтём обязательства при расчёте нагрузки.",
            options: options(["Да", "Нет", "Затрудняюсь ответить"]),
          },
        ]
      : []),
    {
      key: "intent",
      title: "С чего вы хотите начать?",
      hint: "Вы сможете изменить задачу в любой момент.",
      options: options(
        p.stage === "planning"
          ? [
              "Оценить затраты на запуск",
              "Узнать варианты финансирования",
              "Оценить экономику бизнес-идеи",
              "Пока изучаю возможности",
            ]
          : [
              "Подобрать финансирование",
              "Оценить финансовые возможности бизнеса",
              "Разобраться с действующим кредитом",
              "Пока изучаю возможности",
            ],
      ),
    },
  ];
  const q = questions[step];
  const update = (key: keyof Profile, value: unknown) => {
    const next = { ...p, [key]: value };
    if (key === "stage") {
      next.registered = true;
      next.intent = "";
      next.ageBand = "";
    }
    if (key === "registered" && value === false) {
      next.form = "Не зарегистрирован";
      next.ageBand = "";
    }
    if (
      key === "registered" &&
      value === true &&
      next.form === "Не зарегистрирован"
    )
      next.form = "ООО";
    setP(next);
    localStorage.setItem("alfa-onboarding", JSON.stringify(next));
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/" + (login ? "login" : "register"), {
        phone,
        password,
        ...(!login
          ? {
              profile: {
                ...p,
                name:
                  p.form === "Не зарегистрирован" ? "Мой проект" : "Мой бизнес",
                registered: p.stage === "operating" || p.registered,
              },
            }
          : {}),
      });
      localStorage.removeItem("alfa-onboarding");
      await onAuth();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <header className="public-header">
        <button className="unstyled" onClick={() => go("/")}>
          <Brand />
        </button>
        <span className="muted">
          {login ? "С возвращением" : "Знакомство с вашим бизнесом"}
        </span>
        <button
          className="text-button"
          onClick={() => go(login ? "/onboarding" : "/login")}
        >
          {login ? "Регистрация" : "Уже есть аккаунт? Войти"}{" "}
          <ArrowRight size={16} />
        </button>
      </header>
      <main className="onboard-grid">
        <section className="onboard-main">
          {!auth ? (
            <>
              <button
                className="text-button muted"
                onClick={() => (step ? setStep(step - 1) : go("/"))}
              >
                <ArrowLeft size={16} /> Назад
              </button>
              <div className="onboard-progress">
                <span>
                  Шаг {step + 1} из {questions.length}
                </span>
                <b>{Math.round(((step + 1) / questions.length) * 100)}%</b>
                <div>
                  <i
                    style={{
                      width: `${((step + 1) / questions.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <h1>{q.title}</h1>
              <p className="lead">{q.hint}</p>
              <div
                className={
                  "answer-grid " + (q.options.length > 6 ? "compact" : "")
                }
              >
                {q.options.map((o, i) => (
                  <button
                    key={String(o.value)}
                    className={
                      "answer " + (p[q.key] === o.value ? "selected" : "")
                    }
                    onClick={() => update(q.key, o.value)}
                  >
                    <span className="answer-icon">
                      {q.key === "stage" ? (
                        i === 0 ? (
                          <Building2 />
                        ) : (
                          <Rocket />
                        )
                      ) : (
                        <span>{String(i + 1).padStart(2, "0")}</span>
                      )}
                    </span>
                    <span>
                      <b>{o.label}</b>
                      {o.sub && <small>{o.sub}</small>}
                    </span>
                    <span className="radio">
                      {p[q.key] === o.value && <Check size={12} />}
                    </span>
                  </button>
                ))}
              </div>
              <Button
                className="continue"
                disabled={p[q.key] === undefined || p[q.key] === ""}
                onClick={() =>
                  step < questions.length - 1
                    ? setStep(step + 1)
                    : setAuth(true)
                }
              >
                Продолжить <ArrowRight size={18} />
              </Button>
            </>
          ) : (
            <>
              <Badge tone="red">
                {login ? "Личный кабинет" : "Последний шаг"}
              </Badge>
              <h1>
                {login
                  ? "Рады видеть вас снова"
                  : "Сохраните свой финансовый контекст"}
              </h1>
              <p className="lead">
                {login
                  ? "Войдите, чтобы продолжить работу с вашим бизнесом."
                  : "Анкета уже заполнена. Создайте аккаунт, чтобы ответы, документы и расчёты оставались с вами."}
              </p>
              <form onSubmit={submit} className="auth-form">
                <Field label="Номер телефона" hint="Формат: +7 999 123-45-67">
                  <input
                    autoComplete="tel"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 999 123-45-67"
                  />
                </Field>
                <Field
                  label="Пароль"
                  hint={login ? undefined : "Минимум 10 символов"}
                >
                  <input
                    type="password"
                    required
                    minLength={login ? 1 : 10}
                    maxLength={128}
                    autoComplete={login ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {error && (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                )}
                <p className="fine-print">
                  Упрощённая регистрация MVP без SMS. Телефон не подтверждён.
                  Это не банковская идентификация. Используйте синтетические
                  данные.
                </p>
                <Button disabled={busy}>
                  {busy ? "Сохраняем…" : login ? "Войти" : "Создать аккаунт"}{" "}
                  <ArrowRight size={18} />
                </Button>
                {!login && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAuth(false)}
                  >
                    <ArrowLeft size={15} /> Вернуться к анкете
                  </button>
                )}
              </form>
            </>
          )}
        </section>
        <aside className="onboard-aside">
          <div className="aside-mark">
            <SparkleMark />
          </div>
          <Badge tone="green">
            <ShieldCheck size={13} /> Всё начинается с понимания
          </Badge>
          <h2>
            Не просто сумма.
            <br />
            Решение для
            <br />
            <span>вашего бизнеса.</span>
          </h2>
          <div className="aside-points">
            {[
              "Вопросы по вашей стадии бизнеса",
              "Ответы сохранятся в профиле",
              "Документы можно добавить позже",
            ].map((t) => (
              <p key={t}>
                <Check size={17} />
                {t}
              </p>
            ))}
          </div>
          <div className="demo-switch">
            <small>Хотите сначала осмотреться?</small>
            <button onClick={() => demo("ooo")}>
              Демо ООО <ArrowUpRightMini />
            </button>
            <button onClick={() => demo("ip")}>
              Демо ИП <ArrowUpRightMini />
            </button>
            <button onClick={() => demo("idea")}>
              Демо проекта <ArrowUpRightMini />
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
function SparkleMark() {
  return (
    <svg viewBox="0 0 100 100" fill="none">
      <path
        d="M50 6 59 38 92 50 59 61 50 94 39 61 7 50 39 38Z"
        fill="currentColor"
      />
      <circle cx="80" cy="20" r="5" fill="currentColor" />
    </svg>
  );
}
function ArrowUpRightMini() {
  return <ArrowRight size={14} />;
}
