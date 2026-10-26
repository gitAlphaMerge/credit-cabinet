export type QuickAction = { id: string; label: string; prompt: string };

export const quickActions = {
  onboarding: [
    {
      id: "requirements",
      label: "Что нужно для кредита",
      prompt:
        "Какие данные и документы нужны, чтобы оценить возможность финансирования?",
    },
    {
      id: "realistic-amount",
      label: "Какая сумма реальна",
      prompt:
        "От чего зависит доступная сумма и как её проверить на моих данных?",
    },
    {
      id: "need-credit",
      label: "Нужен ли мне кредит",
      prompt:
        "Нужен ли мне кредит для этой задачи? Сначала оцени, можно ли обойтись без кредита, какие есть альтернативы и риски долга. Не предлагай кредит по умолчанию.",
    },
  ],
  questionnaire: [
    {
      id: "why-question",
      label: "Зачем этот вопрос",
      prompt:
        "Зачем нужен вопрос текущего раздела анкеты и как ответ влияет на проверку?",
    },
    {
      id: "unknown-answer",
      label: "Что если не знаю",
      prompt: "Что делать, если я не знаю ответ в текущем разделе анкеты?",
    },
    {
      id: "skip-question",
      label: "Можно пропустить?",
      prompt:
        "Можно ли пропустить вопрос текущего раздела и что тогда произойдёт?",
    },
  ],
  documents: [
    {
      id: "statement",
      label: "Какую выписку загрузить",
      prompt:
        "Какую выписку, за какой период и в каком формате загрузить для этой заявки?",
    },
    {
      id: "why-document",
      label: "Зачем этот документ",
      prompt:
        "Зачем нужен документ на этом этапе и какие сведения из него проверяются?",
    },
    {
      id: "statement-data",
      label: "Что видно в выписке",
      prompt:
        "Какие показатели система извлекла из моей выписки, а какие пока не подтверждены?",
    },
  ],
  recommendation: [
    {
      id: "why-limit",
      label: "Почему такой лимит",
      prompt:
        "Какие сохранённые данные повлияли на показанный лимит? Не рассчитывай новый лимит в чате.",
    },
    {
      id: "raise-limit",
      label: "Как поднять лимит",
      prompt:
        "Какие проверяемые шаги могут повысить доступный лимит после нового расчёта?",
    },
    {
      id: "compare-products",
      label: "Сравнить продукты",
      prompt:
        "Сравни доступные продукты по назначению, сроку и платежам для моей задачи.",
    },
  ],
  decision: [
    {
      id: "decision-reason",
      label: "Почему такой результат",
      prompt: "Объясни сохранённый результат и его причины простыми словами.",
    },
    {
      id: "next-step",
      label: "Что дальше",
      prompt: "Какой следующий шаг по моей заявке и от кого зависит решение?",
    },
  ],
  supplement: [
    {
      id: "missing-data",
      label: "Что ещё нужно",
      prompt: "Какие сведения или документы ещё нужны по сохранённому запросу?",
    },
    {
      id: "wait-time",
      label: "Сколько ждать",
      prompt:
        "Когда будет повторная проверка после дополнения данных? Если точного срока нет, скажи об этом.",
    },
    {
      id: "without-document",
      label: "Что без документа",
      prompt:
        "Что будет с заявкой, если я не могу предоставить запрошенный документ?",
    },
  ],
  contract: [
    {
      id: "plain-contract",
      label: "Объясни договор просто",
      prompt:
        "Объясни условия сохранённого договора простыми словами без новых обещаний банка.",
    },
    {
      id: "monthly-payment",
      label: "Какой платёж в месяц",
      prompt:
        "Какой ежемесячный платёж указан в сохранённом договоре и от чего он зависит?",
    },
    {
      id: "early-repayment",
      label: "Можно досрочно?",
      prompt: "Что в сохранённом договоре сказано о досрочном погашении?",
    },
  ],
} as const satisfies Record<string, readonly QuickAction[]>;

export type QuickActionStage = keyof typeof quickActions;

export function quickActionStage(
  view: string,
  section: number,
  decision?: string,
): QuickActionStage {
  if (view === "supplement") return "supplement";
  if (view === "contract" || view === "details") return "contract";
  if (view === "dossier" || (view === "questionnaire" && section === 1))
    return "documents";
  if (view === "recommendation" || view === "catalog" || view === "scenario")
    return "recommendation";
  if (view === "questionnaire") return "questionnaire";
  if (decision === "ADDITIONAL_DATA_REQUIRED") return "supplement";
  if (view === "decision" || view === "processing" || decision)
    return "decision";
  return "onboarding";
}

export function sendQuickAction(
  action: QuickAction,
  send: (prompt: string) => void,
): void {
  send(action.prompt);
}
