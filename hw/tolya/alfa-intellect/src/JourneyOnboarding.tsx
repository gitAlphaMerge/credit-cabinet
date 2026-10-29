import { LoadingScreen } from "./LoadingScreen";
import { useMinimumLoading } from "./loading-hold";
import { JOURNEY_RESTORE_HOLD_MS } from "./loading-timing";
import { useEffect, useRef, useState } from "react";
import { MvpOnboarding } from "./Mvp2";
import { api, workspaceHeaders, setApiWorkspace } from "./api";
import {
  onboardingSchema,
  type OnboardingAnswers,
  type MvpApplication,
} from "../shared/mvp2";
import {
  restoreOnboarding,
  onboardingStepValid,
  type OnboardingPosition,
} from "../shared/onboarding-state";
import { CreditTransition } from "./CreditMotion";
import { SideRail, SideRailItem } from "./SideRail";
import { Brand } from "./ui";
import { RestartJourney } from "./RestartJourney";

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
    [ready, setReady] = useState(false);
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
            // Opening onboarding explicitly starts another pass. Reuse the
            // existing isolated restart so old tabs/pipelines cannot restore it.
            await api("/journey/restart", {});
            if (active) window.location.replace("/onboarding");
            return;
          }
        }
        if (active) adopt(restoreOnboarding(position));
      })
      .catch((e) => {
      if (active) setError(visibleError(e));
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
      if (current.current?.sequence === sequence) setError(visibleError(e));
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
    if (next > 2) {
      setPreparing(true);
      setReady(false);
    }
    try {
      // The rendered position advances only after the complete current snapshot is stored.
      await persist(value.answers, Math.min(2, next));
      if (next <= 2)
        adopt({ ...current.current!, answers: value.answers, step: next });
      else {
        onboardingSchema.parse(value.answers);
        const previousOwner = workspaceHeaders()["X-Journey-Workspace"];
        const application = await api<MvpApplication>("/journey/complete", {
          answers: value.answers,
          sequence: current.current!.sequence,
        });
        latest.current = null;
        setApiWorkspace(application.businessId);
        if (previousOwner && previousOwner !== application.businessId) {
          // A previously open form can finish after submission in another tab.
          // Reload the root state for its new owner instead of mixing sessions.
          window.location.replace("/apply");
          return;
        }
        await onComplete();
        setReady(true);
      }
    } catch (e) {
      // Keep the same form and answers; a failed save is not a completed transition.
      void persist(value.answers, value.step).catch(() => {});
      adopt({ ...current.current!, answers: value.answers, step: value.step });
      setError(visibleError(e));
      setPreparing(false);
      setReady(false);
    } finally {
      navigation.current = false;
      setMoving(false);
    }
  }
  const restoring = useMinimumLoading(!model && !error, error ? 0 : JOURNEY_RESTORE_HOLD_MS);
  if (preparing)
    return (
      <div className="onboarding journey-onboarding">
        <header className="public-header">
          <a href="/" aria-label="На главную"><Brand /></a>
          <div className="journey-header-tools"><SideRail><SideRailItem tip="Начать сначала"><RestartJourney /></SideRailItem></SideRail></div>
        </header>
        <main className="product-preparation">
          <CreditTransition
            kind="selection"
            ready={ready}
            error={error}
            onFinish={() => go("/apply")}
          />
        </main>
      </div>
    );
  if (!model || restoring)
    return (
      <main className={error ? "loading-screen" : "journey-loading"}>
        {error ? <p role="status">{error}</p> : <LoadingScreen fullPage title="Восстанавливаем ответы" message="Пуш возвращает вас к сохранённому шагу" />}
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
        go={path => {
          if (navigation.current || !current.current) return;
          navigation.current = true;
          setMoving(true);
          void persist(current.current.answers, current.current.step).then(() => go(path)).catch(e => setError(visibleError(e))).finally(() => {navigation.current = false;setMoving(false);});
        }}
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
import { visibleError } from "./application-client";
