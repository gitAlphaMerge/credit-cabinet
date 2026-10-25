import { useEffect, useRef, useState } from "react";
import { MvpOnboarding } from "./Mvp2";
import { api, workspaceHeaders } from "./api";
import type { OnboardingAnswers } from "../shared/mvp2";
import { onboardingSchema } from "../shared/mvp2";
import { ProductPreparation } from "./ProductPreparation";
export function JourneyOnboarding({
  go,
  onComplete,
}: {
  go: (path: string) => void;
  onComplete: () => Promise<void>;
}) {
  const [saved, setSaved] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(0);
  const queue = useRef(Promise.resolve()),
    sequence = useRef(0),
    latest = useRef<{
      answers: OnboardingAnswers;
      step: number;
      sequence: number;
    } | null>(null);
  useEffect(() => {
    void api("/journey")
      .then(async (position) => {
        if (position.applicationId) {
          const current = await api(
            `/mvp2/applications/${position.applicationId}`,
          );
          if (current.lifecycle !== "DRAFT" || current.error) {
            await onComplete();
            go("/apply");
            return;
          }
        }
        sequence.current = position.onboardingSequence ?? 0;
        setSaved(position);
      })
      .catch((e) => setError(e.message));
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
  if (busy) return <ProductPreparation stage={stage} />;
  if (!saved)
    return (
      <main className="loading-screen">
        <p role="status">{error || "Восстанавливаем ответы…"}</p>
      </main>
    );
  return (
    <>
      <MvpOnboarding
        initial={saved.onboarding ?? undefined}
        initialStep={saved.onboardingStep ?? 0}
        go={go}
        busy={busy}
        onProgress={(answers, step) => {
          setSaved((previous: any) => ({
            ...previous,
            onboarding: answers,
            onboardingStep: step,
          }));
          const payload = { answers, step, sequence: ++sequence.current };
          latest.current = payload;
          queue.current = queue.current
            .catch(() => {})
            .then(() => api("/journey/onboarding", payload, "PUT"))
            .then(() => {})
            .catch((e) => setError(e.message));
        }}
        onDone={async (answers) => {
          setSaved((previous: any) => ({
            ...previous,
            onboarding: answers,
            onboardingStep: 2,
          }));
          setBusy(true);
          setError("");
          try {
            onboardingSchema.parse(answers);
            setStage(0);
            await queue.current;
            setStage(1);
            await api("/journey/complete", { answers });
            setStage(2);
            await onComplete();
            go("/apply");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
