import { useEffect, useRef, useState } from "react";
import { cabinetSnapshot, validDate } from "../shared/cabinet";
import { useWorkspace } from "./context";
import { api, money } from "./api";
import type { MvpApplication } from "../shared/mvp2";
import { labelCode, loadOwnApplication, loadOwnApplications, jsonObject, type ClientDetail } from "./application-client";
import { ThemeToggle } from "./ThemeToggle";

export function CabinetProfileMenu({ name, onProfile, onLogout }: { name: string; onProfile(): void; onLogout(): void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase() || "К";
  return <div className="home-profile" ref={root}>
    <button className="home-avatar" type="button" aria-label="Меню профиля" aria-expanded={open} onClick={() => setOpen(!open)}>{initials}</button>
    {open && <div className="home-profile-menu"><strong>{name || "Профиль"}</strong><button onClick={() => { setOpen(false); onProfile(); }}>Профиль</button><div className="home-theme">Тема <ThemeToggle /></div><button onClick={() => { setOpen(false); onLogout(); }}>Выйти</button></div>}
  </div>;
}

export function CabinetHome() {
  const { state, go } = useWorkspace();
  const snapshot = cabinetSnapshot(state);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [mvp, setMvp] = useState<MvpApplication | null>(null);
  const [applicationState, setApplicationState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let live = true;
    api<MvpApplication[]>("/mvp2/applications").then(list => { if (live) setMvp(list[0] ?? null); }).catch(() => {});
    loadOwnApplications().then(async list => list.length ? loadOwnApplication(list[0].id) : null)
      .then(value => { if (live) { setDetail(value); setApplicationState("ready"); } })
      .catch(() => { if (live) setApplicationState("error"); });
    return () => { live = false; };
  }, []);
  const statement = state.documents.filter(d => d.confirmed && d.category === "statement").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const rows = (statement?.records || []).filter(r => validDate(String(r.date)) && typeof r.amount === "number" && Number.isFinite(r.amount)).sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const monthly = new Map<string, number>();
  rows.forEach(r => { const month = String(r.date).slice(0, 7); monthly.set(month, (monthly.get(month) || 0) + Number(r.amount)); });
  const months = [...monthly.entries()].slice(-6);
  const balances = (statement?.records || []).filter(r => validDate(String(r.date)) && typeof r.balance === "number" && Number.isFinite(r.balance)).sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const last = balances.at(-1), previous = balances.at(-2);
  const payments = (snapshot.facility?.events || []).filter(p => p.status !== "paid" && p.date >= snapshot.today).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 3);
  const dossier = detail?.dossier as (NonNullable<ClientDetail["dossier"]> & {core_result?: unknown}) | undefined;
  const raw = jsonObject(dossier?.core_result), core = jsonObject(raw.core ?? raw);
  const after = mvp?.financial?.limitAfter ?? (typeof core.limit_after_rub === "number" ? core.limit_after_rub : null);
  const codes = Array.isArray(core.reason_codes) ? core.reason_codes : [];
  const risks = [codes.includes("STRESS_NEGATIVE_FLOW") ? "При снижении выручки на 30% поток становится отрицательным." : null, codes.includes("CASH_GAP") ? "В выписке обнаружены месяцы с кассовым разрывом." : null, ...snapshot.signals.filter(s => s.type === "risk").map(s => s.title)].filter((x): x is string => !!x);
  const next = mvp?.missing?.find(item => item.status !== "accepted" && item.status !== "skipped")?.label || (dossier?.holes?.[0] ? labelCode(dossier.holes[0]) : "");
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", {day:"numeric", month:"short", year:"numeric"});
  return <main className="home-dashboard">
    <header className="home-heading"><div><span>ОБЗОР БИЗНЕСА</span><h1>Главная</h1><p>{state.profile.name || "Ваш бизнес"}</p></div></header>
    <div className="home-grid">
      <section className="home-card home-flow"><h2>Денежный поток по месяцам</h2><p>Поступления минус списания по подтверждённой выписке{statement ? ` · ${statement.name}` : ""}</p>
        {months.length ? <div className="home-months">{months.map(([m,n]) => <div key={m}><span>{new Date(m + "-01T00:00:00").toLocaleDateString("ru-RU", {month:"short", year:"2-digit"})}</span><strong>{money(n)}</strong></div>)}</div> : <p>Подтвердите выписку, чтобы увидеть движение денег.</p>}</section>
      <section className="home-card"><h2>Остаток на счёте</h2><strong className="home-number">{last ? money(Number(last.balance)) : "Нет данных"}</strong><p>{last ? `На ${fmtDate(String(last.date))}` : "В подтверждённой выписке нет остатка."}</p>{last && previous && <p>Изменение с {fmtDate(String(previous.date))}: {money(Number(last.balance) - Number(previous.balance))}</p>}</section>
      <section className="home-card"><h2>Ближайшие платежи</h2>{payments.length ? payments.map(p => <div className="home-row" key={p.id}><span>{fmtDate(p.date)}</span><strong>{money(p.principal + p.interest + p.fees)}</strong></div>) : <p>Подтверждённого графика ближайших платежей нет.</p>}<button onClick={() => go("/credit")}>Кредитный кабинет →</button></section>
      <section className="home-card"><h2>Заявка и лимит</h2><p>{applicationState === "loading" ? "Загружаем заявку…" : applicationState === "error" ? "Не удалось загрузить заявку." : detail ? labelCode(detail.application.status) : "Заявок пока нет."}</p><div className="home-row"><span>Лимит сейчас</span><strong>{money(mvp?.financial?.limitNow ?? dossier?.limit_now_rub)}</strong></div><div className="home-row"><span>После шага</span><strong>{money(after)}</strong></div>{detail && <button onClick={() => go("/apply")}>Открыть заявку →</button>}</section>
      <section className="home-card"><h2>Главные риски</h2>{risks.length ? risks.map((risk,i) => <p key={i}>{risk}</p>) : <p>Стресс −30% и кассовый разрыв: данных для оценки нет.</p>}</section>
      <section className="home-card home-next"><h2>Следующий шаг</h2><p>{next ? next : !statement ? "Подтвердите банковскую выписку для анализа." : detail ? "Откройте заявку, чтобы проверить её состояние." : "Проверьте данные бизнеса в профиле."}</p><button onClick={() => go(next || detail ? "/apply" : "/profile")}>{next || detail ? "К заявке" : "Открыть профиль"} →</button></section>
    </div>
  </main>;
}

