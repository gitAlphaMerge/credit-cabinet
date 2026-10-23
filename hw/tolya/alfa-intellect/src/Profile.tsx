import { useState, useRef } from "react";
import { DocumentIllustration } from "./Illustration";
import {
  Pencil,
  Search,
  Check,
  Paperclip,
  FileText,
  Download,
  Building2,
  Clock3,
  BriefcaseBusiness,
  MapPin,
  ArrowLeft,
  Info,
  FlaskConical,
} from "lucide-react";
import { useWorkspace } from "./context";
import { Button, Badge, Field, Modal } from "./ui";
import { api, date } from "./api";
import { documentTypes } from "../shared/types";
export function ProfilePage() {
  const w = useWorkspace(),
    p = w.state.profile,
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState({
      name: p.name,
      activity: p.activity || p.sector,
      region: p.region || "",
      sector: p.sector,
    }),
    [inn, setInn] = useState(p.inn || ""),
    [candidate, setCandidate] = useState<any>(null),
    [lookupBusy, setLookupBusy] = useState(false),
    [lookupError, setLookupError] = useState(""),
    [category, setCategory] = useState("statement"),
    [viewDoc, setViewDoc] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const age = (() => {
    if (!p.registered) return "Планирую запуск";
    if (!p.registeredAt) return p.ageBand || "Не указан";
    const d = new Date(p.registeredAt),
      now = new Date();
    let months =
      (now.getFullYear() - d.getFullYear()) * 12 +
      now.getMonth() -
      d.getMonth();
    if (now.getDate() < d.getDate()) months--;
    months = Math.max(0, months);
    return `${Math.floor(months / 12)} лет ${months % 12} мес.`;
  })();
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError("");
    setCandidate(null);
    if (!/^(\d{10}|\d{12})$/.test(inn)) {
      setLookupError(
        `Введите ИНН целиком: 10 цифр для организации или 12 для ИП. Сейчас введено ${inn.length}.`,
      );
      return;
    }
    setLookupBusy(true);
    try {
      setCandidate(await api("/lookup", { inn }));
    } catch (e) {
      setLookupError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }
  return (
    <main className="profile-page page-wrap">
      <button
        className="text-button muted"
        onClick={() => w.go(w.cabinetPath || "/cabinet")}
      >
        <ArrowLeft size={15} /> Кредитный кабинет
      </button>
      <div className="page-heading">
        <span className="eyebrow">КОНТЕКСТ ВАШЕГО БИЗНЕСА</span>
        <h1>Профиль бизнеса</h1>
        <p>
          Основные сведения и документы. Данные используются в чате, подборе и
          сопровождении кредита.
        </p>
      </div>
      <section className="panel profile-info">
        <div className="panel-title">
          <h2>Основные сведения</h2>
          <Button
            secondary
            onClick={() => {
              setDraft({
                name: p.name,
                activity: p.activity || p.sector,
                region: p.region || "",
                sector: p.sector,
              });
              setEditing(!editing);
            }}
          >
            <Pencil size={16} /> {editing ? "Отменить" : "Редактировать"}
          </Button>
        </div>
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await w.act("/profile", draft, "PATCH");
              setEditing(false);
            }}
          >
            <div className="form-grid">
              {Object.entries(draft).map(([k, v]) => (
                <Field
                  key={k}
                  label={
                    k === "name"
                      ? "Название бизнеса"
                      : k === "activity"
                        ? "Фактический вид деятельности"
                        : k === "region"
                          ? "Регион"
                          : "Отрасль"
                  }
                >
                  <input
                    value={v}
                    required={k === "name"}
                    maxLength={160}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="fine-print">
              Уточнения сохраняются отдельно от исходных регистрационных
              сведений.
            </p>
            <Button>
              Сохранить изменения <Check size={16} />
            </Button>
          </form>
        ) : (
          <div className="profile-columns">
            <div>
              <h3>
                {p.registered ? "Регистрационные данные" : "Сведения о проекте"}
              </h3>
              {p.registered && (
                <form className="inn-search" onSubmit={lookup} noValidate>
                  <Search size={20} />
                  <label>
                    <small>ИНН компании или ИП</small>
                    <input
                      aria-label="ИНН"
                      value={inn}
                      maxLength={12}
                      inputMode="numeric"
                      aria-invalid={!!lookupError}
                      aria-describedby="inn-help inn-error"
                      onChange={(e) => {
                        setInn(e.target.value.replace(/\D/g, ""));
                        setLookupError("");
                        setCandidate(null);
                      }}
                      placeholder="Введите ИНН"
                    />
                  </label>
                  <Button secondary disabled={lookupBusy}>
                    {lookupBusy ? "Ищем…" : "Найти по ИНН"}
                  </Button>
                </form>
              )}
              {p.registered && (
                <div className="registry-help">
                  <small id="inn-help">
                    10 цифр для организации · 12 цифр для ИП
                  </small>
                  {lookupError && (
                    <p id="inn-error" role="alert" className="registry-error">
                      {lookupError}
                    </p>
                  )}
                  <a
                    href="https://egrul.nalog.ru/index.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Открыть официальный поиск ФНС ↗
                  </a>
                </div>
              )}
              <dl className="profile-table">
                <div>
                  <dt>Название</dt>
                  <dd>{p.name}</dd>
                </div>
                {p.registered && (
                  <>
                    <div>
                      <dt>Форма бизнеса</dt>
                      <dd>{p.form}</dd>
                    </div>
                    <div>
                      <dt>Возраст бизнеса</dt>
                      <dd>{age}</dd>
                    </div>
                    <div>
                      <dt>Статус</dt>
                      <dd>
                        <span className="status-dot" />
                        {p.registryRecord
                          ? {
                              ACTIVE: "Действующая компания",
                              LIQUIDATED: "Прекратила деятельность",
                              LIQUIDATING: "В процессе ликвидации",
                              REORGANIZING: "Реорганизация",
                              BANKRUPT: "Банкротство",
                            }[String(p.registryRecord.status)] ||
                            String(
                              p.registryRecord.status ||
                                "Статус требует уточнения",
                            )
                          : "Регистрационные сведения не проверены"}
                      </dd>
                    </div>
                    <div>
                      <dt>Регион</dt>
                      <dd>{p.region || "Не указан"}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Источник</dt>
                  <dd>{p.source || "Ответы пользователя в анкете"}</dd>
                </div>
              </dl>
            </div>
            <div className="onboard-facts">
              <h3>Общие сведения</h3>
              {[
                [
                  Building2,
                  "Стадия бизнеса",
                  p.stage === "operating" ? "Действующий" : "Планирую запуск",
                ],
                [BriefcaseBusiness, "Отрасль", p.sector],
                [FileText, "Вид деятельности", p.activity || p.sector],
                [
                  Clock3,
                  "Срок работы / подготовки",
                  p.preparation || p.ageBand || "Не указан",
                ],
              ].map(([Icon, label, value]: any) => (
                <div key={label}>
                  <span className="icon-tile">
                    <Icon size={20} />
                  </span>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="panel documents-panel">
        <div className="panel-title">
          <div>
            <h2>Документы бизнеса</h2>
            <p>Загрузите один раз — используйте во всех разделах.</p>
          </div>
          <Badge>
            {w.state.documents.filter((d) => d.confirmed).length} из 6 загружено
          </Badge>
        </div>
        <div className="document-grid">
          {documentTypes.map(([c, title], i) => {
            const d = w.state.documents.find(
                (x) => x.category === c && x.confirmed,
              ),
              pending = w.state.documents.find(
                (x) => x.category === c && !x.confirmed,
              );
            const na = p.form === "ИП" && ["balance", "pnl"].includes(c);
            return (
              <article className="document-card" key={c}>
                <span className={"doc-icon color-" + i}>
                  <DocumentIllustration category={c} size={32} decorative />
                </span>
                <h3>{title}</h3>
                <span className={"doc-status " + (d ? "loaded" : "")}>
                  {d ? <Check size={14} /> : <span className="neutral-dot" />}
                  {d ? "Загружен" : "Не загружен"}
                </span>
                <small>
                  {d
                    ? d.period
                    : na
                      ? "Для ИП может быть неприменим"
                      : c === "model" || c === "plan"
                        ? "Плановые показатели проекта"
                        : "Подтверждение фактических данных"}
                </small>
                {d && (
                  <div className="file-name">
                    <FileText size={15} />
                    {d.name}
                  </div>
                )}
                <div className="document-actions">
                  {d ? (
                    <a
                      className="button secondary"
                      href={"/api/documents/" + d.id + "/download"}
                    >
                      <Download size={15} /> Открыть
                    </a>
                  ) : (
                    <Button
                      secondary
                      disabled={w.uploading}
                      onClick={() => {
                        setCategory(c);
                        input.current?.click();
                      }}
                    >
                      <Paperclip size={15} /> Загрузить
                    </Button>
                  )}
                  {d && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setCategory(c);
                        input.current?.click();
                      }}
                    >
                      Заменить
                    </button>
                  )}
                </div>
                {d && (
                  <button
                    className="text-button"
                    onClick={() => setViewDoc(d.id)}
                  >
                    Показать данные
                  </button>
                )}
                {pending && (
                  <button
                    className="text-button pending-note"
                    onClick={() => w.reviewDocument(pending)}
                  >
                    Проверить извлечённые данные
                  </button>
                )}
                <a
                  className="template-link"
                  href={
                    "/fixtures/" +
                    c +
                    (c === "model"
                      ? ".xlsx"
                      : c === "plan"
                        ? ".docx"
                        : c === "pnl"
                          ? ".pdf"
                          : ".csv")
                  }
                  download
                >
                  Скачать шаблон с примером
                </a>
                {c === "pnl" && (
                  <a
                    className="template-link"
                    href="/fixtures/pnl-comparable.csv"
                    download
                  >
                    Шаблон ОФР для сравнения периодов
                  </a>
                )}
              </article>
            );
          })}
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept=".csv,.xlsx,.docx,.pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void w.upload(f, category);
            e.target.value = "";
          }}
        />
        <p className="fine-print">
          <Info size={14} /> До 8 МБ. PDF с текстовым слоем, XLSX, CSV, DOCX в
          поддерживаемых шаблонах. OCR сканов не поддерживается. Зелёная галочка
          появится после проверки и вашего подтверждения.
        </p>
      </section>
      {candidate && (
        <Modal
          title="Подтвердите сведения о бизнесе"
          onClose={() => setCandidate(null)}
        >
          <Badge tone={candidate.demo ? "red" : "green"}>
            {candidate.source}
          </Badge>
          <dl className="profile-table">
            {Object.entries(candidate)
              .filter(([k]) => !["demo", "source"].includes(k))
              .map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {{
                      name: "Название",
                      inn: "ИНН",
                      form: "ОПФ",
                      registeredAt: "Дата регистрации",
                      region: "Регион",
                      activity: "Деятельность",
                      status: "Статус",
                      okved: "ОКВЭД",
                    }[k] || k}
                  </dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
          <div className="modal-actions">
            <Button secondary onClick={() => setCandidate(null)}>
              Отменить
            </Button>
            <Button
              onClick={async () => {
                await w.act("/lookup/confirm", candidate);
                setCandidate(null);
              }}
            >
              Подтвердить <Check size={16} />
            </Button>
          </div>
        </Modal>
      )}
      {viewDoc && (
        <Modal
          title="Подтверждённые показатели документа"
          onClose={() => setViewDoc(null)}
        >
          {Object.entries(
            w.state.documents.find((d) => d.id === viewDoc)!.fields,
          ).map(([k, v]) => (
            <div className="data-row" key={k}>
              <span>{w.config.fieldNames[k] || k}</span>
              <b>{String(v)}</b>
            </div>
          ))}
        </Modal>
      )}
    </main>
  );
}
