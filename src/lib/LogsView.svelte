<script>
  import { createEventDispatcher } from "svelte";

  export let logs = [];
  export let branchName = "";
  export let floatingEnabled = true;

  const dispatch = createEventDispatcher();

  function formatTime(value) {
    if (!value) return "--:--:--";
    return new Date(value).toLocaleTimeString([], { hour12: false });
  }
</script>

<div class="logs-view">
  <div class="logs-header">
    <div class="logs-title-block">
      <div class="logs-eyebrow">Execution History</div>
      <h2>Logs</h2>
      <div class="logs-subtitle">
        <span class="branch">🌿 {branchName || "No active branch"}</span>
        <span class="count">{logs.length} entries</span>
      </div>
    </div>

    <div class="logs-actions">
      <button class="btn btn-ghost" on:click={() => dispatch("refresh")}>
        ↻ Refresh
      </button>
      <button class="btn btn-accent" on:click={() => dispatch("toggle-floating")}>
        {floatingEnabled ? "Disable Floating Panel" : "Enable Floating Panel"}
      </button>
    </div>
  </div>

  <div class="logs-body">
    {#if logs.length === 0}
      <div class="empty">No execution logs yet.</div>
    {:else}
      {#each logs as log}
        <div class="entry {log.type}">
          <div class="meta">
            <span class="time">{formatTime(log.timestamp || log.time)}</span>
            <span class="type-badge">{log.type}</span>
          </div>
          <div class="text">{log.message}</div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .logs-view {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 0 20px 20px;
  }

  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 24px;
    border: 1px solid var(--bdr);
    border-radius: 14px;
    background:
      radial-gradient(circle at top left, rgba(88, 166, 255, 0.14), transparent 36%),
      linear-gradient(180deg, var(--surface), var(--surface-h));
  }

  .logs-title-block h2 {
    margin: 4px 0 0;
    font-size: 28px;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .logs-eyebrow {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--tx-d);
  }

  .logs-subtitle {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
    font-size: 12px;
    color: var(--tx-d);
  }

  .branch {
    color: var(--acc);
    font-weight: 700;
  }

  .count {
    font-weight: 600;
  }

  .logs-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }

  .logs-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
    border: 1px solid var(--bdr);
    border-radius: 14px;
    background: var(--surface);
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    margin-bottom: 10px;
    font-size: 12px;
    border-radius: 10px;
    border: 1px solid var(--bdr);
    background: rgba(255, 255, 255, 0.02);
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .time {
    color: var(--tx-d);
    white-space: nowrap;
    opacity: 0.7;
  }

  .type-badge {
    text-transform: uppercase;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 999px;
    opacity: 0.8;
    letter-spacing: 0.08em;
  }

  .entry.error {
    border-color: rgba(248, 81, 73, 0.28);
    background: rgba(248, 81, 73, 0.06);
  }

  .entry.error .type-badge {
    color: #f85149;
    background: rgba(248, 81, 73, 0.12);
  }

  .entry.error .text {
    color: #f85149;
  }

  .entry.info .type-badge {
    color: #58a6ff;
    background: rgba(88, 166, 255, 0.12);
  }

  .entry.success {
    border-color: rgba(63, 185, 80, 0.28);
    background: rgba(63, 185, 80, 0.06);
  }

  .entry.success .type-badge {
    color: #3fb950;
    background: rgba(63, 185, 80, 0.12);
  }

  .entry.success .text {
    color: #3fb950;
  }

  .text {
    color: var(--tx-b);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .empty {
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--tx-d);
    font-style: italic;
    font-size: 13px;
  }

  @media (max-width: 860px) {
    .logs-view {
      padding: 0 12px 12px;
    }

    .logs-header {
      padding: 18px;
      flex-direction: column;
    }

    .logs-title-block h2 {
      font-size: 24px;
    }

    .logs-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
