<script>
  export let info;

  const statusTone = (branch) => {
    if (!branch.hasUpstream) return "muted";
    if (branch.ahead || branch.behind) return "warn";
    return "ok";
  };

  const statusText = (branch) => {
    if (!branch.hasUpstream) return "no upstream";
    if (!branch.ahead && !branch.behind) return "in sync";
    if (branch.ahead && branch.behind) return `${branch.ahead} ahead · ${branch.behind} behind`;
    if (branch.ahead) return `${branch.ahead} ahead`;
    return `${branch.behind} behind`;
  };
</script>

<aside class="sidebar">
  <div class="section">
    <div class="section-title">Current</div>
    <div class="current-branch">{info.branch}</div>
    <div class="current-status" class:ok={statusTone(info.branchStatus) === "ok"} class:warn={statusTone(info.branchStatus) === "warn"}>
      {statusText(info.branchStatus)}
    </div>
    {#if info.branchStatus.upstream}
      <div class="upstream">tracking {info.branchStatus.upstream}</div>
    {/if}
  </div>

  <div class="section">
    <div class="section-title">Local branches</div>
    <div class="branches">
      {#each info.branchStatuses as branch}
        <div class="branch-row" class:active={branch.name === info.branch}>
          <div class="branch-main">
            <span class="branch-name">{branch.name}</span>
            {#if branch.name === info.branch}
              <span class="badge">active</span>
            {/if}
          </div>
          <div class="branch-meta">{statusText(branch)}</div>
        </div>
      {/each}
    </div>
  </div>
</aside>

<style>
  .sidebar {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .section {
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 8px;
    padding: 14px;
  }
  .section-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--tx-d);
    margin-bottom: 10px;
  }
  .current-branch {
    color: var(--tx-b);
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .current-status, .upstream, .branch-meta {
    font-size: 12px;
    color: var(--tx-d);
  }
  .current-status.ok { color: var(--grn); }
  .current-status.warn { color: var(--amb); }
  .upstream { margin-top: 4px; }
  .branches {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .branch-row {
    border: 1px solid var(--bdr);
    border-radius: 6px;
    padding: 10px;
  }
  .branch-row.active {
    border-color: rgba(74, 222, 128, 0.35);
    background: var(--grn-bg);
  }
  .branch-main {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 3px;
  }
  .branch-name {
    color: var(--tx-b);
    font-size: 13px;
    font-weight: 600;
  }
  .badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--grn);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 999px;
    padding: 1px 6px;
  }
  @media (max-width: 980px) {
    .sidebar { width: 100%; }
  }
</style>