<script>
  import { createEventDispatcher } from "svelte";

  export let files = [];
  export let excludes = [];
  export let selectedFile = null;
  export let collapsed = { staged: false, unstaged: false, excluded: false };
  export let commitMessage = "";
  export let loading = false;

  const dispatch = createEventDispatcher();

  $: stagedFiles = files.filter(f => f.staged);
  $: unstagedFiles = files.filter(f => !f.staged);

  function select(item) {
    dispatch("select", item);
  }

  function toggleStage(e, file) {
    e.stopPropagation();
    const action = file.staged ? 'unstage' : 'stage';
    dispatch("toggle-stage", { action, path: file.path });
  }

  function excludeFile(e, file) {
    e.stopPropagation();
    dispatch("manage-exclude", { action: 'add', pattern: file.path });
  }

  function removeExclude(e, pattern) {
    e.stopPropagation();
    dispatch("manage-exclude", { action: 'remove', pattern });
  }

  function toggleCollapse(section) {
      dispatch("toggle-collapse", section);
  }

  function handleCommit() {
      dispatch("commit");
  }

  function getStatusLabel(x, y) {
      if (x === '?' && y === '?') return 'Untracked';
      if (x === 'M') return 'Modified (Staged)';
      if (y === 'M') return 'Modified (Unstaged)';
      if (x === 'A') return 'Added (Staged)';
      if (y === 'A') return 'Added (Unstaged) ';
      if (x === 'D') return 'Deleted (Staged)';
      if (y === 'D') return 'Deleted (Unstaged)';
      return `${x}${y}`;
  }

  function getLetter(f) {
      if (f.untracked) return '?';
      const letter = f.staged ? f.x : f.y;
      return letter !== ' ' ? letter : (f.x !== ' ' ? f.x : f.y);
  }
</script>

