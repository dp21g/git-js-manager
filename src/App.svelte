<script>
  import { onMount, tick } from "svelte";
  import { getFolderConfig, getRepoInfo, updateSettings, updateTabs, setActiveRepo, deleteBranch, renameBranch, runGitCommand, logCommand } from "./lib/api.js";
  import Toast from "./lib/Toast.svelte";
  import ProjectView from "./lib/ProjectView.svelte";
  import SettingsPanel from "./lib/SettingsPanel.svelte";
  import ConfirmModal from "./lib/ConfirmModal.svelte";
  import RepoDrawer from "./lib/RepoDrawer.svelte";
  import ContextMenu from "./lib/ContextMenu.svelte";
  import {
    DEFAULT_SETTINGS,
    ZOOM_STEP,
    applyUiSettingsToDocument,
    clampWideDrawerWidth,
    clampZoomLevel,
    normalizeUiSettings
  } from "../server/ui-settings.mjs";

  const WIDE_DRAWER_BREAKPOINT = 1180;
  const VIEW_MODES = [
    { id: "squash", label: "Squash" },
    { id: "diff", label: "Diff" },
    { id: "compare", label: "Compare" },
    { id: "commit", label: "Commit" },
    { id: "logs", label: "Logs" }
  ];
  const GIT_COMMANDS = [
    { id: "pull", label: "Pull" },
    { id: "fetch", label: "Fetch" },
    { id: "push", label: "Push" },
  ];

  let tabs = []; // { id, repoPath, name, active }
  let activeTabId = null;
  let folderConfig = {
    recentDirs: [],
    favouriteDirs: [],
    settings: { ...DEFAULT_SETTINGS }
  };
  let loading = true;
  let isSettingsOpen = false;
  let isUndoModalOpen = false;
  let tabStates = {}; // tabId -> state
  let projectViews = {}; // tabId -> instance
  let isWideLayout = false;
  let isDrawerOpen = false;
  let isWideDrawerVisible = true;
  let isDrawerResizing = false;
  let drawerResizeStartX = 0;
  let drawerResizeStartWidth = DEFAULT_SETTINGS.wideDrawerWidth;
  let settingsSaveTimeout;
  let pendingSettingsPatch = {};
  let repoSummaries = {};
  let repoSummaryLoads = {};
  let ctxVisible = false;
  let ctxX = 0;
  let ctxY = 0;
  let ctxTabId = null;
  let ctxRepoPath = "";
  let ctxBranchName = "";
  let ctxIsCurrent = false;
  let ctxOverlay = ""; // "rename" | "delete" | ""
  let ctxRenameName = "";
  let ctxDeleteRemote = false;
  let ctxLoading = false;
  let ctxError = "";
  let glowingRepos = new Set();
  let gitCmdLoading = null;
  let gitCmdStatus = "";
  let drawerRefreshCounter = 0;

  function triggerGlow(path) {
    if (!path) return;
    glowingRepos = new Set([...glowingRepos, path]);
    drawerRefreshCounter += 1;
    setTimeout(() => {
      glowingRepos = new Set([...glowingRepos].filter(p => p !== path));
    }, 2200);
  }

  async function handleGitCommand(cmdId) {
    if (!activeTab?.repoPath || gitCmdLoading) return;

    const branch = activeState?.info?.branch || "";
    if (cmdId === "push" && (branch === "master" || branch === "main")) {
      return;
    }

    gitCmdLoading = cmdId;
    const labels = { pull: "Pull", fetch: "Fetch", push: "Push" };
    gitCmdStatus = `${labels[cmdId]}ing from origin…`;
    try {
      let args = cmdId;
      if (cmdId === "push" && branch) {
        args = `push origin ${branch}`;
        gitCmdStatus = `Pushing to origin/${branch}…`;
      }
      const result = await runGitCommand(args, activeTab.repoPath);
      await logCommand(result, activeTab.repoPath);
      gitCmdStatus = result.ok ? `${labels[cmdId]} completed` : `${labels[cmdId]} failed`;
      await projectViews[activeTabId]?.refreshWS?.();
      await projectViews[activeTabId]?.refreshLg?.();
      triggerGlow(activeTab.repoPath);
    } catch (err) {
      console.error(`Git ${cmdId} failed:`, err);
      gitCmdStatus = `${cmdId} failed: ${err.message || err}`;
    } finally {
      setTimeout(() => {
        if (gitCmdStatus && !gitCmdLoading) gitCmdStatus = "";
      }, 3000);
      gitCmdLoading = null;
    }
  }

  function playSound(freq, type = "sine", duration = 0.12, vol = 0.08) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  function soundDelete() { playSound(200, "sine", 0.25, 0.1); }
  function soundRename() { playSound(600, "sine", 0.1, 0.06); }
  function soundSwitch() { playSound(800, "sine", 0.08, 0.05); }

  $: activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null;
  $: activeState = tabStates[activeTabId] || { view: "picker", mode: "squash" };
  $: activeProject = projectViews[activeTabId];
  $: settings = normalizeUiSettings(folderConfig.settings);
  $: drawerRepoState = settings.drawerRepoState || {};
  $: collapsedRepoName =
    activeState.info?.path?.split(/[\\/]/).pop() ||
    activeTab?.name ||
    "No repo selected";
  $: collapsedBranchName = activeState.info?.branch || "";
  $: wideDrawerWidth = settings.wideDrawerWidth;

  $: if (typeof document !== "undefined") {
    applyUiSettingsToDocument(settings);
  }

  $: if (isWideLayout) {
    isDrawerOpen = false;
  }

  onMount(() => {
    let cancelled = false;

    function syncLayout() {
      if (typeof window === "undefined") return;
      isWideLayout = window.innerWidth >= WIDE_DRAWER_BREAKPOINT;
      if (!isWideLayout) {
        isDrawerResizing = false;
      }
    }

    function handleZoomHotkeys(event) {
      const modifierPressed = event.metaKey || event.ctrlKey;
      if (!modifierPressed || event.altKey) return;

      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        setZoomLevel(settings.zoomLevel + ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoomLevel(settings.zoomLevel - ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        setZoomLevel(DEFAULT_SETTINGS.zoomLevel);
      }
    }

    function handleGlobalMouseMove(event) {
      if (!isDrawerResizing) return;
      const nextWidth = clampWideDrawerWidth(
        drawerResizeStartWidth + (event.clientX - drawerResizeStartX) / settings.zoomLevel
      );
      setLocalSettings({ wideDrawerWidth: nextWidth });
    }

    function handleGlobalMouseUp() {
      if (!isDrawerResizing) return;
      isDrawerResizing = false;
      scheduleSettingsPersist({ wideDrawerWidth: settings.wideDrawerWidth }, 0);
    }

    syncLayout();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", syncLayout);
      window.addEventListener("keydown", handleZoomHotkeys);
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }

    (async () => {
      const data = await getFolderConfig();
      if (cancelled) return;

      if (!data.error) {
        const nextSettings = normalizeUiSettings(data.settings);
        folderConfig = {
          recentDirs: [],
          favouriteDirs: [],
          settings: { ...DEFAULT_SETTINGS },
          ...data,
          settings: nextSettings
        };
        isWideDrawerVisible = nextSettings.wideDrawerVisible;

        if (data.tabs && data.tabs.length > 0) {
          tabs = data.tabs;
          const active = tabs.find((tab) => tab.active) || tabs[0];
          activeTabId = active?.id || null;
          if (active?.repoPath) {
            setActiveRepo(active.repoPath);
            const activeDrawerState =
              nextSettings.drawerRepoState?.[active.id] ||
              nextSettings.drawerRepoState?.[active.repoPath] ||
              {};
            refreshRepoSummary(active.repoPath, {
              force: true,
              includeRemotes: Boolean(activeDrawerState.remoteExpanded)
            });
          }
          for (const tab of data.tabs) {
            if (!tab.repoPath || tab.id === activeTabId) continue;
            refreshRepoSummary(tab.repoPath, { force: false, includeRemotes: false });
          }
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
      clearTimeout(settingsSaveTimeout);

      if (typeof window !== "undefined") {
        window.removeEventListener("resize", syncLayout);
        window.removeEventListener("keydown", handleZoomHotkeys);
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("mouseup", handleGlobalMouseUp);
      }
    };
  });

  function setLocalSettings(patch) {
    const nextSettings = normalizeUiSettings({
      ...(folderConfig.settings || {}),
      ...patch
    });

    folderConfig = {
      ...folderConfig,
      settings: nextSettings
    };

    if (typeof patch.wideDrawerVisible === "boolean") {
      isWideDrawerVisible = nextSettings.wideDrawerVisible;
    }

    return nextSettings;
  }

  function scheduleSettingsPersist(patch, delay = 140) {
    pendingSettingsPatch = { ...pendingSettingsPatch, ...patch };
    clearTimeout(settingsSaveTimeout);
    settingsSaveTimeout = setTimeout(async () => {
      const payload = pendingSettingsPatch;
      pendingSettingsPatch = {};
      await updateSettings(payload);
    }, delay);
  }

  function setZoomLevel(nextZoom) {
    const zoomLevel = clampZoomLevel(nextZoom);
    if (zoomLevel === settings.zoomLevel) return;
    setLocalSettings({ zoomLevel });
    scheduleSettingsPersist({ zoomLevel });
  }

  function handleStatusUpdate(e) {
    const { tabId, state } = e.detail;
    tabStates[tabId] = state;
    tabStates = { ...tabStates };

    const tab = tabs.find((item) => item.id === tabId);
    if (tab?.repoPath && state?.info) {
      const previousSummary = repoSummaries[tab.repoPath];
      const mergedSummary = mergeRepoSummary(previousSummary, state.info);
      repoSummaries = {
        ...repoSummaries,
        [tab.repoPath]: mergedSummary
      };
    }
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
    setLocalSettings({ wideDrawerVisible: visible });
    await updateSettings({ wideDrawerVisible: visible });
  }

  function getDrawerState(stateKey, path = "") {
    return drawerRepoState?.[stateKey] || drawerRepoState?.[path] || {};
  }

  function mergeRepoSummary(previousSummary, nextSummary) {
    if (!nextSummary) return previousSummary || null;

    const remoteBranchesLoaded =
      nextSummary.remoteBranchesLoaded === true ||
      previousSummary?.remoteBranchesLoaded === true;
    const remoteBranches =
      nextSummary.remoteBranchesLoaded === true
        ? nextSummary.remoteBranches || []
        : previousSummary?.remoteBranches || [];

    return {
      ...(previousSummary || {}),
      ...nextSummary,
      remoteBranches,
      remoteBranchesLoaded
    };
  }

  function getRepoSummaryLoadKey(path, includeRemotes) {
    return `${path}::${includeRemotes ? "with-remotes" : "local"}`;
  }

  function startDrawerResize(event) {
    if (!isWideLayout || !isWideDrawerVisible) return;
    isDrawerResizing = true;
    drawerResizeStartX = event.clientX;
    drawerResizeStartWidth = wideDrawerWidth;
    event.preventDefault();
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

  async function refreshRepoSummary(path, { force = false, includeRemotes = false } = {}) {
    if (!path) return null;
    const loadKey = getRepoSummaryLoadKey(path, includeRemotes);
    const fallbackLoadKey = getRepoSummaryLoadKey(path, true);
    const cachedSummary = repoSummaries[path];

    if (!force) {
      if (repoSummaryLoads[loadKey]) return repoSummaryLoads[loadKey];
      if (!includeRemotes && repoSummaryLoads[fallbackLoadKey]) return repoSummaryLoads[fallbackLoadKey];
      if (cachedSummary && (!includeRemotes || cachedSummary.remoteBranchesLoaded)) {
        return cachedSummary;
      }
    }

    const load = getRepoInfo(path, { includeRemotes }).then((data) => {
      if (!data?.error && !data?.needsRepo) {
        const mergedSummary = mergeRepoSummary(repoSummaries[path], data);
        repoSummaries = {
          ...repoSummaries,
          [path]: mergedSummary
        };
        return mergedSummary;
      }
      return null;
    }).finally(() => {
      const nextLoads = { ...repoSummaryLoads };
      delete nextLoads[loadKey];
      repoSummaryLoads = nextLoads;
    });

    repoSummaryLoads = {
      ...repoSummaryLoads,
      [loadKey]: load
    };

    return load;
  }

  async function activateTab(id, { close = false, refresh = false } = {}) {
    if (!id) return;
    const switchingTabs = activeTabId !== id;

    activeTabId = id;
    tabs = tabs.map((tab) => ({ ...tab, active: tab.id === id }));
    const active = tabs.find((tab) => tab.id === id);
    if (active?.repoPath) setActiveRepo(active.repoPath);
    await persistTabs();
    await tick();

    if (active?.repoPath && getDrawerState(active.id, active.repoPath).remoteExpanded) {
      refreshRepoSummary(active.repoPath, {
        force: false,
        includeRemotes: true
      });
    }

    if (refresh && !switchingTabs) {
      await projectViews[id]?.refreshRepoContext?.();
    }

    if (close) closeDrawer();
  }

  function selectTab(id) {
    activateTab(id, { close: true, refresh: true });
  }

  function closeTab(id) {
    if (tabs.length === 1) return;
    if (!confirm("Close this tab?")) return;

    const index = tabs.findIndex((tab) => tab.id === id);
    const remainingTabs = tabs.filter((tab) => tab.id !== id);
    const nextActiveId =
      activeTabId === id ? remainingTabs[Math.max(0, index - 1)]?.id : activeTabId;

    tabs = remainingTabs.map((tab) => ({ ...tab, active: tab.id === nextActiveId }));
    activeTabId = nextActiveId;

    const active = tabs.find((tab) => tab.id === nextActiveId);
    if (active?.repoPath) setActiveRepo(active.repoPath);

    closeDrawer();
    persistTabs();
  }

  async function handleDrawerSelect(e) {
    await activateTab(e.detail.id, { close: true, refresh: true });
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

  function updateDrawerRepoState(stateKey, patch) {
    if (!stateKey) return;
    const nextDrawerState = {
      ...drawerRepoState,
      [stateKey]: {
        ...(drawerRepoState[stateKey] || {}),
        ...patch
      }
    };
    setLocalSettings({ drawerRepoState: nextDrawerState });
    scheduleSettingsPersist({ drawerRepoState: nextDrawerState });
  }

  async function handleDrawerToggleRepo(e) {
    const { path, stateKey, expanded } = e.detail;
    updateDrawerRepoState(stateKey, { expanded });
    if (expanded && path) {
      const drawerState = getDrawerState(stateKey, path);
      const hasRemoteBranches = Boolean(drawerState.remoteExpanded);
      await refreshRepoSummary(path, {
        force: !repoSummaries[path],
        includeRemotes: hasRemoteBranches
      });
      if (hasRemoteBranches && !repoSummaries[path]?.remoteBranchesLoaded) {
        refreshRepoSummary(path, { force: false, includeRemotes: true });
      }
    }
  }

  function handleDrawerToggleLocalBranches(e) {
    const { stateKey, localExpanded } = e.detail;
    updateDrawerRepoState(stateKey, { localExpanded });
  }

  async function handleDrawerToggleRemoteBranches(e) {
    const { path, stateKey, remoteExpanded } = e.detail;
    updateDrawerRepoState(stateKey, { remoteExpanded });
    if (remoteExpanded) {
      await refreshRepoSummary(path, {
        force: false,
        includeRemotes: true
      });
    }
  }

  async function handleDrawerChangeBranch(e) {
    const targetId = e.detail?.id || activeTabId;
    if (!targetId) return;

    await activateTab(targetId, { refresh: true });

    const targetTab = tabs.find((tab) => tab.id === targetId);
    const targetProject = projectViews[targetId];

    if (targetTab?.repoPath) {
      targetProject?.openBranchSwitch(e.detail?.branch || "");
    } else {
      targetProject?.pickRepo();
    }

    closeDrawer();
  }

  async function handleDrawerSwitchLocalBranch(e) {
    const { id, branch } = e.detail;
    if (!id || !branch) return;
    await activateTab(id, { refresh: true });
    const result = await projectViews[id]?.switchBranchFromDrawer?.(branch);
    if (result?.ok) {
      const tab = tabs.find(t => t.id === id);
      if (tab?.repoPath) {
        await refreshRepoSummary(tab.repoPath, { force: true });
        triggerGlow(tab.repoPath);
      }
    }
    if (!isWideLayout) closeDrawer();
  }

  async function handleDrawerSwitchRemoteBranch(e) {
    const { id, branch } = e.detail;
    if (!id || !branch) return;
    await activateTab(id, { refresh: true });
    const result = await projectViews[id]?.switchBranchFromDrawer?.(branch, { remote: true });
    if (result?.ok) {
      const tab = tabs.find(t => t.id === id);
      if (tab?.repoPath) {
        await refreshRepoSummary(tab.repoPath, { force: true });
        triggerGlow(tab.repoPath);
      }
    }
    if (!isWideLayout) closeDrawer();
  }

  async function handleDrawerDeleteBranch(e) {
    const { id, path, branch, deleteRemote } = e.detail;
    if (!id || !path || !branch) return;

    const result = await deleteBranch(branch, Boolean(deleteRemote), path);
    if (result?.ok) {
      await refreshRepoSummary(path, { force: true });
      triggerGlow(path);
      if (id === activeTabId) {
        await projectViews[id]?.refreshRepoContext?.();
      }
    }
  }

  async function handleDrawerRenameBranch(e) {
    const { id, path, oldName, newName } = e.detail;
    if (!id || !path || !oldName || !newName) return;

    const result = await renameBranch(oldName, newName, path);
    if (result?.ok) {
      await refreshRepoSummary(path, { force: true });
      triggerGlow(path);
      if (id === activeTabId) {
        await projectViews[id]?.refreshRepoContext?.();
      }
    }
  }

  function handleDrawerCtxOpen(e) {
    const { x, y, tabId, repoPath, branch, isCurrent } = e.detail;
    ctxX = x;
    ctxY = y;
    ctxTabId = tabId;
    ctxRepoPath = repoPath;
    ctxBranchName = branch;
    ctxIsCurrent = isCurrent;
    ctxOverlay = "";
    ctxRenameName = branch;
    ctxDeleteRemote = false;
    ctxVisible = true;
  }

  $: ctxItems = (() => {
    const items = [];
    if (!ctxBranchName) return items;
    if (!ctxIsCurrent) {
      items.push({ label: "Switch to Branch", action: "switch" });
      items.push({ label: "Rename Branch…", action: "rename" });
      items.push({ label: "Delete Branch…", action: "delete", danger: true });
    }
    return items;
  })();

  async function handleCtxAction(e) {
    const action = e.detail.action;
    ctxVisible = false;

    if (action === "switch") {
      soundSwitch();
      await activateTab(ctxTabId, { refresh: true });
      const result = await projectViews[ctxTabId]?.switchBranchFromDrawer?.(ctxBranchName);
      if (result?.ok) {
        await refreshRepoSummary(ctxRepoPath, { force: true });
        triggerGlow(ctxRepoPath);
      }
    } else if (action === "rename") {
      ctxRenameName = ctxBranchName;
      ctxError = "";
      ctxLoading = false;
      ctxOverlay = "rename";
    } else if (action === "delete") {
      ctxDeleteRemote = false;
      ctxError = "";
      ctxLoading = false;
      ctxOverlay = "delete";
    }
  }

  async function submitCtxDelete() {
    if (!ctxRepoPath || !ctxBranchName) return;
    ctxError = "";
    ctxLoading = true;
    try {
      const result = await deleteBranch(ctxBranchName, ctxDeleteRemote, ctxRepoPath);
      ctxLoading = false;
      if (result?.ok) {
        soundDelete();
        await refreshRepoSummary(ctxRepoPath, { force: true });
        triggerGlow(ctxRepoPath);
        if (ctxTabId === activeTabId) {
          await projectViews[ctxTabId]?.refreshRepoContext?.();
        }
        ctxOverlay = "";
      } else {
        ctxError = result?.error || "Failed to delete branch";
      }
    } catch (err) {
      ctxLoading = false;
      ctxError = err?.message || "Unexpected error";
    }
  }

  async function submitCtxRename() {
    const newName = ctxRenameName?.trim();
    if (!newName || newName === ctxBranchName || !ctxRepoPath) {
      ctxOverlay = "";
      return;
    }
    ctxError = "";
    ctxLoading = true;
    try {
      const result = await renameBranch(ctxBranchName, newName, ctxRepoPath);
      ctxLoading = false;
      if (result?.ok) {
        soundRename();
        await refreshRepoSummary(ctxRepoPath, { force: true });
        triggerGlow(ctxRepoPath);
        if (ctxTabId === activeTabId) {
          await projectViews[ctxTabId]?.refreshRepoContext?.();
        }
        ctxOverlay = "";
      } else {
        ctxError = result?.error || "Failed to rename branch";
      }
    } catch (err) {
      ctxLoading = false;
      ctxError = err?.message || "Unexpected error";
    }
  }

  function closeCtxOverlay(e) {
    if (e && e.key === "Escape") {
      ctxOverlay = "";
      return;
    }
    ctxOverlay = "";
  }

  function handleRepoSelected(e) {
    const { tabId, path } = e.detail;
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;

    tab.repoPath = path;
    tab.name = path.split(/[\\/]/).pop() || path;
    tabs = [...tabs];

    if (tabId === activeTabId) setActiveRepo(path);
    updateDrawerRepoState(tabId, {
      expanded: true,
      localExpanded: true,
      remoteExpanded: false
    });
    refreshRepoSummary(path, { force: true });
    persistTabs();
  }

  function handleSettingsChange(e) {
    setLocalSettings(e.detail);
  }

  async function persistTabs() {
    await updateTabs(tabs);
  }

  async function refreshConfig() {
    const data = await getFolderConfig();
    if (data.error) return;

    folderConfig = {
      ...folderConfig,
      ...data,
      settings: normalizeUiSettings(data.settings)
    };
    isWideDrawerVisible = folderConfig.settings.wideDrawerVisible;
  }
</script>

<div class="app-container">
  <div class="zoom-shell">
    <div class="app-shell" class:drawer-resizing={isDrawerResizing}>
      {#if isWideLayout && isWideDrawerVisible}
        <aside class="drawer-shell" style={`width: ${wideDrawerWidth}px;`}>
          <RepoDrawer
            tabs={tabs}
            {tabStates}
            {repoSummaries}
            {repoSummaryLoads}
            {activeTabId}
            {activeTab}
            activeInfo={activeState.info}
            baseBranch={activeState.baseBranch}
            repoDrawerState={drawerRepoState}
            {glowingRepos}
            wide={true}
            on:select={handleDrawerSelect}
            on:close={handleDrawerClose}
            on:pick-repo={handleDrawerPickRepo}
            on:change-branch={handleDrawerChangeBranch}
            on:change-base={handleDrawerBaseChange}
            on:toggle-repo={handleDrawerToggleRepo}
            on:toggle-local-branches={handleDrawerToggleLocalBranches}
            on:toggle-remotes={handleDrawerToggleRemoteBranches}
            on:switch-local-branch={handleDrawerSwitchLocalBranch}
            on:switch-remote-branch={handleDrawerSwitchRemoteBranch}
            on:ctx-open={handleDrawerCtxOpen}
            on:add={addTab}
          />
        </aside>
        <button
          type="button"
          class="drawer-resizer"
          aria-label="Resize repository drawer"
          on:mousedown={startDrawerResize}
        ></button>
      {/if}

      <div class="workspace-shell">
        <div class="tab-bar">
          <div class="tab-bar-left">
            <button
              class="chrome-btn drawer-toggle"
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
                    <span class="collapsed-meta-icon" aria-hidden="true"></span>
                    <span class="collapsed-branch-name">{collapsedBranchName}</span>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <div class="tab-bar-center" class:visible={activeState.view === "main"}>
            {#if activeState.view === "main"}
              <div class="git-commands">
                <span class="git-cmds-label">Git</span>
                {#each GIT_COMMANDS as cmd}
                  <button
                    class="git-cmd-btn"
                    class:loading={gitCmdLoading === cmd.id}
                    disabled={gitCmdLoading === cmd.id}
                    on:click={() => handleGitCommand(cmd.id)}
                    title={`git ${cmd.id}`}
                  >
                    {#if gitCmdLoading === cmd.id}
                      <span class="spin-sm"></span>
                    {/if}
                    {cmd.label}
                  </button>
                {/each}
              </div>
              {#if gitCmdStatus}
                <span class="git-cmd-status" class:error={gitCmdStatus.includes("failed")}>{gitCmdStatus}</span>
              {/if}
              <div class="view-separator"></div>
            {/if}
            <div class="view-switcher">
              {#each VIEW_MODES as mode}
                <button
                  class:active={activeState.mode === mode.id}
                  on:click={() => activeProject?.changeMode(mode.id)}
                >
                  <span>{mode.label}</span>

                  {#if mode.id === "commit" && activeState.unstagedCount > 0}
                    <span class="mode-badge warning" title={`${activeState.unstagedCount} unstaged files`}>
                      {activeState.unstagedCount}
                    </span>
                  {/if}

                  {#if mode.id === "commit" && activeState.unpushedCount > 0}
                    <span class="mode-badge accent" title={`${activeState.unpushedCount} local commits`}>
                      {activeState.unpushedCount}
                    </span>
                  {/if}

                  {#if mode.id === "logs" && activeState.logsCount > 0}
                    <span class="mode-badge neutral" title={`${activeState.logsCount} log entries`}>
                      {activeState.logsCount}
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>

          <div class="tab-bar-right">
            {#if activeState.view === "main"}
              <button class="chrome-btn icon-action" on:click={() => activeProject?.runRefresh()} title="Refresh">
                ↻
              </button>
            {/if}
            <button class="chrome-btn settings-btn" on:click={() => (isSettingsOpen = true)} title="Settings">
              ⚙
            </button>
          </div>
        </div>

        <div class="tab-content">
          {#if loading}
            <div class="app-loading">Initializing workspace...</div>
          {:else if activeTab}
            {#key activeTabId}
              <div class="tab-pane">
                <ProjectView
                  bind:this={projectViews[activeTab.id]}
                  tabId={activeTab.id}
                  repoPath={activeTab.repoPath}
                  {folderConfig}
                  on:repo-selected={handleRepoSelected}
                  on:config-changed={refreshConfig}
                  on:status-update={handleStatusUpdate}
                />
              </div>
            {/key}
          {:else}
            <div class="app-loading">No active tab</div>
          {/if}
        </div>
      </div>
    </div>

    {#if !isWideLayout && isDrawerOpen}
      <button class="drawer-backdrop" on:click={closeDrawer} aria-label="Close repository drawer"></button>
      <aside class="drawer-overlay" style={`width: min(${wideDrawerWidth}px, 88vw);`}>
        <RepoDrawer
          tabs={tabs}
          {tabStates}
          {repoSummaries}
          {repoSummaryLoads}
          {activeTabId}
          {activeTab}
          activeInfo={activeState.info}
          baseBranch={activeState.baseBranch}
          repoDrawerState={drawerRepoState}
          {glowingRepos}
          on:select={handleDrawerSelect}
          on:close={handleDrawerClose}
          on:pick-repo={handleDrawerPickRepo}
          on:change-branch={handleDrawerChangeBranch}
          on:change-base={handleDrawerBaseChange}
          on:toggle-repo={handleDrawerToggleRepo}
          on:toggle-local-branches={handleDrawerToggleLocalBranches}
          on:toggle-remotes={handleDrawerToggleRemoteBranches}
          on:switch-local-branch={handleDrawerSwitchLocalBranch}
          on:switch-remote-branch={handleDrawerSwitchRemoteBranch}
          on:ctx-open={handleDrawerCtxOpen}
          on:add={addTab}
        />
      </aside>
    {/if}

    <Toast />
    <SettingsPanel
      bind:isOpen={isSettingsOpen}
      settings={settings}
      on:change={handleSettingsChange}
      on:close={() => (isSettingsOpen = false)}
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

  <ContextMenu
    visible={ctxVisible}
    x={ctxX}
    y={ctxY}
    items={ctxItems}
    on:action={handleCtxAction}
    on:close={() => { ctxVisible = false; }}
  />

  {#if ctxOverlay === "rename"}
    <button class="ctx-overlay-backdrop" on:click={closeCtxOverlay} on:keydown={(e) => e.key === "Escape" && closeCtxOverlay(e)} aria-label="Close rename dialog"></button>
    <div class="ctx-overlay" style={`left:${ctxX}px;top:${ctxY}px;`} role="dialog" aria-label="Rename branch">
      <div class="ctx-overlay-header">Rename Branch</div>
      <input
        type="text"
        class="ctx-overlay-input"
        bind:value={ctxRenameName}
        disabled={ctxLoading}
        on:keydown={(e) => { if (e.key === "Enter") submitCtxRename(); if (e.key === "Escape") closeCtxOverlay(e); }}
        placeholder="New branch name"
      />
      {#if ctxError}
        <p class="ctx-overlay-error">{ctxError}</p>
      {/if}
      <div class="ctx-overlay-actions">
        <button type="button" class="btn-ctx" on:click={submitCtxRename} disabled={ctxLoading}>
          {ctxLoading ? "Renaming…" : "Rename"}
        </button>
        <button type="button" class="btn-ctx" on:click={closeCtxOverlay} disabled={ctxLoading}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if ctxOverlay === "delete"}
    <button class="ctx-overlay-backdrop" on:click={closeCtxOverlay} on:keydown={(e) => e.key === "Escape" && closeCtxOverlay(e)} aria-label="Close delete dialog"></button>
    <div class="ctx-overlay" style={`left:${ctxX}px;top:${ctxY}px;`} role="dialog" aria-label="Delete branch">
      <div class="ctx-overlay-header">Delete Branch</div>
      <p class="ctx-overlay-text">Delete <code>{ctxBranchName}</code>?</p>
      <label class="ctx-overlay-checkbox">
        <input type="checkbox" bind:checked={ctxDeleteRemote} disabled={ctxLoading} />
        <span>Also delete remote branch</span>
      </label>
      {#if ctxError}
        <p class="ctx-overlay-error">{ctxError}</p>
      {/if}
      <div class="ctx-overlay-actions">
        <button type="button" class="btn-ctx btn-ctx-danger" on:click={submitCtxDelete} disabled={ctxLoading}>
          {ctxLoading ? "Deleting…" : "Delete"}
        </button>
        <button type="button" class="btn-ctx" on:click={closeCtxOverlay} disabled={ctxLoading}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--bg);
    color: var(--tx-b);
    position: relative;
  }

  .zoom-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    width: calc(100% / var(--ui-zoom));
    height: calc(100% / var(--ui-zoom));
    transform: scale(var(--ui-zoom));
    transform-origin: top left;
    overflow: hidden;
  }

  .app-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .app-shell.drawer-resizing {
    user-select: none;
  }

  .drawer-shell {
    flex-shrink: 0;
    background: var(--sidebar-bg);
    min-height: 0;
    min-width: 0;
    border-right: 1px solid var(--bdr);
  }

  .drawer-resizer {
      width: 4px;
      flex-shrink: 0;
      cursor: ew-resize;
      background: var(--panel-resizer);
      transition: background 0.16s ease;
      border: none;
      padding: 0;
  }

  .drawer-resizer:hover,
  .app-shell.drawer-resizing .drawer-resizer {
    background: var(--panel-resizer-active);
  }

  .workspace-shell {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--editor-bg);
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    background: rgba(0, 0, 0, 0.48);
    z-index: 80;
  }

  .drawer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 90;
    box-shadow: 14px 0 32px var(--panel-shadow);
    overflow: hidden;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--bdr);
  }

  .tab-bar {
    background: var(--titlebar-bg);
    border-bottom: 1px solid var(--bdr);
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    flex-shrink: 0;
  }

  .tab-bar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 30%;
    min-width: 0;
  }

  .chrome-btn {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--tx-d);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .chrome-btn:hover,
  .drawer-toggle.open {
    background: var(--list-hover);
    border-color: var(--bdr);
    color: var(--tx-b);
  }

  .collapsed-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    color: var(--tx-b);
    flex: 1 1 auto;
  }

  .collapsed-meta-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    line-height: 1.2;
  }

  .collapsed-meta-icon {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--tx-d);
  }

  .collapsed-repo-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .collapsed-branch-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--tx-d);
    font-family: var(--font-mono);
  }

  .tab-bar-center {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    justify-content: center;
    gap: 8px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }

  .tab-bar-center.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .git-commands {
    display: flex;
    align-items: stretch;
    gap: 2px;
    background: var(--panel-elevated-bg);
    border: 1px solid var(--panel-border);
    border-radius: var(--radius-md);
    padding: 3px;
    flex-shrink: 0;
  }

  .git-cmds-label {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--acc);
    border-right: 1px solid var(--panel-border);
    margin-right: 2px;
  }

  .git-cmd-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--tx-d);
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    min-width: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .git-cmd-btn:hover:not(:disabled) {
    background: var(--list-hover);
    color: var(--tx-b);
    border-color: var(--bdr);
  }

  .git-cmd-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .git-cmd-btn.loading {
    color: var(--acc);
    border-color: var(--acc-bg);
  }

  .view-separator {
    width: 1px;
    height: 22px;
    background: var(--bdr);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .spin-sm {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 2px solid transparent;
    border-top-color: var(--acc);
    border-radius: 50%;
    animation: btn-spin 0.6s linear infinite;
  }

  @keyframes btn-spin {
    to { transform: rotate(360deg); }
  }

  .git-cmd-status {
    font-size: 11px;
    color: var(--acc);
    white-space: nowrap;
    flex-shrink: 0;
    padding: 0 8px;
    animation: status-fade-in 0.2s ease;
  }

  .git-cmd-status.error {
    color: var(--err, #f44747);
  }

  @keyframes status-fade-in {
    from { opacity: 0; transform: translateX(-4px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes repo-glow {
    0% { box-shadow: inset 0 0 0 rgba(78, 161, 255, 0); }
    20% { box-shadow: inset 0 0 20px rgba(78, 161, 255, 0.15); }
    100% { box-shadow: inset 0 0 0px rgba(78, 161, 255, 0); }
  }

  :global(.repo-glow) {
    animation: repo-glow 2s ease-out;
  }

  .view-switcher {
    display: flex;
    align-items: stretch;
    gap: 4px;
    min-width: 0;
    margin: 0 auto;
  }

  .view-switcher button {
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--tx-d);
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    min-width: 88px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .view-switcher button:hover {
    background: var(--list-hover);
    color: var(--tx-b);
  }

  .view-switcher button.active {
    background: var(--panel-section-bg);
    border-color: var(--bdr);
    color: var(--tx-b);
    box-shadow: inset 0 -1px 0 var(--acc);
  }

  .mode-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .mode-badge.warning {
    background: var(--amb-bg);
    color: var(--amb);
  }

  .mode-badge.accent {
    background: var(--acc-bg);
    color: var(--acc-soft-fg);
  }

  .mode-badge.neutral {
    background: var(--list-hover);
    color: var(--tx-d);
  }

  .tab-bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .tab-content {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: var(--editor-bg);
  }

  .tab-pane {
    position: absolute;
    inset: 0;
  }

  .app-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--tx-d);
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  :global(.empty-view) {
    margin-top: 100px;
  }

  @media (max-width: 1179px) {
    .tab-bar {
      flex-wrap: wrap;
      align-items: center;
    }

    .tab-bar-center {
      order: 3;
      width: 100%;
      justify-content: flex-start;
    }
  }

  @media (max-width: 860px) {
    .tab-bar {
      padding: 8px;
    }

    .view-switcher {
      width: 100%;
      flex-wrap: wrap;
      margin: 0;
    }

    .view-switcher button {
      flex: 1 1 120px;
      min-width: 0;
    }
  }

  /* === CTX OVERLAYS (rename / delete) === */
  :global(.ctx-overlay-backdrop) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 210;
    border: none;
    padding: 0;
    cursor: default;
  }

  :global(.ctx-overlay) {
    position: fixed;
    z-index: 220;
    background: var(--panel-elevated-bg);
    border: 1px solid var(--bdr);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 28px var(--panel-shadow);
    padding: 14px;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  :global(.ctx-overlay-header) {
    font-size: 12px;
    font-weight: 600;
    color: var(--tx-b);
  }

  :global(.ctx-overlay-text) {
    font-size: 12px;
    color: var(--tx-b);
  }

  :global(.ctx-overlay-text code) {
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--input-bg);
    padding: 1px 5px;
    border-radius: 3px;
  }

  :global(.ctx-overlay-checkbox) {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--tx-d);
    cursor: pointer;
  }

  :global(.ctx-overlay-checkbox input[type="checkbox"]) {
    width: 15px;
    height: 15px;
    cursor: pointer;
    accent-color: var(--acc);
  }

  :global(.ctx-overlay-input) {
    width: 100%;
    height: 30px;
    padding: 0 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--bdr);
    background: var(--input-bg);
    color: var(--tx-b);
    font-size: 13px;
    font-family: var(--font-mono);
    outline: none;
  }

  :global(.ctx-overlay-input:focus) {
    border-color: var(--acc);
  }

  :global(.ctx-overlay-actions) {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  :global(.btn-ctx) {
    height: 28px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--bdr);
    background: var(--input-bg);
    color: var(--tx-b);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  :global(.btn-ctx:hover) {
    background: var(--list-hover);
  }

  :global(.btn-ctx-danger) {
    background: var(--danger-bg);
    color: var(--red);
    border-color: rgba(244, 135, 113, 0.3);
  }

  :global(.btn-ctx-danger:hover) {
    background: var(--red);
    color: #fff;
    border-color: var(--red);
  }

  :global(.btn-ctx:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.btn-ctx-danger:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--danger-bg);
    color: var(--red);
  }

  :global(.ctx-overlay-error) {
    font-size: 11px;
    color: var(--red);
    margin: 0;
    padding: 4px 0;
  }
</style>
