<script>
  import { createEventDispatcher, onDestroy } from "svelte";
  import { 
    getInfo, getCommits, squash, undoSquash, getLogs, 
    testGetBranches, getDiff, getFiles, compareBranches, saveRepoState,
    reverse, reversePatch, getStatus, stageFile, commit, renameCommitMessage, getWorkingDiff,
    getExcludes, manageExclude, setActiveRepo, push, forcePush,
    getStashes, getStashFiles, getStashDiff, applyStash, switchBranch
  } from "./api.js";

  import { showToast } from "./toast.js";

  import CommitList from "./CommitList.svelte";
  import FolderPicker from "./FolderPicker.svelte";

  import DiffPanel from "./DiffPanel.svelte";
  import FileList from "./FileList.svelte";
  import CompareSelector from "./CompareSelector.svelte";
  import StatusList from "./StatusList.svelte";
  import LogPanel from "./LogPanel.svelte";
  import LogsView from "./LogsView.svelte";
  import BranchSwitchModal from "./BranchSwitchModal.svelte";
  import StashRestoreModal from "./StashRestoreModal.svelte";

  export let tabId;
  export let repoPath = "";
  export let folderConfig = {};

  const dispatch = createEventDispatcher();

  const defaultLogPanelPosition = { x: null, y: null };
  const LOG_POLL_INTERVAL_MS = 1200;

  let view = "loading"; // loading | picker | main
  let mode = "squash";
  let info = null;
  let baseBranch = "";
  let commits = [];
  let selected = new Set();
  let loading = false;
  let logs = [];
  let stashes = [];
  let stashFiles = [];
  let selectedStashRef = "";
  let applyingStashRef = "";
  let branchSwitchOpen = false;
  let branchSwitchTarget = "";
  let branchSwitchStrategy = "direct";
  let branchSwitchStashName = "";
  let branchSwitchError = "";
  let branchSwitchLoading = false;
  let restoreStashPromptOpen = false;
  let restoreSelectedStashRef = "";
  let restoreStashes = [];
  let restoreFromBranch = "";
  let restoreLoading = false;

  $: selectedStash = stashes.find((stash) => stash.ref === selectedStashRef) || null;
  $: branchStashes = stashes.filter((stash) => !info?.branch || !stash.branch || stash.branch === info.branch);
  $: selectedDisplayPath = mode === "commit"
    ? (selectedStash ? selectedFile : selectedWorkingFile?.path)
    : selectedFile;

  // Expose state to parent
  $: unstagedCount = statusFiles.filter(f => !f.staged).length;
  $: unpushedCount = unpushedCommits.length;
  $: dispatch("status-update", { 
    tabId, 
    state: { info, mode, baseBranch, loading, view, unstagedCount, unpushedCount, logsCount: logs.length } 
  });

  export function runSquash() { handleSquash(); }
  export function runUndo(skipConfirm = false) { handleUndo(skipConfirm); }
  export async function runRefresh() { await refreshWorkspace(); }
  export async function refreshRepoContext() { await refreshWorkspace(); }
  export function runTestBranches() { handleTestBranches(); }
  export function changeMode(newMode) { toggleMode(newMode); }
  export function setBase(newBase) { handleBaseChange({ detail: newBase }); }
  export function pickRepo() { view = "picker"; }
  export async function refreshWS() { await refreshWorkspace(); }
  export async function refreshLg() { await refreshLogs(); }
  export function openBranchSwitch(targetBranch = "") {
    if (!info?.branches?.length) return;
    branchSwitchTarget =
      targetBranch && info.branches.includes(targetBranch) && targetBranch !== info.branch
        ? targetBranch
        : (
            branchSwitchTarget &&
            branchSwitchTarget !== info.branch &&
            info.branches.includes(branchSwitchTarget)
              ? branchSwitchTarget
              : (info.branches.find((branch) => branch !== info.branch) || "")
          );
    branchSwitchStrategy = "direct";
    branchSwitchStashName = "";
    branchSwitchError = "";
    branchSwitchOpen = true;
  }

  export async function switchBranchFromDrawer(targetBranch, options = {}) {
    if (!targetBranch || !repoPath) return { error: "No target branch" };
    if (!info) {
      const latestInfo = await refreshInfo(false);
      if (!latestInfo) return { error: "Could not load repository info" };
    }

    if (!options.remote && targetBranch === info?.branch) {
      return { ok: true, currentBranch: targetBranch };
    }

    setActiveRepo(repoPath);
    branchSwitchLoading = true;
    const result = await switchBranch(targetBranch, "direct", "");
    branchSwitchLoading = false;

    if (result.error) {
      if (result.blockedByChanges && !options.remote && info?.branches?.includes(targetBranch)) {
        promptDrawerBranchSwitch(targetBranch, result.error);
      } else {
        showToast(result.error, "err");
      }
      return result;
    }

    await finalizeBranchSwitch(
      result,
      options.remote
        ? `Checked out ${result.currentBranch} from ${targetBranch}.`
        : `Switched to ${result.currentBranch}.`
    );

    return result;
  }

  let currentDiff = "";
  let diffLoading = false;
  let changedFiles = [];
  let selectedFile = null;

  let compareBranch1 = "";
  let compareBranch2 = "";
  let fullCompareData = null;

  let statusFiles = [];
  let unpushedCommits = [];
  let excludePatterns = [];

  let commitMessage = "";
  let squashMessage = "";
  let selectedWorkingFile = null;

  let sidebarWidth = 300;
  let diffSplitH = 50; // percentage
  let collapsedSections = { staged: false, unstaged: false, excluded: false, stashes: true };
  let isResizing = false;
  let resizingType = 'width'; // 'width' | 'diffHeight'
  let logPanelPosition = { ...defaultLogPanelPosition };
  let logPanelFloating = false;
  let refreshingLogs = false;
  let logRefreshInterval = null;

  $: filteredStatusFiles = statusFiles.filter(f => !excludePatterns.includes(f.path));
  $: uiZoom = Number(folderConfig?.settings?.zoomLevel) || 1;
  $: shouldPollLogs = view === "main" && Boolean(repoPath) && (mode === "logs" || logPanelFloating);
  $: if (shouldPollLogs) {
    startLogPolling();
  } else {
    stopLogPolling();
  }

  onDestroy(() => {
    flushPendingState();
    stopLogPolling();
  });

  function startLogPolling() {
    if (typeof window === "undefined" || logRefreshInterval) return;
    logRefreshInterval = window.setInterval(() => {
      refreshLogs();
    }, LOG_POLL_INTERVAL_MS);
  }

  function stopLogPolling() {
    if (!logRefreshInterval) return;
    clearInterval(logRefreshInterval);
    logRefreshInterval = null;
  }

  function clearStashSelection(clearFile = false) {
    selectedStashRef = "";
    stashFiles = [];
    if (clearFile) selectedFile = null;
  }

  function syncBranchSelections() {
    if (!info?.branches?.length) return;

    if (!baseBranch || baseBranch === info.branch || !info.branches.includes(baseBranch)) {
      baseBranch = info.base;
    }

    if (compareBranch1 && !info.branches.includes(compareBranch1)) {
      compareBranch1 = baseBranch;
    }

    if (compareBranch2 && !info.branches.includes(compareBranch2)) {
      compareBranch2 = info.branch;
    }
  }

  // Switch API context whenever repoPath changes.
  let lastRepoPath;
  $: if (repoPath !== lastRepoPath) {
      lastRepoPath = repoPath;
      init();
  }

  async function refreshInfo(showErrors = true) {
    if (!repoPath) {
      view = "picker";
      return null;
    }

    setActiveRepo(repoPath);
    const data = await getInfo();

    if (data.needsRepo) {
      view = "picker";
      return null;
    }

    if (data.error) {
      if (showErrors) showToast(data.error, "err");
      return null;
    }

    info = data;
    if (!baseBranch || baseBranch === info.branch || !info.branches.includes(baseBranch)) {
      baseBranch = data.base;
    }
    syncBranchSelections();
    return data;
  }

  async function init() {
    if (!repoPath) {
        view = "picker";
        return;
    }
    view = "loading";
    const data = await refreshInfo();
    if (!data) {
      return;
    }

    baseBranch = data.base;
    clearStashSelection(true);
    stashes = [];
    logPanelPosition = { ...defaultLogPanelPosition };
    collapsedSections = { staged: false, unstaged: false, excluded: false, stashes: true };
    logPanelFloating = false;

    if (data.repoState) {
        const s = data.repoState;
        mode = s.mode || "squash";
        baseBranch = s.baseBranch || data.base;
        if (s.selected && Array.isArray(s.selected)) {
            selected = new Set(s.selected);
        }
        if (s.compareBranch1) compareBranch1 = s.compareBranch1;
        if (s.compareBranch2) compareBranch2 = s.compareBranch2;
        if (s.selectedFile) selectedFile = s.selectedFile;
        if (s.sidebarWidth) sidebarWidth = s.sidebarWidth;
        if (s.diffSplitH) diffSplitH = s.diffSplitH;
        if (s.collapsedSections) collapsedSections = { ...collapsedSections, ...s.collapsedSections };
        if (s.logPanelPosition) {
          logPanelPosition = {
            x: Number.isFinite(s.logPanelPosition.x) ? s.logPanelPosition.x : null,
            y: Number.isFinite(s.logPanelPosition.y) ? s.logPanelPosition.y : null
          };
        }
        if (typeof s.logPanelFloating === "boolean") {
          logPanelFloating = s.logPanelFloating;
        }
    }

    syncBranchSelections();

    view = "main";
    await loadCommits();

    if (mode === 'compare' && compareBranch1 && compareBranch2) {
        handleCompare();
    }

  }

  async function refreshWorkspace() {
    const latestInfo = await refreshInfo(false);
    if (!latestInfo) return;

    if (mode === "logs") {
      await loadStatus();
      return;
    }

    await loadCommits();
  }

  $: if (view === 'main' && info?.path) {
      persistState({
          mode,
          baseBranch,
          selected: Array.from(selected),
          compareBranch1,
          compareBranch2,
          selectedFile,
          sidebarWidth,
          diffSplitH,
          collapsedSections,
          logPanelPosition,
          logPanelFloating
      });
  }

  let saveTimeout;
  let pendingState = null;
  function persistState(state, immediate = false) {
      pendingState = state;
      clearTimeout(saveTimeout);
      if (immediate) {
          saveRepoState(state);
          pendingState = null;
          return;
      }
      saveTimeout = setTimeout(() => {
          saveRepoState(state);
          pendingState = null;
      }, 300);
  }

  function flushPendingState() {
      if (pendingState) {
          clearTimeout(saveTimeout);
          saveRepoState(pendingState);
          pendingState = null;
      }
  }

  function handleLogPanelPositionChange(event) {
      const { x, y } = event.detail || {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      logPanelPosition = { x, y };
  }

  function handleToggleLogFloating() {
      logPanelFloating = !logPanelFloating;
      if (logPanelFloating) refreshLogs();
  }

  async function loadCommits() {
    setActiveRepo(repoPath);
    loading = true;
    const data = await getCommits(baseBranch);
    loading = false;

    if (data.error) {
      commits = [];
      showToast(data.error, "err");
    } else {
      commits = data.commits || [];
      squashMessage = ""; // Clear on fresh load
      if (selected.size > 0 && mode === 'diff') {
          fetchFiles();
      }
    }

    await loadStatus();
    await refreshLogs();
  }

  async function handleSquash() {
    setActiveRepo(repoPath);
    if (selected.size === 0) return;
    const indices = Array.from(selected).sort((a, b) => a - b);
    const r = await squash(baseBranch, indices, squashMessage);

    await refreshLogs();
    if (r.error) showToast(r.error, "err");
    else {
      showToast("Squash complete!");
      selected = new Set(); 
      await loadCommits();
    }
  }

  async function handleUndo(skipConfirm = false) {
    setActiveRepo(repoPath);
    if (!skipConfirm && !confirm("Undo the last squash?")) return;
    const r = await undoSquash();

    await refreshLogs();
    if (r.error) showToast(r.error, "err");
    else {
      showToast("Squash undone!");
      await loadCommits();
    }
  }

  async function handleReverse(e) {
    const hashes = e.detail;
    if (!hashes?.length) return;
    const count = hashes.length;
    if (!confirm(`Reverse ${count} commit${count > 1 ? 's' : ''}? Changes will be added to your working tree.`)) return;
    setActiveRepo(repoPath);
    loading = true;
    const r = await reverse(hashes);
    loading = false;
    await refreshLogs();
    if (r.error) showToast(r.error, "err");
    else showToast(`Reversed ${count} commit${count > 1 ? 's' : ''}.`);
  }

  async function handleReverseFile(e) {
      setActiveRepo(repoPath);
      const fileName = e.detail;
      const hashes = Array.from(selected).sort((a, b) => a - b).map(i => commits[i].hash);
      const res = await getDiff(hashes);
      if (res.error) return showToast(res.error, "err");

      const allDiff = res.diff;
      const fileMarker = `diff --git a/${fileName} b/${fileName}`;
      const startIndex = allDiff.indexOf(fileMarker);
      if (startIndex === -1) return showToast("Could not find file diff", "err");

      let nextIndex = allDiff.indexOf('diff --git', startIndex + fileMarker.length);
      if (nextIndex === -1) nextIndex = allDiff.length;
      const filePatch = allDiff.substring(startIndex, nextIndex);

      loading = true;
      const r = await reversePatch(filePatch);
      loading = false;
      await refreshLogs();
      if (r.error) showToast(r.error, "err");
      else showToast(`Reversed all changes to ${fileName}.`);
  }

  async function handleReversePatch(e) {
      setActiveRepo(repoPath);
      const patch = e.detail;
      if (!confirm("Reverse the selected lines?")) return;
      loading = true;
      const r = await reversePatch(patch);
      loading = false;
      await refreshLogs();
      if (r.error) showToast(r.error, "err");
      else showToast("Reversed selected lines.");
  }

  function handleBaseChange(e) {
    baseBranch = e.detail;
    selected = new Set();
    clearStashSelection(true);
    loadCommits();
  }

  function onRepoSelected(e) {
    const newPath = e.detail.path;
    dispatch("repo-selected", { tabId, path: newPath });
  }

  async function refreshLogs() {
    if (!repoPath || refreshingLogs) return;
    refreshingLogs = true;
    setActiveRepo(repoPath);
    try {
      const data = await getLogs();
      if (!data.error) logs = data.logs || [];
    } finally {
      refreshingLogs = false;
    }
  }

  async function handleTestBranches() {
    setActiveRepo(repoPath);
    const result = await testGetBranches();
    await refreshLogs();
    if (result.error) showToast(result.error, "err");
    else showToast("get-branches response logged");
  }

  function prioritizeStashes(targetBranch, createdStashRef = "") {
    return [...stashes].sort((left, right) => {
      const leftScore =
        (left.ref === createdStashRef ? 100 : 0) +
        (left.branch === targetBranch ? 10 : 0);
      const rightScore =
        (right.ref === createdStashRef ? 100 : 0) +
        (right.branch === targetBranch ? 10 : 0);

      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.ref.localeCompare(right.ref);
    });
  }

  function resetSelectionForBranchSwitch() {
    selected = new Set();
    clearStashSelection(true);
    changedFiles = [];
    currentDiff = "";
    fullCompareData = null;
    selectedWorkingFile = null;
  }

  function promptDrawerBranchSwitch(targetBranch, errorMessage) {
    branchSwitchTarget = targetBranch;
    branchSwitchStrategy = "stash";
    branchSwitchStashName = "";
    branchSwitchError = `Direct switching was blocked by your current working tree.\n\n${errorMessage}`;
    branchSwitchOpen = true;
  }

  async function finalizeBranchSwitch(result, successMessage) {
    branchSwitchOpen = false;
    branchSwitchLoading = false;
    branchSwitchError = "";
    branchSwitchStashName = "";

    resetSelectionForBranchSwitch();
    await refreshWorkspace();
    compareBranch2 = info?.branch || result.currentBranch;
    showToast(successMessage);

    if (stashes.length > 0) {
      restoreFromBranch = result.previousBranch;
      restoreStashes = prioritizeStashes(info?.branch || result.currentBranch, result.stashRef);
      restoreSelectedStashRef =
        result.stashRef ||
        restoreStashes.find((stash) => stash.branch === (info?.branch || result.currentBranch))?.ref ||
        restoreStashes[0]?.ref ||
        "";
      restoreStashPromptOpen = restoreStashes.length > 0;
    }
  }

  async function handleConfirmBranchSwitch() {
    if (!branchSwitchTarget || branchSwitchTarget === info?.branch) return;

    setActiveRepo(repoPath);
    branchSwitchLoading = true;
    branchSwitchError = "";

    const stashName = branchSwitchStrategy === "stash" ? branchSwitchStashName.trim() : "";
    const result = await switchBranch(branchSwitchTarget, branchSwitchStrategy, stashName);

    if (result.error) {
      branchSwitchLoading = false;
      branchSwitchError = result.blockedByChanges && branchSwitchStrategy === "direct"
        ? `Direct switching was blocked by your current working tree.\n\n${result.error}`
        : result.error;
      if (result.blockedByChanges) {
        branchSwitchStrategy = "stash";
      }
      return;
    }

    await finalizeBranchSwitch(result, `Switched to ${result.currentBranch}.`);
  }

  async function handleApplyRestoreStash() {
    if (!restoreSelectedStashRef) return;
    const stashRef = restoreSelectedStashRef;
    restoreLoading = true;
    setActiveRepo(repoPath);
    const result = await applyStash(stashRef);
    restoreLoading = false;

    if (result.error) {
      showToast(result.error, "err");
      return;
    }

    restoreStashPromptOpen = false;
    restoreSelectedStashRef = "";
    restoreFromBranch = "";
    restoreStashes = [];
    showToast(`Applied ${stashRef}.`);
    await loadStatus();
  }

  function closeRestorePrompt() {
    restoreStashPromptOpen = false;
    restoreSelectedStashRef = "";
    restoreFromBranch = "";
    restoreStashes = [];
    restoreLoading = false;
  }

  async function handleSelect(e) {
    if (selectedStashRef) clearStashSelection(true);
    selected = e.detail;
    if (mode === "diff") await fetchFiles();
  }

  async function handleSelectStash(e) {
    if (mode !== "commit") return;
    const stashRef = e.detail;
    if (!stashRef) return;

    selected = new Set();
    changedFiles = [];
    selectedFile = null;
    currentDiff = "";
    fullCompareData = null;
    selectedStashRef = stashRef;

    await fetchStashFiles();
  }

  async function fetchFiles() {
    if (selected.size === 0) {
      changedFiles = [];
      selectedFile = null;
      currentDiff = "";
      return;
    }
    setActiveRepo(repoPath);
    const hashes = Array.from(selected).sort((a, b) => a - b).map(i => commits[i].hash);
    const result = await getFiles(hashes);
    if (result.error) showToast(result.error, "err");
    else {
      changedFiles = result.files || [];
      if (changedFiles.length > 0 && !selectedFile) {
        handleFileSelect({ detail: changedFiles[0].path });
      } else if (selectedFile) {
          fetchDiff();
      }
    }
  }

  async function fetchStashFiles() {
    if (!selectedStashRef) {
      stashFiles = [];
      return;
    }

    setActiveRepo(repoPath);
    const result = await getStashFiles(selectedStashRef);
    if (result.error) {
      showToast(result.error, "err");
      return;
    }

    stashFiles = result.files || [];

    if (stashFiles.length === 0) {
      selectedFile = null;
      currentDiff = "";
      return;
    }

    const selectedStillExists = stashFiles.some((file) => file.path === selectedFile);
    if (!selectedStillExists) {
      await handleFileSelect({ detail: stashFiles[0].path });
    } else {
      await fetchDiff();
    }
  }

  async function handleFileSelect(e) {
    selectedFile = e.detail;
    await fetchDiff();
  }

  async function fetchDiff() {
    if (!selectedFile) {
      currentDiff = "";
      return;
    }
    setActiveRepo(repoPath);
    diffLoading = true;

    if (selectedStashRef) {
      const stashResult = await getStashDiff(selectedStashRef, selectedFile);
      diffLoading = false;
      if (stashResult.error) {
        showToast(stashResult.error, "err");
        return;
      }
      currentDiff = stashResult.diff || "No changes to show";
      return;
    }

    let sourceDiff = "";
    if (mode === "compare" && fullCompareData) {
      sourceDiff = fullCompareData.diff;
    } else if (selected.size > 0) {
      const hashes = Array.from(selected).sort((a, b) => a - b).map(i => commits[i].hash);
      const result = await getDiff(hashes);
      sourceDiff = result.diff || "";
    }
    diffLoading = false;
    const fileMarker = `diff --git a/${selectedFile} b/${selectedFile}`;
    const startIndex = sourceDiff.indexOf(fileMarker);
    if (startIndex !== -1) {
      let nextIndex = sourceDiff.indexOf('diff --git', startIndex + fileMarker.length);
      if (nextIndex === -1) nextIndex = sourceDiff.length;
      currentDiff = sourceDiff.substring(startIndex, nextIndex);
    } else {
      currentDiff = "Could not find diff for file";
    }
  }

  async function handleCompare() {
    setActiveRepo(repoPath);
    loading = true;
    fullCompareData = null;
    changedFiles = [];
    clearStashSelection(true);
    const result = await compareBranches(compareBranch1, compareBranch2);
    loading = false;
    if (result.error) showToast(result.error, "err");
    else {
      fullCompareData = result;
      changedFiles = result.files || [];
      if (changedFiles.length > 0) {
          if (!selectedFile) handleFileSelect({ detail: changedFiles[0].path });
          else fetchDiff();
      }
    }
  }

  function handleCompareChange(e) {
    compareBranch1 = e.detail.branch1;
    compareBranch2 = e.detail.branch2;
  }

  function handleSwap() {
    const temp = compareBranch1;
    compareBranch1 = compareBranch2;
    compareBranch2 = temp;
    if (fullCompareData) handleCompare();
  }

  function toggleMode(newMode) {
    flushPendingState();
    mode = newMode;
    selected = new Set();
    clearStashSelection();
    currentDiff = "";
    changedFiles = [];
    selectedFile = null;
    selectedWorkingFile = null;
    fullCompareData = null;
    if (mode === 'compare' && info?.branches) {
        if (!compareBranch1) compareBranch1 = baseBranch;
        if (!compareBranch2) compareBranch2 = info.branch;
    }
    if (mode === 'commit') loadStatus();
    if (mode === 'logs') refreshLogs();
  }

  async function loadStatus() {
      setActiveRepo(repoPath);
      loading = true;
      const previousSelectedStash = selectedStashRef;
      const [res, exRes, stashRes] = await Promise.all([getStatus(), getExcludes(), getStashes()]);
      loading = false;
      if (res.error) showToast(res.error, "err");
      else {
          statusFiles = res.files || [];
          unpushedCommits = res.unpushed || [];
      }

      if (exRes.error) showToast(exRes.error, "err");
      else excludePatterns = exRes.excludes || [];

      if (stashRes.error) showToast(stashRes.error, "err");
      else {
          stashes = stashRes.stashes || [];
          if (previousSelectedStash && !stashes.some((stash) => stash.ref === previousSelectedStash)) {
              clearStashSelection(true);
              if (mode === 'commit' && selectedWorkingFile) await fetchWorkingDiff();
              else currentDiff = "";
          }
      }

      if (mode === 'commit' && statusFiles.length > 0 && !selectedWorkingFile) {
          const first = statusFiles.find(f => f.staged) || statusFiles[0];
          handleWorkingFileSelect({ detail: { path: first.path, staged: first.staged } });
      }
      await refreshLogs();
  }

  async function handleApplyStash(e) {
      const detail = e?.detail;
      const stashRef = typeof detail === "string" ? detail : (detail?.stashRef || selectedStashRef);
      const filePath = typeof detail === "object" ? detail?.path : null;
      if (!stashRef) return;
      const wasActiveSelection = selectedStashRef === stashRef;

      setActiveRepo(repoPath);
      applyingStashRef = stashRef;
      const result = await applyStash(stashRef, filePath);
      applyingStashRef = "";

      if (result.error) {
          showToast(result.error, "err");
          return;
      }

      showToast(filePath ? `Applied ${filePath} from ${stashRef}.` : `Applied ${stashRef}.`);
      await loadStatus();

      if (wasActiveSelection && selectedStashRef === stashRef) {
          await fetchStashFiles();
      } else if (mode === 'commit' && selectedWorkingFile) {
          await fetchWorkingDiff();
      }
  }

  function handleDiffFileAction(e) {
      if (selectedStashRef) {
          handleApplyStash({ detail: { stashRef: selectedStashRef, path: e.detail } });
          return;
      }
      handleReverseFile({ detail: e.detail });
  }

  async function handleManageExclude(e) {
      setActiveRepo(repoPath);
      const { action, pattern } = e.detail;
      const res = await manageExclude(action, pattern);
      if (res.error) showToast(res.error, "err");
      else {
          showToast(action === 'add' ? "Added to local exclusions" : "Removed from exclusions");
          await loadStatus();
      }
  }

  function handleToggleCollapse(e) {
      const section = e.detail;
      collapsedSections = { ...collapsedSections, [section]: !collapsedSections[section] };
  }

  function startResizing(type = 'width') { 
      isResizing = true; 
      resizingType = type;
  }
  function stopResizing() {
    isResizing = false;
    flushPendingState();
  }
  function handleMouseMove(e) {
      if (!isResizing) return;
      if (resizingType === 'width') {
          const layout = document.querySelector('.commit-mode-layout');
          if (layout) {
              const rect = layout.getBoundingClientRect();
              sidebarWidth = Math.max(200, Math.min(600, (e.clientX - rect.left) / uiZoom));
          }
      } else if (resizingType === 'diffHeight') {
          const sidebar = document.querySelector('.diff-sidebar-content');
          if (sidebar) {
              const rect = sidebar.getBoundingClientRect();
              const y = e.clientY - rect.top;
              diffSplitH = Math.max(10, Math.min(90, (y / rect.height) * 100));
          }
      }
  }

  async function handleToggleStage(e) {
      setActiveRepo(repoPath);
      const { action, path } = e.detail;
      const res = await stageFile(action, path);
      if (res.error) showToast(res.error, "err");
      else {
          await loadStatus();
          if (selectedWorkingFile?.path === path) {
              selectedWorkingFile = { ...selectedWorkingFile, staged: action === 'stage' };
              fetchWorkingDiff();
          }
      }
  }

  async function handleCommit() {
      setActiveRepo(repoPath);
      if (!commitMessage.trim()) return showToast("Please enter a commit message", "err");
      loading = true;
      const res = await commit(commitMessage);
      loading = false;
      await refreshLogs();
      if (res.error) showToast(res.error, "err");
      else {
          showToast("Committed successfully!");
          commitMessage = "";
          await loadStatus();
          await loadCommits();
      }
  }

  async function handleRenameCommit(e) {
      const { hash, message } = e.detail;
      if (!hash || !message?.trim()) return showToast("Please enter a commit message", "err");
      setActiveRepo(repoPath);
      loading = true;
      try {
          const res = await renameCommitMessage(hash, message);
          await refreshLogs();
          if (res.error) {
              showToast(res.error, "err");
              return;
          }

          showToast("Commit message updated.");
          await loadCommits();
      } catch (error) {
          showToast(error?.message || "Commit rename failed.", "err");
      } finally {
          loading = false;
      }
  }

  async function handlePush() {
      if (!info?.branch) return;
      if (info.branch === 'master' || info.branch === 'main') {
          return showToast(`Pushing to ${info.branch} is disabled for safety.`, "err");
      }
      if (!confirm(`Push changes to origin/${info.branch}?`)) return;

      setActiveRepo(repoPath);
      loading = true;
      const res = await push(info.branch);
      loading = false;
      await refreshLogs();
      if (res.error) showToast(res.error, "err");
      else {
          showToast("Pushed successfully!");
          await loadStatus();
      }
  }

  async function handleForcePush() {
      if (!info?.branch) return;
      if (info.branch === 'master' || info.branch === 'main') {
          return showToast(`Force pushing to ${info.branch} is strictly forbidden!`, "err");
      }
      if (!confirm(`CRITICAL: Force push (with lease) to origin/${info.branch}? This will rewrite remote history.`)) return;

      setActiveRepo(repoPath);
      loading = true;
      const res = await forcePush(info.branch);
      loading = false;
      await refreshLogs();
      if (res.error) showToast(res.error, "err");
      else {
          showToast("Force pushed successfully!");
          await loadStatus();
      }
  }

  async function handleWorkingFileSelect(e) {
      if (selectedStashRef) clearStashSelection(true);
      selectedWorkingFile = e.detail;
      await fetchWorkingDiff();
  }

  async function fetchWorkingDiff() {
      setActiveRepo(repoPath);
      if (!selectedWorkingFile) {
          currentDiff = "";
          return;
      }
      diffLoading = true;
      const res = await getWorkingDiff(selectedWorkingFile.path, selectedWorkingFile.staged);
      diffLoading = false;
      if (res.error) showToast(res.error, "err");
      else currentDiff = res.diff || "No changes to show";
  }
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={stopResizing} />

<div class="project-view" class:resizing={isResizing}>
  {#if view === "loading"}
    <div class="empty-view">Loading Project...</div>

  {:else if view === "picker"}
    <FolderPicker
      initialPath={repoPath}
      {folderConfig}
      on:repo-selected={onRepoSelected}
      on:config-changed={() => dispatch('config-changed')}
    />

  {:else if view === "main" && info}
    <div class="layout layout-main">
      {#if mode === 'commit' || mode === 'diff'}
        <div class="commit-mode-layout" style="--sidebar-w: {sidebarWidth}px">
            <div class="commit-sidebar">
                {#if mode === 'commit'}
                    <StatusList 
                        files={filteredStatusFiles} 
                        unpushedCommits={unpushedCommits}
                        stashes={branchStashes}
                        excludes={excludePatterns}

                        selectedFile={selectedWorkingFile}
                        {selectedStashRef}
                        {applyingStashRef}
                        collapsed={collapsedSections}
                        bind:commitMessage={commitMessage}
                        {loading}
                        on:select={handleWorkingFileSelect}
                        on:select-stash={handleSelectStash}
                        on:apply-stash={handleApplyStash}
                        on:toggle-stage={handleToggleStage}
                        on:manage-exclude={handleManageExclude}
                        on:toggle-collapse={handleToggleCollapse}
                        on:commit={handleCommit}
                        on:rename-commit={handleRenameCommit}
                        on:push={handlePush}
                    />
                {:else}
                    <div class="diff-sidebar-content">
                        <div class="diff-sidebar-sec" style="height: {diffSplitH}%">
                            <div class="sec-header">Commits ({commits.length})</div>
                            <div class="sec-body">
                                {#if loading}
                                    <div class="empty-view">Loading commits...</div>
                                {:else}
                                    <CommitList 
                                        {commits} {selected} {mode} 
                                        bind:squashMessage={squashMessage}
                                        {unpushedCommits}
                                        on:select={handleSelect} 
                                        on:squash={handleSquash} 
                                        on:undo={() => dispatch('undo')} 
                                        on:reverse={handleReverse}
                                        on:force-push={handleForcePush}
                                    />
                                {/if}
                            </div>
                        </div>

                        <button
                          type="button"
                          class="h-resizer"
                          aria-label="Resize commit and file panels"
                          on:mousedown={() => startResizing('diffHeight')}
                        ></button>
                        <div class="diff-sidebar-sec file-browser-sec" style="height: {100 - diffSplitH}%">
                            <div class="sec-header">Changed Files ({changedFiles.length})</div>
                            <div class="sec-body">
                                <FileList
                                  files={changedFiles}
                                  {selectedFile}
                                  actionIcon="↩"
                                  actionTitle="Reverse all changes to this file from selection"
                                  actionTone="reverse"
                                  on:select={handleFileSelect}
                                  on:action={handleDiffFileAction}
                                />
                            </div>
                        </div>
                    </div>
                {/if}
                <button
                  type="button"
                  class="resizer"
                  aria-label="Resize sidebar"
                  on:mousedown={() => startResizing('width')}
                ></button>
            </div>

            <div class="commit-content">

                <div class="commit-main-area">
                    {#if mode === 'commit' && selectedStash}
                        <div class="stash-files-panel">
                            <div class="sec-header">Stash Files ({stashFiles.length})</div>
                            <div class="stash-files-body">
                                <FileList
                                  files={stashFiles}
                                  {selectedFile}
                                  actionIcon="+"
                                  actionTitle="Apply this file from the selected stash"
                                  actionTone="apply"
                                  on:select={handleFileSelect}
                                  on:action={handleDiffFileAction}
                                />
                            </div>
                        </div>
                    {/if}

                    <div class="commit-diff-section">
                        <div class="diff-header">
                            <div class="diff-title-block">
                                <h3>{mode === 'commit' && selectedStash ? 'Stash Diff:' : 'File Diff:'} <span class="file-path">{selectedDisplayPath || 'None selected'}</span></h3>
                                {#if mode === 'commit' && selectedStash}
                                    <div class="stash-context">{selectedStash.message || selectedStash.label} · {selectedStash.ref}</div>
                                {/if}
                            </div>
                            <div class="diff-header-actions">
                                {#if mode === 'commit' && selectedWorkingFile}
                                    <button
                                        class="btn btn-ghost btn-sm discard-file-btn"
                                        on:click={() => handleToggleStage({ detail: { action: 'unstage', path: selectedWorkingFile.path } })}
                                        title="Discard all changes in this file"
                                    >
                                        🗑 Discard File
                                    </button>
                                {:else if mode === 'commit' && selectedStash}
                                    {#if selectedFile}
                                        <button
                                            class="btn btn-accent btn-sm apply-file-btn"
                                            on:click={() => handleApplyStash({ detail: { stashRef: selectedStashRef, path: selectedFile } })}
                                            disabled={applyingStashRef === selectedStashRef}
                                        >
                                            + Apply File
                                        </button>
                                    {/if}
                                    <button
                                        class="btn btn-accent btn-sm apply-stash-btn"
                                        on:click={() => handleApplyStash({ detail: { stashRef: selectedStashRef } })}
                                        disabled={applyingStashRef === selectedStashRef}
                                    >
                                        Apply Stash
                                    </button>
                                {:else if mode === 'diff' && selectedFile}
                                    <button
                                        class="btn btn-ghost btn-sm discard-file-btn"
                                        on:click={() => handleReverseFile({ detail: selectedFile })}
                                        title="Discard all changes in this file"
                                    >
                                        🗑 Discard File
                                    </button>
                                {/if}
                                {#if diffLoading}<span class="loading-label">Loading...</span>{/if}
                            </div>
                        </div>

                        <div class="diff-wrapper">
                            <DiffPanel diff={currentDiff} allowReverse={!selectedStash} on:reverse-patch={handleReversePatch}/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      {:else if mode === 'logs'}
        <LogsView
          {logs}
          branchName={info.branch}
          floatingEnabled={logPanelFloating}
          on:refresh={refreshLogs}
          on:toggle-floating={handleToggleLogFloating}
        />
      {:else}
        <div class="main-panel">

          {#if mode === 'compare'}
            <CompareSelector 
              branches={info.branches}
              branch1={compareBranch1} branch2={compareBranch2}
              on:change={handleCompareChange} on:swap={handleSwap} on:compare={handleCompare}
            />
          {/if}
          <div class="top-section" class:compare-layout={mode === 'compare'}>
            {#if mode === 'squash'}
              <div class="commit-section">
                {#if loading}<div class="empty-view">Loading...</div>
                {:else if commits.length <= 1}
                  <div class="empty-view">✓ {commits.length === 0 ? `No commits ahead of ${baseBranch}.` : "Only 1 commit."}</div>
                {:else}
                  <CommitList 
                    {commits} {selected} {mode} 
                    bind:squashMessage={squashMessage}
                    on:select={handleSelect} 
                    on:squash={handleSquash} 
                    on:undo={() => dispatch('undo')} 
                    on:reverse={handleReverse}
                  />
                {/if}
              </div>
            {/if}

            {#if mode === 'compare'}
              <div class="file-section">
                <div class="sec-header">Changed Files ({changedFiles.length})</div>
                {#if loading}<div class="empty-view">Comparing...</div>
                {:else if !fullCompareData}<div class="empty-view">Select branches</div>
                {:else}
                    <FileList files={changedFiles} {selectedFile} on:select={handleFileSelect} on:reverse-file={handleReverseFile}/>
                {/if}
              </div>
            {/if}
          </div>
          {#if mode === 'squash'}
            <!-- Rebase Plan Preview Removed -->
          {:else}

            <div class="bottom-diff-section">
              <div class="diff-header">
                <h3>Diff: <span class="file-path">{selectedFile || 'None'}</span></h3>
                <div class="diff-header-actions">
                    {#if selectedFile}
                        <button 
                            class="btn btn-ghost btn-sm discard-file-btn" 
                            on:click={() => handleReverseFile({ detail: selectedFile })}
                            title="Discard all changes from selected commits in this file"
                        >
                            🗑 Discard File
                        </button>
                    {/if}
                    {#if diffLoading}<span class="loading-label">Loading...</span>{/if}
                </div>
              </div>

              <div class="diff-wrapper"><DiffPanel diff={currentDiff} on:reverse-patch={handleReversePatch}/></div>
            </div>
          {/if}
        </div>
      {/if}
      {#if logPanelFloating && mode !== 'logs'}
        <LogPanel
          {logs}
          branchName={info.branch}
          position={logPanelPosition}
          on:positionchange={handleLogPanelPositionChange}
        />
      {/if}
    </div>
  {/if}

  <BranchSwitchModal
    bind:isOpen={branchSwitchOpen}
    currentBranch={info?.branch || ""}
    branches={info?.branches || []}
    bind:selectedBranch={branchSwitchTarget}
    dirtyCount={statusFiles.length}
    loading={branchSwitchLoading}
    bind:strategy={branchSwitchStrategy}
    bind:stashName={branchSwitchStashName}
    error={branchSwitchError}
    on:confirm={handleConfirmBranchSwitch}
    on:close={() => {
      branchSwitchOpen = false;
      branchSwitchError = "";
      branchSwitchStashName = "";
    }}
  />

  <StashRestoreModal
    bind:isOpen={restoreStashPromptOpen}
    currentBranch={info?.branch || ""}
    previousBranch={restoreFromBranch}
    stashes={restoreStashes}
    bind:selectedStashRef={restoreSelectedStashRef}
    loading={restoreLoading}
    on:apply={handleApplyRestoreStash}
    on:close={closeRestorePrompt}
  />
</div>

<style>
  .project-view {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--editor-bg);
  }

  .project-view.resizing {
      user-select: none;
  }

  .layout {
      display: flex;
      align-items: flex-start;
      height: 100%;
      min-height: 0;
      background: var(--editor-bg);
  }

  .main-panel {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
      height: 100%;
      padding: 12px;
      background: var(--editor-bg);
  }

  .commit-mode-layout {
      display: flex;
      flex: 1;
      height: 100%;
      min-width: 0;
      background: var(--panel-bg);
      border: 1px solid var(--bdr);
      overflow: hidden;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  .commit-sidebar {
      width: var(--sidebar-w);
      height: 100%;
      position: relative;
      flex-shrink: 0;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--bdr);
  }

  .resizer {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      width: 4px;
      cursor: col-resize;
      z-index: 10;
      background: var(--panel-resizer);
      border: none;
      padding: 0;
  }

  .resizer:hover,
  .project-view.resizing .resizer {
      background: var(--panel-resizer-active);
  }

  .commit-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 12px;
      gap: 12px;
      background: var(--editor-bg);
  }

  .commit-main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
  }

  .stash-files-panel {
      display: flex;
      flex-direction: column;
      flex: 0 0 220px;
      min-height: 160px;
      max-height: 260px;
      background: var(--panel-bg);
      border: 1px solid var(--bdr);
      overflow: hidden;
  }
  .stash-files-body {
      flex: 1;
      min-height: 0;
      background: var(--panel-bg);
  }
  .commit-diff-section { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; min-height: 0; }

  .diff-sidebar-content {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--sidebar-bg);
  }

  .diff-sidebar-sec {
      display: flex;
      flex-direction: column;
      min-height: 0;
  }

  .file-browser-sec {
      min-height: 0;
  }

  .sec-header {
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--tx-d);
      background: var(--panel-section-bg);
      border-bottom: 1px solid var(--bdr);
      flex-shrink: 0;
      letter-spacing: 0.06em;
  }

  .sec-body {
      flex: 1;
      overflow-y: auto;
      background: var(--panel-bg);
  }

  .h-resizer {
      height: 4px;
      background: var(--panel-resizer);
      cursor: row-resize;
      flex-shrink: 0;
      transition: background 0.2s;
      border: none;
      padding: 0;
  }
  .h-resizer:hover { background: var(--panel-resizer-active); }
  .top-section { display: flex; gap: 14px; height: calc(100vh - 120px); }
  .top-section.compare-layout { height: 300px; }

  .commit-section, .file-section { flex: 1; min-width: 0; overflow-y: auto; }
  .bottom-diff-section { flex: 1; display: flex; flex-direction: column; gap: 12px; height: 600px; }
  .diff-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .diff-title-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .diff-header h3 { font-size: 13px; color: var(--tx-d); margin: 0; font-weight: 600; }
  .diff-header-actions { display: flex; align-items: center; gap: 12px; }
  .discard-file-btn { color: var(--red); opacity: 0.7; }
  .discard-file-btn:hover { opacity: 1; background: var(--danger-bg); }
  .apply-file-btn,
  .apply-stash-btn {
      border-color: rgba(137, 209, 133, 0.24);
      background: var(--grn-bg);
      color: var(--grn);
  }
  .apply-file-btn:hover,
  .apply-stash-btn:hover {
      background: var(--grn);
      border-color: var(--grn);
      color: #fff;
  }
  .stash-context {
      font-size: 11px;
      color: var(--tx-d);
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
  }
  .file-path { color: var(--acc); font-family: var(--font-mono); }

  .diff-wrapper { flex: 1; min-height: 0; }
  .empty-view { text-align: center; padding: 40px; color: var(--tx-d); }
</style>
