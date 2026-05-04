<script>
  import { createEventDispatcher } from "svelte";
  export let commit;
  export let selected = false;

  export let isBase = false;
  export let mode = "squash";

  const dispatch = createEventDispatcher();

  $: action = isBase ? "pick" : selected ? (mode === "squash" ? "fixup" : "diff") : "pick";

  function handleReverse(e) {
    e.stopPropagation();
    dispatch("reverse", [commit.hash]);
  }
</script>

<div
  class="row"
  class:first={isBase}
  class:selected
  class:diff-mode={mode === 'diff'}
  on:click
  on:keydown
  role="button"
  tabindex="0"
>
  <div class="left">
    <div class="checkbox" class:disabled={isBase && mode === 'squash'} class:checked={selected}>
      {#if selected}
        {#if mode === 'squash'}<span class="arrow">↑</span>{:else}✓{/if}
      {/if}
      {#if isBase && mode === 'squash'}<span class="lock">★</span>{/if}
    </div>
    <span class="action" class:pick={action === "pick"} class:fixup={action === "fixup"} class:diff={action === 'diff'}>
      {action}
    </span>
  </div>

  <div class="center">
    <span class="hash">{commit.hash}</span>
    <span class="msg" class:dim={selected && mode === 'squash'}>{commit.message}</span>
  </div>

  <div class="right-actions">
    {#if isBase && mode === 'squash'}
      <span class="badge">base</span>
    {/if}
    <button class="reverse-btn" on:click={handleReverse} title="Reverse this commit (unstaged)">
      ↩ Reverse
    </button>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--bdr);
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
    border-left: 3px solid transparent;
  }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--surface-h); }
  .row.first { background: var(--grn-bg); border-left-color: var(--grn); cursor: default; }
  .row.selected { background: var(--amb-bg); border-left-color: var(--amb); }
  
  .row.diff-mode.selected {
    background: rgba(88, 166, 255, 0.1);
    border-left-color: #58a6ff;
  }

  .left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

  .checkbox {
    width: 20px; height: 20px; border-radius: 4px;
    border: 2px solid var(--bdr-l);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
    transition: all 0.15s; flex-shrink: 0;
  }
  .checkbox.disabled { border-color: var(--grn-d); background: rgba(74, 222, 128, 0.1); }
  .checkbox.checked { border-color: var(--amb); background: rgba(251, 191, 36, 0.15); }
  
  .row.diff-mode .checkbox.checked {
    border-color: #58a6ff;
    background: rgba(88, 166, 255, 0.2);
    color: #58a6ff;
  }

  .arrow { color: var(--amb); }
  .lock { color: var(--grn); font-size: 10px; }

  .action {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; padding: 2px 7px; border-radius: 3px;
    width: 48px; text-align: center; flex-shrink: 0;
  }
  .pick { color: var(--grn); background: var(--grn-bg); }
  .fixup { color: var(--amb); background: var(--amb-bg); }
  .diff { color: var(--acc); background: var(--acc-bg); }

  .center { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  .hash { font-size: 12px; color: var(--acc); flex-shrink: 0; font-family: 'JetBrains Mono', monospace; opacity: 0.8; }
  .msg { font-size: 12px; color: var(--tx-b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .msg.dim { color: var(--tx-d); text-decoration: line-through; text-decoration-color: rgba(107, 115, 148, 0.4); }

  .right-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .reverse-btn {
    background: transparent;
    border: 1px solid var(--bdr);
    color: var(--tx-d);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s;
    font-family: inherit;
  }
  .row:hover .reverse-btn { opacity: 1; }
  .reverse-btn:hover { background: var(--red-bg); color: var(--red); border-color: var(--red); }

  .badge {
    font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--grn); background: var(--grn-bg);
    border: 1px solid var(--grn-bg);
    padding: 2px 8px; border-radius: 3px; flex-shrink: 0;
  }
</style>
