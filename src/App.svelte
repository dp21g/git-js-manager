<script>
  import { onMount } from "svelte";
  import { getFolderConfig, updateTabs, setActiveRepo } from "./lib/api.js";
  import Toast from "./lib/Toast.svelte";
  import ProjectView from "./lib/ProjectView.svelte";

  let tabs = []; // { id, repoPath, name, active }
  let activeTabId = null;
  let folderConfig = { recentDirs: [], favouriteDirs: [] };
  let loading = true;

  onMount(async () => {
    const data = await getFolderConfig();
    if (!data.error) {
        folderConfig = data;
        if (data.tabs && data.tabs.length > 0) {
            tabs = data.tabs;
            const active = tabs.find(t => t.active);
            activeTabId = active ? active.id : tabs[0].id;
        } else {
            // Create initial tab
            addTab();
        }
    } else {
        addTab();
    }
    loading = false;
  });

  function addTab() {
    const id = "tab-" + Math.random().toString(36).substr(2, 9);
    const newTab = { id, repoPath: "", name: "New Tab", active: true };
    tabs = tabs.map(t => ({ ...t, active: false }));
    tabs = [...tabs, newTab];
    activeTabId = id;
    persistTabs();
  }

  function selectTab(id) {
    activeTabId = id;
    tabs = tabs.map(t => ({ ...t, active: t.id === id }));
    const active = tabs.find(t => t.id === id);
    if (active && active.repoPath) setActiveRepo(active.repoPath);
    persistTabs();
  }

  function closeTab(e, id) {
    e.stopPropagation();
    if (tabs.length === 1) return;
    if (!confirm("Close this tab?")) return;
    
    const index = tabs.findIndex(t => t.id === id);
    tabs = tabs.filter(t => t.id !== id);
    
    if (activeTabId === id) {
        const nextIndex = Math.max(0, index - 1);
        activeTabId = tabs[nextIndex].id;
        tabs[nextIndex].active = true;
    }
    persistTabs();
  }

  function handleRepoSelected(e) {
      const { tabId, path } = e.detail;
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
          tab.repoPath = path;
          tab.name = path.split('/').pop() || path;
          tabs = [...tabs];
          persistTabs();
      }
  }

  async function persistTabs() {
      await updateTabs(tabs);
  }

  async function refreshConfig() {
      const data = await getFolderConfig();
      if (!data.error) folderConfig = data;
  }
</script>

<div class="app-container">
  <div class="tab-bar">
    <div class="tabs-scroll">
      {#each tabs as tab (tab.id)}
        <div 
          class="tab" 
          class:active={activeTabId === tab.id}
          on:click={() => selectTab(tab.id)}
        >
          <span class="tab-icon">📁</span>
          <span class="tab-name">{tab.name}</span>
          <button class="close-tab" on:click={(e) => closeTab(e, tab.id)}>×</button>
        </div>
      {/each}
      <button class="add-tab" on:click={addTab} title="New Tab">+</button>
    </div>
  </div>

  <div class="tab-content">
    {#if loading}
        <div class="app-loading">Initializing Workspace...</div>
    {:else}
        {#each tabs as tab (tab.id)}
            <div class="tab-pane" class:hidden={activeTabId !== tab.id}>
                <ProjectView 
                    tabId={tab.id}
                    repoPath={tab.repoPath}
                    {folderConfig}
                    on:repo-selected={handleRepoSelected}
                    on:config-changed={refreshConfig}
                />
            </div>
        {/each}
    {/if}
  </div>

  <Toast />
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
  }

  .tab-bar {
    background: #010409;
    border-bottom: 1px solid var(--bdr);
    padding: 8px 12px 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .tabs-scroll {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs-scroll::-webkit-scrollbar { display: none; }

  .tab {
    height: 34px;
    padding: 0 12px;
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-bottom: none;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    min-width: 120px;
    max-width: 200px;
    transition: all 0.2s;
    user-select: none;
    position: relative;
    top: 1px;
  }

  .tab:hover { background: var(--surface-h); }
  .tab.active { background: var(--bg); border-bottom: 1px solid var(--bg); z-index: 2; border-color: var(--bdr) var(--bdr) transparent; }

  .tab-icon { font-size: 12px; opacity: 0.7; }
  .tab-name { 
    font-size: 12px; 
    font-weight: 500; 
    color: var(--tx-d); 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
  }
  .tab.active .tab-name { color: var(--tx-b); }

  .close-tab {
    background: transparent;
    border: none;
    color: var(--tx-d);
    font-size: 14px;
    padding: 0 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: all 0.2s;
  }
  .tab:hover .close-tab { opacity: 1; }
  .close-tab:hover { background: rgba(255,255,255,0.1); color: var(--red); }

  .add-tab {
    background: transparent;
    border: none;
    color: var(--tx-d);
    font-size: 18px;
    padding: 0 12px;
    cursor: pointer;
    border-radius: 4px;
    height: 34px;
    display: flex;
    align-items: center;
  }
  .add-tab:hover { background: var(--surface-h); color: var(--acc); }

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
