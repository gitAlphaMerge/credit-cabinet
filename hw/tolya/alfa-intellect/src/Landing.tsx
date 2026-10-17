import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  WalletCards,
  ChartNoAxesCombined,
  MessagesSquare,
  FileCheck2,
  ChevronDown,
  Sparkles,
  TrendingUp,
  LockKeyhole,
  SlidersHorizontal,
  Clock3,
} from "lucide-react";
import { Brand, Button, Badge, LineChart, SectionTitle } from "./ui";
import { useEffect, useRef, useState } from "react";
export function Landing({ go }: { go: (s: string) => void }) {
  const root = useRef<HTMLDivElement>(null),
    [scenario, setScenario] = useState(0);
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
      ?.querySelectorAll(".section,.benefit-strip,.feature-card")
      .forEach((node) => {
        node.classList.add("reveal-section");
        observer.observe(node);
      });
    return () => observer.disconnect();
  }, []);
  return (
    <div className="landing" ref={root}>
      <header className="public-header">
        <a href="/" aria-label="Альфа-Интеллект">
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
        <Button secondary onClick={() => go("/login")}>
          Войти <ArrowUpRight size={16} />
        </Button>
      </header>
      <main>
        <section className="hero wrap">
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
          <div className="hero-visual" aria-label="Пример финансового расчёта">
            <div className="visual-orbit" />
            <div className="visual-chip top">
              <span className="icon-tile green">
                <TrendingUp size={19} />
              </span>
              <div>
                <small>Ваш следующий шаг</small>
                <b>Расти с запасом прочности</b>
              </div>
              <span className="pulse-dot" />
            </div>
            <div className="hero-finance-card">
              <div className="card-top">
                <span>
                  <span className="tiny-red" /> Финансовая перспектива
                </span>
                <Badge>Пример</Badge>
              </div>
              <div className="hero-chart-title">
                <div>
                  <small>Свободный поток после платежа</small>
                  <strong>
                    {scenario === 0 ? "+217 500" : "+109 000"} <span>₽</span>
                  </strong>
                </div>
                <span className="chart-arrow">
                  <ArrowUpRight />
                </span>
              </div>
              <LineChart
                description="Иллюстративный пример свободного денежного потока"
                values={
                  scenario === 0
                    ? [60, 78, 68, 96, 89, 130, 143, 135, 180, 197, 217]
                    : [60, 72, 65, 81, 70, 90, 82, 92, 98, 103, 109]
                }
                labels={["Сегодня", "Через 3 месяца", "Через 6 месяцев"]}
              />
              <div className="visual-card-bottom">
                <div>
                  <span className="legend green-dot" /> Достаточно для планов
                </div>
                <span>Синтетические данные</span>
              </div>
              <div
                className="segmented hero-scenarios"
                aria-label="Иллюстративный сценарий"
              >
                <button
                  className={scenario === 0 ? "active" : ""}
                  onClick={() => setScenario(0)}
                >
                  Базовый пример
                </button>
                <button
                  className={scenario === 1 ? "active" : ""}
                  onClick={() => setScenario(1)}
                >
                  Меньше поступлений
                </button>
              </div>
            </div>
            <div className="visual-chip bottom">
              <span className="icon-tile red">
                <ShieldCheck size={20} />
              </span>
              <div>
                <b>Каждый вывод можно проверить</b>
                <small>Данные → формула → понятное решение</small>
              </div>
              <Check size={16} />
            </div>
            <span className="visual-caption">
              Иллюстративный пример, не прогноз для вашего бизнеса
            </span>
          </div>
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
              ].map(([n, t, d]) => (
                <article key={n}>
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
