<script>
  export let logs = [];
  let expanded = false;

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class="log-panel" class:expanded>
  <button class="toggle-btn" on:click={toggle}>
    <span class="icon">📋</span>
    <span class="label">Execution Log</span>
    <span class="count">{logs.length}</span>
    <span class="arrow">{expanded ? '▼' : '▲'}</span>
  </button>

  {#if expanded}
    <div class="content">
      {#each logs as log}
        <div class="entry {log.type}">
          <div class="meta">
            <span class="time">{new Date(log.timestamp || log.time).toLocaleTimeString([], { hour12: false })}</span>
            <span class="type-badge">{log.type}</span>
          </div>
          <span class="text">{log.message}</span>
        </div>
      {/each}
      {#if logs.length === 0}
        <div class="empty">No execution logs yet.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .log-panel {
    position: fixed;
    bottom: 40px;
    right: 24px;
    width: 280px;
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 1000;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    max-height: 48px;
  }

  .log-panel.expanded {
    width: 450px;
    max-height: 420px;
  }

  .toggle-btn {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--tx-b);
    font-size: 13px;
    font-weight: 600;
  }

  .toggle-btn:hover {
    background: var(--surface-h);
  }

  .icon { font-size: 16px; }
  .label { flex: 1; text-align: left; }
  .count {
    font-size: 10px;
    background: var(--bdr);
    padding: 2px 6px;
    border-radius: 10px;
    color: var(--tx-d);
  }
  .arrow { opacity: 0.5; font-size: 10px; }

  .content {
    height: 360px;
    overflow-y: auto;
    padding: 12px;
    border-top: 1px solid var(--bdr);
    background: var(--surface-d);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    margin-bottom: 8px;
    font-size: 11px;
    border-radius: 6px;
    border: 1px solid var(--bdr);
    background: rgba(255,255,255,0.02);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .time { color: var(--tx-d); white-space: nowrap; opacity: 0.6; }
  
  .type-badge {
    text-transform: uppercase;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    opacity: 0.7;
  }

  .entry.error { border-color: rgba(248, 81, 73, 0.3); background: rgba(248, 81, 73, 0.05); }
  .entry.error .type-badge { color: #f85149; background: rgba(248, 81, 73, 0.1); }
  .entry.error .text { color: #f85149; }

  .entry.info .type-badge { color: #58a6ff; background: rgba(88, 166, 255, 0.1); }
  
  .entry.success { border-color: rgba(63, 185, 80, 0.3); background: rgba(63, 185, 80, 0.05); }
  .entry.success .type-badge { color: #3fb950; background: rgba(63, 185, 80, 0.1); }
  .entry.success .text { color: #3fb950; }

  .text { word-break: break-all; line-height: 1.4; color: var(--tx-b); }

  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--tx-d);
    font-style: italic;
    font-size: 12px;
  }
</style>