import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Brand, Button } from "./ui";
import { SideRail } from "./SideRail";
import "./about.css";

type Member = {
  name: string;
  role: string;
  school: string;
  built: string;
  photo?: string;
  cv?: string;
};

// Вуз Артёма: резюме от 16.09 (ростер case-champion). Подпись «колледж» оставлена как в резюме.
const TEAM: Member[] = [
  {
    name: "Саша",
    role: "Капитан",
    school: "Финансовый университет · 3 курс · управление рисками и страхованием",
    built: "Агент, контракты, золотые сценарии, дизайн и выкатка",
    photo: "/team/sasha.jpg",
    cv: "/team/cv/sasha.pdf",
  },
  {
    name: "Лиза",
    role: "Ядро скоринга",
    school: "НИУ ВШЭ · 3 курс · прикладное машинное обучение (ПМО)",
    built: "Ядро, ступеньки, скоркарта, пороги и коды причин",
    photo: "/team/liza.jpg",
  },
  {
    name: "Толя",
    role: "Кабинет и продукт",
    school: "Финансовый университет · 3 курс · управление финансовыми рисками",
    built:
      "Кабинет alfa-intellect, концепт, инструменты, логика скоркарты, документы, финмодель",
    photo: "/team/tolya.jpg",
  },
  {
    name: "Артём",
    role: "Бэкенд",
    school: "МГУТУ · 4 курс · информационные технологии и программирование, веб-разработка",
    built: "API на Go, провода между сервисами, хранилище, безопасность, Docker",
    cv: "/team/cv/artem.pdf",
  },
  {
    name: "Тоня",
    role: "Концепт и тексты",
    school: "Финансовый университет · 3 курс · финансовые рынки и финансовые технологии",
    built: "Концепт, сценарий разговора, тексты, питч",
    photo: "/team/tonya.jpg",
    cv: "/team/cv/tonya.pdf",
  },
];

const FLOW = [
  ["Выписка", "CSV банка и 1С, свои переводы и заём учредителя отделяются"],
  ["Поток", "Чистый денежный поток по месяцам"],
  ["Нагрузка", "DSCR 1,25 при стрессе выручки −30%"],
  ["Стоп-факторы", "Отдельным шлагбаумом, с кодом причины"],
  ["Ответ", "Статус, инструмент, лимит сейчас и после шага"],
] as const;

const WORKS = [
  "Ядро, расчёт потока и лимитов, HTTP API",
  "Путь заявки, очередь менеджера, дозапрос и повторный скоринг",
  "Альтернативы, оффер, график платежей, договор в PDF",
  "Диалог агента и проверка объяснения",
];

const MODELED = [
  "Компании, выписки, документы и ставки синтетические",
  "ЕГРЮЛ и ЕГРИП — мок-реестр, подключения к БКИ нет",
  "Подпись демонстрационная, без SMS",
  "Выдача меняет статус, денег не переводит",
];


// Факты из context/stop-rules.md и context/core.md. Пороги не дублируем, кроме тех, что уже на слайдах.
const RISKS = [
  ["Стресс выручки", "Считаем так, будто выручка упала на 30%. Если поток уходит в минус, клиент узнаёт про риск до заявки."],
  ["Кассовый разрыв", "Месяцы с отрицательным потоком при положительном среднем. Под них подбирается овердрафт, а не длинный кредит."],
  ["Один заказчик", "Больше 70% поступлений от одного контрагента. Просим договор и акт сверки. Эквайринг заказчиком не считается: это сотни покупателей."],
  ["Наличные и принуждение", "Больше 30% поступлений уходит наличными или есть списания по требованию налоговой и приставов: такое решает менеджер."],
] as const;

const GUARDS = [
  ["Шлагбаум до расчёта", "Сначала стоп-факторы, первый сработавший решает статус. Лимит считается только если шлагбаум открыт."],
  ["Никакого «одобрено»", "Четыре статуса: можно подавать, можно после шага, лучше другой инструмент, нужен менеджер. Решение за банком."],
  ["Цифры только от ядра", "Агент пишет словами. Страж пропускает в ответ только разрешённые числа и снимает обещания за банк."],
  ["Код причины", "Каждый отказ и каждое ограничение сопровождается кодом и шагом, после которого ответ изменится."],
] as const;

const PATHS = [
  {
    title: "Путь клиента",
    note: "От первого слова до пересчёта лимита",
    steps: ["Вход", "Разговор: цель, сумма, срок, источник возврата", "Выписка", "Ядро считает", "Ответ и шаг", "Сделал шаг", "Пересчёт"],
  },
  {
    title: "Путь к менеджеру",
    note: "Человек появляется там, где нужен",
    steps: ["Просьба о менеджере или третья неудачная попытка", "Статус «нужен менеджер»", "Очередь банка", "Дозапрос клиенту", "Повторный скоринг", "Оффер или решение"],
  },
  {
    title: "Путь одной реплики",
    note: "Что происходит с каждым сообщением агента",
    steps: ["Приёмщик достаёт слоты", "Роутер выбирает цель", "Ядро при готовности", "Агент формулирует", "Страж проверяет", "Клиент"],
  },
  {
    title: "Путь памяти",
    note: "Агент помнит клиента, но не выписку",
    steps: ["Разговор", "Факты клиента отдельно от сессии", "Новый разговор начинается с них", "«Забудь меня» стирает всё"],
  },
  {
    title: "Путь проверки",
    note: "Как мы тестируем агента до жюри",
    steps: ["Персоны-клиенты", "Провокаторы", "Судья другой модели", "Метки человека", "Правка"],
  },
] as const;

