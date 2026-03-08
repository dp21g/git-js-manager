<script>
  import { createEventDispatcher } from "svelte";

  export let files = [];
  export let selectedFile = null;

  const dispatch = createEventDispatcher();

  function select(file) {
    dispatch("select", file);
  }

  function handleReverseFile(e, file) {
    e.stopPropagation();
    dispatch("reverse-file", file);
  }

  function getStatusLabel(status) {
    const map = {
      'A': 'Added',
      'M': 'Modified',
      'D': 'Deleted',
      'R': 'Renamed',
      'C': 'Copied'
    };
    return map[status[0]] || status;
  }
</script>

<div class="file-list">
  <div class="header">
    Changed Files ({files.length})
  </div>
  <div class="items">
    {#each files as file}
      <div class="file-row" class:active={selectedFile === file.path}>
        <button 
          class="file-item" 
          on:click={() => select(file.path)}
        >
          <span class="status {file.status[0]}" title={getStatusLabel(file.status)}>
            {file.status[0]}
          </span>
          <span class="path">{file.path}</span>
        </button>
        <button class="reverse-file-btn" on:click={(e) => handleReverseFile(e, file.path)} title="Reverse all changes to this file from selection">
          ↩
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .file-list {
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tx-d);
    border-bottom: 1px solid var(--bdr);
    background: var(--surface-h);
  }

  .items {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .file-row {
    display: flex;
    align-items: center;
    border-radius: 6px;
    transition: all 0.15s;
    margin-bottom: 2px;
  }

  .file-row:hover {
    background: var(--surface-h);
  }

  .file-row.active {
    background: var(--acc-bg);
  }

  .file-item {
    flex: 1;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .reverse-file-btn {
    background: transparent;
    border: none;
    color: var(--tx-d);
    padding: 8px 12px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-row:hover .reverse-file-btn {
    opacity: 1;
  }

  .reverse-file-btn:hover {
    color: var(--red);
  }

  .status {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
    flex-shrink: 0;
  }

  .status.A { color: #3fb950; background: rgba(63, 185, 80, 0.1); }
  .status.M { color: #d29922; background: rgba(210, 153, 34, 0.1); }
  .status.D { color: #f85149; background: rgba(248, 81, 73, 0.1); }
  .status.R { color: #a371f7; background: rgba(163, 113, 247, 0.1); }

  .path {
    font-size: 12px;
    color: var(--tx-b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
  }
</style>
