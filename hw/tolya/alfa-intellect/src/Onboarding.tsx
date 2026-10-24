import { useRef, useState } from "react";
import { Illustration } from "./Illustration";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Rocket,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { Brand, Button, Badge, Field } from "./ui";
import { api } from "./api";
import type { Profile } from "../shared/types";
import { PhoneInput, normalizePhone } from "./phone";
import { Preparation } from "./Preparation";
import { PREPARATION_KEY, readPreparation } from "./preparation-state";
import { MvpOnboarding } from "./Mvp2";
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
}: {
  go: (p: string) => void;
  onAuth: () => Promise<void>;
  login?: boolean;
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
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState<number | null>(() => {
      try {
        return login ? null : readPreparation(sessionStorage);
      } catch {
        return null;
      }
    }),
    [showPassword, setShowPassword] = useState(false),
    [touched, setTouched] = useState({ phone: false, password: false });
  const branches = useRef<Record<string, Partial<Profile>>>({ [p.stage]: p });
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
  const groups = [
    ["stage"],
    p.stage === "planning"
      ? ["registered", "form", "sector", "preparation"]
      : ["form", "sector", "ageBand"],
    p.stage === "planning"
      ? ["ageBand", "intent"]
      : ["result", "debt", "intent"],
  ];
  const currentQuestions = questions.filter((q) =>
    groups[step].includes(q.key),
  );
  const valid = currentQuestions.every(
    (q) => p[q.key] !== undefined && p[q.key] !== "",
  );
  const titles =
    step === 0
      ? [
          "На каком этапе ваш бизнес?",
          "Зададим только вопросы, которые подходят вашей ситуации.",
        ]
      : step === 1
        ? [
            p.stage === "planning"
              ? "Подготовка к запуску"
              : "Расскажите о бизнесе",
            "Основные сведения сохранятся в профиле.",
          ]
        : [
            p.stage === "planning"
              ? "С чего начнём?"
              : "Финансовая ситуация и задача",
            "Это предварительные ответы с ваших слов. Документы можно добавить позже.",
          ];
  const phoneError =
    touched.phone && !normalizePhone(phone)
      ? "Введите номер полностью: +7 и 10 цифр."
      : "";
  const passwordError =
    touched.password && password.length < (login ? 1 : 8)
      ? login
        ? "Введите пароль."
        : "Пароль должен содержать не менее 8 символов."
      : "";
  const update = (key: keyof Profile, value: unknown) => {
    let next = { ...p, [key]: value };
    if (key === "stage") {
      branches.current[p.stage] = p;
      next = {
        ...base,
        ...branches.current[String(value)],
        stage: String(value),
      };
      if (value === "operating") next.registered = true;
    }
    if (
      key === "registered" &&
      value === true &&
      next.form === "Не зарегистрирован"
    )
      next.form = "ООО";
    setP(next);
    try {
      localStorage.setItem("alfa-onboarding", JSON.stringify(next));
    } catch {}
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || preparing) return;
    setTouched({ phone: true, password: true });
    if (!normalizePhone(phone) || password.length < (login ? 1 : 8)) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/" + (login ? "login" : "register"), {
        phone: normalizePhone(phone),
        password,
        ...(!login
          ? {
              profile: {
                ...p,
                name:
                  p.form === "Не зарегистрирован" ? "Мой проект" : "Мой бизнес",
                registered: p.stage === "operating" || p.registered,
                ...(!p.registered && p.stage === "planning"
                  ? {
                      form: "Не зарегистрирован",
                      ageBand: "",
                      name: "Мой проект",
                    }
                  : {}),
              },
            }
          : {}),
      });
      try {
        localStorage.removeItem("alfa-onboarding");
      } catch {}
      if (login) {
        try {
          sessionStorage.removeItem(PREPARATION_KEY);
        } catch {}
        await onAuth();
      } else {
        const start = Date.now();
        try {
          sessionStorage.setItem(PREPARATION_KEY, String(start));
        } catch {}
        setPreparing(start);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!login && !auth && !preparing)
    return <MvpOnboarding initial={p.mvp2Answers} go={go} onDone={answers => {
      setP({...base, stage:"operating", sector:answers.industry, ageBand:answers.age, intent:"Подобрать финансирование", result:"Не указан", debt:"Не уверен", mvp2Answers:answers});
      setAuth(true);
    }} />;
  if (preparing)
    return (
      <Preparation
        startedAt={preparing}
        onComplete={async () => {
          await onAuth();
          try {
            sessionStorage.removeItem(PREPARATION_KEY);
          } catch {}
        }}
      />
    );
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
                  Экран {step + 1} из {groups.length}
                </span>
                <b>{Math.round(((step + 1) / groups.length) * 100)}%</b>
                <div>
                  <i
                    style={{
                      width: `${((step + 1) / groups.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <Illustration group="docs" name="questionnaire" size={48} decorative />
              <h1>{titles[0]}</h1>
              <p className="lead">{titles[1]}</p>
              <div className="onboarding-fields">
                {currentQuestions.map((q) => (
                  <fieldset
                    key={q.key}
                    className={"question-group question-" + q.key}
                  >
                    <legend>
                      {q.key === "stage" ? "Выберите вашу ситуацию" : q.title}
                    </legend>
                    {q.key === "sector" ? (
                      <select
                        aria-label={q.title}
                        value={p.sector}
                        onChange={(e) => update(q.key, e.target.value)}
                      >
                        <option value="" disabled>
                          Выберите сферу
                        </option>
                        {q.options.map((o) => (
                          <option key={String(o.value)} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div
                        className="answer-grid"
                        role="radiogroup"
                        aria-label={q.title}
                      >
                        {q.options.map((o, i) => (
                          <label
                            className={
                              "answer " +
                              (p[q.key] === o.value ? "selected" : "")
                            }
                            key={String(o.value)}
                          >
                            <input
                              className="visually-hidden"
                              type="radio"
                              name={q.key}
                              checked={p[q.key] === o.value}
                              onChange={() => update(q.key, o.value)}
                            />
                            {q.key === "stage" && (
                              <span className="stage-symbol">
                                {i === 0 ? <Building2 /> : <Rocket />}
                              </span>
                            )}
                            <span>
                              <b>{o.label}</b>
                              {o.sub && <small>{o.sub}</small>}
                            </span>
                            <span className="radio">
                              {p[q.key] === o.value && <Check size={12} />}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                ))}
              </div>
              <Button
                className="continue"
                disabled={!valid}
                onClick={() =>
                  step < groups.length - 1 ? setStep(step + 1) : setAuth(true)
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
              <h1>{login ? "Вход в Альфа-Интеллект" : "Создайте аккаунт"}</h1>
              <p className="lead">
                {login
                  ? "Войдите, чтобы продолжить работу с вашим бизнесом."
                  : "Анкета уже заполнена. Создайте аккаунт, чтобы ответы, документы и расчёты оставались с вами."}
              </p>
              <form noValidate onSubmit={submit} className="auth-form">
                <label className="field">
                  <span>Номер телефона</span>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    onBlur={() => setTouched({ ...touched, phone: true })}
                    invalid={!!phoneError}
                    errorId={phoneError ? "phone-error" : undefined}
                  />
                </label>
                {phoneError && (
                  <small id="phone-error" className="field-error" role="alert">
                    {phoneError}
                  </small>
                )}
                <div className="field">
                  <label htmlFor="auth-password">Пароль</label>
                  <div className="password-input">
                    <input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      maxLength={128}
                      autoComplete={login ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched({ ...touched, password: true })}
                      aria-invalid={!!passwordError}
                      aria-describedby={
                        passwordError ? "password-error" : undefined
                      }
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Скрыть пароль" : "Показать пароль"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {passwordError && (
                  <small
                    id="password-error"
                    className="field-error"
                    role="alert"
                  >
                    {passwordError}
                  </small>
                )}
                {error && (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                )}
                <p className="fine-print">
                  Телефон пока не подтверждается по SMS. Аккаунт не является
                  банковской идентификацией.
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
