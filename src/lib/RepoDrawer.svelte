<script>
  import { createEventDispatcher } from "svelte";
  import { fade } from "svelte/transition";
  import { shortPath } from "./path.js";
  import Tooltip from "./Tooltip.svelte";

  export let tabs = [];
  export let tabStates = {};
  export let repoSummaries = {};
  export let repoSummaryLoads = {};
  export let activeTabId = null;
  export let activeTab = null;
  export let activeInfo = null;
  export let baseBranch = "";
  export let repoDrawerState = {};
  export let wide = false;
  export let glowingRepos = new Set();

  const dispatch = createEventDispatcher();

  const LOAD_KEY_REMOTES = "::with-remotes";
  const LOAD_KEY_LOCAL = "::local";

  const statusText = (branch) => {
    if (!branch) return "";
    if (!branch.hasUpstream) return "no upstream";
    if (!branch.ahead && !branch.behind) return "in sync";
    if (branch.ahead && branch.behind) return `${branch.ahead}↑ ${branch.behind}↓`;
    if (branch.ahead) return `${branch.ahead}↑`;
    return `${branch.behind}↓`;
  };

  function summaryFor(tab) {
    const cached = repoSummaries?.[tab.repoPath] || null;
    const live = tabStates[tab.id]?.info || (tab.id === activeTabId ? activeInfo : null);
    if (!cached && !live) return null;
    const remotesLoaded =
      live?.remoteBranchesLoaded === true || cached?.remoteBranchesLoaded === true;
    const remoteBranches =
      live?.remoteBranchesLoaded === true ? live.remoteBranches || [] : cached?.remoteBranches || [];
    return {
      ...(cached || {}),
      ...(live || {}),
      remoteBranches,
      remoteBranchesLoaded: remotesLoaded
    };
  }

  function resolveRemoteBranch(branch, summary) {
    const statuses = summary?.branchStatuses || [];
    const tracked = statuses.find((lb) => lb.upstream === branch.name);
    const localName =
      tracked?.name ||
      branch.localName ||
      (statuses.some((lb) => lb.name === branch.shortName) ? branch.shortName : "");
    return { ...branch, localExists: Boolean(localName), localName };
  }

  function pullableRemotes(summary) {
    return (summary?.remoteBranches || [])
      .map((b) => resolveRemoteBranch(b, summary))
      .filter((b) => !b.localExists);
  }

  function onBranchContextMenu(e, tab, branchName, branchStatus) {
    e.preventDefault();
    dispatch("ctx-open", {
      x: e.clientX,
      y: e.clientY,
      tabId: tab.id,
      repoPath: tab.repoPath,
      branch: branchName,
      isCurrent: branchName === (summaryFor(tab)?.branch || ""),
      branchStatus
    });
  }

  $: activeSummary =
    tabStates[activeTabId]?.info ||
    activeInfo ||
    (activeTab?.repoPath ? repoSummaries?.[activeTab.repoPath] || null : null);
  $: currentPath = activeSummary?.path || activeTab?.repoPath || "";
  $: currentRepoName = currentPath.split(/[\\/]/).pop() || activeTab?.name || "No repo selected";
  $: currentBranch = activeSummary?.branch || "";

  $: displayRows = tabs.map(tab => {
    const dState = repoDrawerState?.[tab.id] || repoDrawerState?.[tab.repoPath] || {};
    return {
      ...tab,
      dState,
      expanded: typeof dState.expanded === "boolean" ? dState.expanded : tab.id === activeTabId,
      localExpanded: typeof dState.localExpanded === "boolean" ? dState.localExpanded : true,
      remoteExpanded: Boolean(dState.remoteExpanded),
      sum: summaryFor(tab),
      isGlowing: tab.repoPath && glowingRepos.has(tab.repoPath),
    };
  });
</script>

