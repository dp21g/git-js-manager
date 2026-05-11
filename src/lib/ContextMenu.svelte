<script>
  import { createEventDispatcher, onMount } from "svelte";

  export let items = [];
  export let x = 0;
  export let y = 0;
  export let visible = false;

  const dispatch = createEventDispatcher();

  function handleAction(action) {
    dispatch("action", { action });
    visible = false;
  }

  function close() {
    dispatch("close");
  }

  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  $: if (visible && typeof document !== "undefined") {
    document.addEventListener("click", close, { once: true });
    document.addEventListener("keydown", onKeydown, { once: true });
  }

  $: style = visible ? `left:${x}px;top:${y}px;` : "display:none;";
</script>

{#if visible}
  <div class="context-menu" style={style}>
    {#each items as item}
      <button
        type="button"
        class="context-item"
        class:danger={item.danger}
        on:click|stopPropagation={() => handleAction(item.action)}
      >
        <span class="context-item-label">{item.label}</span>
        {#if item.shortcut}
          <span class="context-item-shortcut">{item.shortcut}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 200;
    background: var(--panel-elevated-bg);
    border: 1px solid var(--bdr);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px var(--panel-shadow);
    padding: 4px;
    min-width: 160px;
  }

  .context-item {
    width: 100%;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--tx-b);
    padding: 6px 10px;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 12px;
    transition: background 0.08s ease;
  }

  .context-item:hover {
    background: var(--list-hover);
  }

  .context-item.danger:hover {
    background: var(--danger-bg);
    color: var(--red);
  }

  .context-item-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-item-shortcut {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--tx-d);
    font-family: var(--font-mono);
  }
</style>
