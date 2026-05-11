import { execFile, execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (_) {}
}

loadDotEnv();

if (process.env.KEY && !process.env.GIT_SQUASH_YUBIKEY_PIN) {
  process.env.GIT_SQUASH_YUBIKEY_PIN = process.env.KEY;
}

const BACKUP_DIR = path.join(os.homedir(), ".git-squash-ui", "backups");
const DEFAULT_SCRIPTS_DIR = path.join(__dirname, "..", "scripts");
const SCRIPTS_DIR = path.resolve(process.env.GIT_SQUASH_UI_SCRIPTS_DIR || DEFAULT_SCRIPTS_DIR);
const SCRIPT_LOG_PATH = path.join(os.homedir(), ".git-squash-ui", "script-execution.log");
const COMMIT_FIELD_SEPARATOR = "__GSUI_FIELD__";
const COMMIT_ENTRY_SEPARATOR = "__GSUI_ENTRY__";
const STASH_FIELD_SEPARATOR = "__GSUI_STASH_FIELD__";
const REF_FIELD_SEPARATOR = "__GSUI_REF_FIELD__";
const USER_SHELL = process.env.SHELL || "/bin/zsh";

function getBackupFile(repoPath) {
  const repoId = crypto.createHash("md5").update(path.resolve(repoPath)).digest("hex");
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return path.join(BACKUP_DIR, repoId);
}

function pushBackup(repoPath, hash) {
  const file = getBackupFile(repoPath);
  fs.appendFileSync(file, hash + "\n");
}

function popBackup(repoPath) {
  const file = getBackupFile(repoPath);
  if (!fs.existsSync(file)) return null;
  let content = fs.readFileSync(file, "utf-8").trim().split("\n").filter(Boolean);
  if (!content.length) return null;
  const hash = content.pop();
  if (content.length === 0) {
    fs.unlinkSync(file);
  } else {
    fs.writeFileSync(file, content.join("\n") + "\n");
  }
  return hash;
}

function normalizeCommandOutput(text = "") {
  return text
    .replace(/[\x00-\x1F\x7F]/g, (char) => (char === '\n' || char === '\r' || char === '\t' ? char : ''))
    .replace(/\r\n/g, "\n")
    .replace(/\n+$/, "");
}

function normalizeCommandError(text = "") {
  return text.replace(/[\x00-\x1F\x7F]/g, (char) => (char === '\n' || char === '\r' || char === '\t' ? char : ''));
}

function shellQuote(value = "") {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function exitCodeFromError(error, fallback = 1) {
  return Number.isFinite(error?.status) ? Number(error.status) : fallback;
}

function logCommandResult(
  logs,
  { runner, command, cwd, startedAt, ok, out = "", err = "", exitCode = null, message = "" }
) {
  if (!logs?.command) return;

  logs.command({
    runner,
    command,
    cwd,
    stdout: out,
    stderr: err,
    exitCode: exitCode ?? (ok ? 0 : 1),
    durationMs: Date.now() - startedAt,
    status: ok ? "success" : "error",
    message:
      message ||
      (ok ? `${runner} completed successfully.` : `${runner} failed.`),
  });
}

function buildShellEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (process.env.GIT_SQUASH_YUBIKEY_PIN) {
    env.GIT_SQUASH_YUBIKEY_PIN = process.env.GIT_SQUASH_YUBIKEY_PIN;
  }
  return env;
}

function runInUserShell(command, cwd, timeout = 60000, extraEnv = {}) {
  try {
    const out = execFileSync(USER_SHELL, ["-lc", command], {
      cwd,
      encoding: "utf-8",
      timeout,
      env: buildShellEnv(extraEnv),
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { ok: true, out: normalizeCommandOutput(out), err: "", exitCode: 0 };
  } catch (e) {
    const err = normalizeCommandError((e.stderr || e.message || "").trim());
    return { ok: false, out: "", err, exitCode: exitCodeFromError(e) };
  }
}

// Non-blocking version for network git commands (pull/fetch/push).
// Returns a Promise so the Node.js event loop remains responsive during execution.
function runInUserShellAsync(command, cwd, timeout = 60000, extraEnv = {}) {
  return new Promise((resolve) => {
    execFile(
      USER_SHELL,
      ["-lc", command],
      {
        cwd,
        encoding: "utf-8",
        timeout,
        env: buildShellEnv(extraEnv),
        stdio: ["pipe", "pipe", "pipe"],
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            ok: false,
            out: "",
            err: normalizeCommandError((err.stderr || err.message || "").trim()),
            exitCode: exitCodeFromError(err),
          });
        } else {
          resolve({
            ok: true,
            out: normalizeCommandOutput(stdout),
            err: normalizeCommandOutput(stderr || ""),
            exitCode: 0,
          });
        }
      }
    );
  });
}

