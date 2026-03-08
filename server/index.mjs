import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoutes } from "./routes.mjs";
import { git } from "./git.mjs";
import { createLogStore } from "./logs.mjs";
import { readConfig } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3174;

// ── Shared state ─────────────────────────────────────────────────────────────
const state = { repoPath: null, logs: createLogStore() };

// Check CLI arg
const arg = process.argv[2];
if (arg && !arg.startsWith("-")) {
  const abs = path.resolve(arg);
  if (git("rev-parse --git-dir", abs).ok) state.repoPath = abs;
}

// Fall back to cwd
if (!state.repoPath && git("rev-parse --git-dir", process.cwd()).ok) {
  state.repoPath = process.cwd();
}

if (!state.repoPath) {
  const config = readConfig();
  if (config.lastRepo && git("rev-parse --git-dir", config.lastRepo).ok) {
    state.repoPath = config.lastRepo;
  }
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// API routes
app.use("/api", createRoutes(state));

// Serve built frontend in production
const distPath = path.join(__dirname, "..", "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\x1b[32m$\x1b[0m git squash ui`);
  console.log(`  repo:  ${state.repoPath || "(none — pick in browser)"}`);
  console.log(`  api:   \x1b[36m${url}\x1b[0m`);
  console.log(`  press Ctrl+C to stop\n`);
});
