import type { MissingField } from "../shared/mvp2";
import { safeDisplayText } from "./application-client";

/** Show the next open request and keep the rest available for context. */
export function MissingDataStep({
  items,
  onSkip,
}: {
  items: MissingField[];
  onSkip: (id: string) => void;
}) {
  const active = items.find((item) => (item.status ?? "todo") === "todo");
  if (!active) return null;
  return (
    <div className="mvp-missing-step">
      <article data-active="true" className="mvp-account">
        <h3>{safeDisplayText(active.title ?? active.label)}</h3>
        <p>Зачем: {safeDisplayText(active.why ?? active.label)}</p>
        <p>Что изменится: {safeDisplayText(active.effect ?? "Банк продолжит проверку заявки.")}</p>
        <button type="button" onClick={() => onSkip(active.id ?? active.key)}>
          Подать без этого
        </button>
      </article>
      {items.filter((item) => item.id !== active.id).length > 0 && (
        <details>
          <summary>Остальные пункты запроса</summary>
          <ol>
            {items.filter((item) => item.id !== active.id).map((item) => (
              <li key={item.id ?? item.key}>
                {safeDisplayText(item.title ?? item.label)}: {item.status === "uploaded" ? "загружено" :
                  item.status === "accepted" ? "принято" :
                  item.status === "skipped" ? "подано без этого" : "ожидает"}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
