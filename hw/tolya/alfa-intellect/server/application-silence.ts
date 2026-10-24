import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { setImmediate as yieldTurn } from "node:timers/promises";
import {
  ApplicationError,
  applicationOf,
  eventsOf,
  offerExpired,
  transitionApplication,
  type Application,
  type Dependencies,
} from "./applications";
import type { AppState } from "../shared/types";

export function silenceConfig(env: NodeJS.ProcessEnv = process.env) {
  const number = (key: string, fallback: number) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(n) || n < 1)
      throw new Error(`Некорректная настройка ${key}`);
    return n;
  };
  // The frozen contract has no numeric timeout. Demo default: one day after
  // a delivered nudge; operators can shorten it explicitly for a demonstration.
  return {
    timeoutMs: number("APPLICATION_SILENCE_MS", 24 * 60 * 60 * 1000),
    intervalMs: number("APPLICATION_SWEEP_MS", 60 * 1000),
  };
}

function stateOf(database: DatabaseSync, uid: string): AppState {
  const row = database.prepare("SELECT state FROM users WHERE id=?").get(uid)!;
  return JSON.parse(String(row.state));
}
function deliverNudge(
  database: DatabaseSync,
  a: Application,
  text: string,
  at: string,
) {
  const state = stateOf(database, a.user_id);
  let chat = state.chats.find((c) => c.selectionId === a.selection_id);
  if (!chat) {
    chat = {
      id: randomUUID(),
      title: "Сведения по заявке",
      selectionId: a.selection_id,
      messages: [],
    };
    state.chats.unshift(chat);
  }
  chat.messages.push({
    id: randomUUID(),
    role: "assistant",
    mode: "application",
    text,
    createdAt: at,
  });
  database
    .prepare("UPDATE users SET state=? WHERE id=?")
    .run(JSON.stringify(state), a.user_id);
}

// Only internal code calls this: the authenticated HTTP handlers never accept
// actorRole from a request body or from X-Role.
export async function disagreeWithApplication(
  database: DatabaseSync,
  a: Application,
  objections: string,
  deps: Dependencies,
) {
  return transitionApplication(
    database,
    {
      applicationId: a.id,
      expectedVersion: a.version,
      event: "escalate_disagreed",
      actorRole: "system",
      actorId: null,
      payload: { client_objections: objections },
    },
    deps,
  );
}

// A previous explicit disagreement remains unresolved if resupply still leaves
// the request red. A green rescore has already produced offered and is untouched.
export async function resumeDisagreedReview(
  database: DatabaseSync,
  a: Application,
  deps: Dependencies,
) {
  if (a.status !== "info_requested") return { application: a };
  const events = eventsOf(database, a.id);
  if (events.at(-1)?.event !== "client_update") return { application: a };
  const request = events.findLast((e) => e.event === "request_info");
  const escalation = events.findLast((e) => e.to_status === "queued");
  if (
    !request ||
    escalation?.event !== "escalate_disagreed" ||
    Number(escalation.seq) > Number(request.seq)
  )
    return { application: a };
  try {
    return await disagreeWithApplication(
      database,
      a,
      JSON.parse(String(escalation.payload)).client_objections,
      deps,
    );
  } catch (error) {
    const current = applicationOf(database, a.id);
    // Concurrent replays may both observe the same completed client_update.
    // Accept only the one expected system escalation, never a later action.
    if (
      error instanceof ApplicationError &&
      error.status === 409 &&
      current.version === a.version + 1 &&
      current.status === "queued" &&
      eventsOf(database, a.id).at(-1)?.event === "escalate_disagreed"
    )
      return { application: current };
    throw error;
  }
}

export async function sweepSilentApplications(
  database: DatabaseSync,
  deps: Dependencies,
  timeoutMs = silenceConfig().timeoutMs,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error("Некорректный порог молчания");
  const rows = database
    .prepare(
      "SELECT * FROM applications WHERE status IN ('info_requested','offered') ORDER BY id",
    )
    .all() as Application[];
  let nudged = 0,
    escalated = 0;
  for (const [index, row] of rows.entries()) {
    if (index % 25 === 0) await yieldTurn();
    const a = applicationOf(database, row.id);
    if (a.status === "offered") {
      if (offerExpired(database, a.id, deps)) {
        try {
          await transitionApplication(
            database,
            {
              applicationId: a.id,
              expectedVersion: a.version,
              event: "expire",
              actorRole: "system",
              actorId: null,
            },
            deps,
          );
        } catch (error) {
          if (applicationOf(database, a.id).version === a.version) throw error;
        }
      }
      continue;
    }
    if (a.status !== "info_requested") continue;
    const events = eventsOf(database, a.id);
    const entry = events.findLast(
      (e) => e.to_status === "info_requested" && e.event !== "agent_nudge",
    );
    const nudge = events.findLast(
      (e) =>
        e.event === "agent_nudge" && Number(e.seq) > Number(entry?.seq ?? 0),
    );
    if (!nudge) {
      const text =
        "По заявке нужны дополнительные сведения. Ответьте в чате или дополните документы, чтобы продолжить проверку.";
      await transitionApplication(
        database,
        {
          applicationId: a.id,
          expectedVersion: a.version,
          event: "agent_nudge",
          actorRole: "system",
          actorId: null,
          payload: { text },
        },
        deps,
      );
      deliverNudge(database, a, text, deps.clock().toISOString());
      nudged++;
      continue;
    }
    const state = stateOf(database, a.user_id);
    const active = database
      .prepare(
        "SELECT COUNT(*) AS n FROM applications WHERE user_id=? AND status IN ('info_requested','queued','offered')",
      )
      .get(a.user_id)!;
    const replies = state.chats
      .filter(
        (c) =>
          c.selectionId === a.selection_id ||
          (!c.selectionId && Number(active.n) === 1),
      )
      .flatMap((c) => c.messages)
      .filter((m) => m.role === "user")
      .map((m) => Date.parse(m.createdAt));
    const lastReply = Math.max(-Infinity, ...replies.filter(Number.isFinite));
    // A reply resolves this reminder even when it has not completed a rescore.
    // Do not describe a responding client as silent or reset their wait clock.
    if (lastReply >= Date.parse(String(nudge.at))) continue;
    if (deps.clock().getTime() - Date.parse(String(nudge.at)) < timeoutMs)
      continue;
    try {
      await transitionApplication(
        database,
        {
          applicationId: a.id,
          expectedVersion: a.version,
          event: "escalate_silent",
          actorRole: "system",
          actorId: null,
          payload: {},
        },
        deps,
      );
      escalated++;
    } catch (error) {
      // CAS rejects races with client_update or another system sweep.
      if (applicationOf(database, a.id).version === a.version) throw error;
    }
  }
  return { nudged, escalated };
}

export function startSilenceSweep(
  database: DatabaseSync,
  dependencies: () => Dependencies,
) {
  const config = silenceConfig();
  let running: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = sweepSilentApplications(
      database,
      dependencies(),
      config.timeoutMs,
    )
      .catch((error) =>
        console.error(
          "[applications] silence sweep failed",
          error instanceof Error ? error.message : "unknown",
        ),
      )
      .finally(() => {
        running = undefined;
      });
  }, config.intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
