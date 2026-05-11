const BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:43174/api").replace(/\/$/, "");
const STARTUP_RETRY_DELAYS_MS = [150, 250, 400, 700, 1000, 1500, 2000, 2500];

let currentRepoPath = "";

export function setActiveRepo(path) {
  currentRepoPath = path;
}

function getTauriInvoke() {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.core?.invoke || null;
}

async function tryNativeInvoke(command, args) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;

  try {
    return await invoke(command, args);
  } catch (error) {
    console.warn(`[native git] ${command} failed, falling back to HTTP`, error);
    return null;
  }
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

function isRetryableNetworkError(error) {
  const message = error?.message || "";
  return /failed to fetch|networkerror|load failed|fetch/i.test(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, opts = {}, repoPathOverride = undefined) {
  const headers = { ...opts.headers };
  const targetRepoPath = repoPathOverride === undefined ? currentRepoPath : repoPathOverride;
  if (targetRepoPath) {
    headers["X-Repo-Path"] = targetRepoPath;
  }

  const method = (opts.method || "GET").toUpperCase();
  const retryDelays = method === "GET" ? STARTUP_RETRY_DELAYS_MS : [];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
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
      const shouldRetry = attempt < retryDelays.length && isRetryableNetworkError(error);
      if (!shouldRetry) {
        return { error: error?.message || "Request failed." };
      }
      await wait(retryDelays[attempt]);
    }
  }
}

export function getInfo(options = {}) {
  return loadRepoInfo(currentRepoPath, options);
}

export function getRepoInfo(path, options = {}) {
  return loadRepoInfo(path, options);
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

export function getStashes() {
  return request("/stashes");
}

export function getStashFiles(stashRef) {
  return request("/stash-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stashRef }),
  });
}

export function getStashDiff(stashRef, path) {
  return request("/stash-diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stashRef, path }),
  });
}

export function applyStash(stashRef, path) {
  return request("/apply-stash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stashRef, path }),
  });
}

export function switchBranch(branch, strategy, stashName) {
  return request("/switch-branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, strategy, stashName }),
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

export function saveRepoStateForPath(repoPath, state) {
  return request("/save-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }, repoPath);
}

export function getStatus() {
  return loadRepoStatus(currentRepoPath);
}

async function getRepoState(repoPath) {
  if (!repoPath) return { needsRepo: true };
  return request("/repo-state", {}, repoPath);
}

async function loadRepoInfo(repoPath, options = {}) {
  const includeRemotes = Boolean(options.includeRemotes);
  if (!repoPath) {
    return request("/info");
  }

  const nativeSummary = await tryNativeInvoke("git_repo_summary", { repoPath, includeRemotes });
  if (!nativeSummary) {
    const params = new URLSearchParams({ path: repoPath });
    if (includeRemotes) params.set("includeRemotes", "1");
    return request(`/info?${params.toString()}`);
  }

  const repoStateData = await getRepoState(repoPath);
  return {
    ...nativeSummary,
    repoState: repoStateData?.repoState || null
  };
}

async function loadRepoStatus(repoPath) {
  if (!repoPath) {
    return request("/status");
  }

  const nativeStatus = await tryNativeInvoke("git_repo_status", { repoPath });
  if (nativeStatus) {
    return nativeStatus;
  }

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

export async function deleteBranch(branch, deleteRemote, repoPath = undefined) {
  const targetPath = repoPath || currentRepoPath;
  const nativeResult = await tryNativeInvoke("git_delete_branch", { repoPath: targetPath, branch, deleteRemote });
  if (nativeResult) return nativeResult;
  return request("/delete-branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, deleteRemote }),
  }, repoPath);
}

export async function renameBranch(oldName, newName, repoPath = undefined) {
  const targetPath = repoPath || currentRepoPath;
  const nativeResult = await tryNativeInvoke("git_rename_branch", { repoPath: targetPath, oldName, newName });
  if (nativeResult) return nativeResult;
  return request("/rename-branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldName, newName }),
  }, repoPath);
}

export async function runGitCommand(command, repoPath = undefined) {
  const targetPath = repoPath || currentRepoPath;
  const nativeResult = await tryNativeInvoke("git_command", { repoPath: targetPath, command });
  if (nativeResult) return nativeResult;
  return request("/git-command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  }, repoPath);
}

export function logCommand(result, repoPath = undefined) {
  const targetPath = repoPath || currentRepoPath;
  return request("/log-command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command: result.command || "",
      cwd: targetPath,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode != null ? result.exitCode : (result.ok ? 0 : 1),
      durationMs: result.durationMs || result.duration_ms || 0,
    }),
  }, repoPath);
}
