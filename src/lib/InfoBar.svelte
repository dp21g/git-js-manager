<script>
  import { createEventDispatcher } from "svelte";

  export let info;
  export let baseBranch;

  const dispatch = createEventDispatcher();
</script>

<div class="info-bar">
  <div class="item">
    <span class="label">repo:</span>
    <span class="value path" title={info.path}>{info.path}</span>
    <button class="link" on:click={() => dispatch("change-repo")}>change</button>
  </div>

  <div class="item">
    <span class="label">branch:</span>
    <span class="value">{info.branch}</span>
  </div>

  <div class="item">
    <span class="label">base:</span>
    <select
      class="base-select"
      value={baseBranch}
      on:change={(e) => dispatch("base-change", e.target.value)}
    >
      {#each info.branches as b}
        <option value={b}>{b}</option>
      {/each}
    </select>
  </div>

  <button class="btn btn-ghost btn-sm" on:click={() => dispatch("refresh")}>
    ↻ refresh
  </button>

  <button class="btn btn-ghost btn-sm" on:click={() => dispatch("test-branches")}>
    test branches
  </button>

  <button class="btn btn-danger btn-sm" on:click={() => dispatch("undo")}>
    ↩ Undo Last Squash
  </button>
</div>

<style>
  .info-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 12px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .label {
    color: var(--tx-d);
  }
  .value {
    color: var(--tx-b);
    font-weight: 600;
  }
  .path {
    color: var(--acc);
    max-width: 350px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link {
    font-size: 11px;
    color: var(--acc);
    background: none;
    border: none;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link:hover {
    color: var(--tx-b);
  }
  .base-select {
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    background: var(--bg);
    color: var(--grn);
    border: 1px solid var(--bdr);
    border-radius: 4px;
    padding: 3px 8px;
    outline: none;
  }
</style>
