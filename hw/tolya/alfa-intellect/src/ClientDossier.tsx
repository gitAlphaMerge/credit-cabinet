import { ApplicationKnowledge } from "./ApplicationKnowledge";
import type { ReactNode } from "react";
import type { MvpApplication, Product, Questionnaire } from "../shared/mvp2";
import { money, date } from "./api";
import { Button } from "./ui";
import type { StatementMetadata } from "./StatementUpload";
type Fact = [string, ReactNode];
const facts = (rows: Fact[]) => (
  <dl className="dossier-facts">
    {rows.map(([label, value]) => (
      <div key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>
);
export function ClientDossier({
  application: a,
  products,
  statements,
  editable,
  onEdit,
}: {
  application: MvpApplication;
  products: Product[];
  statements: StatementMetadata[];
  editable: boolean;
  onEdit: (section: number) => void;
}) {
  const q = a.questionnaire,
    product = products.find((p) => p.id === q.productId);
  const card = (title: string, section: number, children: ReactNode) => (
    <article className="dossier-card">
      <header>
        <h3>{title}</h3>
        {editable && (
          <Button type="button" secondary onClick={() => onEdit(section)}>
            Изменить
          </Button>
        )}
      </header>
      {children}
    </article>
  );
  const details: { title: string; rows: Fact[] }[] = [
    {
      title: "Компания",
      rows: [
        [
          "Полномочия представителя",
          q.authorized ? "Подтверждены" : "Не подтверждены",
        ],
        [
          "Согласие на обработку данных",
          Object.values(q.consents).every(Boolean) ? "Получено" : "Требуется",
        ],
        ...(q.actualIndustry
          ? [["Фактическая деятельность", q.actualIndustry] as Fact]
          : []),
      ],
    },
    {
      title: "Финансовые данные",
      rows: [
        [
          "Полнота выписок",
          q.complete === "yes"
            ? "Все основные операции отражены"
            : q.complete === "no"
              ? "Есть операции вне выписок"
              : "Нужно уточнить после загрузки",
        ],
        ...(q.complete === "no"
          ? ([
              ["Операции вне выписок", q.outsideType],
              ["Поступления вне выписок", money(q.outsideIn)],
              ["Расходы вне выписок", money(q.outsideOut)],
            ] as Fact[])
          : []),
      ],
    },
    {
      title: "Обязательства",
      rows: [
        [
          "Кредиты и линии",
          q.loans === "yes"
            ? "Есть"
            : q.loans === "no"
              ? "Нет"
              : "Нужно уточнить",
        ],
        ...(q.loans === "yes"
          ? ([
              ["Остаток долга", money(q.debt)],
              ["Платёж по кредитам", money(q.monthlyDebt)],
              ...(q.balloonExpected === "yes"
                ? [
                    ["Разовое погашение", money(q.balloon)],
                    [
                      "Дата погашения",
                      q.balloonPeriod ? date(q.balloonPeriod) : "Уточните дату",
                    ],
                  ]
                : []),
            ] as Fact[])
          : []),
        [
          "Лизинг",
          q.leasing === "yes"
            ? "Есть"
            : q.leasing === "no"
              ? "Нет"
              : "Требуется уточнение",
        ],
        ...(q.leasing === "yes"
          ? [["Платёж по лизингу", money(q.monthlyLeasing)] as Fact]
          : []),
      ],
    },
    {
      title: "Особенности",
      rows: [
        [
          "Сезонность",
          q.seasonality === "yes"
            ? "Выраженная"
            : q.seasonality === "no"
              ? "Нет"
              : "Пока не определена",
        ],
        ...(q.futureIn !== null && ["income", "both"].includes(q.future)
          ? [["Будущие поступления", money(q.futureIn)] as Fact]
          : []),
        ...(q.futureOut !== null && ["expense", "both"].includes(q.future)
          ? [["Будущие расходы", money(q.futureOut)] as Fact]
          : []),
        ...(q.futurePeriod && !["none", "unknown"].includes(q.future)
          ? [["Период операций", q.futurePeriod] as Fact]
          : []),
      ],
    },
    {
      title: "Финансирование",
      rows: [
        [
          "Когда нужны средства",
          q.neededAt === "Выбрать дату" && q.neededDate
            ? date(q.neededDate)
            : q.neededAt,
        ],
        ...(q.productId === "INVEST"
          ? ([
              ["Стоимость проекта", money(q.projectCost)],
              ...(q.economicEffect !== null
                ? [
                    [
                      "Дополнительный результат в месяц — оценка заявителя",
                      money(q.economicEffect),
                    ],
                  ]
                : []),
            ] as Fact[])
          : []),
        ...(["RCL", "OVERDRAFT"].includes(q.productId) && q.cycleDays !== null
          ? [["Цикл использования", `${q.cycleDays} дн.`] as Fact]
          : []),
        ...(q.productId === "NCL" && q.tranches
          ? [["План траншей", q.tranches] as Fact]
          : []),
        ...(q.productId === "REFI"
          ? ([
              ["Остаток прежнего кредита", money(q.oldBalance)],
              ["Ставка прежнего кредита", `${q.oldRate}%`],
              ["Платёж прежнего кредита", money(q.oldPayment)],
            ] as Fact[])
          : []),
        ...(q.customerContractAmount !== null
          ? [
              [
                "Договор с заказчиком — со слов заявителя",
                money(q.customerContractAmount),
              ] as Fact,
            ]
          : []),
        ...(q.reconciliationReference
          ? [
              [
                "Акт сверки — со слов заявителя",
                q.reconciliationReference,
              ] as Fact,
            ]
          : []),
      ],
    },
  ];
  return (
    <div className="client-dossier">
      <ApplicationKnowledge application={a} editable={editable} onEdit={onEdit}/>
      {editable && q.accounts.some((account) => !account.documentId) && (
        <section className="dossier-incomplete" role="status">
          <div>
            <strong>Выписки пока не полные</strong>
            <p>
              Можно подать заявку сейчас. После отправки попросим добавить
              недостающие выписки; это не отказ по кредиту.
            </p>
          </div>
          <Button type="button" secondary onClick={() => onEdit(1)}>
            Добавить выписки
          </Button>
        </section>
      )}
      <div className="dossier-cards">
        {card(
          "Компания",
          0,
          <>
            <h4>{a.company?.name || "Компания требует подтверждения"}</h4>
            {facts([
              ["ИНН", q.inn],
              ["Форма", a.company?.form || "Уточните компанию"],
              ["Отрасль", a.onboarding.industry],
              ...(a.company?.okved
                ? [
                    [
                      "ОКВЭД",
                      `${a.company.okved} · ${a.company.activity || ""}`,
                    ] as Fact,
                  ]
                : []),
            ])}
          </>,
        )}
        {card(
          "Запрашиваемый кредит",
          4,
          <>
            <h4>{product?.name}</h4>
            <strong className="dossier-amount">
              {q.amount > 0 ? money(q.amount) : "Уточните сумму"}
            </strong>
            {facts([
              ["Срок", `${q.term} мес.`],
              ["Ставка каталога", `${product?.rate}%`],
              ["Назначение", q.purposeDetails || q.purpose],
              ["Использование", q.usage],
              ["Источник погашения", q.repayment],
            ])}
          </>,
        )}
        {card(
          "Основные сведения бизнеса",
          2,
          facts([
            ["Расчётные счета", q.accounts.length],
            [
              "Кредиты и линии",
              q.loans === "yes"
                ? "Есть"
                : q.loans === "no"
                  ? "Нет"
                  : "Требуется уточнение",
            ],
            [
              "Лизинг",
              q.leasing === "yes"
                ? "Есть"
                : q.leasing === "no"
                  ? "Нет"
                  : "Требуется уточнение",
            ],
          ]),
        )}
        {card(
          "Загруженные документы",
          1,
          <ul className="dossier-documents">
            {q.accounts.map((account, i) => {
              const s = statements.find((s) => s.id === account.documentId);
              return (
                <li key={account.id}>
                  <strong>{account.bank || `Счёт ${i + 1}`}</strong>
                  {s ? (
                    <>
                      <span>{s.name}</span>
                      <small>{s.period} · Проверено</small>
                    </>
                  ) : (
                    <span className="dossier-missing">
                      Выписка не загружена — потребуется для оценки
                    </span>
                  )}
                </li>
              );
            })}
          </ul>,
        )}
      </div>
      <details className="dossier-details">
        <summary>Дополнительные сведения заявки</summary>
        {details.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            {facts(group.rows)}
          </section>
        ))}
      </details>
    </div>
  );
}
