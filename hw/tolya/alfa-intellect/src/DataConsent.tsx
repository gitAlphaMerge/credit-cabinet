import type { Questionnaire } from "../shared/mvp2";

export function DataConsent({
  value,
  onChange,
}: {
  value: Questionnaire["consents"];
  onChange: (value: Questionnaire["consents"]) => void;
}) {
  return (
    <fieldset className="mvp-span">
      <legend>Согласие на обработку данных</legend>
      <label className="mvp-check">
        <input
          type="checkbox"
          checked={value.registry && value.financial && value.bki}
          onChange={(e) => {
            const checked = e.target.checked;
            onChange({ registry: checked, financial: checked, bki: checked });
          }}
        />
        Даю согласие на обработку данных, проверку компании и кредитной истории,
        а также анализ выписок.
      </label>
    </fieldset>
  );
}
