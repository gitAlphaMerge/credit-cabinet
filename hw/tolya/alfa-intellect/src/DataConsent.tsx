import type { Questionnaire } from "../shared/mvp2";

export function DataConsent({
  value,
  onChange,
  error,
}: {
  value: Questionnaire["consents"];
  onChange: (value: Questionnaire["consents"]) => void;
  error?: string;
}) {
  return (
    <fieldset className="mvp-span" data-field="consents">
      <legend>Согласие на обработку данных</legend>
      <label className="mvp-check">
        <input
          type="checkbox"
          checked={value.registry && value.financial && value.bki}
          aria-invalid={!!error}
          onChange={(e) => {
            const checked = e.target.checked;
            onChange({ registry: checked, financial: checked, bki: checked });
          }}
        />
        Даю согласие на обработку данных, проверку компании и кредитной истории,
        а также анализ выписок.
      </label>
      <details className="consent-scope">
        <summary>Какие проверки входят?</summary>
        <p>
          Проверка компании, обработка и анализ выписок, проверка кредитной
          истории (БКИ). Дополнительные проверки выполняются после вашего
          согласия. Вы можете ознакомиться с найденными общедоступными
          сведениями о компании до подтверждения.
        </p>
      </details>
      {error && (
        <small className="mvp-error" role="alert">
          {error}
        </small>
      )}
    </fieldset>
  );
}
