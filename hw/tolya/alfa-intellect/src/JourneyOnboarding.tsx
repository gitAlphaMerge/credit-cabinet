import { useEffect, useRef, useState } from "react";
import { MvpOnboarding } from "./Mvp2";
import { api } from "./api";
import type { OnboardingAnswers } from "../shared/mvp2";
export function JourneyOnboarding({
  go,
  onComplete,
}: {
  go: (path: string) => void;
  onComplete: () => Promise<void>;
}) {
  const [saved, setSaved] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    void api("/journey")
      .then(setSaved)
      .catch((e) => setError(e.message));
  }, []);
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
          queue.current = queue.current
            .catch(() => {})
            .then(() => api("/journey/onboarding", { answers, step }, "PUT"))
            .then(() => {})
            .catch((e) => setError(e.message));
        }}
        onDone={async (answers) => {
          setBusy(true);
          setError("");
          try {
            await queue.current;
            await api("/journey/complete", { answers });
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
