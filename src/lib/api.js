const BASE = "/api";

let currentRepoPath = "";

export function setActiveRepo(path) {
  currentRepoPath = path;
}

function stripHtml(text = "") {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHttpErrorMessage(path, status, rawBody = "") {
  if (status === 404 && path === "/rename-commit") {
    return "Rename commit is unavailable on the current backend. Restart the Git Squash UI dev server and try again.";
  }

  const bodyText = stripHtml(rawBody);
  if (bodyText) return bodyText;
  return `Request failed (${status}).`;
}

async function request(path, opts = {}) {
  const headers = { ...opts.headers };
  if (currentRepoPath) {
    headers["X-Repo-Path"] = currentRepoPath;
  }

  try {
    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    const rawBody = await res.text();

    let data = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      if (data?.error) return data;
      return { error: getHttpErrorMessage(path, res.status, rawBody) };
    }

    if (data !== null) return data;
    return rawBody ? { ok: true, raw: rawBody } : { ok: true };
  } catch (error) {
    return { error: error?.message || "Request failed." };
  }
}

export function getInfo() {
  return request("/info");
}

export function getCommits(base) {
  return request(`/commits?base=${encodeURIComponent(base)}`);
}

export function squash(base, fixupIndices, customMessage) {
  return request("/squash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base, fixup_indices: fixupIndices, custom_message: customMessage }),
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

export function renameCommitMessage(hash, message) {
  return request("/rename-commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash, message }),
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

export function updateSettings(settings) {
  return request("/update-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
}

export function push(branch) {
  return request("/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  });
}

export function forcePush(branch) {
  return request("/force-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  });
}
