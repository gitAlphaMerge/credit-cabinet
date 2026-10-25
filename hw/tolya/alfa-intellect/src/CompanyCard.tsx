import type { Company } from "../shared/mvp2";
export function companyAge(value?: string, now = new Date()): string | null {
  if (!value) return null;
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date > now) return null;
  let months =
    (now.getUTCFullYear() - date.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    date.getUTCMonth();
  if (now.getUTCDate() < date.getUTCDate()) months--;
  return months < 12
    ? `${Math.max(0, months)} мес.`
    : `${Math.floor(months / 12)} г. ${months % 12} мес.`;
}
export function CompanyCard({ company }: { company: Company }) {
  const age = companyAge(company.registeredAt);
  return (
    <article className="company-card">
      <header>
        <span className="company-symbol" aria-hidden="true">
          {company.form === "ИП" ? "ИП" : "ЮЛ"}
        </span>
        <div>
          <h3>{company.name}</h3>
          <span
            className={
              "company-status " + (company.status === "ACTIVE" ? "active" : "")
            }
          >
            {company.status === "ACTIVE"
              ? "Действует"
              : company.status === "LIQUIDATED"
                ? "Деятельность прекращена"
                : company.status}
          </span>
        </div>
      </header>
      <dl className="dossier-facts">
        <div>
          <dt>ИНН</dt>
          <dd>{company.inn}</dd>
        </div>
        <div>
          <dt>Форма</dt>
          <dd>{company.form}</dd>
        </div>
        {company.okved && (
          <div>
            <dt>Основной ОКВЭД</dt>
            <dd>
              {company.okved}
              {company.activity && ` · ${company.activity}`}
            </dd>
          </div>
        )}
        {company.registeredAt && (
          <div>
            <dt>Дата регистрации</dt>
            <dd>
              {new Date(company.registeredAt + "T00:00:00Z").toLocaleDateString(
                "ru-RU",
                { timeZone: "UTC" },
              )}
            </dd>
          </div>
        )}
        {age && (
          <div>
            <dt>Возраст компании</dt>
            <dd>{age}</dd>
          </div>
        )}
        {company.region && (
          <div>
            <dt>Регион</dt>
            <dd>{company.region}</dd>
          </div>
        )}
      </dl>
      <small className="muted">Источник: {company.source}</small>
    </article>
  );
}
