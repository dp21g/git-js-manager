<script>
  export let log = {};
  export let compact = false;

  function formatTime(value) {
    if (!value) return "--:--:--";
    return new Date(value).toLocaleTimeString([], { hour12: false });
  }

  function formatDuration(value) {
    if (!Number.isFinite(value) || value < 0) return "";
    if (value < 1000) return `${Math.round(value)} ms`;

    const seconds = value / 1000;
    if (seconds < 60) {
      return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)} s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }

  $: timestamp = log.timestamp || log.time || "";
  $: durationLabel = formatDuration(log.durationMs);
  $: tone = log.type || "info";
  $: kind = log.kind || "message";
  $: hasStdout = Boolean(log.stdout);
  $: hasStderr = Boolean(log.stderr);
  $: exitLabel =
    log.exitCode === null || log.exitCode === undefined ? "" : `exit ${log.exitCode}`;
</script>

<article class="entry" class:compact class:command={kind === "command"} data-tone={tone}>
  <div class="entry-top">
    <div class="entry-meta">
      <span class="time">{formatTime(timestamp)}</span>
      <span class="badge">{kind === "command" ? (log.runner || "command") : tone}</span>
      {#if durationLabel}
        <span class="duration">{durationLabel}</span>
      {/if}
      {#if exitLabel}
        <span class="exit" class:error={log.exitCode !== 0}>{exitLabel}</span>
      {/if}
    </div>

    {#if log.cwd}
      <div class="cwd" title={log.cwd}>{log.cwd}</div>
    {/if}
  </div>

  {#if kind === "command"}
    {#if log.message}
      <div class="summary">{log.message}</div>
    {/if}

    <pre class="block command-line"><span class="prompt">$</span> {log.command}</pre>

    {#if hasStdout}
      <pre class="block stdout">{log.stdout}</pre>
    {/if}

    {#if hasStderr}
      <pre class="block stderr">{log.stderr}</pre>
    {/if}

    {#if !hasStdout && !hasStderr}
      <pre class="block muted">Command completed without output.</pre>
    {/if}
  {:else}
    <pre class="block message">{log.message}</pre>
  {/if}
</article>

<style>
  .entry {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--terminal-border);
    background: var(--terminal-line-bg);
    color: var(--terminal-text);
  }

  .entry.compact {
    padding: 10px 11px;
    gap: 6px;
    border-radius: 10px;
  }

  .entry[data-tone="error"] {
    border-color: rgba(255, 123, 114, 0.28);
  }

  .entry[data-tone="success"] {
    border-color: rgba(63, 185, 80, 0.28);
  }

  .entry-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .entry-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }

  .time,
  .duration,
  .exit,
  .cwd {
    font-size: 11px;
    color: var(--terminal-muted);
  }

  .exit.error {
    color: var(--terminal-error);
  }

  .badge {
    padding: 2px 7px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 9px;
    font-weight: 700;
    background: var(--terminal-chip-bg);
    color: var(--terminal-chip-text);
  }

  .cwd {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  .summary {
    font-size: 12px;
    color: var(--terminal-text);
  }

  .block {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    font-size: 12px;
    font-family: var(--font-mono);
  }

  .entry.compact .block {
    font-size: 11px;
  }

  .command-line {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--terminal-command-bg);
    color: var(--terminal-command);
  }

  .prompt {
    color: var(--terminal-success);
  }

  .stdout,
  .stderr,
  .message,
  .muted {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--terminal-bg);
    color: var(--terminal-text);
  }

  .stderr {
    color: var(--terminal-error);
  }

  .muted {
    color: var(--terminal-muted);
  }
</style>