/** Run a git command, return { ok, out, err } */
export function git(args, cwd, logs) {
  const needsUserShell = args.includes("push") || args.includes("fetch") || args.includes("pull");
  const gitExecutable = needsUserShell ? path.join(SCRIPTS_DIR, "git-with-pin") : "git";
  const displayCommand = needsUserShell ? `${shellQuote(gitExecutable)} ${args}` : `git ${args}`;
  const startedAt = Date.now();

  if (needsUserShell) {
    const result = runInUserShell(
      displayCommand,
      cwd,
      60000,
      {
        PATH: [SCRIPTS_DIR, process.env.PATH].filter(Boolean).join(path.delimiter),
      }
    );
    logCommandResult(logs, {
      runner: "git",
      command: displayCommand,
      cwd,
      startedAt,
      ok: result.ok,
      out: result.out,
      err: result.err,
      exitCode: result.exitCode,
      message: result.ok ? "Git command completed." : "Git command failed.",
    });
    return result;
  }

  try {
    const out = execSync(`${gitExecutable} ${args}`, {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const result = { ok: true, out: normalizeCommandOutput(out), err: "", exitCode: 0 };
    logCommandResult(logs, {
      runner: "git",
      command: displayCommand,
      cwd,
      startedAt,
      ok: true,
      out: result.out,
      err: "",
      exitCode: 0,
      message: "Git command completed.",
    });
    return result;
  } catch (e) {
    const err = normalizeCommandError((e.stderr || e.message || "").trim());
    const result = { ok: false, out: "", err, exitCode: exitCodeFromError(e) };
    logCommandResult(logs, {
      runner: "git",
      command: displayCommand,
      cwd,
      startedAt,
      ok: false,
      out: "",
      err,
      exitCode: result.exitCode,
      message: "Git command failed.",
    });
    return result;
  }
}

function runScript(scriptName, args, cwd, logs) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const displayArgs = args.map((arg) => shellQuote(arg)).join(" ");
  const displayCommand = `/bin/bash ${shellQuote(scriptPath)}${displayArgs ? ` ${displayArgs}` : ""}`;
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(SCRIPT_LOG_PATH), { recursive: true });
  fs.appendFileSync(SCRIPT_LOG_PATH, `\n[${new Date().toISOString()}] ${displayCommand}\n`);
  try {
    const out = execFileSync("/bin/bash", [scriptPath, ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 60000,
      // Provide git-with-pin in PATH as "git" for scripts as well
      env: {
        ...process.env,
        PATH: [SCRIPTS_DIR, process.env.PATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Strip ALL control characters except tab, and normalize newlines
    const normalizedOut = out.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")
                             .replace(/\r/g, "")
                             .replace(/\n+$/, "");

                             
    if (normalizedOut) fs.appendFileSync(SCRIPT_LOG_PATH, `${normalizedOut}\n`);
    const result = { ok: true, out: normalizedOut, err: "", exitCode: 0 };
    logCommandResult(logs, {
      runner: "script",
      command: displayCommand,
      cwd,
      startedAt,
      ok: true,
      out: normalizedOut,
      err: "",
      exitCode: 0,
      message: `${scriptName} completed.`,
    });
    return result;
  } catch (e) {
    const err = normalizeCommandError((e.stderr || e.message || "").trim());
    if (err) fs.appendFileSync(SCRIPT_LOG_PATH, `${err}\n`);
    const result = { ok: false, out: "", err, exitCode: exitCodeFromError(e) };
    logCommandResult(logs, {
      runner: "script",
      command: displayCommand,
      cwd,
      startedAt,
      ok: false,
      out: "",
      err,
      exitCode: result.exitCode,
      message: `${scriptName} failed.`,
    });
    return result;
  }
}

function parseDetailedCommits(raw = "") {
  return raw
    .split(COMMIT_ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", subject = "", ...messageParts] = entry.split(COMMIT_FIELD_SEPARATOR);
      const fullMessage = messageParts.join(COMMIT_FIELD_SEPARATOR).trim();
      const normalizedHash = hash.trim();
      const normalizedSubject = subject.trim();
      return {
        hash: normalizedHash,
        shortHash: normalizedHash.slice(0, 7),
        message: normalizedSubject || fullMessage.split("\n")[0] || "",
        fullMessage: fullMessage || normalizedSubject,
      };
    })
    .filter((commit) => commit.hash);
}

function normalizeQuotedPath(filePath = "") {
  if (filePath.startsWith('"') && filePath.endsWith('"')) {
    return filePath.slice(1, -1).replace(/\\/g, "");
  }
  return filePath;
}

function parseNameStatusOutput(raw = "") {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([A-Z\?][A-Z0-9\?]*)\s+(.*)$/);
      if (!match) return null;

      const status = match[1];
      let filePath = normalizeQuotedPath(match[2]);
      const arrowIndex = filePath.indexOf(" -> ");

      if (arrowIndex !== -1 && (status.startsWith("R") || status.startsWith("C"))) {
        filePath = normalizeQuotedPath(filePath.substring(arrowIndex + 4));
      }

      return { status, path: filePath };
    })
    .filter(Boolean);
}

