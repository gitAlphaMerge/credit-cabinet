import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startTeamAgentProcess } from "../server/team-agent-process";

async function withLog(run: (logPath: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "team-agent-test-"));
  try { await run(join(directory, "team-agent.log")); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

async function listen(handler: import("node:http").RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no test server address");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("already_up records health details", async () => withLog(async (TEAM_AGENT_LOG) => {
  const fixture = await listen((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, llm: "test-model" }));
  });
  try {
    await startTeamAgentProcess({ TEAM_AGENT_URL: fixture.url, TEAM_AGENT_LOG, TEAM_AGENT_AUTOSTART: "0" });
    const [event] = (await readFile(TEAM_AGENT_LOG, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(event.result, "already_up");
    assert.equal(event.llm, "test-model");
  } finally { fixture.server.close(); }
}));

test("down records a reason and returns so the cabinet can start", async () => withLog(async (TEAM_AGENT_LOG) => {
  await startTeamAgentProcess({ TEAM_AGENT_URL: "http://127.0.0.1:1", TEAM_AGENT_LOG, TEAM_AGENT_AUTOSTART: "0" });
  const [event] = (await readFile(TEAM_AGENT_LOG, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(event.result, "down");
  assert.match(event.reason, /fetch|connect|ECONNREFUSED/i);
}));

test("child exit is journaled", async () => withLog(async (TEAM_AGENT_LOG) => {
  const { stopTeamAgentProcess } = await import("../server/team-agent-process");
  let requests = 0;
  const fixture = await listen((_request, response) => {
    requests += 1;
    if (requests === 1) response.writeHead(503).end("starting");
    else response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, llm: "templates" }));
  });
  try {
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { pid: 1234, exitCode: null, killed: false,
      kill: () => { Object.assign(child, { exitCode: 0, killed: true }); child.emit("exit", 0, null); return true; } });
    await startTeamAgentProcess(
      { TEAM_AGENT_URL: fixture.url, TEAM_AGENT_LOG, TEAM_AGENT_AUTOSTART: "1" },
      (() => child) as never,
    );
    stopTeamAgentProcess();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const events = (await readFile(TEAM_AGENT_LOG, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events[0].result, "up");
    assert.equal(events[1].event, "agent_exit");
    assert.equal(events[1].pid, 1234);
    assert.equal(events[1].code, 0);
  } finally { fixture.server.close(); }
}));
