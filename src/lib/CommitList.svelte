<script>
  import { createEventDispatcher } from "svelte";
  import CommitRow from "./CommitRow.svelte";

  export let commits = [];
  export let selected = new Set();
  export let mode = "squash"; // squash | diff

  const dispatch = createEventDispatcher();

  $: keepCount = commits.length - selected.size;
  $: squashCount = selected.size + (selected.size > 0 ? 1 : 0);

  function toggle(index) {
    if (mode === "squash") {
      // Squash logic: select everything from top to index
      if (index >= commits.length - 1) return;
      const next = new Set();
      for (let i = 0; i <= index; i++) {
          next.add(i);
      }
      dispatch("select", next);
    } else {
      // Diff logic: toggle individual selection
      const next = new Set(selected);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      dispatch("select", next);
    }
  }

  function selectAll() {
    const s = new Set();
    const limit = mode === "squash" ? commits.length - 1 : commits.length;
    commits.forEach((_, i) => { if (i < limit) s.add(i); });
    dispatch("select", s);
  }

  function selectNone() {
    dispatch("select", new Set());
  }

  function handleReverseSelected() {
    const hashes = Array.from(selected)
      .sort((a, b) => a - b) // newer first sorted order
      .map(i => commits[i].hash);
    dispatch("reverse", hashes);
  }
</script>

<!-- Toolbar -->
<div class="toolbar">
  <div class="toolbar-left">
    <button class="btn btn-accent btn-sm" on:click={selectAll}>
      {mode === 'squash' ? 'Squash All → 1' : 'Select All'}
    </button>
    <button class="btn btn-ghost btn-sm" on:click={selectNone}>Clear Selection</button>
    
    {#if selected.size > 0}
      <button class="btn btn-danger btn-sm" on:click={handleReverseSelected}>
        ↩ Reverse {selected.size === commits.length - 1 && mode === 'squash' ? 'All' : 'Selected'}
      </button>
    {/if}
  </div>
  <div class="stats">
    {#if mode === 'squash'}
      <span class="keep">{keepCount} keep</span>
      <span class="dot">·</span>
      <span class="squash">{squashCount} fixup</span>
    {:else}
      <span class="squash">{selected.size} selected</span>
    {/if}
    <span class="dot">·</span>
    <span class="total">{commits.length} total</span>
  </div>
</div>

<!-- Commit rows -->
<div class="list">
  {#each commits as commit, i}
    <CommitRow
      {commit}
      index={i}
      isBase={i === commits.length - 1}
      {mode}
      selected={selected.has(i)}
      on:click={() => toggle(i)}
      on:reverse={(e) => dispatch("reverse", e.detail)}
    />
  {/each}
</div>

<!-- Action buttons -->
{#if mode === 'squash'}
  <div class="actions">
    <button
      class="btn btn-primary"
      disabled={selected.size === 0}
      on:click={() => dispatch("squash")}
    >
      Squash {squashCount} commit{squashCount !== 1 ? "s" : ""}
    </button>
  </div>
{/if}

<style>
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .toolbar-left { display: flex; gap: 8px; }

  .stats {
    display: flex; align-items: center; gap: 10px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
  }
  .keep { color: var(--grn); }
  .squash { color: var(--amb); }
  .total { color: var(--tx-d); }
  .dot { color: var(--bdr); }

  .list { border-radius: 8px; border: 1px solid var(--bdr); overflow: hidden; background: var(--surface); }

  .actions {
    margin-top: 20px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
</style>