function parseStashSubject(subject = "") {
  const trimmedSubject = subject.trim();
  const match = /^(WIP on|On)\s+(.+?):\s*(.*)$/.exec(trimmedSubject);
  if (!match) {
    return { branch: "", message: trimmedSubject, label: trimmedSubject };
  }

  const [, kind, branch, message] = match;
  return {
    branch: branch.trim(),
    message: message.trim(),
    label: trimmedSubject,
    kind,
  };
}

function extractStashRef(value = "") {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/stash@\{\d+\}/);
  return match ? match[0] : trimmedValue;
}

function parseStashList(raw = "") {
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      let ref = "";
      let subject = "";
      let hash = "";

      if (line.includes(STASH_FIELD_SEPARATOR)) {
        [ref = "", subject = "", hash = ""] = line.split(STASH_FIELD_SEPARATOR);
      } else {
        const trimmedLine = line.trim();
        const extractedRef = extractStashRef(trimmedLine);
        const hashMatch = trimmedLine.match(/([0-9a-f]{40})$/i);

        ref = extractedRef;
        hash = hashMatch ? hashMatch[1] : "";
        subject = trimmedLine
          .slice(extractedRef.length, hash ? -hash.length : undefined)
          .replace(/^:\s*/, "")
          .trim();
      }

      const parsed = parseStashSubject(subject);
      const normalizedHash = hash.trim();
      const normalizedRef = extractStashRef(ref);

      return {
        ref: normalizedRef,
        label: parsed.label,
        branch: parsed.branch,
        message: parsed.message || parsed.label,
        hash: normalizedHash,
        shortHash: normalizedHash.slice(0, 7),
      };
    })
    .filter((stash) => stash.ref);
}

function parseKeyValueOutput(raw = "") {
  return raw
    .split("\n")
    .filter(Boolean)
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) return acc;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function isBranchSwitchBlockedMessage(message = "") {
  return /would be overwritten|please commit your changes or stash them|local changes/i.test(message);
}

function parseTrackCounts(track = "") {
  const trimmed = track
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "");

  if (!trimmed) {
    return { ahead: 0, behind: 0 };
  }

  let ahead = 0;
  let behind = 0;

  for (const segment of trimmed.split(",")) {
    const value = segment.trim();
    if (value.startsWith("ahead ")) {
      ahead = Number.parseInt(value.slice("ahead ".length), 10) || 0;
    } else if (value.startsWith("behind ")) {
      behind = Number.parseInt(value.slice("behind ".length), 10) || 0;
    }
  }

  return { ahead, behind };
}

function readBranchStatuses(repoPath, logs) {
  const format = `--format=%(refname:short)${REF_FIELD_SEPARATOR}%(upstream:short)${REF_FIELD_SEPARATOR}%(upstream:track)`;
  const result = git(`for-each-ref --sort=refname ${format} refs/heads`, repoPath, logs);
  if (!result.ok) return null;

  return result.out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", upstream = "", track = ""] = line.split(REF_FIELD_SEPARATOR);
      const { ahead, behind } = parseTrackCounts(track);

      return {
        name,
        hasUpstream: Boolean(upstream),
        upstream,
        ahead,
        behind,
      };
    })
    .filter((branch) => branch.name);
}

function readRemoteRefs(repoPath, logs) {
  const result = git("for-each-ref --sort=refname --format=%(refname:short) refs/remotes", repoPath, logs);
  if (!result.ok) return null;

  return result.out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith("/HEAD"));
}

function detectBaseBranchFromBranches(branches = [], currentBranch = "") {
  for (const candidate of ["main", "master", "develop"]) {
    if (candidate !== currentBranch && branches.includes(candidate)) {
      return candidate;
    }
  }
  return "";
}