<div class="status-sidebar">
  <!-- STAGED SECTION (35%) -->
  <div class="section staged-sec" class:collapsed={collapsed.staged}>
    <div class="header" on:click={() => toggleCollapse('staged')}>
      <span class="chevron">{collapsed.staged ? '▶' : '▼'}</span>
      <span class="title">Staged ({stagedFiles.length})</span>
    </div>
    {#if !collapsed.staged}
      <div class="items">
        {#each stagedFiles as file}
          <div class="file-row" class:active={selectedFile?.path === file.path && selectedFile?.staged}>
            <button class="file-item" on:click={() => select({ path: file.path, staged: true })}>
              <span class="status {getLetter(file)}" title={getStatusLabel(file.x, file.y)}>{getLetter(file)}</span>
              <span class="path">{file.path}</span>
            </button>
            <button class="action-btn unstage" on:click={(e) => toggleStage(e, file)} title="Unstage">−</button>
          </div>
        {/each}
        {#if stagedFiles.length === 0}<div class="empty">No staged changes</div>{/if}
      </div>
    {/if}
  </div>

  <!-- UNSTAGED SECTION (40%) -->
  <div class="section unstaged-sec" class:collapsed={collapsed.unstaged}>
    <div class="header" on:click={() => toggleCollapse('unstaged')}>
      <span class="chevron">{collapsed.unstaged ? '▶' : '▼'}</span>
      <span class="title">Unstaged ({unstagedFiles.length})</span>
    </div>
    {#if !collapsed.unstaged}
      <div class="items">
        {#each unstagedFiles as file}
          <div class="file-row" class:active={selectedFile?.path === file.path && !selectedFile?.staged}>
            <button class="file-item" on:click={() => select({ path: file.path, staged: false })}>
              <span class="status {getLetter(file)}" title={getStatusLabel(file.x, file.y)}>{getLetter(file)}</span>
              <span class="path">{file.path}</span>
            </button>
            <div class="row-actions">
              <button class="action-btn exclude" on:click={(e) => excludeFile(e, file)} title="Exclude">👁️‍🗨️</button>
              <button class="action-btn stage" on:click={(e) => toggleStage(e, file)} title="Stage">+</button>
            </div>
          </div>
        {/each}
        {#if unstagedFiles.length === 0}<div class="empty">No modified files</div>{/if}
      </div>
    {/if}
  </div>

  <!-- EXCLUDED SECTION (25%) -->
  <div class="section excluded-sec" class:collapsed={collapsed.excluded}>
    <div class="header" on:click={() => toggleCollapse('excluded')}>
      <span class="chevron">{collapsed.excluded ? '▶' : '▼'}</span>
      <span class="title">Local Exclusions ({excludes.length})</span>
    </div>
    {#if !collapsed.excluded}
      <div class="items">
        {#each excludes as pattern}
          <div class="file-row">
            <div class="file-item inert">
              <span class="status X">X</span>
              <span class="path">{pattern}</span>
            </div>
            <button class="action-btn remove-exclude" on:click={(e) => removeExclude(e, pattern)} title="Remove">×</button>
          </div>
        {/each}
        {#if excludes.length === 0}<div class="empty">No exclusions</div>{/if}
      </div>
    {/if}
  </div>

  <!-- COMMIT FOOTER -->
  <div class="commit-footer">
      <textarea 
        bind:value={commitMessage} 
        placeholder="Commit message..."
        class="commit-input"
        on:keydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCommit(); }}
      ></textarea>
      <div class="commit-actions-bar">
          <div class="staged-info">
              {stagedFiles.length} staged
          </div>
          <button 
            class="commit-btn" 
            on:click={handleCommit} 
            disabled={loading || !commitMessage.trim() || stagedFiles.length === 0}
          >
            🚀 Commit
          </button>
      </div>
  </div>
</div>

<style>
  .status-sidebar {
    background: var(--surface);
    border-right: 1px solid var(--bdr);
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section {
      display: flex;
      flex-direction: column;
      min-height: 40px;
      overflow: hidden;
      border-bottom: 1px solid var(--bdr);
  }

  /* Percentage Heights (Adjusted to leave room for footer) */
  .staged-sec { height: 32%; }
  .unstaged-sec { height: 38%; }
  .excluded-sec { height: 20%; border-bottom: none; }

  .section.collapsed {
      height: 40px !important;
      flex: none !important;
  }

  .commit-footer {
      height: 120px;
      flex-shrink: 0;
      background: var(--surface-h);
      border-top: 2px solid var(--bdr-l);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
  }

  .commit-input {
      flex: 1;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--bdr);
      border-radius: 6px;
      padding: 8px 10px;
      color: var(--tx-b);
      font-family: inherit;
      font-size: 12px;
      resize: none;
      outline: none;
      transition: border-color 0.2s;
  }
  .commit-input:focus { border-color: var(--acc); }

  .commit-actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }

  .staged-info { font-size: 10px; color: var(--tx-d); font-weight: 600; }

  .commit-btn {
      background: var(--acc);
      color: #fff;
      border: none;
      padding: 6px 16px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
  }
  .commit-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.1); }
  .commit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .header {
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tx-d);
    background: var(--surface-h);
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }
  .header:hover { background: var(--bdr); color: var(--tx-b); }
  .staged-sec .header { color: var(--acc); background: rgba(129, 140, 248, 0.05); }

  .chevron { font-size: 8px; opacity: 0.5; width: 10px; }

  .items {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .empty { padding: 16px; text-align: center; font-size: 11px; color: var(--tx-d); font-style: italic; }

  .file-row { display: flex; align-items: center; border-radius: 4px; transition: all 0.15s; margin-bottom: 1px; }
  .file-row:hover { background: var(--surface-h); }
  .file-row.active { background: var(--acc-bg); }

  .file-item {
    flex: 1;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }
  .file-item.inert { cursor: default; }

  .row-actions { display: flex; gap: 2px; opacity: 0; }
  .file-row:hover .row-actions { opacity: 1; }

  .action-btn {
    background: transparent;
    border: none;
    color: var(--tx-d);
    width: 28px;
    height: 28px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }
  .action-btn:hover { background: rgba(255,255,255,0.05); }
  .action-btn.stage:hover { color: var(--acc); }
  .action-btn.unstage { opacity: 0; }
  .file-row:hover .action-btn.unstage { opacity: 1; }
  .action-btn.unstage:hover { color: var(--red); }
  .action-btn.remove-exclude { opacity: 0; }
  .file-row:hover .action-btn.remove-exclude { opacity: 1; }

  .status {
    width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
    border-radius: 3px; font-size: 9px; font-weight: 800; flex-shrink: 0;
  }
  .status.M { color: #d29922; background: rgba(210, 153, 34, 0.1); }
  .status.A { color: #3fb950; background: rgba(63, 185, 80, 0.1); }
  .status.D { color: #f85149; background: rgba(248, 81, 73, 0.1); }
  .status.\? { color: #7d8590; background: rgba(125, 133, 144, 0.1); }
  .status.X { color: var(--tx-d); background: rgba(255,255,255,0.05); }

  .path { font-size: 11px; color: var(--tx-b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono', monospace; }
</style>
