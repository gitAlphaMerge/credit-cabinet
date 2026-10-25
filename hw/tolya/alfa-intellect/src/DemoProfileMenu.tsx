import { useEffect, useRef, useState } from "react";
import { Building2, Check, HelpCircle, LogOut } from "lucide-react";
import type { PersonaSummary } from "../shared/demo-personas";
import { api } from "./api";
import { IconButton } from "./ui";
import { NotificationCenter } from "./NotificationCenter";

// Локальные правила шапки: одинаковая геометрия, без изменения общих стилей кабинета.
export const profileMenuStyles = `
.app-header .header-tools.g2-tools { gap: 8px; }
.app-header .g2-tools > .icon-button,
.app-header .g2-tools > .g2-profile > .icon-button,
.app-header .g2-tools > .notification-center > div > .icon-button {
  display: inline-flex; width: 36px; height: 36px; min-width: 36px; min-height: 36px;
  padding: 0; align-items: center; justify-content: center; border-radius: 9px;
}
.app-header .g2-tools > .icon-button svg,
.app-header .g2-tools > .g2-profile > .icon-button svg,
.app-header .g2-tools > .notification-center > div > .icon-button svg { width: 20px; height: 20px; }
.app-header .g2-tools button:focus-visible { outline: 2px solid var(--red); outline-offset: 3px; }
.g2-profile { position: relative; }
.g2-profile-panel { position: absolute; top: calc(100% + 10px); right: 0; z-index: 160;
  width: min(360px, calc(100vw - 24px)); max-height: min(560px, 75vh); overflow-y: auto;
  padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: white;
  box-shadow: 0 12px 35px #17192320; color: var(--ink); }
.g2-profile-panel h2 { margin: 16px 0 4px; font-size: 15px; }
.g2-profile-panel p { margin: 4px 0 12px; font-size: 12px; color: var(--muted); }
.g2-personas { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.g2-personas button { width: 100%; display: flex; align-items: center; gap: 8px;
  text-align: left; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: white; }
.g2-personas button[aria-current=true] { border-color: var(--red); background: #fff6f5; }
.g2-personas button:disabled { cursor: default; }
.g2-personas strong { display: block; font-size: 12px; }
.g2-personas small { display: block; margin-top: 4px; font-size: 11px; color: var(--muted); }
.g2-personas svg { flex-shrink: 0; color: var(--red); }
`;

type MenuProps = {
  company: string;
  personas: PersonaSummary[];
  busy: boolean;
  error: string;
  onProfile(): void;
  onSwitch(key: string): void;
};
export function DemoProfileMenuView(p: MenuProps) {
  return (
    <section className="g2-profile-panel" aria-label="Меню профиля">
      <strong>{p.company}</strong>
      <p>
        <button className="text-button" disabled={p.busy} onClick={p.onProfile}>
          Открыть профиль компании
        </button>
      </p>
      {p.personas.length > 0 && (
        <>
          <h2>Примеры профилей</h2>
          <p>Синтетические данные (мок). Выберите готовый сценарий.</p>
          <ul className="g2-personas">
            {p.personas.map((persona) => (
              <li key={persona.key}>
                <button
                  type="button"
                  aria-current={persona.current ? "true" : undefined}
                  disabled={p.busy || persona.current}
                  onClick={() => p.onSwitch(persona.key)}
                >
                  <span>
                    <strong>
                      {persona.company}
                      {persona.current ? " · Текущий" : ""}
                    </strong>
                    <small>{persona.description}</small>
                  </span>
                  {persona.current && <Check size={16} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.busy && <p role="status">Открываем выбранный профиль…</p>}
      {p.error && <p role="alert">{p.error}</p>}
    </section>
  );
}

export async function switchDemoPersona(key: string) {
  const result = await api<{ is_demo: boolean; destination: string }>(
    "/demo-personas/switch",
    { persona: key },
  );
  if (
    result.is_demo !== true ||
    !["/bank", "/application"].includes(result.destination)
  )
        throw new Error("Не удалось сменить пример профиля");
  return result.destination;
}

export function DemoProfileTools(p: {
  company: string;
  onProfile(): void;
  onHelp(): void;
  onLogout(): void;
}) {
  const [open, setOpen] = useState(false),
    [personas, setPersonas] = useState<PersonaSummary[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    switching = useRef(false);
  useEffect(() => {
    let live = true;
    api<{ personas: PersonaSummary[] }>("/demo-personas")
      .then((result) => {
        if (live) setPersonas(result.personas);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLElement>(".g2-profile-panel button")
      ?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !switching.current)
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !switching.current) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function select(key: string) {
    if (switching.current) return;
    switching.current = true;
    setBusy(true);
    setError("");
    try {
      const destination = await switchDemoPersona(key);
      // Полная навигация сбрасывает чаты, документы и незавершённые запросы предыдущего пользователя.
      window.location.assign(destination);
    } catch (e) {
      setError(visibleError(e));
      setBusy(false);
      switching.current = false;
    }
  }
  return (
    <>
      <style>{profileMenuStyles}</style>
      <IconButton label="Выйти" disabled={busy} onClick={p.onLogout}>
        <LogOut size={20} />
      </IconButton>
      <IconButton label="Помощь и обучение" disabled={busy} onClick={p.onHelp}>
        <HelpCircle size={20} />
      </IconButton>
      <NotificationCenter />
      <div className="g2-profile" ref={root} data-tour="profile">
        <button
          type="button"
          className="icon-button"
          ref={trigger}
          disabled={busy}
          aria-label={`Профиль: ${p.company}`}
          title={p.company}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Building2 size={20} />
        </button>
        {open && (
          <DemoProfileMenuView
            company={p.company}
            personas={personas}
            busy={busy}
            error={error}
            onProfile={() => {
              setOpen(false);
              p.onProfile();
            }}
            onSwitch={(key) => void select(key)}
          />
        )}
      </div>
    </>
  );
}
import { visibleError } from "./application-client";