function buildRemoteBranches(remoteRefs = [], branchStatuses = []) {
  const upstreamMap = new Map(
    branchStatuses
      .filter((branch) => branch.hasUpstream && branch.upstream)
      .map((branch) => [branch.upstream, branch.name])
  );
  const localNames = new Set(branchStatuses.map((branch) => branch.name));

  return remoteRefs
    .map((remoteRef) => {
      const slashIndex = remoteRef.indexOf("/");
      if (slashIndex === -1) return null;

      const remote = remoteRef.slice(0, slashIndex);
      const shortName = remoteRef.slice(slashIndex + 1);
      const localName = upstreamMap.get(remoteRef) || (localNames.has(shortName) ? shortName : "");

      return {
        name: remoteRef,
        shortName,
        remote,
        localExists: Boolean(localName),
        localName,
      };
    })
    .filter(Boolean);
}

function detectBaseBranch(repoPath, currentBranch = "", logs) {
  for (const candidate of ["main", "master", "develop"]) {
    if (candidate === currentBranch) continue;
    if (git(`show-ref --verify --quiet refs/heads/${candidate}`, repoPath, logs).ok) {
      return candidate;
    }
  }
  return "";
}

function getLocalCommits(repoPath, logs) {
  const format = `--format=%H${COMMIT_FIELD_SEPARATOR}%s${COMMIT_FIELD_SEPARATOR}%B${COMMIT_ENTRY_SEPARATOR}`;

  let result = git(`log @{u}..HEAD ${format}`, repoPath, logs);
  if (result.ok) {
    return parseDetailedCommits(result.out);
  }

  const currentBranch = git("branch --show-current", repoPath, logs).out.trim();
  const fallbackBase = detectBaseBranch(repoPath, currentBranch, logs);

  if (fallbackBase) {
    result = git(`log ${fallbackBase}..HEAD ${format}`, repoPath, logs);
    if (result.ok) return parseDetailedCommits(result.out);
  }

  result = git(`log HEAD ${format}`, repoPath, logs);
  return result.ok ? parseDetailedCommits(result.out) : [];
}


/** Get current branch, detected base, and local branch metadata with optional remote refs. */
export function getInfo(repoPath, logs, options = {}) {
  const includeRemotes = Boolean(options.includeRemotes);
  const branch = git("branch --show-current", repoPath, logs);
  if (!branch.ok) return null;

  const currentBranch = branch.out.trim();
  const branchStatuses = readBranchStatuses(repoPath, logs) || [];
  const branches = branchStatuses.map((item) => item.name);
  const base = detectBaseBranchFromBranches(branches, currentBranch) || "master";
  const remoteBranches =
    includeRemotes
      ? buildRemoteBranches(readRemoteRefs(repoPath, logs) || [], branchStatuses)
      : [];

  const branchStatus = branchStatuses.find((item) => item.name === currentBranch) || {
    name: currentBranch,
    hasUpstream: false,
    upstream: "",
    ahead: 0,
    behind: 0,
  };

  return {
    branch: currentBranch,
    base,
    branches,
    path: repoPath,
    branchStatuses,
    remoteBranches,
    remoteBranchesLoaded: includeRemotes,
    branchStatus
  };
}

export function testGetBranches(repoPath, logs) {
  logs?.info("scripts/get-branches.sh");
  const result = runScript("get-branches.sh", [repoPath], repoPath, logs);
  if (!result.ok) {
    logs?.error(`get-branches failed: ${result.err}`);
    return { error: result.err || "get-branches failed" };
  }
  logs?.success(`get-branches response: ${result.out}`);
  return { ok: true, output: result.out };
}

/** Get commits between base and HEAD */
export function getCommits(repoPath, baseBranch, logs) {
  logs?.info(`scripts/get-commits.sh ${baseBranch}`);
  let r = runScript("get-commits.sh", [repoPath, baseBranch], repoPath, logs);
  if (!r.ok) r = git(`log --oneline ${baseBranch}..HEAD`, repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Could not get commits");
    return { error: r.err || "Could not get commits" };
  }

  const commits = r.out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(" ");
      return { hash: line.slice(0, i), message: line.slice(i + 1) };
    });

  logs?.success(`Loaded ${commits.length} commits`);
  return { commits };
}

