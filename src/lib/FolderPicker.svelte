<script>
  import { createEventDispatcher, onMount } from "svelte";
  import { listDir, setRepo, nativeDialog, toggleFavourite } from "./api.js";
  import { showToast } from "./toast.js";
  import { shortPath } from "./path.js";

  export let initialPath = "";
  export let folderConfig = { recentDirs: [], favouriteDirs: [], configPath: "" };

  const dispatch = createEventDispatcher();

  let current = "";
  let parent = "";
  let dirs = [];
  let isGit = false;

  onMount(() => browse(initialPath));

  async function browse(p) {
    const data = await listDir(p);
    if (data.error) { showToast(data.error, "err"); return; }
    current = data.current;
    parent = data.parent;
    dirs = data.dirs;
    isGit = data.isGit;
  }

  async function selectDir(dir) {
    if (dir.isGit) {
      const r = await setRepo(dir.path);
      if (r.error) { showToast(r.error, "err"); return; }
      dispatch("config-changed");
      dispatch("repo-selected", { path: r.path });
    } else {
      browse(dir.path);
    }
  }

  async function useThis() {
    const r = await setRepo(current);
    if (r.error) { showToast(r.error, "err"); return; }
    dispatch("config-changed");
    dispatch("repo-selected", { path: r.path });
  }

  async function openNative() {
    const r = await nativeDialog();
    if (r.error) {
      if (r.error !== "Cancelled") showToast(r.error, "err");
      return;
    }
    showToast("Opened: " + r.path);
    dispatch("config-changed");
    dispatch("repo-selected", { path: r.path });
  }

  async function toggleFav(path) {
    const r = await toggleFavourite(path);
    if (r.error) { showToast(r.error, "err"); return; }
    folderConfig = { ...folderConfig, recentDirs: r.recentDirs, favouriteDirs: r.favouriteDirs };
    showToast(r.favourite ? "Added to favourites" : "Removed from favourites");
    dispatch("config-changed");
  }

  async function openSavedRepo(path) {
    const r = await setRepo(path);
    if (r.error) { showToast(r.error, "err"); return; }
    dispatch("config-changed");
    dispatch("repo-selected", { path: r.path || path });
  }

  const isFavourite = (path) => folderConfig.favouriteDirs.includes(path);
</script>

<div class="picker">
  <h2>Select a Git Repository</h2>
  <p class="hint">Browse to a folder containing a .git directory, or use the native dialog.</p>

  <div class="native">
    <button class="btn btn-accent" on:click={openNative}>Open Folder Dialog</button>
    <span class="or">or browse below</span>
  </div>

  {#if folderConfig.configPath}
    <p class="hint config-path">Saved locally in {folderConfig.configPath}</p>
  {/if}

  {#if folderConfig.favouriteDirs.length > 0 || folderConfig.recentDirs.length > 0}
    <div class="saved-grid">
      <div class="saved-card">
        <div class="saved-title">Favourites</div>
        {#if folderConfig.favouriteDirs.length === 0}
          <div class="saved-empty">No favourites yet</div>
        {:else}
          {#each folderConfig.favouriteDirs as fav}
            <div class="saved-item">
              <button class="saved-link" on:click={() => openSavedRepo(fav)}>{shortPath(fav)}</button>
              <button class="btn btn-ghost btn-sm" on:click={() => toggleFav(fav)}>★</button>
            </div>
          {/each}
        {/if}
      </div>

      <div class="saved-card">
        <div class="saved-title">Recent</div>
        {#if folderConfig.recentDirs.length === 0}
          <div class="saved-empty">No recent repos yet</div>
        {:else}
          {#each folderConfig.recentDirs as recent}
            <div class="saved-item">
              <button class="saved-link" on:click={() => openSavedRepo(recent)}>{shortPath(recent)}</button>
              <button class="btn btn-ghost btn-sm" on:click={() => toggleFav(recent)}>{isFavourite(recent) ? "★" : "☆"}</button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <div class="nav">
    <button class="btn btn-ghost btn-sm" on:click={() => browse(parent)}>↑ Parent</button>
    <div class="path">{current}</div>
    {#if isGit}
      <button class="btn btn-primary btn-sm" on:click={useThis}>Use This Repo</button>
    {/if}
  </div>

  <div class="list">
    {#if dirs.length === 0}
      <div class="empty">No subdirectories</div>
    {/if}
    {#each dirs as dir}
      <button class="item" class:git={dir.isGit} on:click={() => selectDir(dir)}>
        <span class="icon">{dir.isGit ? "⬡" : "▸"}</span>
        <span class="name">{dir.name}</span>
        {#if dir.isGit}
          <button class="star" on:click|stopPropagation={() => toggleFav(dir.path)}>{isFavourite(dir.path) ? "★" : "☆"}</button>
          <span class="git-label">git repo</span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .picker { padding: 32px 0; }
  h2 { font-size: 16px; color: var(--tx-b); margin-bottom: 4px; }
  .hint { font-size: 12px; color: var(--tx-d); margin-bottom: 20px; }
  .config-path { margin-top: -10px; margin-bottom: 16px; }

  .native { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .or { font-size: 11px; color: var(--tx-d); }

  .saved-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  .saved-card {
    background: var(--surface); border: 1px solid var(--bdr); border-radius: 8px; padding: 12px;
  }
  .saved-title { color: var(--tx-b); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .saved-empty { color: var(--tx-d); font-size: 12px; }
  .saved-item { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .saved-item:last-child { margin-bottom: 0; }
  .saved-link {
    flex: 1; background: transparent; border: 1px solid var(--bdr); color: var(--acc);
    border-radius: 6px; padding: 7px 10px; text-align: left; font-size: 12px;
  }
  .saved-link:hover { background: var(--surface-h); }

  .nav {
    display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
  }
  .path {
    flex: 1; padding: 8px 12px; background: var(--surface);
    border: 1px solid var(--bdr); border-radius: 6px;
    color: var(--acc); font-size: 12px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .list {
    border: 1px solid var(--bdr); border-radius: 8px;
    max-height: 400px; overflow-y: auto;
  }
  .empty { padding: 20px; text-align: center; color: var(--tx-d); font-size: 12px; }

  .item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 8px 14px; border: none;
    border-bottom: 1px solid var(--bdr); background: transparent;
    font-family: inherit; font-size: 12px; text-align: left;
    transition: background 0.1s;
  }
  .item:last-child { border-bottom: none; }
  .item:hover { background: var(--surface-h); }
  .icon { color: var(--amb); flex-shrink: 0; }
  .item.git .icon { color: var(--grn); }
  .name { color: var(--tx-b); }
  .item.git .name { color: var(--grn); }
  .star {
    margin-left: auto; background: transparent; border: none; color: var(--amb);
    font-size: 15px; padding: 2px 6px;
  }
  .git-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--grn); background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.2);
    padding: 1px 6px; border-radius: 3px; margin-left: auto;
  }
  @media (max-width: 700px) {
    .saved-grid { grid-template-columns: 1fr; }
  }
</style>
