import { appendFile, mkdir } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Health = { ok?: boolean; llm?: string };
type LogEvent = Record<string, unknown> & { event: string; ts: string };

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const logPath = resolve(repositoryRoot, "var/log/team-agent.log");
let ownedAgent: ChildProcess | undefined;
let exitListenerInstalled = false;

async function health(url: string, timeoutMs: number): Promise<Health> {
  const response = await fetch(new URL("/health", url), { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`health HTTP ${response.status}`);
  return (await response.json()) as Health;
}

const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function stopOwnedAgent(): void {
  if (ownedAgent && ownedAgent.exitCode === null && !ownedAgent.killed) ownedAgent.kill();
}

function stopAndExit(code: number): void {
  stopOwnedAgent();
  process.exit(code);
}

export function stopTeamAgentProcess(): void {
  stopOwnedAgent();
}

export async function startTeamAgentProcess(
  env: NodeJS.ProcessEnv = process.env,
  spawnProcess: typeof spawn = spawn,
): Promise<void> {
  const configuredUrl = env.TEAM_AGENT_URL;
  if (!configuredUrl) return;

  const started = Date.now();
  const activeLogPath = resolve(env.TEAM_AGENT_LOG || logPath);
  let result: "up" | "down" | "already_up" = "down";
  let reason: string | undefined;
  let pid: number | null = null;
  let llm = "templates";
  let child: ChildProcess | undefined;

  try {
    const current = await health(configuredUrl, 2_000);
    result = "already_up";
    llm = current.llm || llm;
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
    if (env.TEAM_AGENT_AUTOSTART === "1") {
      try {
        const agentUrl = new URL(configuredUrl);
        const port = Number(agentUrl.port || (agentUrl.protocol === "https:" ? 443 : 80));
        child = spawnProcess(env.TEAM_AGENT_PYTHON || "python", [resolve(repositoryRoot, "services/agent/server.py")], {
          cwd: repositoryRoot,
          env: { ...env, AGENT_PORT: String(port), AGENT_LOG: activeLogPath },
          stdio: "ignore",
          windowsHide: true,
        });
        ownedAgent = child;
        pid = child.pid ?? null;
        child.once("exit", (code) => {
          void logTo(activeLogPath, { event: "agent_exit", ts: new Date().toISOString(), pid, code });
          if (ownedAgent === child) ownedAgent = undefined;
        });
        child.once("error", (processError) => {
          void logTo(activeLogPath, {
            event: "agent_exit", ts: new Date().toISOString(), pid, code: null,
            reason: processError.message,
          });
        });
        if (!exitListenerInstalled) {
          process.once("SIGINT", () => stopAndExit(130));
          process.once("SIGTERM", () => stopAndExit(143));
          process.once("exit", stopOwnedAgent);
          exitListenerInstalled = true;
        }

        const deadline = Date.now() + 15_000;
        let lastError: unknown = error;
        while (Date.now() < deadline && child.exitCode === null) {
          try {
            const startedHealth = await health(configuredUrl, Math.min(1_000, Math.max(1, deadline - Date.now())));
            result = "up";
            reason = undefined;
            llm = startedHealth.llm || llm;
            break;
          } catch (healthError) {
            lastError = healthError;
            await delay(250);
          }
        }
        if (result !== "up") {
          reason = lastError instanceof Error ? lastError.message : String(lastError);
          if (child.exitCode === null && !child.killed) child.kill();
        }
      } catch (spawnError) {
        reason = spawnError instanceof Error ? spawnError.message : String(spawnError);
      }
    }
  }

  await logTo(activeLogPath, {
    event: "agent_start",
    ts: new Date().toISOString(),
    url: configuredUrl,
    pid,
    llm,
    result,
    ...(result === "down" ? { reason } : {}),
    ms: Date.now() - started,
  });

  // Leave the cabinet running. Its chat provider reports agent-offline on use.
}

async function logTo(path: string, event: LogEvent): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // A logging failure must not stop the cabinet from starting.
  }
}