/** Perform squash via automated interactive rebase */
export function squash(repoPath, baseBranch, fixupIndices, logs, customMessage = "") {
  if (!fixupIndices.length) return { error: "No commits selected" };
  const totalAhead = commitsAheadCount(repoPath, baseBranch, logs);
  const sortedFixups = [...fixupIndices].sort((a, b) => a - b);
  logs?.info(`squash validation: totalAhead=${totalAhead}, fixupIndices=${sortedFixups.join(",")}`);

  // Validation: In Newest-First, fixups must be contiguous and start from the top (index 0)
  const len = sortedFixups.length;
  if (sortedFixups[0] !== 0 || sortedFixups[len - 1] !== len - 1) {
    const msg = "Fixup selections must be the latest contiguous commit(s) (starting from the top).";
    logs?.error(msg);
    return { error: msg };
  }

  // The number of commits to collapse (including the ones to be squashed and the one we merge into)
  const squashCount = len + 1;
  if (squashCount > totalAhead) {
    const msg = "Cannot squash the base commit. At least one 'pick' must remain.";
    logs?.error(msg);
    return { error: msg };
  }

  logs?.info(`scripts/squash.sh ${squashCount}`);

  const head = git("rev-parse HEAD", repoPath, logs);
  if (!head.ok) return { error: "Could not read HEAD" };

  // Save backup to stack
  pushBackup(repoPath, head.out);

  // Stash dirty changes
  const dirty = git("status --porcelain", repoPath, logs).out;
  let stashed = false;
  if (dirty) {
    git('stash push --include-untracked -m "squash-ui-temp"', repoPath, logs);
    stashed = true;
  }

  const commitsR = git(
    `log --reverse --format=%H%x1f%s%x1f%B%x00 HEAD~${squashCount}..HEAD`,
    repoPath,
    logs
  );
  if (!commitsR.ok) {
    if (stashed) git("stash pop", repoPath, logs);
    logs?.error(commitsR.err || "Could not read commits for squash");
    return { error: commitsR.err || "Could not read commits for squash", backup: head.out };
  }

  const commits = commitsR.out
    .split("\0")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, ...bodyParts] = line.split("\u001f");
      return {
        hash: hash?.trim(),
        subject: subject?.trim(),
        body: bodyParts.join("\u001f").trim(),
      };
    });

  // Determine message
  let message = "";
  if (customMessage && customMessage.trim()) {
      message = customMessage.trim();
  } else {
      // Always use the oldest commit message in the squash block (the "pick" commit)
      // as the final commit message, discarding the newer "fixup" messages.
      const oldest = commits[0];
      message = oldest ? `${oldest.subject}\n\n${oldest.body}`.trim() : "Squashed commits";
  }

  const commitMsgFile = path.join(os.tmpdir(), `git-squash-message-${Date.now()}.txt`);
  fs.writeFileSync(commitMsgFile, message);
  const commitR = runScript("squash.sh", [repoPath, String(squashCount), commitMsgFile], repoPath, logs);
  fs.unlinkSync(commitMsgFile);

  if (!commitR.ok) {
    git(`reset --hard ${head.out}`, repoPath, logs);
    if (stashed) git("stash pop", repoPath, logs);
    logs?.error(`Squash commit failed: ${commitR.err}`);
    return { error: `Squash commit failed: ${commitR.err}`, backup: head.out };
  }

  if (stashed) git("stash pop", repoPath, logs);
  logs?.success(`Squash completed on ${baseBranch} without rebase conflicts`);
  return { success: true, backup: head.out };
}


function commitsAheadCount(repoPath, baseBranch, logs) {
  const result = git(`rev-list --count ${baseBranch}..HEAD`, repoPath, logs);
  return result.ok ? Number(result.out) : 0;
}

/** Undo the last squash from backup stack */
export function undo(repoPath, logs) {
  const ref = popBackup(repoPath);
  if (!ref) return { error: "No more squashes to undo" };

  logs?.info(`git reset --hard ${ref}`);
  const r = git(`reset --hard ${ref}`, repoPath, logs);
  if (!r.ok) return { error: `Reset failed: ${r.err}` };

  logs?.success(`Restored backup to ${ref}`);
  return { success: true, restored_to: ref };
}

/** Get diff for one or more commit hashes */
export function getDiff(repoPath, hashes, logs) {
  logs?.info(`scripts/get-diff.sh for ${hashes.length} commits`);
  const r = runScript("get-diff.sh", [repoPath, ...hashes], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Could not get diff");
    return { error: r.err || "Could not get diff" };
  }
  return { diff: r.out };
}

/** Get list of changed files for one or more commit hashes */
export function getFiles(repoPath, hashes, logs) {
  logs?.info(`scripts/get-files.sh for ${hashes.length} commits`);
  const r = runScript("get-files.sh", [repoPath, ...hashes], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Could not get files");
    return { error: r.err || "Could not get files" };
  }

  return { files: parseNameStatusOutput(r.out) };
}

