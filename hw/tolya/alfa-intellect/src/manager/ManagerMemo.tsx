import { useState } from "react";
import { money } from "../api";
import { Modal } from "../ui";
import { finite, clientLabels } from "../application-client";
import type { ApplicationDetail } from "./api";

type Props = {
  detail: ApplicationDetail;
  optionId?: string;
  initialComment?: string;
  busy: boolean;
  onClose(): void;
  onSend(payload: Record<string, string>): Promise<void>;
};
const rub = (n: unknown) => (finite(n) ? money(n) : "нет данных");
const label = (s: string) => clientLabels[s] || "Требует уточнения: " + s;
export function memoBlocks(detail: ApplicationDetail, optionId?: string) {
  const { application: a, dossier: d } = detail;
  const option = d?.alternatives?.find((o) => o.option_id === optionId);
  const n = d?.N ?? d?.readiness_n,
    m = d?.M ?? d?.readiness_m;
  const checks = d?.checks ?? [];
  const amount = option ? option.amount_rub : a.amount;
  return [
    {
      title: "1 · Запрос",
      text: `Запрошено ${rub(a.amount)}. На рассмотрение: ${rub(amount)}.${option ? ` Срок: ${option.term_months} мес.` : ""}`,
    },
    {
      title: "2 · Вердикт ядра",
      text: `Готовность: ${finite(n) && finite(m) ? `${n} из ${m}` : "нет данных"}. Лимит сейчас: ${rub(d?.limit_now_rub)}.`,
    },
    {
      title: "3 · За",
      text: d?.verified?.length
        ? d.verified.map(label).join("; ")
        : "Отдельный список сверенных данных не предоставлен.",
    },
    {
      title: "4 · Против",
      text:
        [...(d?.holes ?? []), ...(d?.stops_fired ?? [])]
          .map(label)
          .join("; ") || "Данные о препятствиях не предоставлены.",
    },
    {
      title: "5 · Проверки",
      text: checks.length
        ? checks
            .map(
              (c) =>
                `${c.source || "Источник не указан"}: ${c.status === "ok" ? "пройдено" : c.status === "unavailable" ? "источник недоступен" : "не пройдено"}. ${c.managerText || "Описание отсутствует"}`,
            )
            .join("\n")
        : "Данных о проверках нет.",
    },
    {
      title: "6 · Рекомендация",
      text:
        finite(amount) &&
        finite(d?.limit_now_rub) &&
        amount > 0 &&
        amount <= d.limit_now_rub
          ? `Передать на проверку сумму ${rub(amount)} в пределах текущего лимита. Решение принимает банк.`
          : "Не передавать: сумма превышает текущий лимит или данные о лимите отсутствуют.",
    },
  ];
}
export function ManagerMemo(p: Props) {
  const [comment, setComment] = useState(p.initialComment || "");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const blocks = memoBlocks(p.detail, p.optionId);
  const option = p.detail.dossier?.alternatives?.find(
    (o) => o.option_id === p.optionId,
  );
  const amount = option ? option.amount_rub : p.detail.application.amount;
  const limit = p.detail.dossier?.limit_now_rub;
  const blocked =
    p.busy ||
    sending ||
    p.detail.application.status !== "queued" ||
    !finite(amount) ||
    amount <= 0 ||
    !finite(limit) ||
    amount > limit ||
    (!!p.optionId && !option);
  return (
    <Modal
      title="Записка андеррайтеру"
      wide
      onClose={() => {
        if (!p.busy && !sending) p.onClose();
      }}
    >
      <p>Черновик собран из досье. Проверьте данные, решение отправляете вы.</p>
      <form
        className="manager-memo"
        onSubmit={async (e) => {
          e.preventDefault();
          if (blocked || !checked) return;
          setSending(true);
          setError("");
          try {
            await p.onSend({
              ...(p.optionId ? { option_id: p.optionId } : {}),
              memo:
                blocks.map((b) => `${b.title}\n${b.text}`).join("\n\n") +
                (comment.trim()
                  ? "\n\nКомментарий менеджера:\n" + comment.trim()
                  : ""),
            });
          } catch {
            setError(
              "Не удалось передать записку. Проверьте досье и повторите попытку.",
            );
          } finally {
            setSending(false);
          }
        }}
      >
        <div className="manager-memo-grid">
          {blocks.map((b) => (
            <section key={b.title} className="manager-memo-block">
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </section>
          ))}
        </div>
        <label className="field">
          <span>Комментарий менеджера</span>
          <textarea
            name="comment"
            rows={3}
            maxLength={1000}
            value={comment}
            disabled={blocked}
            onChange={(e) => {
              setComment(e.target.value);
              setChecked(false);
            }}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            required
            checked={checked}
            disabled={blocked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Я проверил досье и согласен с запиской
        </label>
        {blocked && (
          <p>
            Передача доступна для заявки в очереди с суммой в пределах
            известного лимита.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={p.busy || sending}
            onClick={p.onClose}
          >
            Вернуться к досье
          </button>
          <button className="button" disabled={blocked || !checked}>
            Передать андеррайтеру
          </button>
        </div>
      </form>
    </Modal>
  );
}
