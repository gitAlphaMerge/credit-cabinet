import {
  ArrowRight,
  ArrowUpRight,
  Check,
  WalletCards,
  ChartNoAxesCombined,
  MessagesSquare,
  FileCheck2,
  ChevronDown,
  Sparkles,
  LockKeyhole,
  SlidersHorizontal,
  Clock3,
  Coins,
  Newspaper,
  BrainCircuit,
} from "lucide-react";
import { SideRail, SideRailItem } from "./SideRail";
import { Brand, Button, Badge, SectionTitle } from "./ui";
import { useEffect, useRef } from "react";
import { LivePattern } from "./LivePattern";
import { HeroFinance } from "./HeroFinance";
import { RestartJourney } from "./RestartJourney";
export function Landing({ go }: { go: (s: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    root.current
      ?.querySelectorAll(".section,.benefit-strip,.feature-card,.journey-step")
      .forEach((node) => {
        node.classList.add("reveal-section");
        observer.observe(node);
      });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="landing" ref={root}>
      <header className="public-header">
        <a href="/" aria-label="Умный кредитный кабинет — главная">
          <Brand />
        </a>
        <nav>
          <a href="#opportunities">Возможности</a>
          <a href="#how">Как это работает</a>
          <a href="#questions">Вопросы</a>
          <a href="/about" onClick={(e) => { e.preventDefault(); go("/about"); }}>О продукте</a>
        </nav>
        <div className="journey-header-tools">
          <SideRail>
            <SideRailItem tip="Начать сначала">
              <RestartJourney />
            </SideRailItem>
          </SideRail>
          <details className="landing-demo-menu">
            <summary>Демо <ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="landing-demo-options">
              <button type="button" onClick={() => go("/jury")}>Режим жюри</button>
              <button type="button" onClick={() => go("/login")}>Режим тестирования</button>
              <small>Пять тестовых компаний и менеджер банка. Данные входа на экране.</small>
            </div>
          </details>
          <Button secondary onClick={() => go("/login")}>Войти</Button>
          <Button onClick={() => go("/onboarding")}>
            Начать оформление <ArrowUpRight size={16} />
          </Button>
        </div>
      </header>
      <main>
        <section className="hero wrap hero-live-pattern">
          <div className="hero-copy">
            <div className="hero-kicker">Большие планы. Понятные финансы.</div>
            <h1 className="hero-title" aria-label="Умный кредитный кабинет">
              <span className="hero-word" aria-hidden="true">Умный</span>
              <span className="hero-word" aria-hidden="true">кредитный</span>
              <span className="hero-word hero-word-brand" aria-hidden="true">кабинет</span>
            </h1>
            <div className="hero-actions">
              <Button onClick={() => go("/onboarding")}>
                Подобрать финансирование <ArrowRight size={19} />
              </Button>
            </div>
          </div>
          <HeroFinance pattern={<LivePattern showCaption={false} />} />
        </section>
        <section className="benefit-strip wrap">
          {[
            [
              WalletCards,
              "Подходящий инструмент",
              "Под вашу задачу, сумму и сроки",
            ],
            [
              ChartNoAxesCombined,
              "Посильная нагрузка",
              "Прозрачный расчёт до решения",
            ],
            [
              MessagesSquare,
              "Контекст всегда рядом",
              "Обсуждайте бизнес в одном чате",
            ],
            [
              FileCheck2,
              "От данных к действию",
              "Документы и расчёты в одном месте",
            ],
          ].map(([Icon, title, text]: any) => (
            <div key={title}>
              <Icon size={24} />
              <b>{title}</b>
              <p>{text}</p>
            </div>
          ))}
        </section>
        <section id="opportunities" className="section wrap">
          <SectionTitle title="Финансирование, которое работает на бизнес">
            Помогаем увидеть всю картину и принять взвешенное решение. Кабинет
            считает, сколько бизнес может занять без риска для оборота,
            подбирает подходящий продукт и объясняет каждую цифру. Решение о
            кредите принимает банк.
          </SectionTitle>
          <div className="feature-grid">
            <article className="feature-card wide-feature">
              <div>
                <span className="feature-number">01 / ПОДБОР</span>
                <h3>
                  Сначала задача.
                  <br />
                  Потом продукт.
                </h3>
                <p>
                  Скажите, на что нужны деньги. Покажем сумму и срок, которые
                  выдержит ваш оборот.
                </p>
                <button
                  className="text-button"
                  onClick={() => go("/onboarding")}
                >
                  Проверить свои возможности <ArrowRight size={17} />
                </button>
              </div>
              <div className="comparison-mini">
                <div>
                  <span>Запрос бизнеса</span>
                  <b>Оборудование</b>
                  <SlidersHorizontal size={18} />
                </div>
                <div className="mini-bars">
                  <span style={{ height: 64 }} />
                  <span style={{ height: 90 }} />
                  <span style={{ height: 120 }} />
                  <span style={{ height: 148 }} />
                  <span style={{ height: 170 }} />
                </div>
                <div className="mini-metrics">
                  <span>
                    Сумма <b>По вашей задаче</b>
                  </span>
                  <span>
                    Срок <b>По вашим поступлениям</b>
                  </span>
                </div>
              </div>
            </article>
            <article className="feature-card">
              <span className="feature-number">02 / ОБЪЯСНЕНИЯ</span>
              <MessagesSquare className="feature-big-icon" />
              <h3>
                Спросите про любую
                <br />
                цифру.
              </h3>
              <p>
                Агент в чате объяснит, откуда взялась сумма или отказ, и
                покажет, какие данные на это повлияли.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-number">03 / СОПРОВОЖДЕНИЕ</span>
              <div className="payment-preview">
                <div className="payment-ring">
                  <WalletCards size={27} />
                </div>
                <Badge tone="green">Всё по графику</Badge>
              </div>
              <h3>Платежи под контролем.</h3>
              <p>
                Видно ближайший платёж и остаток долга. Можно проверить, что
                будет, если выручка упадёт.
              </p>
            </article>
            <article className="feature-card soft-feature">
              <span className="feature-number">04 / ДОКУМЕНТЫ</span>
              <div className="files-preview">
                {["Выписка", "Финансовая модель", "Бизнес-план"].map((t) => (
                  <div key={t}>
                    <FileCheck2 size={18} />
                    {t}
                    <Check size={15} />
                  </div>
                ))}
              </div>
              <h3>
                Документы
                <br />
                один раз.
              </h3>
              <p>
                Загрузите выписку или отчёт. Кабинет достанет нужные цифры, вы
                их проверите, и они пригодятся в чате и подборе.
              </p>
            </article>
          </div>
        </section>
        <section id="how" className="how-section">
          <div className="wrap">
            <SectionTitle title="Три шага к понятному решению" />
            <div className="steps-grid">
              {[
                [
                  "01",
                  "Расскажите о бизнесе",
                  "Короткая анкета поможет понять вашу стадию, отрасль и задачу.",
                ],
                [
                  "02",
                  "Добавьте контекст",
                  "При необходимости загрузите документы или укажите денежные показатели.",
                ],
                [
                  "03",
                  "Сравните и решите",
                  "Изучите расчёт, обсудите альтернативы и подготовьте досье.",
                ],
              ].map(([n, t, d], index) => (
                <article
                  className="journey-step"
                  key={n}
                  style={{ transitionDelay: `${index * 140}ms` }}
                >
                  <div
                    className={"journey-illustration journey-" + n}
                    aria-hidden="true"
                  >
                    <JourneyScene step={index} />
                  </div>
                  <span className="step-number">{n}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="trust-section wrap">
          <div>
            <LockKeyhole size={30} />
            <h2>
              Ваши решения.
              <br />
              Ваш контроль.
            </h2>
          </div>
          <div>
            <p>
              Вы подтверждаете данные и действия. Расчёты отделены от объяснений
              ИИ, источники видны, а решение о выдаче кредита всегда принимает
              банк.
            </p>
            <p className="trust-open">
              Для жюри открыт контракт API: каждый расчёт можно повторить
              запросом и сверить с тем, что показывает кабинет.
            </p>
            <div className="trust-tags">
              <Badge>
                <Check size={13} /> Прозрачные формулы
              </Badge>
              <Badge>
                <Check size={13} /> Контроль данных
              </Badge>
              <Badge>
                <Check size={13} /> Без скрытых действий
              </Badge>
            </div>
            <a
              className="text-button trust-api"
              href="https://github.com/gitAlphaMerge/credit-cabinet/blob/main/docs/openapi.yaml"
              target="_blank"
              rel="noopener noreferrer"
            >
              Открытый API для жюри <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
        <section id="questions" className="section wrap faq">
          <SectionTitle eyebrow="ЕСТЬ ВОПРОСЫ?" title="Разберёмся вместе" />
          {[
            [
              "Это банковское одобрение?",
              "Нет. Продукт помогает предварительно оценить нагрузку и подготовить информацию. Решение о кредите принимает банк.",
            ],
            [
              "Нужно сразу загружать документы?",
              "Можно начать с анкеты и общения. При нехватке данных расчёт покажет ограничения и предложит добавить сведения.",
            ],
            [
              "Подходит ли сервис для ИП и нового бизнеса?",
              "Да. Онбординг учитывает ИП, организации и проекты без регистрации. Для нового бизнеса используются прогнозные данные с явной пометкой.",
            ],
            [
              "Что доступно без подключения ИИ?",
              "Подбор продукта, заполнение заявки, анализ выписок CSV и проверка условий. После решения банка можно пройти договор, подпись и получение средств.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={20} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section id="roadmap" className="section wrap roadmap">
          <SectionTitle
            eyebrow="НОВЫЕ РАЗРАБОТКИ"
            title="Что появится в кабинете"
          />
          <div className="roadmap-grid">
            {[
              [
                Coins,
                "ЦФА для бизнеса",
                "Привлечение денег через выпуск цифровых финансовых активов: кабинет подскажет, когда это выгоднее кредита.",
              ],
              [
                Newspaper,
                "Пульс",
                "Лента новостей, ставок и изменений в законах, которые касаются именно вашей отрасли и ваших платежей.",
              ],
              [
                BrainCircuit,
                "Агент Омега",
                "Альфа отвечает быстро, Омега думает глубже: финансовая модель, сценарии и долгие задачи бизнеса.",
              ],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Coins;
              return (
                <article className="roadmap-card" key={title as string}>
                  <span className="roadmap-icon">
                    <I size={22} aria-hidden="true" />
                  </span>
                  <Badge>В разработке</Badge>
                  <h3>{title as string}</h3>
                  <p>{text as string}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="final-cta wrap">
          <div>
            <span className="eyebrow">СЛЕДУЮЩИЙ ШАГ — ЗА ВАМИ</span>
            <h2>
              Дайте вашим планам
              <br />
              финансовую опору.
            </h2>
            <p>Начните с нескольких вопросов о бизнесе.</p>
          </div>
          <Button onClick={() => go("/onboarding")}>
            Начать знакомство <ArrowRight size={20} />
          </Button>
        </section>
      </main>
      <footer className="public-footer wrap">
        <Brand />
        <p>
          Иллюстративные данные, не предложение банка. Решение принимает банк
        </p>
        <button className="text-button" onClick={() => go("/onboarding")}>
          Начать оформление <ArrowUpRight size={15} />
        </button>
        <p className="footer-authors">
          Сделали для Альфа-Хака 2026: Саша, капитан: агент, контракты, дизайн ·
          Толя, продакт: кабинет, заявка, подбор, дизайн · Лиза, инженер: ядро и
          скоркарта · Артём, разработчик: API, хранилище, контейнеры · Тоня,
          исследователь: концепт, кастдев, тексты и питч.
        </p>
      </footer>
    </div>
  );
}

// Сцены трёх шагов в духе живого узора: красный — бизнес, синий — данные, зелёный только «готово».
function JourneyScene({ step }: { step: number }) {
  const red = "var(--theme-red)",
    blue = "var(--theme-chart-primary)";
  return (
    <svg className="journey-scene" viewBox="0 0 320 160" role="presentation">
      <path d="M260 0a60 60 0 0 1 60 60V0z" fill={blue} opacity="0.14" />
      <circle cx="28" cy="140" r="34" fill={red} opacity="0.08" />
      {step === 0 ? (
        <g>
          <circle cx="232" cy="52" r="26" fill={blue} opacity="0.85" />
          <path d="M70 70 140 22l70 48z" fill={red} />
          <rect x="82" y="70" width="116" height="78" rx="6" fill={red} />
          {[0, 1, 2].map((c) =>
            [0, 1].map((r) => (
              <rect
                key={c + "-" + r}
                x={96 + c * 32}
                y={82 + r * 24}
                width="20"
                height="14"
                rx="3"
                fill="var(--theme-surface)"
                opacity="0.92"
              />
            )),
          )}
          <rect x="128" y="128" width="24" height="20" rx="3" fill="var(--theme-surface)" />
          <rect
            x="40"
            y="148"
            width="240"
            height="4"
            rx="2"
            fill="currentColor"
            opacity="0.2"
          />
        </g>
      ) : step === 1 ? (
        <g>
          <rect
            x="118"
            y="28"
            width="104"
            height="124"
            rx="10"
            fill={blue}
            opacity="0.18"
          />
          <rect
            x="96"
            y="16"
            width="104"
            height="124"
            rx="10"
            fill="var(--theme-surface)"
            stroke={blue}
            strokeWidth="2"
          />
          <rect x="112" y="36" width="56" height="8" rx="4" fill={red} />
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x="112"
              y={56 + i * 16}
              width={72 - (i % 2) * 22}
              height="6"
              rx="3"
              fill={blue}
              opacity="0.35"
            />
          ))}
          <circle cx="214" cy="122" r="22" fill={blue} />
          <path
            d="M204 122l7 7 13-14"
            fill="none"
            stroke="var(--theme-surface)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M40 40a28 28 0 0 1 28 28H40z" fill={red} />
        </g>
      ) : (
        <g>
          {[46, 70, 96, 122].map((h, i) => (
            <rect
              key={i}
              x={70 + i * 42}
              y={148 - h}
              width="28"
              height={h}
              rx="6"
              fill={i === 3 ? red : blue}
              opacity={i === 3 ? 1 : 0.3 + i * 0.2}
            />
          ))}
          <path
            d="M66 96 112 72l42 10 60-50"
            fill="none"
            stroke={red}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="250" cy="28" r="16" fill="var(--theme-green)" />
          <path
            d="M243 28l5 5 9-10"
            fill="none"
            stroke="var(--theme-surface)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}
