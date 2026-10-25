import { useId } from "react";
import { Upload, CheckCircle2, FileText } from "lucide-react";
export type StatementMetadata = {
  id: string;
  accountId: string;
  name: string;
  period: string;
  operations: number;
};
export function StatementUpload({
  label,
  statement,
  disabled,
  error,
  onUpload,
}: {
  label: string;
  statement?: StatementMetadata;
  disabled: boolean;
  error?: string;
  onUpload: (file: File) => void;
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
        {statement ? "Заменить CSV-выписку" : "Загрузить CSV-выписку"}
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
      {error && (
        <small className="mvp-error" id={id + "-error"} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
