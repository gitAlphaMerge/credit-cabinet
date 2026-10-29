import { LoadingScreen } from "./LoadingScreen";
import type { CSSProperties } from "react";
import { useId } from "react";
import { Upload, CheckCircle2, FileText } from "lucide-react";
import { money } from "./api";
export type StatementMetadata = {
  id: string;
  accountId: string;
  name: string;
  period: string;
  operations: number;
  months?: string[];
  extracted?: { inflow: number; outflow: number; source: string };
};
export function StatementUpload({
  label,
  statement,
  disabled,
  error,
  onUpload,
  onRemove,
  onDiscrepancy,
  uploading = false,
  removingDisabled = false,
}: {
  label: string;
  statement?: StatementMetadata;
  disabled: boolean;
  error?: string;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  onDiscrepancy?: () => void;
  uploading?: boolean;
  removingDisabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="statement-upload">
      <span>{label}</span>
      <input
        className="visually-hidden"
        id={id}
        type="file"
        aria-label={label}
        accept=".csv,text/csv"
        disabled={disabled}
        aria-describedby={error ? id + "-error" : undefined}
        aria-invalid={!!error}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <label
        htmlFor={id}
        className={"statement-upload-trigger" + (disabled ? " disabled" : "")}
      >
        <Upload size={18} />
        {uploading
          ? "Загружаем и проверяем CSV…"
          : statement
            ? "Заменить CSV-выписку"
            : "Загрузить CSV-выписку"}
      </label>
      {statement && (
        <div className="statement-status">
          <FileText size={18} />
          <div>
            <strong>{statement.name}</strong>
            <small>
              {statement.period} · {statement.operations} операций · проверено
            </small>
          </div>
          <CheckCircle2 size={18} />
        </div>
      )}
      {!statement && !uploading && !error && (
        <small className="muted">Файл пока не добавлен · формат CSV</small>
      )}
      {uploading && (
        <LoadingScreen compact title="Пуш проверяет выписку" message="Передаём файл и проверяем операции" />
      )}
      {uploading && (
        <small role="status">
          Передаём файл и проверяем операции. Результат появится после ответа
          сервера.
        </small>
      )}
      {statement?.months && statement.months.length < 6 && (
        <p className="mvp-notice">
          История операций: {statement.months.length} мес. Файл сохранён, но для
          базовой оценки потребуется дополнительная история. Это не ошибка
          формата и не отказ.
        </p>
      )}
      {statement?.extracted && (
        <div className="statement-extracted">
          <span>Из выписки · {statement.period}</span>
          <dl>
            <div>
              <dt>Поступления за период</dt>
              <dd>{money(statement.extracted.inflow)}</dd>
            </div>
            <div>
              <dt>Списания за период</dt>
              <dd>{money(statement.extracted.outflow)}</dd>
            </div>
          </dl>
          <small>
            {statement.extracted.source}. Это обороты, а не свободный денежный
            поток или одобренный лимит.
          </small>
        </div>
      )}
      {statement && (
        <div className="statement-file-actions">
          {onDiscrepancy && (
            <button type="button" onClick={onDiscrepancy}>
              Сообщить о расхождении
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              disabled={removingDisabled || uploading}
              onClick={onRemove}
            >
              Удалить выписку
            </button>
          )}
        </div>
      )}
      {error && (
        <small className="mvp-error" id={id + "-error"} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
