const BASE = "/api";

let currentRepoPath = "";

export function setActiveRepo(path) {
  currentRepoPath = path;
}

async function request(path, opts = {}) {
  const headers = { ...opts.headers };
  if (currentRepoPath) {
    headers["X-Repo-Path"] = currentRepoPath;
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  return res.json();
}

export function getInfo() {
  return request("/info");
}

export function getCommits(base) {
  return request(`/commits?base=${encodeURIComponent(base)}`);
}

export function squash(base, fixupIndices) {
  return request("/squash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base, fixup_indices: fixupIndices }),
  });
}

export function undoSquash() {
  return request("/undo", { method: "POST" });
}

export function getDiff(hashes) {
  return request("/diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });
}

export function getFiles(hashes) {
  return request("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });
}

export function compareBranches(branch1, branch2) {
  return request("/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch1, branch2 }),
  });
}

export function reverse(hashes) {
  return request("/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hashes }),
  });
}

export function reversePatch(patch) {
  return request("/reverse-patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch }),
  });
}

export function listDir(path) {
  return request(`/ls?path=${encodeURIComponent(path)}`);
}

export function setRepo(path) {
  return request("/set-repo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export function nativeDialog() {
  return request("/native-dialog", { method: "POST" });
}

export function getFolderConfig() {
  return request("/folder-config");
}

export function toggleFavourite(path) {
  return request("/favourite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export function getLogs() {
  return request("/logs");
}

export function testGetBranches() {
  return request("/test-get-branches", { method: "POST" });
}

export function saveRepoState(state) {
  return request("/save-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

export function getStatus() {
  return request("/status");
}

export function stageFile(action, path) {
  return request("/stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, path }),
  });
}

export function commit(message) {
  return request("/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}

export function getWorkingDiff(path, staged) {
  return request("/working-diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, staged }),
  });
}

export function getExcludes() {
  return request("/excludes");
}

export function manageExclude(action, pattern) {
  return request("/exclude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, pattern }),
  });
}

export function updateTabs(tabs) {
  return request("/update-tabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabs }),
  });
}
