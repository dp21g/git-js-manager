<script>
  import { onMount } from "svelte";
  import { getFolderConfig, updateSettings, updateTabs, setActiveRepo } from "./lib/api.js";
  import Toast from "./lib/Toast.svelte";
  import ProjectView from "./lib/ProjectView.svelte";
  import SettingsPanel from "./lib/SettingsPanel.svelte";
  import ConfirmModal from "./lib/ConfirmModal.svelte";
  import RepoDrawer from "./lib/RepoDrawer.svelte";

  const WIDE_DRAWER_BREAKPOINT = 1180;

  let tabs = []; // { id, repoPath, name, active }
  let activeTabId = null;
  let folderConfig = { recentDirs: [], favouriteDirs: [], settings: { theme: "dark" } };
  let loading = true;
  let isSettingsOpen = false;
  let isUndoModalOpen = false;
  let tabStates = {}; // tabId -> state
  let projectViews = {}; // tabId -> instance
  let isWideLayout = false;
  let isDrawerOpen = false;
  let isWideDrawerVisible = true;

  $: activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null;
  $: activeState = tabStates[activeTabId] || { view: "picker", mode: "squash" };
  $: activeProject = projectViews[activeTabId];
  $: collapsedRepoName =
    activeState.info?.path?.split(/[\\/]/).pop() ||
    activeTab?.name ||
    "No repo selected";
  $: collapsedBranchName = activeState.info?.branch || "";
  $: theme = folderConfig.settings?.theme || "dark";

  $: if (typeof document !== "undefined") {
    document.body.className = theme === "light" ? "light-mode" : "";
  }

  $: if (isWideLayout) {
    isDrawerOpen = false;
  }

  onMount(() => {
    let cancelled = false;

    function syncLayout() {
      if (typeof window === "undefined") return;
      isWideLayout = window.innerWidth >= WIDE_DRAWER_BREAKPOINT;
    }

    syncLayout();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", syncLayout);
    }

    (async () => {
      const data = await getFolderConfig();
      if (cancelled) return;

      if (!data.error) {
        folderConfig = {
          recentDirs: [],
          favouriteDirs: [],
          settings: { theme: "dark" },
          ...data
        };
        isWideDrawerVisible = data.settings?.wideDrawerVisible ?? true;

        if (data.tabs && data.tabs.length > 0) {
          tabs = data.tabs;
          const active = tabs.find((tab) => tab.active) || tabs[0];
          activeTabId = active?.id || null;
          if (active?.repoPath) setActiveRepo(active.repoPath);
        } else {
          addTab();
        }
      } else {
        addTab();
      }

      loading = false;
    })();

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", syncLayout);
      }
    };
  });

  function handleStatusUpdate(e) {
    const { tabId, state } = e.detail;
    tabStates[tabId] = state;
    tabStates = { ...tabStates };
  }

  function toggleDrawer() {
    if (isWideLayout) {
      setWideDrawerVisible(!isWideDrawerVisible);
      return;
    }
    isDrawerOpen = !isDrawerOpen;
  }

  function closeDrawer() {
    if (!isWideLayout) isDrawerOpen = false;
  }

  async function setWideDrawerVisible(visible) {
    isWideDrawerVisible = visible;
    folderConfig = {
      ...folderConfig,
      settings: { ...(folderConfig.settings || {}), wideDrawerVisible: visible }
    };
    await updateSettings({ wideDrawerVisible: visible });
  }

  function addTab() {
    const id = "tab-" + Math.random().toString(36).slice(2, 11);
    const newTab = { id, repoPath: "", name: "New Tab", active: true };
    tabs = tabs.map((tab) => ({ ...tab, active: false }));
    tabs = [...tabs, newTab];
    activeTabId = id;
    closeDrawer();
    persistTabs();
  }

  function selectTab(id) {
    activeTabId = id;
    tabs = tabs.map((tab) => ({ ...tab, active: tab.id === id }));
    const active = tabs.find((tab) => tab.id === id);
    if (active?.repoPath) setActiveRepo(active.repoPath);
    closeDrawer();
    persistTabs();
  }

  function closeTab(id) {
    if (tabs.length === 1) return;
    if (!confirm("Close this tab?")) return;

    const index = tabs.findIndex((tab) => tab.id === id);
    const remainingTabs = tabs.filter((tab) => tab.id !== id);
    const nextActiveId = activeTabId === id ? remainingTabs[Math.max(0, index - 1)]?.id : activeTabId;

    tabs = remainingTabs.map((tab) => ({ ...tab, active: tab.id === nextActiveId }));
    activeTabId = nextActiveId;

    const active = tabs.find((tab) => tab.id === nextActiveId);
    if (active?.repoPath) setActiveRepo(active.repoPath);

    closeDrawer();
    persistTabs();
  }

  function handleDrawerSelect(e) {
    selectTab(e.detail.id);
  }

  function handleDrawerClose(e) {
    closeTab(e.detail.id);
  }

  function handleDrawerBaseChange(e) {
    activeProject?.setBase(e.detail.value);
  }

  function handleDrawerPickRepo() {
    activeProject?.pickRepo();
    closeDrawer();
  }

  function handleRepoSelected(e) {
    const { tabId, path } = e.detail;
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;

    tab.repoPath = path;
    tab.name = path.split(/[\\/]/).pop() || path;
    tabs = [...tabs];

    if (tabId === activeTabId) setActiveRepo(path);
    persistTabs();
  }

  async function persistTabs() {
    await updateTabs(tabs);
  }

  async function refreshConfig() {
    const data = await getFolderConfig();
    if (!data.error) folderConfig = data;
  }
