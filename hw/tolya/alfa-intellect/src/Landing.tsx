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
  Building2,
} from "lucide-react";
import { Brand, Button, Badge, SectionTitle } from "./ui";
import { useEffect, useRef } from "react";
import { LivePattern } from "./LivePattern";
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
          <button className="text-button" onClick={() => go("/demo")}>
            Демо
          </button>
        </nav>
        <button
          className="text-button public-mobile-demo"
          onClick={() => go("/demo")}
        >
          Демо
        </button>
        <Button secondary onClick={() => go("/login")}>
          Войти <ArrowUpRight size={16} />
        </Button>
      </header>
      <main>
        <section className="hero wrap hero-live-pattern">
          <div className="hero-copy">
            <Badge tone="red">
              <Sparkles size={13} /> Финансовый помощник вашего бизнеса
            </Badge>
            <h1>
              Большие планы.
              <br />
              Понятные <span>финансы.</span>
            </h1>
            <p>
              От подбора финансирования до последнего платежа — с вниманием к
              вашему бизнесу.
            </p>
            <div className="hero-actions">
              <Button onClick={() => go("/onboarding")}>
                Подобрать финансирование <ArrowRight size={19} />
              </Button>
              <button className="text-button" onClick={() => go("/demo")}>
                Посмотреть демо <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="hero-meta">
              <span>
                <Check size={15} /> Без банковских заявок
              </span>
              <span>
                <Clock3 size={15} /> Знакомство за 3 минуты
              </span>
            </div>
          </div>
          <LivePattern />
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
          <SectionTitle
            eyebrow="ОТ ПЕРВОГО ВОПРОСА ДО ПОГАШЕНИЯ"
            title="Финансирование, которое работает на бизнес"
          >
            Помогаем увидеть всю картину и принять взвешенное решение.
          </SectionTitle>
          <div className="feature-grid">
            <article className="feature-card wide-feature">
              <div>
                <span className="feature-number">01 / ПОДБОР</span>
                <h3>
                  Сначала ваша задача.
                  <br />
                  Потом — инструмент.
                </h3>
                <p>
                  Оборудование, оборотные средства или новый проект. Сравните
                  сумму, срок и платёж, прежде чем двигаться дальше.
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
                    Сумма <b>Под вашу задачу</b>
                  </span>
                  <span>
                    Срок <b>С учётом потока</b>
                  </span>
                </div>
              </div>
            </article>
            <article className="feature-card">
              <span className="feature-number">02 / ОБЪЯСНЕНИЯ</span>
              <MessagesSquare className="feature-big-icon" />
              <h3>
                Обсудите цифры.
                <br />
                Получите ясность.
              </h3>
              <p>
                Агент помнит контекст бизнеса. Под каждым расчётом — исходные
                данные, формулы и ограничения.
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
                Ближайший платёж, остаток долга и сценарий «Что, если?» — без
                перегруженных таблиц.
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
                Больше контекста.
                <br />
                Меньше повторений.
              </h3>
              <p>
                Загрузите документ один раз. Проверьте извлечённые показатели —
                они станут доступны в чате и подборе.
              </p>
            </article>
          </div>
        </section>
        <section id="how" className="how-section">
          <div className="wrap">
            <SectionTitle
              eyebrow="ПРОСТОЙ ПУТЬ"
              title="Три шага к понятному решению"
            />
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
                    {index === 0 ? (
                      <>
                        <Building2 size={32} />
                        <span className="journey-mini-line" />
                        <span className="journey-mini-line short" />
                        <span className="journey-check">
                          <Check size={15} />
                        </span>
                      </>
                    ) : index === 1 ? (
                      <>
                        <FileCheck2 size={32} />
                        <span className="journey-doc" />
                        <span className="journey-doc second" />
                        <span className="journey-check">
                          <Check size={15} />
                        </span>
                      </>
                    ) : (
                      <>
                        <ChartNoAxesCombined size={32} />
                        <span className="journey-bar" />
                        <span className="journey-bar second" />
                        <span className="journey-bar third" />
                        <span className="journey-check">
                          <ArrowUpRight size={15} />
                        </span>
                      </>
                    )}
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
          </div>
        </section>
        <section id="questions" className="section wrap faq">
          <SectionTitle eyebrow="ЕСТЬ ВОПРОСЫ?" title="Разберёмся вместе" />
          {[
            [
              "Это банковское одобрение?",
              "Нет. Продукт помогает предварительно оценить нагрузку и подготовить информацию. Решение о кредите принимает банк. Условия в текущем MVP демонстрационные.",
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
              "Анкета, профиль, обработка подготовленных документов, программные расчёты, подбор, демозаявка и кабинет. Для свободного диалога нужен серверный ключ LLM.",
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
          Хакатон · демонстрационный MVP
          <br />
          Не является офертой или банковской идентификацией.
        </p>
        <button className="text-button" onClick={() => go("/login")}>
          Войти в кабинет <ArrowUpRight size={15} />
        </button>
      </footer>
    </div>
  );
}
