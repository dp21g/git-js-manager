<script>
  import { createEventDispatcher } from "svelte";
  import { shortPath } from "./path.js";

  export let tabs = [];
  export let activeTabId = null;
  export let activeTab = null;
  export let activeInfo = null;
  export let baseBranch = "";
  export let wide = false;

  const dispatch = createEventDispatcher();

  function selectTab(id) {
    dispatch("select", { id });
  }

  function closeTab(event, id) {
    event.stopPropagation();
    dispatch("close", { id });
  }

  function changeBase(event) {
    dispatch("change-base", { value: event.currentTarget.value });
  }
</script>

<div class="repo-drawer" class:wide>
  <div class="drawer-header">
    <div class="drawer-heading">
      <div class="drawer-title">
        <div class="eyebrow">Workspace</div>
        <h2>Repositories</h2>
      </div>

      {#if wide}
        <button class="drawer-visibility-btn" on:click={() => dispatch("toggle-visibility")} title="Hide repository drawer">
          ⇤
        </button>
      {/if}
    </div>

    <button class="add-repo" on:click={() => dispatch("add")} title="Open another repository">
      + Add Repo
    </button>
  </div>

  <div class="drawer-body">
    <section class="active-panel">
      <div class="panel-header">
        <div>
          <div class="panel-eyebrow">Active Repo</div>
          <div class="panel-title">
            {#if activeInfo}
              {activeInfo.path.split(/[\\/]/).pop()}
            {:else}
              {activeTab?.repoPath ? activeTab.name : "No Repo Selected"}
            {/if}
          </div>
        </div>

        <button class="change-repo-btn" on:click={() => dispatch("pick-repo")}>
          {activeTab?.repoPath ? "Change" : "Select"}
        </button>
      </div>

      <div class="active-path">
        {#if activeInfo}
          {shortPath(activeInfo.path)}
        {:else if activeTab?.repoPath}
          {shortPath(activeTab.repoPath)}
        {:else}
          Pick a local repository for this tab.
        {/if}
      </div>

      {#if activeInfo}
        <div class="repo-controls">
          <div class="control-card">
            <div class="control-label">Source Branch</div>
            <div class="control-value">{activeInfo.branch}</div>
          </div>

          <label class="control-card select-card">
            <span class="control-label">Base Branch</span>
            <select class="branch-select" value={baseBranch} on:change={changeBase}>
              {#each activeInfo.branches as branch}
                <option value={branch}>{branch}</option>
              {/each}
            </select>
          </label>
        </div>
      {/if}
    </section>

    <div class="drawer-list">
      {#if tabs.length === 0}
        <div class="drawer-empty">No repos yet. Add one to get started.</div>
      {:else}
        {#each tabs as tab (tab.id)}
          <div class="repo-item" class:active={tab.id === activeTabId}>
            <button class="repo-button" on:click={() => selectTab(tab.id)} title={tab.repoPath || "Select a repository"}>
              <div class="repo-topline">
                <span class="repo-marker">{tab.id === activeTabId ? "Current" : tab.repoPath ? "Repo" : "New"}</span>
                <span class="repo-name">{tab.repoPath ? tab.name : "Select Repo"}</span>
              </div>
              <div class="repo-path">{tab.repoPath ? shortPath(tab.repoPath) : "Choose a local repository for this tab"}</div>
            </button>

            {#if tabs.length > 1}
              <button class="close-button" on:click={(event) => closeTab(event, tab.id)} title="Close repo tab">
                ×
              </button>
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
    background: linear-gradient(180deg, var(--surface-h), var(--surface));
    color: var(--tx-b);
  }

  .repo-drawer.wide {
    border-right: 1px solid var(--bdr);
  }

  .drawer-header {
    padding: 18px 18px 14px;
    border-bottom: 1px solid var(--bdr);
    display: flex;
    flex-direction: column;
    gap: 14px;
    background:
      radial-gradient(circle at top left, rgba(88, 166, 255, 0.14), transparent 42%),
      linear-gradient(180deg, var(--surface), var(--surface-h));
  }

  .drawer-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .drawer-title h2 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .eyebrow,
  .panel-eyebrow,
  .control-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tx-d);
  }

  .drawer-visibility-btn {
    width: 34px;
    height: 34px;
    border: 1px solid var(--bdr);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--tx-b);
    font-size: 16px;
    transition: all 0.2s ease;
  }

  .drawer-visibility-btn:hover {
    background: rgba(88, 166, 255, 0.12);
    border-color: rgba(88, 166, 255, 0.28);
    color: var(--acc);
  }

  .add-repo,
  .change-repo-btn {
    border: 1px solid rgba(88, 166, 255, 0.24);
    background: rgba(88, 166, 255, 0.12);
    color: var(--acc);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 700;
    text-align: left;
    transition: all 0.2s ease;
  }

  .add-repo:hover,
  .change-repo-btn:hover {
    background: rgba(88, 166, 255, 0.2);
    border-color: rgba(88, 166, 255, 0.38);
    color: #fff;
  }

  .change-repo-btn {
    padding: 7px 10px;
    font-size: 11px;
    flex-shrink: 0;
  }

  .drawer-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
  }

  .active-panel {
    border: 1px solid rgba(88, 166, 255, 0.16);
    border-radius: 16px;
    padding: 14px;
    background:
      linear-gradient(135deg, rgba(88, 166, 255, 0.1), rgba(88, 166, 255, 0.02)),
      var(--surface-h);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .panel-title {
    margin-top: 4px;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    word-break: break-word;
  }

  .active-path {
    font-size: 11px;
    color: var(--tx-d);
    line-height: 1.45;
    word-break: break-word;
  }

  .repo-controls {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .control-card {
    border: 1px solid var(--bdr);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.12);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .control-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--tx-b);
    word-break: break-word;
  }

  .branch-select {
    width: 100%;
    border: 1px solid var(--bdr);
    border-radius: 10px;
    background: var(--surface);
    color: var(--grn);
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 700;
    outline: none;
  }

  .branch-select:focus {
    border-color: var(--acc);
  }

  .drawer-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .drawer-empty {
    border: 1px dashed var(--bdr);
    border-radius: 14px;
    padding: 18px;
    color: var(--tx-d);
    font-size: 12px;
    line-height: 1.5;
    background: var(--surface-h);
  }

  .repo-item {
    position: relative;
    border-radius: 14px;
    border: 1px solid transparent;
    transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
  }

  .repo-item:hover {
    border-color: rgba(88, 166, 255, 0.16);
    background: var(--surface-h);
    transform: translateX(2px);
  }

  .repo-item.active {
    border-color: rgba(88, 166, 255, 0.3);
    background:
      linear-gradient(135deg, rgba(88, 166, 255, 0.14), rgba(88, 166, 255, 0.04)),
      var(--surface-h);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .repo-button {
    width: 100%;
    border: none;
    background: transparent;
    color: inherit;
    padding: 14px 48px 14px 14px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .repo-topline {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .repo-marker {
    flex-shrink: 0;
    border-radius: 999px;
    border: 1px solid rgba(88, 166, 255, 0.22);
    background: rgba(88, 166, 255, 0.12);
    color: var(--acc);
    padding: 3px 8px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .repo-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 700;
  }

  .repo-path {
    font-size: 11px;
    color: var(--tx-d);
    line-height: 1.4;
    word-break: break-word;
  }

  .close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--tx-d);
    font-size: 16px;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
  }

  .repo-item:hover .close-button,
  .repo-item.active .close-button {
    opacity: 1;
  }

  .close-button:hover {
    background: rgba(248, 81, 73, 0.12);
    color: var(--red);
  }
</style>