/** Compare two branches/refs */
export function compareBranches(repoPath, branch1, branch2, logs) {
  logs?.info(`scripts/compare.sh ${branch1}..${branch2}`);
  
  // Get files
  const fileData = runScript("compare.sh", [repoPath, branch1, branch2, "files"], repoPath, logs);
  if (!fileData.ok) {
    logs?.error(fileData.err || "Compare failed");
    return { error: fileData.err || "Compare failed" };
  }

  const files = parseNameStatusOutput(fileData.out);

  // Get full diff (we can filter in frontend or just fetch as needed)
  const diffData = runScript("compare.sh", [repoPath, branch1, branch2, "diff"], repoPath, logs);
  
  return { 
    files, 
    diff: diffData.ok ? diffData.out : "",
    same: files.length === 0
  };
}

export function getStashes(repoPath, logs) {
  logs?.info("scripts/get-stashes.sh");
  const result = runScript("get-stashes.sh", [repoPath], repoPath, logs);
  if (!result.ok) {
    logs?.error(result.err || "Could not get stashes");
    return { error: result.err || "Could not get stashes" };
  }

  return { stashes: parseStashList(result.out) };
}

export function getStashFiles(repoPath, stashRef, logs) {
  logs?.info(`scripts/get-stash-files.sh ${stashRef}`);
  const result = runScript("get-stash-files.sh", [repoPath, stashRef], repoPath, logs);
  if (!result.ok) {
    logs?.error(result.err || "Could not get stash files");
    return { error: result.err || "Could not get stash files" };
  }

  return { files: parseNameStatusOutput(result.out) };
}

export function getStashDiff(repoPath, stashRef, filePath, logs) {
  const label = filePath ? `${stashRef} ${filePath}` : stashRef;
  logs?.info(`scripts/get-stash-diff.sh ${label}`);
  const args = filePath ? [repoPath, stashRef, filePath] : [repoPath, stashRef];
  const result = runScript("get-stash-diff.sh", args, repoPath, logs);
  if (!result.ok) {
    logs?.error(result.err || "Could not get stash diff");
    return { error: result.err || "Could not get stash diff" };
  }

  return { diff: result.out };
}

export function applyStash(repoPath, stashRef, filePath, logs) {
  const label = filePath ? `${stashRef} ${filePath}` : stashRef;
  logs?.info(`scripts/apply-stash.sh ${label}`);
  const args = filePath ? [repoPath, stashRef, filePath] : [repoPath, stashRef];
  const result = runScript("apply-stash.sh", args, repoPath, logs);
  if (!result.ok) {
    logs?.error(result.err || "Could not apply stash");
    return { error: result.err || "Could not apply stash" };
  }

  logs?.success(filePath ? `Applied ${filePath} from ${stashRef}` : `Applied ${stashRef}`);
  return { ok: true };
}

export function switchBranch(repoPath, branchName, strategy = "direct", stashName = "", logs) {
  const normalizedStrategy = strategy === "stash" ? "stash" : "direct";
  logs?.info(`scripts/switch-branch.sh ${branchName} strategy=${normalizedStrategy}`);

  const result = runScript(
    "switch-branch.sh",
    [repoPath, branchName, normalizedStrategy, stashName || ""],
    repoPath,
    logs
  );
  if (!result.ok) {
    logs?.error(result.err || "Could not switch branches");
    return {
      error: result.err || "Could not switch branches",
      blockedByChanges: isBranchSwitchBlockedMessage(result.err),
    };
  }

  const parsed = parseKeyValueOutput(result.out);
  logs?.success(`Switched to ${parsed.current_branch || branchName}`);
  return {
    ok: true,
    previousBranch: parsed.previous_branch || "",
    currentBranch: parsed.current_branch || branchName,
    stashed: parsed.stashed === "1",
    stashRef: parsed.stash_ref || "",
  };
}

export function deleteBranch(repoPath, branchName, deleteRemote, logs) {
  logs?.info(`scripts/delete-branch.sh ${branchName} deleteRemote=${deleteRemote ? "1" : "0"}`);
  const result = runScript(
    "delete-branch.sh",
    [repoPath, branchName, deleteRemote ? "1" : "0"],
    repoPath,
    logs
  );
  if (!result.ok) {
    logs?.error(result.err || "Could not delete branch");
    return { error: result.err || "Could not delete branch" };
  }
  const parsed = parseKeyValueOutput(result.out);
  logs?.success(`Deleted branch ${parsed.deleted || branchName}`);
  return {
    ok: true,
    deleted: parsed.deleted || branchName,
    remoteDeleted: parsed.remote_deleted === "1",
    upstream: parsed.upstream || "",
  };
}

