import type { Metric } from "../shared/cabinet";
export function metricScale(m: Pick<Metric, "id" | "value">) {
  const n = m.value,
    clamp = (n: number) => Math.max(0, Math.min(100, n));
  if (m.id === "dscr")
    return {
      position: n === null ? null : clamp((n / 2) * 100),
      kind: "coverage",
      left: "Ниже 1,0",
      right: "От 1,3",
      note: "DSCR: ниже 1,0 — поток не покрывает долг; 1,0–1,3 — небольшой запас; от 1,3 — запас выше. Ориентиры MVP, не банковские нормативы.",
    };
  if (m.id === "share")
    return {
      position: n === null ? null : clamp(100 - n),
      kind: "direction",
      left: "Выше доля",
      right: "Ниже доля",
      note: "Направление нагрузки: меньшая доля платежей оставляет больше поступлений на другие задачи. Безопасного универсального процента нет; обязательные расходы эта доля не учитывает. Шкала: 100% и выше слева, 0% справа.",
    };
  if (m.id === "growth")
    return {
      position:
        n === null ? null : clamp(50 + (Math.atan(n / 25) / Math.PI) * 100),
      kind: "direction",
      left: "Снижение",
      right: "Рост",
      note: "Индикатор показывает только направление изменения выручки относительно нуля. Это не рейтинг бизнеса и не оценка способности платить кредит. Величина показана числом; края шкалы не являются нормативами.",
    };
  return {
    position: n === null ? null : clamp(50 + n / 2),
    kind: "direction",
    left: "Убыток",
    right: "Прибыль",
    note: "Индикатор показывает знак и величину рентабельности продаж, от −100% до +100% с ограничением по краям. Положительное значение не означает, что маржа достаточна для отрасли; универсальная зелёная норма не назначается.",
  };
}
export const cabinetRoute = (path: string) =>
  ["/cabinet-v2", "/efficiency"].includes(path) ? "/cabinet" : path;