</script>

<div class="app-container" class:light-mode={theme === "light"}>
  <div class="app-shell">
    {#if isWideLayout && isWideDrawerVisible}
      <aside class="drawer-shell">
        <RepoDrawer
          tabs={tabs}
          {activeTabId}
          {activeTab}
          activeInfo={activeState.info}
          baseBranch={activeState.baseBranch}
          wide={true}
          on:select={handleDrawerSelect}
          on:close={handleDrawerClose}
          on:pick-repo={handleDrawerPickRepo}
          on:change-base={handleDrawerBaseChange}
          on:toggle-visibility={toggleDrawer}
          on:add={addTab}
        />
      </aside>
    {/if}

    <div class="workspace-shell">
      <div class="tab-bar">
        <div class="tab-bar-left">
          <button
            class="drawer-toggle"
            class:open={isWideLayout ? isWideDrawerVisible : isDrawerOpen}
            on:click={toggleDrawer}
            title={
              isWideLayout
                ? (isWideDrawerVisible ? "Hide repository drawer" : "Show repository drawer")
                : (isDrawerOpen ? "Close repository drawer" : "Open repository drawer")
            }
          >
            ☰
          </button>

          {#if isWideLayout && !isWideDrawerVisible && (collapsedRepoName || collapsedBranchName)}
            <div
              class="collapsed-meta"
              title={
                `Repo: ${collapsedRepoName}` +
                (collapsedBranchName ? `\nBranch: ${collapsedBranchName}` : "")
              }
            >
              <div class="collapsed-meta-row repo">
                <span class="collapsed-meta-icon" aria-hidden="true">📁</span>
                <span class="collapsed-repo-name">{collapsedRepoName}</span>
              </div>

              {#if collapsedBranchName}
                <div class="collapsed-meta-row branch">
                  <span class="collapsed-meta-icon" aria-hidden="true">🌿</span>
                  <span class="collapsed-branch-name">{collapsedBranchName}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="tab-bar-center" class:visible={activeState.view === "main"}>
          <div class="view-switcher">
            <button class:active={activeState.mode === "squash"} on:click={() => activeProject?.changeMode("squash")}>🥞 Squash</button>
            <button class:active={activeState.mode === "diff"} on:click={() => activeProject?.changeMode("diff")}>🔍 Diff</button>
            <button class:active={activeState.mode === "compare"} on:click={() => activeProject?.changeMode("compare")}>⚖️ Compare</button>
            <button class:active={activeState.mode === "commit"} on:click={() => activeProject?.changeMode("commit")}>
              💾 Commit
              {#if activeState.unstagedCount > 0}
                <span class="unstaged-badge" title="{activeState.unstagedCount} unstaged files">{activeState.unstagedCount}</span>
              {/if}
              {#if activeState.unpushedCount > 0}
                <span class="unpushed-badge" title="{activeState.unpushedCount} local commits">{activeState.unpushedCount}</span>
              {/if}
            </button>
            <button class:active={activeState.mode === "logs"} on:click={() => activeProject?.changeMode("logs")}>
              🧾 Logs
              {#if activeState.logsCount > 0}
                <span class="logs-badge" title="{activeState.logsCount} log entries">{activeState.logsCount}</span>
              {/if}
            </button>
          </div>
        </div>

        <div class="tab-bar-right">
          {#if activeState.view === "main"}
            <button class="icon-action" on:click={() => activeProject?.runRefresh()} title="Refresh">↻</button>
          {/if}
          <button class="settings-btn" on:click={() => isSettingsOpen = true} title="Settings">
            ⚙️
          </button>
        </div>
      </div>

      <div class="tab-content">
        {#if loading}
          <div class="app-loading">Initializing Workspace...</div>
        {:else}
          {#each tabs as tab (tab.id)}
            <div class="tab-pane" class:hidden={activeTabId !== tab.id}>
              <ProjectView
                bind:this={projectViews[tab.id]}
                tabId={tab.id}
                repoPath={tab.repoPath}
                {folderConfig}
                on:repo-selected={handleRepoSelected}
                on:config-changed={refreshConfig}
                on:status-update={handleStatusUpdate}
              />
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  {#if !isWideLayout && isDrawerOpen}
    <button class="drawer-backdrop" on:click={closeDrawer} aria-label="Close repository drawer"></button>
    <aside class="drawer-overlay">
      <RepoDrawer
        tabs={tabs}
        {activeTabId}
        {activeTab}
        activeInfo={activeState.info}
        baseBranch={activeState.baseBranch}
        on:select={handleDrawerSelect}
        on:close={handleDrawerClose}
        on:pick-repo={handleDrawerPickRepo}
        on:change-base={handleDrawerBaseChange}
        on:add={addTab}
      />
    </aside>
  {/if}

  <Toast />
  <SettingsPanel 
    bind:isOpen={isSettingsOpen} 
    settings={folderConfig.settings}
    on:change={(e) => { folderConfig.settings = e.detail; refreshConfig(); }}
    on:close={() => isSettingsOpen = false}
  />
  <ConfirmModal 
    bind:isOpen={isUndoModalOpen}
    title="Undo Last Squash"
    message="This will move your HEAD back to the previous state. Are you sure you want to undo the last squash operation?"
    confirmText="Yes, Undo Squash"
    danger={true}
    on:confirm={() => activeProject?.runUndo(true)}
  />
</div>


<style>
  :global(:root) {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-h: #21262d;
    --bdr: #30363d;
    --bdr-l: #484f58;
    --tx-b: #c9d1d9;
    --tx-d: #8b949e;
    --acc: #58a6ff;
    --acc-bg: rgba(88, 166, 255, 0.1);
    --red: #f85149;
    --grn: #3fb950;
    --grn-bg: rgba(63, 185, 80, 0.1);
    --amb: #d29922;
    --amb-bg: rgba(210, 153, 34, 0.1);
  }

  :global(body.light-mode), .app-container.light-mode {
    --bg: #ffffff;

    --surface: #ffffff;
    --surface-h: #f6f8fa;
    --bdr: #e1e4e8;
    --bdr-l: #d1d5da;
    --tx-b: #24292e;
    --tx-d: #6a737d;
    --acc: #0366d6;
    --acc-bg: rgba(3, 102, 214, 0.05);
    --red: #d73a49;
    --grn: #22863a;
    --grn-bg: rgba(34, 134, 58, 0.05);
    --amb: #b08800;
    --amb-bg: rgba(176, 136, 0, 0.05);
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--tx-b);
    overflow: hidden;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--bg);
    color: var(--tx-b);
    position: relative;
  }

  .app-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .drawer-shell {
    width: 320px;
    flex-shrink: 0;
    background: var(--surface);
    min-height: 0;
  }

  .workspace-shell {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    background: rgba(1, 4, 9, 0.58);
    backdrop-filter: blur(3px);
    z-index: 80;
  }

  .drawer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(360px, 88vw);
    z-index: 90;
    box-shadow: 16px 0 48px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .tab-bar {
    background: #010409;
    border-bottom: 1px solid var(--bdr);
    padding: 12px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 64px;
    flex-shrink: 0;
  }

  .light-mode .tab-bar {
    background: #f6f8fa;
  }

  .tab-bar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 1 40%;
    min-width: 0;
  }

  .drawer-toggle {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--bdr);
    background: var(--surface);
    color: var(--tx-b);
    font-size: 18px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .drawer-toggle:hover,
  .drawer-toggle.open {
    background: var(--surface-h);
    border-color: rgba(88, 166, 255, 0.32);
    color: var(--acc);
  }

  .collapsed-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 0;
    background: transparent;
    color: var(--tx-b);
    flex: 1 1 auto;
  }

  .collapsed-meta-row {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.15;
  }

  .collapsed-meta-icon {
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1.2;
    margin-top: 1px;
  }

  .collapsed-repo-name {
    min-width: 0;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 10px;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tx-d);
  }

  .collapsed-branch-name {
    min-width: 0;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 600;
    color: var(--acc);
    font-family: "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace;
  }

  .tab-bar-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .settings-btn {
    background: transparent;
    border: none;
    color: var(--tx-d);
    font-size: 16px;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .settings-btn:hover {
    background: var(--surface-h);
    color: var(--tx-b);
    transform: rotate(30deg);
  }

  .tab-bar-center {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tab-bar-center.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .view-switcher {
    display: flex;
    align-items: stretch;
    gap: 6px;
    min-width: 0;
    margin: 0 auto;
  }

  .view-switcher button {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--tx-d);
    padding: 9px 16px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    min-width: 100px;
    justify-content: center;
    white-space: nowrap;
  }

  .view-switcher button::after {
    content: "";
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 5px;
    height: 2px;
    background: transparent;
    transition: all 0.2s;
  }

  .view-switcher button:hover {
    background: var(--surface-h);
    border-color: rgba(255, 255, 255, 0.04);
    color: var(--tx-b);
  }

  .view-switcher button.active {
    background: var(--surface);
    border-color: rgba(88, 166, 255, 0.2);
    color: var(--tx-b);
  }

  .view-switcher button.active::after {
    background: var(--acc);
    box-shadow: 0 0 10px var(--acc);
  }

  .unstaged-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    background: var(--amb);
    color: #000;
    font-size: 9px;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 10px;
    line-height: 1;
    min-width: 14px;
    text-align: center;
    border: 1px solid rgba(0,0,0,0.1);
  }

  .unpushed-badge {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: var(--acc);
    color: white;
    font-size: 9px;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 10px;
    line-height: 1;
    min-width: 14px;
    text-align: center;
    box-shadow: 0 0 5px var(--acc-bg);
  }

  .logs-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(255, 255, 255, 0.14);
    color: var(--tx-b);
    font-size: 9px;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 10px;
    line-height: 1;
    min-width: 14px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .icon-action {
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--tx-d);
      cursor: pointer;
      transition: all 0.2s;
      font-size: 14px;
  }
  .icon-action:hover {
      background: var(--surface-h);
      border-color: var(--bdr);
      color: var(--tx-b);
  }

  @media (max-width: 1179px) {
    .tab-bar {
      flex-wrap: wrap;
      align-items: center;
    }

    .tab-bar-center {
      order: 3;
      width: 100%;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-start;
    }
  }

  @media (max-width: 860px) {
    .tab-bar {
      padding: 12px;
      gap: 12px;
    }

    .view-switcher {
      width: 100%;
      flex-wrap: wrap;
      margin: 0;
    }

    .view-switcher button {
      flex: 1 1 140px;
      min-width: 0;
    }
  }

  @media (max-width: 640px) {
    .tab-bar-right {
      margin-left: auto;
    }

    .tab-bar-center {
      gap: 12px;
    }
  }




  .tab-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .tab-pane {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
  .tab-pane.hidden { display: none; }

  .app-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--tx-d);
    font-size: 14px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  :global(.empty-view) {
      margin-top: 100px;
  }
</style>
