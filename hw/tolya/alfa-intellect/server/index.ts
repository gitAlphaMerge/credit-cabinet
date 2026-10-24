import "dotenv/config";
import { app } from "./app";
import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startTeamAgentProcess } from "./team-agent-process";
void startTeamAgentProcess();
const production =
  process.env.NODE_ENV !== "development" && existsSync("dist/index.html");
app.use("/fixtures", express.static(resolve("fixtures")));
if (production) {
  app.use(express.static(resolve("dist")));
  // Managed worktrees live below .codex; allow that ancestor only for this fixed
  // public SPA file, never for user-controlled paths or uploads.
  app.use((_req, res) => res.sendFile(resolve("dist/index.html"), { dotfiles: "allow" }));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4173);
app
  .listen(port, process.env.HOST || "127.0.0.1", (error?: Error) => {
    if (!error)
      console.log(
        `Альфа-Интеллект: http://localhost:${port} · ${production ? "production" : "development"}`,
      );
  })
  .on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Порт ${port} уже занят. Остановите прежний сервер или задайте другой PORT.`
        : `Не удалось запустить сервер: ${error.message}`,
    );
    process.exit(1);
  });