export function renameBranch(repoPath, oldName, newName, logs) {
  logs?.info(`scripts/rename-branch.sh ${oldName} -> ${newName}`);
  const result = runScript(
    "rename-branch.sh",
    [repoPath, oldName, newName],
    repoPath,
    logs
  );
  if (!result.ok) {
    logs?.error(result.err || "Could not rename branch");
    return { error: result.err || "Could not rename branch" };
  }
  const parsed = parseKeyValueOutput(result.out);
  logs?.success(`Renamed branch ${oldName} -> ${parsed.new_name || newName}`);
  return {
    ok: true,
    oldName: parsed.old_name || oldName,
    newName: parsed.new_name || newName,
  };
}

/** Reverse (revert) one or more commits without committing */
export function reverseCommits(repoPath, hashes, logs) {
  logs?.info(`scripts/reverse.sh ${hashes.length} commits`);
  const r = runScript("reverse.sh", [repoPath, ...hashes], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Reverse failed");
    return { error: r.err || "Reverse failed" };
  }
  return { ok: true };
}

/** Apply a reverse patch for specific lines or files */
export function reversePatch(repoPath, patch, logs) {
  logs?.info("Applying granular reverse patch");
  logs?.info("--- PAYLOAD START ---\n" + patch + "\n--- PAYLOAD END ---");
  const scriptPath = path.join(SCRIPTS_DIR, "reverse-patch.sh");
  const displayCommand = `${shellQuote(scriptPath)} ${shellQuote(repoPath)}`;
  const startedAt = Date.now();
  try {
    // Using execFileSync to ensure we handle the input buffer correctly
    const out = execSync(`"${scriptPath}" "${repoPath}"`, {
      input: patch,
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    const normalizedOut = normalizeCommandOutput(out || "");
    logCommandResult(logs, {
      runner: "script",
      command: displayCommand,
      cwd: repoPath,
      startedAt,
      ok: true,
      out: normalizedOut,
      err: "",
      exitCode: 0,
      message: "reverse-patch.sh completed.",
    });
    return { ok: true };
  } catch (e) {
    const err = normalizeCommandError((e.stderr || e.message || "").trim());
    logCommandResult(logs, {
      runner: "script",
      command: displayCommand,
      cwd: repoPath,
      startedAt,
      ok: false,
      out: "",
      err,
      exitCode: exitCodeFromError(e),
      message: "reverse-patch.sh failed.",
    });
    logs?.error("Reverse patch failed: " + err);
    return { error: err };
  }
}

/** Get status of working directory */
export function getStatus(repoPath, logs) {
  logs?.info("scripts/get-status.sh");
  const r = runScript("get-status.sh", [repoPath], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Could not get status");
    return { error: r.err || "Could not get status" };
  }
  
  const files = r.out.split("\n").filter(Boolean).map(line => {
    // ... (logic remains same)
    const x = line[0];
    const y = line[1];
    let path = line.slice(3);
    if (path.startsWith('"') && path.endsWith('"')) {
        path = path.slice(1, -1).replace(/\\/g, ''); 
    }
    const arrowIndex = path.indexOf(' -> ');
    if (arrowIndex !== -1 && (x === 'R' || x === 'C')) {
        path = path.substring(arrowIndex + 4);
        if (path.startsWith('"') && path.endsWith('"')) {
            path = path.slice(1, -1).replace(/\\/g, '');
        }
    }

    return { 
        x, 
        y, 
        path, 
        staged: x !== ' ' && x !== '?' && x !== '!',
        unstaged: y !== ' ' && y !== '?' && y !== '!',
        untracked: x === '?' && y === '?'
    };
  });
  
  const unpushed = getLocalCommits(repoPath, logs);

  return { files, unpushed };
}


/** Stage or unstage a file */
export function stageFile(repoPath, action, filePath, logs) {
  logs?.info(`scripts/stage.sh ${action} ${filePath}`);
  const r = runScript("stage.sh", [repoPath, action, filePath], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Stage failed");
    return { error: r.err || "Stage failed" };
  }
  return { ok: true };
}

/** Perform a commit */
export function commit(repoPath, message, logs) {
  logs?.info(`scripts/commit.sh with message: ${message}`);
  const r = runScript("commit.sh", [repoPath, message], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Commit failed");
    return { error: r.err || "Commit failed" };
  }
  return { ok: true };
}

export function renameCommitMessage(repoPath, hash, message, logs) {
  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    return { error: "Commit message is empty" };
  }

  const localCommit = getLocalCommits(repoPath, logs).find(
    (commit) => commit.hash === hash || commit.shortHash === hash
  );
  if (!localCommit) {
    return { error: "Only local commits that have not reached a remote can be renamed here." };
  }

  logs?.info(`scripts/rename-commit.sh ${localCommit.shortHash}`);

  const messageFile = path.join(os.tmpdir(), `git-squash-rename-${Date.now()}.txt`);
  fs.writeFileSync(messageFile, `${message.replace(/\s+$/, "")}\n`);

  try {
    const result = runScript("rename-commit.sh", [repoPath, localCommit.hash, messageFile], repoPath, logs);
    if (!result.ok) {
      logs?.error(result.err || "Commit rename failed");
      return { error: result.err || "Commit rename failed" };
    }
  } finally {
    if (fs.existsSync(messageFile)) fs.unlinkSync(messageFile);
  }

  logs?.success(`Renamed commit ${localCommit.shortHash}`);
  return { ok: true };
}

/** Get diff for a working file */
export function getWorkingDiff(repoPath, filePath, staged, logs) {
  logs?.info(`scripts/get-working-diff.sh ${filePath} staged=${staged}`);
  const r = runScript("get-working-diff.sh", [repoPath, filePath, String(staged)], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Could not get working diff");
    return { error: r.err || "Could not get working diff" };
  }
  return { diff: r.out };
}

/** Manage local exclusions (.git/info/exclude) */
export function getExcludes(repoPath, logs) {
  logs?.info("scripts/manage-exclude.sh list");
  const r = runScript("manage-exclude.sh", [repoPath, "list"], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Could not get excludes");
    return { error: r.err || "Could not get excludes" };
  }
  return { excludes: r.out.split("\n").filter(Boolean) };
}

export function manageExclude(repoPath, action, pattern, logs) {
  logs?.info(`scripts/manage-exclude.sh ${action} ${pattern}`);
  const r = runScript("manage-exclude.sh", [repoPath, action, pattern], repoPath, logs);
  if (!r.ok) {
    logs?.error(r.err || "Exclude action failed");
    return { error: r.err || "Exclude action failed" };
  }
  return { ok: true };
}

/** Perform a push */
export function push(repoPath, branchName, logs) {
  if (branchName === "master" || branchName === "main") {
      return { error: `Pushing to ${branchName} is not allowed from this UI.` };
  }
  logs?.info(`Pushing ${branchName} up...`);
  const r = git(`push origin ${branchName}`, repoPath, logs);
  if (!r.ok) {
    logs?.error(`Push failed: ${r.err}`);
    return { error: r.err };
  }
  logs?.success(`Pushed ${branchName} successfully.`);
  return { success: true };
}

/** Perform a force push */
export function forcePush(repoPath, branchName, logs) {
  if (branchName === "master" || branchName === "main") {
      return { error: `Force pushing to ${branchName} is strictly forbidden.` };
  }
  logs?.info(`Force pushing ${branchName}...`);
  const r = git(`push origin ${branchName} --force-with-lease`, repoPath, logs);
  if (!r.ok) {
    logs?.error(`Force push failed: ${r.err}`);
    return { error: r.err };
  }
  logs?.success(`Force pushed ${branchName} successfully.`);
  return { success: true };
}

/** Run a generic git command (pull, fetch, push) via shell — returns a Promise */
export async function runGitCommand(repoPath, command, logs) {
  if (!repoPath || !command) return { error: "Missing repo path or command" };

  const needsUserShell = command.includes("push") || command.includes("fetch") || command.includes("pull");

  if (needsUserShell) {
    // Async path: event loop stays responsive during the network operation
    const gitExecutable = path.join(SCRIPTS_DIR, "git-with-pin");
    const displayCommand = `${shellQuote(gitExecutable)} ${command}`;
    const startedAt = Date.now();

    const r = await runInUserShellAsync(displayCommand, repoPath, 60000, {
      PATH: [SCRIPTS_DIR, process.env.PATH].filter(Boolean).join(path.delimiter),
    });

    logCommandResult(logs, {
      runner: "git",
      command: displayCommand,
      cwd: repoPath,
      startedAt,
      ok: r.ok,
      out: r.out,
      err: r.err,
      exitCode: r.exitCode,
      message: r.ok ? "Git command completed." : "Git command failed.",
    });

    if (!r.ok) return { error: r.err };
    return { ok: true, stdout: r.out };
  }

  // Fast local operations — sync path unchanged
  const r = git(command, repoPath, logs);
  if (!r.ok) {
    return { error: r.err };
  }
  return { ok: true, stdout: r.out };
}
