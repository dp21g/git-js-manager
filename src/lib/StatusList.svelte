<script>
  import { createEventDispatcher } from "svelte";
  import StashList from "./StashList.svelte";

  export let files = [];
  export let unpushedCommits = [];
  export let stashes = [];
  export let excludes = [];
  export let selectedFile = null;
  export let selectedStashRef = "";
  export let applyingStashRef = "";
  export let collapsed = { unpushed: false, stashes: true, staged: false, unstaged: false, excluded: false };

  export let commitMessage = "";
  export let loading = false;
  let editingCommitHash = null;
  let renameMessage = "";

  const dispatch = createEventDispatcher();

  $: stagedFiles = files.filter(f => f.staged);
  $: unstagedFiles = files.filter(f => f.unstaged || f.untracked);
  $: if (editingCommitHash && !unpushedCommits.some((commit) => commit.hash === editingCommitHash)) {
      editingCommitHash = null;
      renameMessage = "";
  }

  function select(item) {
    dispatch("select", item);
  }

  function toggleStage(e, file) {
    e.stopPropagation();
    const action = file.staged ? 'unstage' : 'stage';
    dispatch("toggle-stage", { action, path: file.path });
  }

  function stageFile(e, file) {
    e.stopPropagation();
    dispatch("toggle-stage", { action: 'stage', path: file.path });
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

  function handlePush() {
      dispatch("push");
  }

  function startRename(e, commit) {
      e.stopPropagation();
      editingCommitHash = commit.hash;
      renameMessage = commit.fullMessage || commit.message || "";
  }

  function cancelRename(e) {
      e?.stopPropagation();
      editingCommitHash = null;
      renameMessage = "";
  }

  function saveRename(e, commit) {
      e.stopPropagation();
      dispatch("rename-commit", { hash: commit.hash, message: renameMessage });
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

  function getUnstagedLetter(f) {
      if (f.untracked) return '?';
      return f.y !== ' ' ? f.y : f.x;
  }
</script>

<div class="status-sidebar">
  <!-- UNPUSHED SECTION (25%) -->
  <div class="section unpushed-sec" class:collapsed={collapsed.unpushed}>
    <div 
        class="header" 
        on:click={() => toggleCollapse('unpushed')}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapse('unpushed')}
        role="button"
        tabindex="0"
    >
      <span class="chevron">{collapsed.unpushed ? '▶' : '▼'}</span>
      <span class="title">Local Commits ({unpushedCommits.length})</span>
    </div>

    {#if !collapsed.unpushed}
      <div class="items">
        {#each unpushedCommits as commit}
          <div class="file-row commit-row" class:editing={editingCommitHash === commit.hash}>
            <div class="commit-summary">
              <div class="file-item inert">
                <span class="status UP" title="Local commit">↑</span>
                <span class="path unpushed-msg">{commit.message}</span>
              </div>
              <div class="commit-actions">
                <span class="hash-label">{commit.shortHash || commit.hash}</span>
                <button
                  class="action-btn rename"
                  on:click={(e) => startRename(e, commit)}
                  title="Rename commit message"
                  disabled={loading}
                >
                  ✎
                </button>
              </div>
            </div>

            {#if editingCommitHash === commit.hash}
              <div class="rename-panel">
                <label class="rename-label" for={"rename-" + commit.hash}>Commit Message</label>
                <textarea
                  id={"rename-" + commit.hash}
                  bind:value={renameMessage}
                  class="rename-input"
                  rows="4"
                  disabled={loading}
                  on:click|stopPropagation
                  on:keydown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveRename(e, commit);
                    if (e.key === "Escape") cancelRename(e);
                  }}
                ></textarea>
                <div class="rename-actions">
                  <span class="rename-hint">This rewrites local commit history only.</span>
                  <div class="rename-buttons">
                    <button class="btn btn-ghost btn-sm" on:click={cancelRename} disabled={loading}>Cancel</button>
                    <button
                      class="btn btn-accent btn-sm"
                      on:click={(e) => saveRename(e, commit)}
                      disabled={loading || !renameMessage.trim()}
                    >
                      {loading ? "Saving..." : "Save Rename"}
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/each}
        {#if unpushedCommits.length === 0}<div class="empty">No local commits to rename or push</div>{/if}
      </div>
    {/if}
  </div>

  <div class="section staged-sec" class:collapsed={collapsed.staged}>
    <div 
        class="header" 
        on:click={() => toggleCollapse('staged')}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapse('staged')}
        role="button"
        tabindex="0"
    >
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
    <div 
        class="header" 
        on:click={() => toggleCollapse('unstaged')}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapse('unstaged')}
        role="button"
        tabindex="0"
    >
      <span class="chevron">{collapsed.unstaged ? '▶' : '▼'}</span>
      <span class="title">Unstaged ({unstagedFiles.length})</span>
    </div>

    {#if !collapsed.unstaged}
      <div class="items">
        {#each unstagedFiles as file}
          <div class="file-row" class:active={selectedFile?.path === file.path && !selectedFile?.staged}>
            <button class="file-item" on:click={() => select({ path: file.path, staged: false })}>
              <span class="status {getUnstagedLetter(file)}" title={getStatusLabel(file.x, file.y)}>{getUnstagedLetter(file)}</span>
              <span class="path">{file.path}</span>
              {#if file.staged}
                <span class="also-staged-badge" title="Also has staged changes">staged</span>
              {/if}
            </button>
            <div class="row-actions">
              <button class="action-btn exclude" on:click={(e) => excludeFile(e, file)} title="Exclude">👁️‍🗨️</button>
              <button class="action-btn stage" on:click={(e) => stageFile(e, file)} title="Stage">+</button>
            </div>
          </div>
        {/each}
        {#if unstagedFiles.length === 0}<div class="empty">No modified files</div>{/if}
      </div>
    {/if}
  </div>

  <!-- EXCLUDED SECTION (25%) -->
  <div class="section excluded-sec" class:collapsed={collapsed.excluded}>
    <div 
        class="header" 
        on:click={() => toggleCollapse('excluded')}
        on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapse('excluded')}
        role="button"
        tabindex="0"
    >
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

  <div class="section stash-sec" class:collapsed={collapsed.stashes}>
    <StashList
      embedded={true}
      {stashes}
      selectedRef={selectedStashRef}
      collapsed={collapsed.stashes}
      loading={Boolean(applyingStashRef)}
      applyingRef={applyingStashRef}
      on:toggle-collapse={() => toggleCollapse('stashes')}
      on:select={(e) => dispatch("select-stash", e.detail)}
      on:apply={(e) => dispatch("apply-stash", e.detail)}
    />
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
            class:commit-btn={true} 
            on:click={handleCommit} 
            disabled={loading || !commitMessage.trim() || stagedFiles.length === 0}
          >
            🚀 Commit
          </button>
          {#if unpushedCommits.length > 0}
              <button 
                class="push-btn" 
                on:click={handlePush} 
                disabled={loading}
              >
                ↑ Push ({unpushedCommits.length})
              </button>
          {/if}
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

  .unpushed-sec { flex: 2.2 1 0; min-height: 140px; }
  .staged-sec { flex: 1.4 1 0; min-height: 96px; }
  .unstaged-sec { flex: 1.9 1 0; min-height: 112px; }
  .excluded-sec { flex: 0.9 1 0; min-height: 76px; }
  .stash-sec { flex: 2.8 1 0; min-height: 160px; border-bottom: none; }


  .section.collapsed {
      height: 32px !important;
      flex: none !important;
      min-height: 32px !important;
  }

  .commit-footer {
      height: 100px;
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

  .push-btn {
      background: #238636;
      color: #fff;
      border: none;
      padding: 6px 16px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
  }
  .push-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.1); }
  .push-btn:disabled { opacity: 0.4; cursor: not-allowed; }


  .header {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--tx-d);
    background: var(--surface-h);
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }
  .header:hover { background: var(--bdr); color: var(--tx-b); }
  .staged-sec .header { color: var(--acc-soft-fg); background: var(--acc-bg); }

  .chevron { font-size: 8px; opacity: 0.5; width: 10px; }

  .unpushed-sec .header { color: #58a6ff; background: rgba(88, 166, 255, 0.05); }
  .unpushed-msg { opacity: 0.9; }
  .hash-label { font-size: 9px; color: var(--tx-d); font-family: 'JetBrains Mono', monospace; opacity: 0.8; }
  .status.UP { color: #58a6ff; background: rgba(88, 166, 255, 0.1); }


  .items {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .empty { padding: 16px; text-align: center; font-size: 11px; color: var(--tx-d); font-style: italic; }

  .file-row { display: flex; align-items: center; border-radius: 4px; transition: all 0.15s; margin-bottom: 1px; }
  .file-row:hover { background: var(--surface-h); }
  .file-row.active { background: var(--acc-bg); }

  .commit-row {
    flex-direction: column;
    align-items: stretch;
    border-radius: 10px;
    margin-bottom: 6px;
  }

  .commit-row.editing {
    background: rgba(88, 166, 255, 0.06);
    border: 1px solid rgba(88, 166, 255, 0.18);
  }

  .commit-summary {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .commit-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 8px;
    flex-shrink: 0;
  }

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
  .action-btn.rename { opacity: 0; transition: opacity 0.2s, background 0.2s, color 0.2s; }
  .commit-row:hover .action-btn.rename,
  .commit-row.editing .action-btn.rename { opacity: 1; }
  .action-btn.rename:hover { color: var(--acc); }
  .action-btn.stage:hover { color: var(--acc); }
  .action-btn.unstage { opacity: 0; }
  .file-row:hover .action-btn.unstage { opacity: 1; }
  .action-btn.unstage:hover { color: var(--red); }
  .action-btn.remove-exclude { opacity: 0; }
  .file-row:hover .action-btn.remove-exclude { opacity: 1; }

  .rename-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 10px 12px 38px;
  }

  .rename-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--tx-d);
  }

  .rename-input {
    width: 100%;
    min-height: 88px;
    resize: vertical;
    border-radius: 8px;
    border: 1px solid rgba(88, 166, 255, 0.18);
    background: rgba(0, 0, 0, 0.16);
    color: var(--tx-b);
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.45;
    font-family: inherit;
    outline: none;
  }

  .rename-input:focus {
    border-color: var(--acc);
    box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.18);
  }

  .rename-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .rename-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .rename-hint {
    font-size: 10px;
    color: var(--tx-d);
  }

  .status {
    width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
    border-radius: 3px; font-size: 9px; font-weight: 800; flex-shrink: 0;
  }
  .status.M { color: var(--amb); background: var(--amb-bg); }
  .status.A { color: var(--grn); background: var(--grn-bg); }
  .status.D { color: var(--red); background: rgba(248, 81, 73, 0.1); }
  .status.\? { color: var(--tx-d); background: var(--surface-h); }
  .status.X { color: var(--tx-d); background: var(--surface-h); }

  .path { font-size: 11px; color: var(--tx-b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono', monospace; }
</style>
