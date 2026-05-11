<script>
  import { createEventDispatcher } from "svelte";

  export let stashes = [];
  export let selectedRef = "";
  export let collapsed = true;
  export let loading = false;
  export let applyingRef = "";
  export let embedded = false;

  const dispatch = createEventDispatcher();

  function toggleCollapse() {
    dispatch("toggle-collapse");
  }

  function getSafeRef(stash) {
    return stash?.ref?.match(/^stash@\{\d+\}$/)?.[0]
      || stash?.ref?.match(/stash@\{\d+\}/)?.[0]
      || "";
  }

  function select(stash) {
    const ref = getSafeRef(stash);
    if (!ref) return;
    dispatch("select", ref);
  }

  function apply(event, stash) {
    event.stopPropagation();
    const ref = getSafeRef(stash);
    if (!ref) return;
    dispatch("apply", ref);
  }
</script>

<div class="stash-section" class:collapsed class:embedded>
  <div
    class="header"
    on:click={toggleCollapse}
    on:keydown={(event) => (event.key === "Enter" || event.key === " ") && toggleCollapse()}
    role="button"
    tabindex="0"
  >
    <span class="chevron">{collapsed ? "▶" : "▼"}</span>
    <span class="title">Stashes ({stashes.length})</span>
  </div>

  {#if !collapsed}
    <div class="items">
      {#if stashes.length === 0}
        <div class="empty">No stashes created from this branch.</div>
      {:else}
        {#each stashes as stash}
          <div class="stash-row" class:active={selectedRef === stash.ref}>
            <button class="stash-item" on:click={() => select(stash)}>
              <div class="stash-topline">
                <span class="stash-message">{stash.message || stash.label}</span>
                <span class="stash-ref">{stash.ref}</span>
              </div>
              <div class="stash-meta">
                {#if stash.shortHash}
                  <span class="hash">{stash.shortHash}</span>
                {/if}
                <span class="branch">{stash.branch || "Unknown branch"}</span>
              </div>
            </button>

            <button
              class="apply-btn"
              on:click={(event) => apply(event, stash)}
              title="Apply this stash to the current branch"
              disabled={loading}
            >
              {applyingRef === stash.ref ? "..." : "Apply"}
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .stash-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    flex: 1;
    min-height: 0;
    min-height: 42px;
    border-top: 1px solid var(--bdr);
    background: var(--surface);
  }

  .stash-section.embedded {
    border-top: none;
  }

  .stash-section.collapsed {
    min-height: 42px;
  }

  .header {
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--acc);
    background: rgba(88, 166, 255, 0.06);
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }

  .header:hover {
    background: rgba(88, 166, 255, 0.12);
  }

  .chevron {
    font-size: 8px;
    opacity: 0.6;
    width: 10px;
  }

  .items {
    flex: 1;
    overflow-y: auto;
    padding: 8px 6px;
  }

  .empty {
    padding: 16px;
    text-align: center;
    font-size: 11px;
    color: var(--tx-d);
    font-style: italic;
  }

  .stash-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 6px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .stash-row:hover {
    background: var(--surface-h);
  }

  .stash-row.active {
    background: var(--acc-bg);
    border-color: rgba(88, 166, 255, 0.2);
  }

  .stash-item {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 10px 12px;
    cursor: pointer;
  }

  .stash-topline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .stash-message {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
    color: var(--tx-b);
  }

  .stash-ref,
  .hash {
    font-size: 10px;
    color: var(--tx-d);
    font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
  }

  .stash-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 11px;
    color: var(--tx-d);
  }

  .branch {
    color: var(--acc);
  }

  .apply-btn {
    flex-shrink: 0;
    align-self: center;
    margin-right: 10px;
    border: 1px solid rgba(88, 166, 255, 0.24);
    border-radius: 8px;
    background: rgba(88, 166, 255, 0.1);
    color: var(--acc);
    padding: 7px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .apply-btn:hover:not(:disabled) {
    background: rgba(88, 166, 255, 0.2);
    color: #fff;
  }

  .apply-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
