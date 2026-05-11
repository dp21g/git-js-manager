import { createApiApp, createState, DEFAULT_API_PORT } from "./app.mjs";

const state = createState();
const app = createApiApp(state, {
  enableCors: true,
  frontendDist: process.env.GIT_SQUASH_UI_FRONTEND_DIST || null,
});

const server = app.listen(DEFAULT_API_PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${DEFAULT_API_PORT}`;
  console.log(`git squash ui sidecar ready on ${url}`);
});

server.on("error", (error) => {
  console.error(`git squash ui sidecar failed to start: ${error.message}`);
  process.exit(1);
});
