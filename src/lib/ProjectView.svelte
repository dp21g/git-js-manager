<script>
  import { onMount, createEventDispatcher } from "svelte";
  import { 
    getInfo, getCommits, squash, undoSquash, getLogs, 
    testGetBranches, getDiff, getFiles, compareBranches, saveRepoState,
    reverse, reversePatch, getStatus, stageFile, commit, renameCommitMessage, getWorkingDiff,
    getExcludes, manageExclude, setActiveRepo, push, forcePush
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

  export let tabId;
  export let repoPath = "";
  export let folderConfig = {};

  const dispatch = createEventDispatcher();

  const defaultLogPanelPosition = { x: null, y: null };

  let view = "loading"; // loading | picker | main
  let mode = "squash";
  let info = null;
  let baseBranch = "";
  let commits = [];
  let selected = new Set();
  let loading = false;
  let logs = [];

  // Expose state to parent
  $: unstagedCount = statusFiles.filter(f => !f.staged).length;
  $: unpushedCount = unpushedCommits.length;
  $: dispatch("status-update", { 
    tabId, 
    state: { info, mode, baseBranch, loading, view, unstagedCount, unpushedCount, logsCount: logs.length } 
  });

  export function runSquash() { handleSquash(); }
  export function runUndo(skipConfirm = false) { handleUndo(skipConfirm); }
  export function runRefresh() { mode === "logs" ? refreshLogs() : loadCommits(); }
  export function runTestBranches() { handleTestBranches(); }
  export function changeMode(newMode) { toggleMode(newMode); }
  export function setBase(newBase) { handleBaseChange({ detail: newBase }); }
  export function pickRepo() { view = "picker"; }

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
  let collapsedSections = { staged: false, unstaged: false, excluded: false };
  let isResizing = false;
  let resizingType = 'width'; // 'width' | 'diffHeight'
  let logPanelPosition = { ...defaultLogPanelPosition };
  let logPanelFloating = true;

  $: filteredStatusFiles = statusFiles.filter(f => !excludePatterns.includes(f.path));

  // Switch API context whenever repoPath changes
  let initialized = false;
  $: if (repoPath !== undefined || !initialized) {
      initialized = true;
      init();
  }

  async function init() {
    if (!repoPath) {
        view = "picker";
        return;
    }
    view = "loading";
    setActiveRepo(repoPath);
    const data = await getInfo();

    if (data.needsRepo) {
      view = "picker";
      return;
    }
    if (data.error) {
      showToast(data.error, "err");
      return;
    }

    info = data;
    baseBranch = data.base;
    logPanelPosition = { ...defaultLogPanelPosition };

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
        if (s.collapsedSections) collapsedSections = s.collapsedSections;
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

    view = "main";
    await refreshLogs();
    await loadCommits();
    await loadStatus(); // Load status always for the counter

    if (mode === 'compare' && compareBranch1 && compareBranch2) {
        handleCompare();
    }

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
  function persistState(state) {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
          saveRepoState(state);
      }, 500);
  }

  function handleLogPanelPositionChange(event) {
      const { x, y } = event.detail || {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      logPanelPosition = { x, y };
  }

  function handleToggleLogFloating() {
      logPanelFloating = !logPanelFloating;
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
    loadCommits();
  }

  function onRepoSelected(e) {
    const newPath = e.detail.path;
    dispatch("repo-selected", { tabId, path: newPath });
  }

  async function refreshLogs() {
    setActiveRepo(repoPath);
    const data = await getLogs();
    if (!data.error) logs = data.logs || [];
  }

  async function handleTestBranches() {
    setActiveRepo(repoPath);
    const result = await testGetBranches();
    await refreshLogs();
    if (result.error) showToast(result.error, "err");
    else showToast("get-branches response logged");
  }

  async function handleSelect(e) {
    selected = e.detail;
    if (mode === "diff") await fetchFiles();
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
    mode = newMode;
    selected = new Set();
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
      const [res, exRes] = await Promise.all([getStatus(), getExcludes()]);
      loading = false;
      if (res.error) showToast(res.error, "err");
      else {
          statusFiles = res.files || [];
          unpushedCommits = res.unpushed || [];
      }

      if (exRes.error) showToast(exRes.error, "err");
      else excludePatterns = exRes.excludes || [];
      if (statusFiles.length > 0 && !selectedWorkingFile) {
          const first = statusFiles.find(f => f.staged) || statusFiles[0];
          handleWorkingFileSelect({ detail: { path: first.path, staged: first.staged } });
      }
      await refreshLogs();
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
  function stopResizing() { isResizing = false; }
  function handleMouseMove(e) {
      if (!isResizing) return;
      if (resizingType === 'width') {
          sidebarWidth = Math.max(200, Math.min(600, e.clientX));
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

<div class="project-view" on:mousemove={handleMouseMove} on:mouseup={stopResizing}>
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
                        excludes={excludePatterns}

                        selectedFile={selectedWorkingFile}
                        collapsed={collapsedSections}
                        bind:commitMessage={commitMessage}
                        {loading}
                        on:select={handleWorkingFileSelect}
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

                        <div class="h-resizer" on:mousedown={() => startResizing('diffHeight')}></div>
                        <div class="diff-sidebar-sec" style="height: {100 - diffSplitH}%">
                            <div class="sec-header">Changed Files ({changedFiles.length})</div>
                            <div class="sec-body">
                                <FileList files={changedFiles} {selectedFile} on:select={handleFileSelect} on:reverse-file={handleReverseFile}/>
                            </div>
                        </div>
                    </div>
                {/if}
                <div class="resizer" on:mousedown={() => startResizing('width')}></div>
            </div>

            <div class="commit-content">

                <div class="commit-main-area">
                    <div class="commit-diff-section">
                        <div class="diff-header">
                            <h3>File Diff: <span class="file-path">{(mode === 'commit' ? selectedWorkingFile?.path : selectedFile) || 'None selected'}</span></h3>
                            <div class="diff-header-actions">
                                {#if (mode === 'commit' && selectedWorkingFile) || (mode === 'diff' && selectedFile)}
                                    <button 
                                        class="btn btn-ghost btn-sm discard-file-btn" 
                                        on:click={() => mode === 'commit' ? handleToggleStage({ detail: { action: 'unstage', path: selectedWorkingFile.path } }) : handleReverseFile({ detail: selectedFile })}
                                        title="Discard all changes in this file"
                                    >
                                        🗑 Discard File
                                    </button>
                                {/if}
                                {#if diffLoading}<span class="loading-label">Loading...</span>{/if}
                            </div>
                        </div>

                        <div class="diff-wrapper">
                            <DiffPanel diff={currentDiff} on:reverse-patch={handleReversePatch}/>
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
</div>

<style>
  .project-view { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; }
  .layout { display: flex; align-items: flex-start; height: 100%; }
  .main-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px; height: 100%; padding: 0 20px; }
  .commit-mode-layout { display: flex; flex: 1; height: 100%; min-width: 0; background: var(--surface); border: 1px solid var(--bdr); border-radius: 8px; overflow: hidden; }
  .commit-sidebar { width: var(--sidebar-w); height: 100%; position: relative; flex-shrink: 0; }
  .resizer { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; cursor: col-resize; z-index: 10; }
  .resizer:hover { background: var(--acc); }
  .commit-content { flex: 1; min-width: 0; display: flex; flex-direction: column; height: 100%; padding: 20px; gap: 20px; background: var(--bg); }
  .commit-main-area { flex: 1; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
  .commit-diff-section { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; min-height: 0; }

  .diff-sidebar-content {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--surface);
  }

  .diff-sidebar-sec {
      display: flex;
      flex-direction: column;
      min-height: 0;
  }

  .sec-header {
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--tx-d);
      background: var(--surface-h);
      border-bottom: 1px solid var(--bdr);
      flex-shrink: 0;
  }

  .sec-body {
      flex: 1;
      overflow-y: auto;
      background: var(--surface);
  }

  .h-resizer {
      height: 4px;
      background: var(--bdr);
      cursor: row-resize;
      flex-shrink: 0;
      transition: background 0.2s;
  }
  .h-resizer:hover { background: var(--acc); }
  .mode-switcher { display: flex; gap: 1px; background: var(--bdr); padding: 2px; border-radius: 8px; width: fit-content; margin-bottom: 20px; }
  .mode-switcher button { background: transparent; border: none; padding: 6px 16px; font-size: 11px; font-weight: 600; color: var(--tx-d); cursor: pointer; border-radius: 6px; }
  .mode-switcher button.active { background: var(--surface); color: var(--tx-b); }
  .top-section { display: flex; gap: 20px; height: calc(100vh - 120px); }
  .top-section.compare-layout { height: 300px; }

  .commit-section, .file-section { flex: 1; min-width: 0; overflow-y: auto; }
  .bottom-diff-section { flex: 1; display: flex; flex-direction: column; gap: 12px; height: 600px; }
  .diff-header h3 { font-size: 13px; color: var(--tx-d); margin: 0; }
  .diff-header-actions { display: flex; align-items: center; gap: 12px; }
  .discard-file-btn { color: var(--red); opacity: 0.7; }
  .discard-file-btn:hover { opacity: 1; background: rgba(248, 81, 73, 0.1); }
  .file-path { color: var(--acc); font-family: 'JetBrains Mono', monospace; }

  .diff-wrapper { flex: 1; min-height: 0; }
  .empty-view { text-align: center; padding: 40px; color: var(--tx-d); }
</style>
