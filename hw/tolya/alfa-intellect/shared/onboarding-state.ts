import {
  catalogAmount,
  onboardingSchema,
  type OnboardingAnswers,
} from "./mvp2";

export const emptyOnboarding: OnboardingAnswers = {
  industry: "",
  age: "",
  purpose: "",
  amountRange: "",
  amount: null,
  term: 12,
  usage: "",
  repayment: "",
};
export function onboardingStepValid(a: OnboardingAnswers, step: number) {
  if (step === 0) return !!a.industry && !!a.age;
  if (step === 1)
    return (
      !!a.purpose &&
      Number.isInteger(a.term) &&
      a.term >= 1 &&
      a.term <= 60 &&
      (a.amountRange === "Не знаю" ||
        (typeof a.amount === "number" &&
          Number.isInteger(a.amount) &&
          a.amount >= catalogAmount.min &&
          a.amount <= catalogAmount.max))
    );
  return step === 2 && !!a.usage && !!a.repayment;
}
/** Restore the saved explicit position. Filled later answers never skip screens. */
export function restoreOnboarding(position: {
  onboarding?: unknown;
  onboardingStep?: number;
  onboardingSequence?: number;
}) {
  const answers = { ...emptyOnboarding };
  const raw = position.onboarding as Record<string, unknown> | undefined;
  for (const key of Object.keys(answers) as (keyof OnboardingAnswers)[]) {
    if (!raw || raw[key] === undefined) continue;
    const value = onboardingSchema.shape[key].safeParse(raw[key]);
    if (value.success) Object.assign(answers, { [key]: value.data });
  }
  let step = Math.max(0, Math.min(2, Math.trunc(position.onboardingStep ?? 0)));
  for (let previous = 0; previous < step; previous++)
    if (!onboardingStepValid(answers, previous)) {
      step = previous;
      break;
    }
  return { answers, step, sequence: position.onboardingSequence ?? 0 };
}
export type OnboardingPosition = ReturnType<typeof restoreOnboarding>;
