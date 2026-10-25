import { useEffect, useState, type ReactNode } from "react";
import { Download, FileText } from "lucide-react";
import { workspaceHeaders } from "./api";
import { Button } from "./ui";
import type { MvpApplication, Product } from "../shared/mvp2";

export async function loadCreditPdf(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: workspaceHeaders(),
    signal,
  });
  if (!response.ok)
    throw new Error("Не удалось загрузить документ. Повторите попытку.");
  const data = await response.arrayBuffer();
  if (
    !response.headers.get("content-type")?.includes("application/pdf") ||
    new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("Сервер не вернул PDF. Повторите загрузку документа.");
  return new Blob([data], { type: "application/pdf" });
}

/** Render the exact persisted backend PDF; never reconstruct contract text in the UI. */
export function CreditDocument({
  url,
  title,
  onReady,
}: {
  url: string;
  title: string;
  onReady?: () => void;
}) {
  const [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl = "";
    setSource("");
    setError("");
    setLoading(true);
    void loadCreditPdf(url, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
      setError(visibleError(e));
          setLoading(false);
        }
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, attempt]);
  return (
    <div className="credit-document-viewer" aria-busy={loading}>
      {loading && (
        <p className="document-loading" role="status">
          <FileText />
          Загружаем {title.toLowerCase()}…
        </p>
      )}
      {error && (
        <div className="document-failure">
          <p role="alert">{error}</p>
          <Button onClick={() => setAttempt((n) => n + 1)}>
            Повторить загрузку документа
          </Button>
        </div>
      )}
      {source && (
        <iframe
          className="mvp-document"
          title={title}
          src={source + "#view=FitH&navpanes=0"}
          onLoad={() => {
            setLoading(false);
            onReady?.();
          }}
        />
      )}
    </div>
  );
}

export function CreditContract({
  application: a,
  product,
  busy,
  summary,
  onReturn,
  onSign,
  onReceive,
}: {
  application: MvpApplication;
  product?: Product;
  busy: boolean;
  summary: ReactNode;
  onReturn: () => void;
  onSign: () => void;
  onReceive: () => void;
}) {
  const [tab, setTab] = useState<"contract" | "schedule">("contract"),
    [read, setRead] = useState(false),
    [viewed, setViewed] = useState(false);
  const root = `/api/mvp2/applications/${a.id}/documents/`;
  const schedule =
    product?.kind === "loan"
      ? "График платежей"
      : "Условия использования лимита";
  return (
    <section className="funding-surface credit-contract">
      <div className="contract-heading">
        <FileText />
        <div>
          <h2>Подписание кредитного договора</h2>
          <p>Проверьте условия договора перед подписанием.</p>
        </div>
      </div>
      {summary}
      <div className="mvp-document-tools">
        <div role="group" aria-label="Документы кредита">
          <Button
            secondary
            aria-pressed={tab === "contract"}
            onClick={() => setTab("contract")}
          >
            Договор
          </Button>
          <Button
            secondary
            aria-pressed={tab === "schedule"}
            onClick={() => setTab("schedule")}
          >
            {schedule}
          </Button>
        </div>
        <a href={root + "contract?download=1"}>
          <Download size={16} />
          Скачать договор PDF
        </a>
        <a href={root + "schedule?download=1"}>
          <Download size={16} />
          {product?.kind === "loan"
            ? "Скачать график PDF"
            : "Скачать условия лимита PDF"}
        </a>
      </div>
      <CreditDocument
        url={root + tab + (a.signature ? "?signed=1" : "")}
        title={tab === "contract" ? "Кредитный договор" : schedule}
        onReady={() => {
          if (tab === "contract") setViewed(true);
        }}
      />
      <footer className="contract-confirmation">
        <div>
          {a.signature ? (
            <p>
              Подпись сохранена. Документ доступен для просмотра и скачивания.
            </p>
          ) : (
            <label className="mvp-check">
              <input
                type="checkbox"
                checked={read}
                disabled={!viewed}
                onChange={(e) => setRead(e.target.checked)}
              />
              Ознакомился с договором и условиями обслуживания
            </label>
          )}
        </div>
        <div className="mvp-actions">
          <Button secondary disabled={busy} onClick={onReturn}>
            Вернуться к решению
          </Button>
          {a.signature ? (
            <Button disabled={busy} onClick={onReceive}>
              К получению средств
            </Button>
          ) : (
            <Button disabled={busy || !read || !viewed} onClick={onSign}>
              {busy ? "Подписываем…" : "Подписать электронной подписью"}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
import { visibleError } from "./application-client";
