import { useState } from "react";
import { ArrowRight, Building2, FileCheck2, Scale, Smartphone } from "lucide-react";
import { Brand, Button, Badge } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { LivePattern } from "./LivePattern";

// Демо-экран входа: внешние провайдеры не подключены, любой способ ведёт в кабинет текущей сессии.
const providers = [
  ["gosuslugi", "Госуслуги", "Г"],
  ["vk", "VK ID", "VK"],
  ["yandex", "Яндекс ID", "Я"],
] as const;

export function LoginScreen({ go }: { go: (p: string) => void }) {
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState("");
  const enter = (via: string) => {
    setPicked(via);
    go("/cabinet");
  };
  return (
    <div className="login-screen">
      <header className="public-header">
        <a href="/" aria-label="На главную">
          <Brand />
        </a>
        <div className="journey-header-tools">
          <ThemeToggle />
        </div>
      </header>
      <main className="login-grid">
        <section className="login-story">
          <div className="login-pattern" aria-hidden="true">
            <LivePattern showCaption={false} />
          </div>
          <h1>Кредитный кабинет вашего бизнеса</h1>
          <ul>
            <li>
              <Scale size={18} /> Юридический статус компаний
            </li>
            <li>
              <FileCheck2 size={18} /> Бухучёт и выписки в одном месте
            </li>
            <li>
              <Building2 size={18} /> Все ваши компании и заявки
            </li>
          </ul>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <Badge tone="blue">Демо-вход</Badge>
          <h2 id="login-title">Войти в кабинет</h2>
          <div className="login-providers">
            {providers.map(([id, name, mark]) => (
              <button
                key={id}
                type="button"
                className={"login-provider login-" + id}
                aria-busy={picked === id}
                onClick={() => enter(id)}
              >
                <span className="login-mark" aria-hidden="true">
                  {mark}
                </span>
                Войти через {name}
              </button>
            ))}
          </div>
          <div className="login-divider">
            <span>или по номеру телефона</span>
          </div>
          <form
            className="login-phone"
            onSubmit={(e) => {
              e.preventDefault();
              enter("phone");
            }}
          >
            <label className="field">
              <span>Номер телефона</span>
              <span className="login-phone-input">
                <Smartphone size={18} aria-hidden="true" />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7 900 000-00-00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </span>
            </label>
            <Button>
              Получить код <ArrowRight size={18} />
            </Button>
          </form>
          <p className="fine-print">
            Прототип для жюри: внешние сервисы не подключены, данные никуда не
            передаются. Вход открывает кабинет текущей сессии.
          </p>
        </section>
      </main>
    </div>
  );
}
