import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiApp, createState, DEFAULT_API_PORT } from "./app.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = DEFAULT_API_PORT;
const state = createState();
const distPath = path.join(__dirname, "..", "dist");

const app = createApiApp(state, {
  enableCors: true,
  frontendDist: process.env.NODE_ENV === "production" ? distPath : null,
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\x1b[32m$\x1b[0m git squash ui`);
  console.log(`  repo:  ${state.repoPath || "(none — pick in browser)"}`);
  console.log(`  api:   \x1b[36m${url}\x1b[0m`);
  console.log(`  press Ctrl+C to stop\n`);
});
