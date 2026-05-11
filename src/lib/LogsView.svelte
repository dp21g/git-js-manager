<script>
  import { createEventDispatcher } from "svelte";
  import ExecutionLogEntry from "./ExecutionLogEntry.svelte";

  export let logs = [];
  export let branchName = "";
  export let floatingEnabled = true;

  const dispatch = createEventDispatcher();
  let bodyEl;

  $: orderedLogs = logs;
  $: if (orderedLogs.length && bodyEl) {
    bodyEl.scrollTop = 0;
  }
</script>

<div class="logs-view">
  <div class="logs-header">
    <div class="logs-title-block">
      <div class="logs-eyebrow">Execution Console</div>
      <h2>Command Transcript</h2>
      <div class="logs-subtitle">
        <span class="branch-chip">Branch: {branchName || "No active branch"}</span>
        <span class="count">{logs.length} captured events</span>
        <span class="hint">Commands, stdout, stderr, and durations are shown inline.</span>
      </div>
    </div>

    <div class="logs-actions">
      <button class="btn btn-ghost" on:click={() => dispatch("refresh")}>
        ↻ Refresh
      </button>
      <button class={`btn ${floatingEnabled ? "btn-ghost" : "btn-primary"}`} on:click={() => dispatch("toggle-floating")}>
        {floatingEnabled ? "Disable Floating Panel" : "Enable Floating Panel"}
      </button>
    </div>
  </div>

  <div class="terminal-frame">
    <div class="terminal-titlebar">
      <div class="terminal-dots" aria-hidden="true">
        <span class="dot red"></span>
        <span class="dot amber"></span>
        <span class="dot green"></span>
      </div>
      <div class="terminal-label">git-squash-ui console</div>
      <div class="terminal-meta">latest at the top</div>
    </div>

    <div class="logs-body" bind:this={bodyEl}>
      {#if orderedLogs.length === 0}
        <div class="empty">
          <div class="empty-title">No execution logs yet.</div>
          <div class="empty-copy">Run an action like refresh, compare, branch switch, commit, or stash apply to populate the console.</div>
        </div>
      {:else}
        {#each orderedLogs as log (log.id)}
          <ExecutionLogEntry {log} />
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .logs-view {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 0 20px 20px;
  }

  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 22px 24px;
    border: 1px solid var(--bdr);
    border-radius: 14px;
    background: linear-gradient(180deg, var(--surface), var(--surface-h));
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

  .branch-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--terminal-chip-bg);
    color: var(--terminal-chip-text);
    font-weight: 700;
  }

  .count {
    font-weight: 700;
  }

  .logs-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }

  .terminal-frame {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--terminal-border);
    border-radius: 16px;
    overflow: hidden;
    background: var(--terminal-raised-bg);
    box-shadow: 0 18px 36px rgba(0, 0, 0, 0.2);
  }

  .terminal-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--terminal-border);
    background: var(--terminal-titlebar-bg);
    color: var(--terminal-muted);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .terminal-dots {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
  }

  .dot.red {
    background: #ff5f56;
  }

  .dot.amber {
    background: #ffbd2e;
  }

  .dot.green {
    background: #27c93f;
  }

  .terminal-label {
    flex: 1;
    min-width: 0;
    color: var(--terminal-text);
  }

  .terminal-meta {
    flex-shrink: 0;
  }

  .logs-body {
    flex: 1;
    min-height: 0;
    overflow-y: scroll;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: var(--terminal-bg);
  }

  .logs-body::-webkit-scrollbar {
    width: 8px;
  }

  .logs-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .logs-body::-webkit-scrollbar-thumb {
    background: var(--terminal-border);
    border-radius: 4px;
  }

  .logs-body::-webkit-scrollbar-thumb:hover {
    background: var(--terminal-muted);
  }

  .empty {
    min-height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    color: var(--terminal-muted);
    padding: 24px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--terminal-text);
  }

  .empty-copy {
    max-width: 480px;
    font-size: 12px;
    line-height: 1.5;
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

    .terminal-titlebar {
      flex-wrap: wrap;
    }

    .terminal-meta {
      width: 100%;
    }
  }
</style>
