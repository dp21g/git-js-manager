import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { readConfig } from "./config.mjs";

const BACKUP_DIR = path.join(os.homedir(), ".git-squash-ui", "backups");
const SCRIPTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "scripts");
const SCRIPT_LOG_PATH = path.join(os.homedir(), ".git-squash-ui", "script-execution.log");

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

/** Run a git command, return { ok, out, err } */
export function git(args, cwd) {
  try {
    const out = execSync(`git ${args}`, {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, out: out.trim(), err: "" };
  } catch (e) {
    return { ok: false, out: "", err: (e.stderr || e.message || "").trim() };
  }
}

function runScript(scriptName, args, cwd) {
  fs.mkdirSync(path.dirname(SCRIPT_LOG_PATH), { recursive: true });
  fs.appendFileSync(SCRIPT_LOG_PATH, `\n[${new Date().toISOString()}] /bin/bash ${path.join(SCRIPTS_DIR, scriptName)} ${args.join(" ")}\n`);
  try {
    const out = execFileSync("/bin/bash", [path.join(SCRIPTS_DIR, scriptName), ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (out) fs.appendFileSync(SCRIPT_LOG_PATH, `${out}\n`);
    return { ok: true, out: out.trim(), err: "" };
  } catch (e) {
    const err = (e.stderr || e.message || "").trim();
    if (err) fs.appendFileSync(SCRIPT_LOG_PATH, `${err}\n`);
    return { ok: false, out: "", err };
  }
}

/** Get current branch, detected base, and all local branches */
export function getInfo(repoPath) {
  const branch = git("branch --show-current", repoPath);
  if (!branch.ok) return null;

  let base = "master";
  for (const c of ["main", "master", "develop"]) {
    if (git(`show-ref --verify --quiet refs/heads/${c}`, repoPath).ok) {
      base = c;
      break;
    }
  }

  const branchData = runScript("get-branches.sh", [repoPath], repoPath);
  const parsed = branchData.ok ? JSON.parse(branchData.out) : { branch: branch.out, branches: [], branchStatuses: [] };
  const branchStatus = parsed.branchStatuses.find((item) => item.name === parsed.branch) || {
    name: parsed.branch,
    hasUpstream: false,
    upstream: "",
    ahead: 0,
    behind: 0,
  };

  return { branch: parsed.branch, base, branches: parsed.branches, path: repoPath, branchStatuses: parsed.branchStatuses, branchStatus };
}

export function testGetBranches(repoPath, logs) {
  logs?.info("scripts/get-branches.sh");
  const result = runScript("get-branches.sh", [repoPath], repoPath);
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
  let r = runScript("get-commits.sh", [repoPath, baseBranch], repoPath);
  if (!r.ok) r = git(`log --oneline ${baseBranch}..HEAD`, repoPath);
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
export function squash(repoPath, baseBranch, fixupIndices, logs) {
  if (!fixupIndices.length) return { error: "No commits selected" };
  const totalAhead = commitsAheadCount(repoPath, baseBranch);
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
  // If we select indices 0 and 1, we squash 2 commits into index 2. Total affected: 3.
  const squashCount = len + 1;
  if (squashCount > totalAhead) {
    const msg = "Cannot squash the base commit. At least one 'pick' must remain.";
    logs?.error(msg);
    return { error: msg };
  }

  logs?.info(`scripts/squash.sh ${squashCount}`);

  const head = git("rev-parse HEAD", repoPath);
  if (!head.ok) return { error: "Could not read HEAD" };

  // Save backup to stack
  pushBackup(repoPath, head.out);

  // Stash dirty changes
  const dirty = git("status --porcelain", repoPath).out;
  let stashed = false;
  if (dirty) {
    git('stash push --include-untracked -m "squash-ui-temp"', repoPath);
    stashed = true;
  }

  const commitsR = git(`log --reverse --format=%H%x1f%s%x1f%B%x00 HEAD~${squashCount}..HEAD`, repoPath);
  if (!commitsR.ok) {
    if (stashed) git("stash pop", repoPath);
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

  const squashed = commits;

  // Always use the oldest commit message in the squash block (the "pick" commit)
  // as the final commit message, discarding the newer "fixup" messages.
  const oldest = commits[0];
  const message = oldest ? `${oldest.subject}\n\n${oldest.body}`.trim() : "Squashed commits";

  const commitMsgFile = path.join(os.tmpdir(), `git-squash-message-${Date.now()}.txt`);
  fs.writeFileSync(commitMsgFile, message);
  const commitR = runScript("squash.sh", [repoPath, String(squashCount), commitMsgFile], repoPath);
  fs.unlinkSync(commitMsgFile);

  if (!commitR.ok) {
    git(`reset --hard ${head.out}`, repoPath);
    if (stashed) git("stash pop", repoPath);
    logs?.error(`Squash commit failed: ${commitR.err}`);
    return { error: `Squash commit failed: ${commitR.err}`, backup: head.out };
  }

  if (stashed) git("stash pop", repoPath);
  logs?.success(`Squash completed on ${baseBranch} without rebase conflicts`);
  return { success: true, backup: head.out };
}

function commitsAheadCount(repoPath, baseBranch) {
  const result = git(`rev-list --count ${baseBranch}..HEAD`, repoPath);
  return result.ok ? Number(result.out) : 0;
}

/** Undo the last squash from backup stack */
export function undo(repoPath, logs) {
  const ref = popBackup(repoPath);
  if (!ref) return { error: "No more squashes to undo" };

  logs?.info(`git reset --hard ${ref}`);
  const r = git(`reset --hard ${ref}`, repoPath);
  if (!r.ok) return { error: `Reset failed: ${r.err}` };

  logs?.success(`Restored backup to ${ref}`);
  return { success: true, restored_to: ref };
}

/** Get diff for one or more commit hashes */
export function getDiff(repoPath, hashes, logs) {
  logs?.info(`scripts/get-diff.sh for ${hashes.length} commits`);
  const r = runScript("get-diff.sh", [repoPath, ...hashes], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Could not get diff");
    return { error: r.err || "Could not get diff" };
  }
  return { diff: r.out };
}

/** Get list of changed files for one or more commit hashes */
export function getFiles(repoPath, hashes, logs) {
  logs?.info(`scripts/get-files.sh for ${hashes.length} commits`);
  const r = runScript("get-files.sh", [repoPath, ...hashes], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Could not get files");
    return { error: r.err || "Could not get files" };
  }
  
  const files = r.out.split("\n").filter(Boolean).map(line => {
    const [status, path] = line.split(/\s+/);
    return { status, path };
  });
  
  return { files };
}

/** Compare two branches/refs */
export function compareBranches(repoPath, branch1, branch2, logs) {
  logs?.info(`scripts/compare.sh ${branch1}..${branch2}`);
  
  // Get files
  const fileData = runScript("compare.sh", [repoPath, branch1, branch2, "files"], repoPath);
  if (!fileData.ok) {
    logs?.error(fileData.err || "Compare failed");
    return { error: fileData.err || "Compare failed" };
  }
  
  const files = fileData.out.split("\n").filter(Boolean).map(line => {
    const [status, path] = line.split(/\s+/);
    return { status, path };
  });

  // Get full diff (we can filter in frontend or just fetch as needed)
  const diffData = runScript("compare.sh", [repoPath, branch1, branch2, "diff"], repoPath);
  
  return { 
    files, 
    diff: diffData.ok ? diffData.out : "",
    same: files.length === 0
  };
}

/** Reverse (revert) one or more commits without committing */
export function reverseCommits(repoPath, hashes, logs) {
  logs?.info(`scripts/reverse.sh ${hashes.length} commits`);
  const r = runScript("reverse.sh", [repoPath, ...hashes], repoPath);
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
  try {
    const scriptPath = path.join(SCRIPTS_DIR, "reverse-patch.sh");
    // Using execFileSync to ensure we handle the input buffer correctly
    const res = execSync(`"${scriptPath}" "${repoPath}"`, {
      input: patch,
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { ok: true };
  } catch (e) {
    const err = (e.stderr || e.message || "").trim();
    logs?.error("Reverse patch failed: " + err);
    return { error: err };
  }
}

/** Get status of working directory */
export function getStatus(repoPath, logs) {
  logs?.info("scripts/get-status.sh");
  const r = runScript("get-status.sh", [repoPath], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Could not get status");
    return { error: r.err || "Could not get status" };
  }
  
  const files = r.out.split("\n").filter(Boolean).map(line => {
    // Porcelain v1: XY path [-> renamed_path]
    const x = line[0];
    const y = line[1];
    const path = line.slice(3);
    // X is staged status, Y is unstaged status
    return { 
        x, 
        y, 
        path, 
        staged: x !== ' ' && x !== '?' && x !== '!',
        unstaged: y !== ' ' && y !== '?' && y !== '!',
        untracked: x === '?' && y === '?'
    };
  });
  
  return { files };
}

/** Stage or unstage a file */
export function stageFile(repoPath, action, filePath, logs) {
  logs?.info(`scripts/stage.sh ${action} ${filePath}`);
  const r = runScript("stage.sh", [repoPath, action, filePath], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Stage failed");
    return { error: r.err || "Stage failed" };
  }
  return { ok: true };
}

/** Perform a commit */
export function commit(repoPath, message, logs) {
  logs?.info(`scripts/commit.sh with message: ${message}`);
  const r = runScript("commit.sh", [repoPath, message], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Commit failed");
    return { error: r.err || "Commit failed" };
  }
  return { ok: true };
}

/** Get diff for a working file */
export function getWorkingDiff(repoPath, filePath, staged, logs) {
  logs?.info(`scripts/get-working-diff.sh ${filePath} staged=${staged}`);
  const r = runScript("get-working-diff.sh", [repoPath, filePath, String(staged)], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Could not get working diff");
    return { error: r.err || "Could not get working diff" };
  }
  return { diff: r.out };
}

/** Manage local exclusions (.git/info/exclude) */
export function getExcludes(repoPath, logs) {
  logs?.info("scripts/manage-exclude.sh list");
  const r = runScript("manage-exclude.sh", [repoPath, "list"], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Could not get excludes");
    return { error: r.err || "Could not get excludes" };
  }
  return { excludes: r.out.split("\n").filter(Boolean) };
}

export function manageExclude(repoPath, action, pattern, logs) {
  logs?.info(`scripts/manage-exclude.sh ${action} ${pattern}`);
  const r = runScript("manage-exclude.sh", [repoPath, action, pattern], repoPath);
  if (!r.ok) {
    logs?.error(r.err || "Exclude action failed");
    return { error: r.err || "Exclude action failed" };
  }
  return { ok: true };
}