<div class="repo-drawer" class:wide>
  <div class="drawer-header">
    <div class="current-context">
      <div class="current-row">
        <span class="context-icon" aria-hidden="true">📁</span>
        <Tooltip text={currentRepoName}>
          <span class="current-repo-name">{currentRepoName}</span>
        </Tooltip>
      </div>
      {#if currentBranch}
        <div class="current-branch-row">
          <span class="context-icon branch" aria-hidden="true"></span>
          <Tooltip text={currentBranch}>
            <span class="current-branch-name">{currentBranch}</span>
          </Tooltip>
        </div>
      {/if}
      <Tooltip text={currentPath || ""}>
        <div class="active-path">
          {currentPath ? shortPath(currentPath) : "Pick a local repository for this tab."}
        </div>
      </Tooltip>
    </div>

    <div class="drawer-actions">
      <button
        class="change-branch-btn"
        on:click={() => (activeTab?.repoPath ? dispatch("change-branch", { id: activeTabId, branch: "" }) : dispatch("pick-repo"))}
      >
        {activeTab?.repoPath ? "Change Branch" : "Select Repo"}
      </button>
      <button class="add-repo" on:click={() => dispatch("add")} title="Open another repository">
        + Add Repo
      </button>
    </div>

    {#if activeSummary}
      <label class="base-branch-control">
        <span class="control-label">Base Branch</span>
        <select class="branch-select" value={baseBranch} on:change={(e) => dispatch("change-base", { value: e.currentTarget.value })}>
          {#each activeSummary.branches || [] as branch}
            <option value={branch}>{branch}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  <div class="drawer-body">
    <div class="drawer-list">
      {#if tabs.length === 0}
        <div class="drawer-empty">No repos yet. Add one to get started.</div>
      {:else}
        {#each displayRows as tab (tab.id)}
          {@const dState = tab.dState}
          {@const expanded = tab.expanded}
          {@const localExpanded = tab.localExpanded}
          {@const remoteExpanded = tab.remoteExpanded}
          {@const sum = tab.sum}
          {@const isGlowing = tab.isGlowing}
          {@const activeBranchStatus = sum?.branchStatuses?.find((b) => b.name === sum?.branch)}
          {@const pullable = pullableRemotes(sum)}
          {@const loadingKeyLocal = tab.repoPath ? `${tab.repoPath}${LOAD_KEY_LOCAL}` : ""}
          {@const loadingKeyRemote = tab.repoPath ? `${tab.repoPath}${LOAD_KEY_REMOTES}` : ""}
          {@const loadingLocal = loadingKeyLocal && !!repoSummaryLoads?.[loadingKeyLocal]}
          {@const loadingRemote = loadingKeyRemote && !!repoSummaryLoads?.[loadingKeyRemote]}
          {@const loadingRemoteData = loadingRemote && !sum?.remoteBranchesLoaded}
          {@const firstLoadLocal = !sum && loadingLocal}

          <div class="repo-item" class:active={tab.id === activeTabId} class:expanded={expanded} class:glow={isGlowing}>
            <div class="repo-row">
              <button
                type="button"
                class="expando-btn"
                on:click={() => dispatch("toggle-repo", {
                  id: tab.id,
                  path: tab.repoPath,
                  stateKey: tab.id,
                  expanded: !expanded
                })}
                aria-label={expanded ? "Collapse repository" : "Expand repository"}
              >
                {expanded ? "▾" : "▸"}
              </button>

              <button
                type="button"
                class="repo-button"
                on:click={() => {
                  dispatch("select", { id: tab.id });
                  if (!tab?.repoPath) return;
                  if (tab.id !== activeTabId) {
                    if (!expanded) {
                      dispatch("toggle-repo", {
                        id: tab.id,
                        path: tab.repoPath,
                        stateKey: tab.id,
                        expanded: true
                      });
                    }
                    return;
                  }
                  dispatch("toggle-repo", {
                    id: tab.id,
                    path: tab.repoPath,
                    stateKey: tab.id,
                    expanded: !expanded
                  });
                }}
                on:dblclick={() => (tab.repoPath ? dispatch("change-branch", { id: tab.id, branch: "" }) : dispatch("pick-repo"))}
                title={tab.repoPath ? "Click to select and toggle. Double-click to switch branch." : "Select a repository"}
              >
                <div class="repo-line">
                  <span class="repo-icon">📁</span>
                  <span class="repo-name">{tab.repoPath ? tab.name : "Select Repo"}</span>
                </div>
                <div class="repo-secondary">
                  {#if tab.repoPath}
                    <span class="repo-branch">{sum?.branch || "…"}</span>
                    <span class="repo-meta">
                      {#if activeBranchStatus}{statusText(activeBranchStatus)}{:else}{shortPath(tab.repoPath)}{/if}
                    </span>
                  {:else}
                    <span class="repo-placeholder">Choose a local repository</span>
                  {/if}
                </div>
              </button>

              {#if tabs.length > 1}
                <button type="button" class="close-btn" on:click|stopPropagation={() => dispatch("close", { id: tab.id })} title="Close repo tab">×</button>
              {/if}
            </div>

            {#if expanded && tab.repoPath}
              <div class="repo-details">
                <div class="branch-group">
                  <button
                    type="button"
                    class="branch-group-toggle"
                    on:click={() => dispatch("toggle-local-branches", {
                      id: tab.id,
                      path: tab.repoPath,
                      stateKey: tab.id,
                      localExpanded: !localExpanded
                    })}
                    aria-expanded={localExpanded}
                  >
                    <span class="bg-chevron">{localExpanded ? "▾" : "▸"}</span>
                    <span class="bg-label">Local Branches</span>
                    <span class="bg-count">{sum ? (sum?.branchStatuses?.length ?? 0) : "…"}</span>
                    {#if firstLoadLocal}
                      <span class="spin" title="Loading local branches…"></span>
                    {/if}
                  </button>
                  {#if localExpanded}
                    <div class="branch-list">
                      {#if sum?.branchStatuses?.length}
                        {#each sum.branchStatuses as branch (branch.name)}
                          <button
                            type="button"
                            class="branch-row"
                            class:current={branch.name === sum.branch}
                            on:dblclick={() => { if (branch.name !== sum.branch) dispatch("switch-local-branch", { id: tab.id, branch: branch.name }); }}
                            on:contextmenu={(e) => onBranchContextMenu(e, tab, branch.name, branch)}
                            title={branch.name === sum.branch ? "Current branch. Right-click for options." : `Double-click to switch to ${branch.name}. Right-click for options.`}
                            transition:fade|local={{ duration: 800 }}
                          >
                            <Tooltip text={branch.name}>
                              <span class="b-name"> {branch.name}</span>
                            </Tooltip>
                            <span class="b-meta">{statusText(branch)}</span>
                          </button>
                        {/each}
                      {:else if firstLoadLocal}
                        <div class="branch-empty">
                          <span class="spin" style="display:inline-block;vertical-align:middle"></span>
                          Loading local branches…
                        </div>
                      {:else}
                        <div class="branch-empty">No local branches found.</div>
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="branch-group">
                  <button
                    type="button"
                    class="branch-group-toggle"
                    on:click={() => dispatch("toggle-remotes", {
                      id: tab.id,
                      path: tab.repoPath,
                      stateKey: tab.id,
                      remoteExpanded: !remoteExpanded
                    })}
                    aria-expanded={remoteExpanded}
                  >
                    <span class="bg-chevron">{remoteExpanded ? "▾" : "▸"}</span>
                    <span class="bg-label">Remote Branches</span>
                    <span class="bg-count">{sum?.remoteBranchesLoaded && pullable ? pullable.length : "…"}</span>
                    {#if loadingRemoteData}
                      <span class="spin" title="Loading remote branches…"></span>
                    {/if}
                  </button>
                  {#if remoteExpanded}
                    <div class="branch-list">
                      {#if loadingRemoteData || !sum?.remoteBranchesLoaded}
                        <div class="branch-empty">
                          <span class="spin" style="display:inline-block;vertical-align:middle"></span>
                          Loading remote branches…
                        </div>
                      {:else if pullable.length}
                        {#each pullable as branch}
                          <button
                            type="button"
                            class="branch-row remote"
                            on:dblclick={() => dispatch("switch-remote-branch", { id: tab.id, branch: branch.name })}
                            title={`Double-click to create local tracking branch from ${branch.name}`}
                          >
                            <span class="b-name">↓ {branch.shortName}</span>
                            <span class="b-meta">{branch.name}</span>
                          </button>
                        {/each}
                      {:else}
                        <div class="branch-empty">No remote-only branches to pull.</div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .repo-drawer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--sidebar-bg);
    color: var(--tx-b);
  }

  .spin {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid transparent;
    border-top-color: var(--tx-d);
    border-radius: 50%;
    animation: drawer-spin 0.7s linear infinite;
    margin-left: auto;
    flex-shrink: 0;
  }

  @keyframes drawer-spin {
    to { transform: rotate(360deg); }
  }

  .drawer-header {
    padding: 10px 12px;
    border-bottom: 1px solid var(--bdr);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--sidebar-bg);
    flex-shrink: 0;
  }

  .current-context {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .current-row,
  .current-branch-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .context-icon {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--tx-d);
  }

  .context-icon.branch {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .current-repo-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .current-branch-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--acc);
    font-family: var(--font-mono);
  }

  .active-path {
    font-size: 10px;
    color: var(--tx-d);
    line-height: 1.3;
    word-break: break-word;
  }

  .drawer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .change-branch-btn,
  .add-repo {
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--input-border);
    padding: 0 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .change-branch-btn {
    background: var(--panel-section-bg);
    color: var(--tx-b);
  }

  .change-branch-btn:hover {
    background: var(--list-hover);
    border-color: var(--bdr);
  }

  .add-repo {
    background: var(--acc);
    border-color: var(--acc);
    color: var(--accent-contrast);
  }

  .add-repo:hover {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
  }

  .base-branch-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .control-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tx-d);
  }

  .branch-select {
    width: 100%;
    height: 28px;
    border-radius: var(--radius-sm);
    background: var(--input-bg);
    color: var(--tx-b);
    padding: 0 8px;
    font-size: 12px;
    outline: none;
  }

  .branch-select:focus {
    border-color: var(--acc);
  }

  .drawer-body {
    flex: 1;
    min-height: 0;
    padding: 6px 6px 6px 8px;
    display: flex;
    flex-direction: column;
  }

  .drawer-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .drawer-empty {
    border: 1px dashed var(--bdr);
    padding: 12px;
    color: var(--tx-d);
    font-size: 11px;
    line-height: 1.4;
    background: var(--panel-section-bg);
  }

  .repo-item {
    border-left: 2px solid transparent;
  }

  .repo-item.glow {
    animation: drawer-glow 2s ease-out;
  }

  @keyframes drawer-glow {
    0% { box-shadow: inset 0 0 0 rgba(78, 161, 255, 0); background: inherit; }
    15% { box-shadow: inset 0 0 24px rgba(78, 161, 255, 0.2); background: rgba(78, 161, 255, 0.08); }
    100% { box-shadow: inset 0 0 0 rgba(78, 161, 255, 0); background: inherit; }
  }

  .repo-item:hover {
    background: var(--list-hover);
  }

  .repo-item.active {
    background: var(--list-active);
    border-left-color: var(--acc);
  }

  .repo-item.expanded {
    background: var(--panel-section-bg);
  }

  .repo-item.active.expanded {
    background: var(--list-active);
  }

  .repo-row {
    display: flex;
    align-items: stretch;
    position: relative;
    min-height: 36px;
  }

  .expando-btn {
    width: 20px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--tx-d);
    font-size: 11px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expando-btn:hover {
    color: var(--tx-b);
  }

  .repo-button {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: inherit;
    padding: 4px 24px 4px 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
    justify-content: center;
  }

  .repo-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .repo-icon {
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.8;
  }

  .repo-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
  }

  .repo-secondary {
    padding-left: 17px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .repo-branch {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--tx-b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .repo-meta,
  .repo-placeholder {
    font-size: 9px;
    color: var(--tx-d);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .repo-item.active .repo-branch {
    color: var(--acc-soft-fg);
  }

  .close-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tx-d);
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.12s ease, background 0.12s ease;
  }

  .repo-item:hover .close-btn,
  .repo-item.active .close-btn {
    opacity: 1;
  }

  .close-btn:hover {
    background: var(--danger-bg);
    color: var(--red);
  }

  .repo-details {
    padding: 0 6px 6px 22px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .branch-group {
    display: flex;
    flex-direction: column;
  }

  .branch-group-toggle {
    width: 100%;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tx-d);
    padding: 3px 6px;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.12s ease, color 0.12s ease;
    min-height: 22px;
  }

  .branch-group-toggle:hover {
    background: var(--list-hover);
    color: var(--tx-b);
  }

  .bg-chevron {
    width: 14px;
    flex-shrink: 0;
    font-size: 10px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bg-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .bg-count {
    flex-shrink: 0;
    font-size: 10px;
    font-family: var(--font-mono);
    min-width: 12px;
    text-align: right;
  }

  .branch-list {
    display: flex;
    flex-direction: column;
    padding-left: 6px;
  }

  .branch-row {
    width: 100%;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tx-b);
    padding: 3px 6px;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: background 0.12s ease;
    min-height: 22px;
    cursor: default;
  }

  .branch-row:hover {
    background: var(--list-hover);
  }

  .branch-row.current {
    background: var(--acc-bg);
    color: var(--acc-soft-fg);
  }

  .branch-row.remote {
    color: var(--tx-b);
  }

  .b-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-family: var(--font-mono);
  }

  .b-meta {
    flex-shrink: 0;
    font-size: 9px;
    color: var(--tx-d);
    font-family: var(--font-mono);
  }

  .branch-empty {
    font-size: 10px;
    color: var(--tx-d);
    padding: 3px 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
