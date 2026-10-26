import { Brain, Building2, FolderTree, Palette, Users } from "lucide-react";
import { useWorkspace } from "./context";
import { Badge } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { AppearanceBody } from "./AppearancePicker";

// Настройки кабинета: только то, что уже есть в состоянии. Чего ещё нет, помечено «В разработке», без кнопок-пустышек.
export function ProfileSettings() {
  const w = useWorkspace(),
    s = w.state,
    p = s.profile;
  const confirmed = s.documents.filter((d) => d.confirmed).length;
  const messages = s.chats.reduce((n, c) => n + c.messages.length, 0);
  const memory: [string, string][] = [
    ["Компания", p.name || "Не указана"],
    ["Отрасль", p.activity || p.sector || "Не указана"],
    ["Регион", p.region || "Не указан"],
    ["Документы", `${s.documents.length}, подтверждено ${confirmed}`],
    ["Разговоры", `${s.chats.length}, сообщений ${messages}`],
  ];
  return (
    <section className="panel profile-settings" id="settings">
      <div className="panel-title">
        <h2>Настройки</h2>
      </div>
      <div className="settings-grid">
        <article className="settings-card">
          <h3>
            <Palette size={18} aria-hidden="true" /> Оформление
          </h3>
          <p>Основа, акцент и светлая или тёмная тема сочетаются между собой. Выбор хранится в этом браузере.</p>
          <div className="settings-row">
            <ThemeToggle />
          </div>
          <AppearanceBody />
        </article>
        <article className="settings-card">
          <h3>
            <Brain size={18} aria-hidden="true" /> Память агента
          </h3>
          <p>Агент отвечает только по этим сведениям. Изменить их можно в основных сведениях и документах.</p>
          <dl className="profile-table">
            {memory.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </article>
        <article className="settings-card">
          <h3>
            <Building2 size={18} aria-hidden="true" /> Организация
          </h3>
          <dl className="profile-table">
            <div>
              <dt>Название</dt>
              <dd>{p.name || "Не указано"}</dd>
            </div>
            <div>
              <dt>Форма</dt>
              <dd>{p.form || "Не указана"}</dd>
            </div>
            <div>
              <dt>ИНН</dt>
              <dd>{p.inn || "Не указан"}</dd>
            </div>
          </dl>
        </article>
        <article className="settings-card">
          <h3>
            <Users size={18} aria-hidden="true" /> Сотрудники
          </h3>
          <ul className="settings-people">
            <li>
              <span className="settings-avatar" aria-hidden="true">
                {(p.name || "Вы").slice(0, 1)}
              </span>
              <span>
                <b>Вы</b>
                <small>Владелец, полный доступ</small>
              </span>
            </li>
          </ul>
          <Badge>В разработке</Badge>
          <p>Приглашение бухгалтера и финансового директора с отдельными правами.</p>
        </article>
        <article className="settings-card settings-wide">
          <h3>
            <FolderTree size={18} aria-hidden="true" /> Структура данных
          </h3>
          <p>
            Профиль → документы → разговоры с агентом → подборы и заявки. Банк видит заявку только после
            вашего согласия.
          </p>
          <div className="settings-row">
            <Badge>Документов: {s.documents.length}</Badge>
            <Badge>Подборов: {s.selections.length}</Badge>
            <Badge>Заявок: {s.leads.length}</Badge>
          </div>
        </article>
      </div>
    </section>
  );
}
