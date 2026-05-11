import express from "express";
import path from "node:path";
import { createRoutes } from "./routes.mjs";
import { git } from "./git.mjs";
import { createLogStore } from "./logs.mjs";
import { readConfig } from "./config.mjs";

export const DEFAULT_API_PORT = Number(process.env.GIT_SQUASH_UI_API_PORT || 43174);

export function resolveInitialRepoPath(argv = process.argv.slice(2), cwd = process.cwd()) {
  const resolvedCwd = path.resolve(cwd);
  const arg = argv[0];

  if (arg && !arg.startsWith("-")) {
    const candidate = path.resolve(resolvedCwd, arg);
    if (git("rev-parse --git-dir", candidate).ok) return candidate;
  }

  if (git("rev-parse --git-dir", resolvedCwd).ok) return resolvedCwd;

  const config = readConfig();
  if (config.lastRepo && git("rev-parse --git-dir", config.lastRepo).ok) {
    return config.lastRepo;
  }

  return null;
}

export function createState(options = {}) {
  return {
    repoPath: resolveInitialRepoPath(options.argv, options.cwd),
    logs: createLogStore(),
  };
}

function applyCors(app) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Repo-Path");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });
}

export function createApiApp(state, { enableCors = false, frontendDist = null } = {}) {
  const app = express();

  if (enableCors) applyCors(app);

  app.use(express.json());
  app.use("/api", createRoutes(state));

  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  return app;
}