function Avatar({ m }: { m: Member }) {
  if (m.photo)
    return <img className="about-ava" src={m.photo} alt={m.name} />;
  return (
    <span className="about-ava about-ava-ini" aria-hidden="true">
      {m.name[0]}
    </span>
  );
}

export function About({ go }: { go: (p: string) => void }) {
  return (
    <div className="landing about">
      <header className="public-header">
        <a href="/" aria-label="Умный кредитный кабинет — главная">
          <Brand />
        </a>
        <div className="journey-header-tools">
          <button className="text-button" onClick={() => go("/")}>
            <ArrowLeft size={16} /> На главную
          </button>
          <Button secondary onClick={() => go("/onboarding")}>
            Начать оформление <ArrowUpRight size={16} />
          </Button>
        </div>
      </header>
      <main className="wrap about-main">
        <section className="about-hero">
          <div className="hero-kicker">О продукте</div>
          <h1>Готовность к кредиту и следующий шаг, а не «одобрено» или отказ</h1>
          <p>
            Помощник ИП и ООО рядом с Альфа-Интеллектом. Считает готовность к
            финансированию по выписке и объясняет, что сделать, чтобы лимит
            вырос.
          </p>
        </section>

        <section className="about-block">
          <h2>Зачем</h2>
          <div className="about-cols">
            <article>
              <b>Клиент</b>
              <p>
                Узнаёт, готов ли он к кредиту, ещё до заявки. Видит, какой
                продукт подходит и на какую сумму рассчитывать сейчас.
              </p>
            </article>
            <article>
              <b>Банк</b>
              <p>
                Простые заявки система решает сама, спорные идут менеджеру в том
                же кабинете. Меньше дозапросов и лишних звонков.
              </p>
            </article>
          </div>
        </section>

        <section className="about-block">
          <h2>Как считает ядро</h2>
          <p className="about-lead">
            Калькулятор на экспертных правилах, а не обученная модель. Каждый
            ответ можно проследить до условия.
          </p>
          <ol className="about-flow">
            {FLOW.map(([t, d], i) => (
              <li key={t}>
                <span className="about-num">{String(i + 1).padStart(2, "0")}</span>
                <b>{t}</b>
                <small>{d}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="about-block">
          <h2>Агент и банк</h2>
          <div className="about-cols">
            <article>
              <b>Агент спрашивает и объясняет</b>
              <p>
                Цифры даёт только ядро. Агент собран как цепочка: приёмщик,
                код-роутер, ядро, объяснение и код-страж. Страж не пропускает
                выдуманные суммы и обещания одобрения.
              </p>
            </article>
            <article>
              <b>Менеджер видит только нужное</b>
              <p>
                Зелёная заявка получает оффер без менеджера. Не хватает данных —
                клиенту приходит дозапрос, после ответа ядро пересчитывает.
              </p>
            </article>
          </div>
        </section>

        <section className="about-block" id="risks">
          <h2>Управление финансовыми рисками</h2>
          <p className="about-lead">
            Риск не прячется в оценке «скоринг 640». Каждый назван, у каждого
            есть код причины и шаг, который его снимает.
          </p>
          <ul className="about-risks">
            {RISKS.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ul>
          <div className="about-cols about-guards">
            {GUARDS.map(([t, d]) => (
              <article key={t}>
                <b>{t}</b>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-block" id="paths">
          <h2>Сквозные пути agentic AI</h2>
          <p className="about-lead">
            Агент не живёт отдельно: он проходит через ядро, банк и проверку.
            Вот пять путей целиком.
          </p>
          <div className="about-paths">
            {PATHS.map((p) => (
              <article key={p.title}>
                <header>
                  <b>{p.title}</b>
                  <small>{p.note}</small>
                </header>
                <ol>
                  {p.steps.map((st) => (
                    <li key={st}>{st}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>

        <section className="about-block">
          <h2>Честно: что работает, а что смоделировано</h2>
          <div className="about-cols">
            <article className="about-ok">
              <b>Работает</b>
              <ul>
                {WORKS.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
            <article className="about-sim">
              <b>Смоделировано</b>
              <ul>
                {MODELED.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="about-block" id="team">
          <h2>Команда</h2>
          <p className="about-lead">
            Пять человек, одна репа. Кто что собирал и откуда пришёл.
          </p>
          <ul className="about-team">
            {TEAM.map((m) => (
              <li key={m.name}>
                <Avatar m={m} />
                <b>{m.name}</b>
                <em>{m.role}</em>
                <span className="about-school">{m.school}</span>
                <span className="about-built">{m.built}</span>
                {m.cv && (
                  <a className="about-cv" href={m.cv} target="_blank" rel="noreferrer">
                    Резюме <ArrowUpRight size={14} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        <footer className="about-foot">
          <span>Альфа-Хак 2026 · команда git merge alpha</span>
          <a href="https://github.com/gitAlphaMerge/credit-cabinet" target="_blank" rel="noreferrer">
            Код на GitHub <ArrowUpRight size={14} />
          </a>
        </footer>
      </main>
      <SideRail />
    </div>
  );
}
