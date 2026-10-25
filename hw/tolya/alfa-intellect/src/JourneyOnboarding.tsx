import { useEffect, useRef, useState } from "react";
import { MvpOnboarding } from "./Mvp2";
import { api, workspaceHeaders } from "./api";
import { onboardingSchema, type OnboardingAnswers } from "../shared/mvp2";
import {
  restoreOnboarding,
  onboardingStepValid,
  type OnboardingPosition,
} from "../shared/onboarding-state";
import { ProductPreparation } from "./ProductPreparation";

export function JourneyOnboarding({
  go,
  onComplete,
}: {
  go: (path: string) => void;
  onComplete: () => Promise<void>;
}) {
  const [model, setModel] = useState<OnboardingPosition>(),
    [error, setError] = useState(""),
    [moving, setMoving] = useState(false),
    [preparing, setPreparing] = useState(false),
    [stage, setStage] = useState(0);
  const current = useRef<OnboardingPosition | undefined>(undefined),
    queue = useRef(Promise.resolve()),
    latest = useRef<{
      answers: OnboardingAnswers;
      step: number;
      sequence: number;
    } | null>(null),
    navigation = useRef(false);
  function adopt(next: OnboardingPosition) {
    current.current = next;
    setModel(next);
  }
  useEffect(() => {
    let active = true;
    void api("/journey")
      .then(async (position) => {
        if (!active) return;
        if (position.applicationId) {
          const a = await api(`/mvp2/applications/${position.applicationId}`);
          if (!active) return;
          if (a.lifecycle !== "DRAFT" || a.error) {
            await onComplete();
            if (active) go("/apply");
            return;
          }
        }
        if (active) adopt(restoreOnboarding(position));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const preserve = () => {
      if (latest.current)
        void fetch("/api/journey/onboarding", {
          method: "PUT",
          credentials: "same-origin",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...workspaceHeaders(),
          },
          body: JSON.stringify(latest.current),
        }).catch(() => {});
    };
    addEventListener("pagehide", preserve);
    return () => removeEventListener("pagehide", preserve);
  }, []);
  function persist(answers: OnboardingAnswers, step: number) {
    const value = {
      answers,
      step,
      sequence: (current.current?.sequence ?? 0) + 1,
    };
    current.current = { ...value };
    latest.current = value;
    const request = queue.current
      .catch(() => {})
      .then(() => api("/journey/onboarding", value, "PUT"))
      .then(() => {});
    queue.current = request.catch(() => {});
    return request;
  }
  function update(answers: OnboardingAnswers) {
    if (!current.current || navigation.current) return;
    const step = current.current.step;
    const request = persist(answers, step);
    const sequence = current.current!.sequence;
    adopt({ ...current.current!, answers, step });
    void request.then(
      () => {
        if (current.current?.sequence === sequence) setError("");
      },
      (e) => {
        if (current.current?.sequence === sequence) setError(e.message);
      },
    );
  }
  async function move(next: number) {
    const value = current.current;
    if (!value || navigation.current) return;
    if (next > value.step && !onboardingStepValid(value.answers, value.step))
      return;
    navigation.current = true;
    setMoving(true);
    setError("");
    try {
      // The rendered position advances only after the complete current snapshot is stored.
      await persist(value.answers, Math.min(2, next));
      if (next <= 2)
        adopt({ ...current.current!, answers: value.answers, step: next });
      else {
        onboardingSchema.parse(value.answers);
        setPreparing(true);
        setStage(1);
        await api("/journey/complete", {
          answers: value.answers,
          sequence: current.current!.sequence,
        });
        latest.current = null;
        setStage(2);
        await onComplete();
        go("/apply");
      }
    } catch (e) {
      // Keep the same form and answers; a failed save is not a completed transition.
      void persist(value.answers, value.step).catch(() => {});
      adopt({ ...current.current!, answers: value.answers, step: value.step });
      setError((e as Error).message);
    } finally {
      navigation.current = false;
      setMoving(false);
      setPreparing(false);
    }
  }
  if (preparing) return <ProductPreparation stage={stage} />;
  if (!model)
    return (
      <main className="loading-screen">
        <p role="status">{error || "Восстанавливаем ответы…"}</p>
        {error && (
          <button onClick={() => location.reload()}>Повторить загрузку</button>
        )}
      </main>
    );
  return (
    <>
      <MvpOnboarding
        value={model.answers}
        step={model.step}
        go={go}
        busy={moving}
        onChange={update}
        onMove={move}
      />
      {error && (
        <div className="toast" role="alert">
          {error} Повторите переход — введённые ответы сохранены в форме.
        </div>
      )}
    </>
  );
}
