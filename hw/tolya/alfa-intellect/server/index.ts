import "dotenv/config";
import { app } from "./app";
import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const production =
  process.env.NODE_ENV !== "development" && existsSync("dist/index.html");
app.use("/fixtures", express.static(resolve("fixtures")));
if (production) {
  app.use(express.static(resolve("dist")));
  app.use((_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4173);
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Альфа-Интеллект: http://localhost:${port} · ${production ? "production" : "development"}`,
  ),
);
