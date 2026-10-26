import { useEffect, useState } from "react";
import { ArrowRight, Building2, FileCheck2, Scale, Smartphone } from "lucide-react";
import { Brand, Button, Badge } from "./ui";
import { api } from "./api";
import { demoPersonas, type PersonaSummary } from "../shared/demo-personas";

export const JURY_LOGIN = "gitmergealpha";
export const JURY_PASSWORD = "alphahack2026";
import { SideRail } from "./SideRail";
import { LivePattern } from "./LivePattern";

// Вход: провайдеры — заглушки в кабинет текущей сессии; телефон и пароль — настоящий /api/auth/login.
const providers = [
  ["gosuslugi", "Госуслуги", "Г"],
  ["vk", "VK ID", "VK"],
  ["yandex", "Яндекс ID", "Я"],
] as const;

export function LoginScreen({ go }: { go: (p: string) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  useEffect(() => {
    api<{ personas: PersonaSummary[] }>("/demo-personas")
      .then((r) => setPersonas(r.personas))
      .catch(() => setPersonas([]));
    // Без засеянной базы те же компании открываются чистыми тестовыми: сервер заведёт их при входе.
  }, []);
  const juryEnter = (login: string, pass: string, persona?: string) => {
    setError("");
    setPicked(persona ?? "phone");
    api<{ destination: string }>("/auth/jury", { login, password: pass, persona })
      .then((r) => location.assign(r.destination))
      .catch((err: Error) => {
        setPicked("");
        setError(err.message || "Логин или пароль не подошли");
      });
  };
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
        <SideRail />
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
          <div className="login-test" id="test">
            <b>Режим тестирования</b>
            <p>
              Логин <code>{JURY_LOGIN}</code>, пароль <code>{JURY_PASSWORD}</code>.
              Или сразу выберите компанию:
            </p>
            <div className="login-test-list">
              {(personas.length ? personas : demoPersonas.filter((p) => p.role === "client")).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-busy={picked === p.key}
                  onClick={() => juryEnter(JURY_LOGIN, JURY_PASSWORD, p.key)}
                >
                  <span>{p.company}</span>
                  <small>{p.description}</small>
                </button>
              ))}
            </div>
          </div>
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
              if (/[a-z]/i.test(phone)) return juryEnter(phone, password);
              setError("");
              setPicked("phone");
              api("/auth/login", { phone, password })
                .then(() => location.assign("/cabinet"))
                .catch((err: Error) => {
                  setPicked("");
                  setError(err.message || "Телефон или пароль не подошли");
                });
            }}
          >
            <label className="field">
              <span>Телефон или логин</span>
              <span className="login-phone-input">
                <Smartphone size={18} aria-hidden="true" />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="+7 900 000-00-00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </span>
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <Button disabled={picked === "phone"}>
              Войти <ArrowRight size={18} />
            </Button>
          </form>
          <p className="fine-print">
            Госуслуги, VK ID и Яндекс ID в прототипе не подключены и открывают
            кабинет текущей сессии. Как подключить:{" "}
            <a href="https://yandex.ru/dev/id/doc/ru/" target="_blank" rel="noopener noreferrer">
              Яндекс ID
            </a>
            ,{" "}
            <a href="https://id.vk.com/about/business" target="_blank" rel="noopener noreferrer">
              VK ID для бизнеса
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
