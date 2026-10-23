// Isolated production API analogue: same app, static middleware and listen as index.ts.
// No dotenv read, Vite, harness or load generator in the measured process.
import express from "express";
import { resolve } from "node:path";
import { memory, heap } from "./q2-memory";

process.env.EGR_PROVIDER = "mock";
delete process.env.TEAM_AGENT_URL;
delete process.env.OPENAI_API_KEY;
const { app } = await import("../../server/app");
const { db } = await import("../../server/store");
const a = await import("../../server/applications");
app.set("trust proxy", "loopback");
a.configureApplications({
  clock: () => new Date(),
  core: {
    score: async () => ({
      core_result: {
        core: {
          stops_fired: [],
          missing: [],
          limit_now_rub: 1_000_000,
          limit_after_rub: 1_000_000,
          reasons: [],
          status: "можно подавать",
          instrument: "кредит",
        },
      },
    }),
  },
});
app.use("/fixtures", express.static(resolve("fixtures")));
app.use(express.static(resolve("dist")));
app.use((_req, res) => res.sendFile(resolve("dist/index.html")));
let peak = process.memoryUsage().rss;
const sample = () => {
  peak = Math.max(peak, process.memoryUsage().rss);
};
const sampler = setInterval(sample, 10);
const server = app.listen(0, "127.0.0.1", () => {
  memory("server-ready");
  process.send!({
    ready: true,
    port: (server.address() as { port: number }).port,
  });
});
process.on("message", async (message: { phase?: string; stop?: boolean }) => {
  if (message.stop) {
    clearInterval(sampler);
    server.close(() => {
      db.close();
      process.disconnect!();
    });
    return;
  }
  sample();
  const usage = memory(message.phase!);
  process.send!({ phase: message.phase, usage, peak });
  if (process.env.Q2_SNAPSHOT === message.phase) await heap(message.phase!);
});
