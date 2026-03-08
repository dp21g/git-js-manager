import { Router } from "express";
import os from "node:os";
import { getInfo, getCommits, squash, undo, testGetBranches, getDiff, getFiles, compareBranches, reverseCommits, reversePatch, getStatus, stageFile, commit, getWorkingDiff, getExcludes, manageExclude } from "./git.mjs";
import { listDir, nativeDialog, isGitRepo } from "./folder-picker.mjs";
import { readConfig, addRecentDir, toggleFavouriteDir, getConfigPath, saveRepoState, updateTabs } from "./config.mjs";

/**
 * Create API router.
 * `state` is a shared object with { repoPath } so routes can read/write it.
 */
export function createRoutes(state) {
  const router = Router();

  const getTarget = (req) => req.headers['x-repo-path'] || state.repoPath;

  // ── Repo info ────────────────────────────────────────────────────────
  router.get("/info", (req, res) => {
    const target = req.query.path || getTarget(req);
    if (!target) {
      return res.json({ needsRepo: true, home: os.homedir(), config: { ...readConfig(), configPath: getConfigPath() } });
    }
    const info = getInfo(target);
    const config = readConfig();
    const repoState = config.repoStates?.[target] || null;
    res.json(info ? { ...info, config: { ...config, configPath: getConfigPath() }, repoState } : { error: "Not a git repository" });
  });

  // ── Commits ──────────────────────────────────────────────────────────
  router.get("/commits", (req, res) => {
    const base = req.query.base;
    if (!base) return res.json({ error: "No base branch" });
    res.json(getCommits(getTarget(req), base, state.logs));
  });

  // ── Squash ───────────────────────────────────────────────────────────
  router.post("/squash", (req, res) => {
    const { base, fixup_indices } = req.body;
    if (!base || !fixup_indices?.length) {
      return res.json({ error: "Missing base or indices" });
    }
    res.json(squash(getTarget(req), base, fixup_indices, state.logs));
  });

  // ── Undo ─────────────────────────────────────────────────────────────
  router.post("/undo", (req, res) => {
    res.json(undo(getTarget(req), state.logs));
  });

  router.post("/diff", (req, res) => {
    const { hashes } = req.body;
    if (!hashes?.length) return res.json({ error: "No hashes provided" });
    res.json(getDiff(getTarget(req), hashes, state.logs));
  });

  router.post("/files", (req, res) => {
    const { hashes } = req.body;
    if (!hashes?.length) return res.json({ error: "No hashes provided" });
    res.json(getFiles(getTarget(req), hashes, state.logs));
  });

  router.post("/compare", (req, res) => {
    const { branch1, branch2 } = req.body;
    if (!branch1 || !branch2) return res.json({ error: "Missing branches" });
    res.json(compareBranches(getTarget(req), branch1, branch2, state.logs));
  });

  router.post("/reverse", (req, res) => {
    const { hashes } = req.body;
    if (!hashes?.length) return res.json({ error: "No hashes provided" });
    res.json(reverseCommits(getTarget(req), hashes, state.logs));
  });

  router.post("/reverse-patch", (req, res) => {
    const { patch } = req.body;
    if (!patch) return res.json({ error: "No patch provided" });
    res.json(reversePatch(getTarget(req), patch, state.logs));
  });

  router.get("/status", (req, res) => {
    if (!getTarget(req)) return res.json({ error: "No repo selected" });
    res.json(getStatus(getTarget(req), state.logs));
  });

  router.post("/stage", (req, res) => {
    const { action, path } = req.body;
    if (!action || !path) return res.json({ error: "Missing action or path" });
    res.json(stageFile(getTarget(req), action, path, state.logs));
  });

  router.post("/commit", (req, res) => {
    const { message } = req.body;
    if (!message) return res.json({ error: "No commit message" });
    res.json(commit(getTarget(req), message, state.logs));
  });

  router.post("/working-diff", (req, res) => {
    const { path, staged } = req.body;
    if (!path) return res.json({ error: "Missing path" });
    res.json(getWorkingDiff(getTarget(req), path, staged, state.logs));
  });

  router.get("/excludes", (req, res) => {
    if (!getTarget(req)) return res.json({ error: "No repo selected" });
    res.json(getExcludes(getTarget(req), state.logs));
  });

  router.post("/exclude", (req, res) => {
    const { action, pattern } = req.body;
    if (!action || !pattern) return res.json({ error: "Missing action or pattern" });
    res.json(manageExclude(getTarget(req), action, pattern, state.logs));
  });

  // ── Folder browsing ──────────────────────────────────────────────────
  router.get("/ls", (req, res) => {
    const p = req.query.path || os.homedir();
    res.json(listDir(p));
  });

  // ── Set repo (from browser picker) ───────────────────────────────────
  router.post("/set-repo", (req, res) => {
    const { path } = req.body;
    if (!path || !isGitRepo(path)) {
      return res.json({ error: "Not a git repository" });
    }
    state.repoPath = path;
    const config = addRecentDir(state.repoPath);
    res.json({ path: state.repoPath, config });
  });

  // ── Native OS dialog ─────────────────────────────────────────────────
  router.post("/native-dialog", (req, res) => {
    const picked = nativeDialog(state.repoPath);
    if (!picked) return res.json({ error: "Cancelled" });
    if (!isGitRepo(picked)) {
      return res.json({ error: `Not a git repository: ${picked}` });
    }
    state.repoPath = picked;
    const config = addRecentDir(state.repoPath);
    res.json({ path: state.repoPath, config });
  });

  router.post("/save-state", (req, res) => {
    const target = getTarget(req);
    if (!target) return res.json({ error: "No repo selected" });
    res.json(saveRepoState(target, req.body));
  });

  router.get("/folder-config", (req, res) => {
    res.json({ ...readConfig(), configPath: getConfigPath() });
  });

  router.get("/logs", (req, res) => {
    res.json({ logs: state.logs.list() });
  });

  router.post("/test-get-branches", (req, res) => {
    res.json(testGetBranches(getTarget(req), state.logs));
  });

  router.post("/favourite", (req, res) => {
    const { path } = req.body;
    if (!path) return res.json({ error: "Missing path" });
    res.json(toggleFavouriteDir(path));
  });

  router.post("/update-tabs", (req, res) => {
    res.json(updateTabs(req.body.tabs));
  });

  return router;
}
