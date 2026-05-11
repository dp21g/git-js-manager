<script>
  import { onMount, tick } from "svelte";
  import ExecutionLogEntry from "./ExecutionLogEntry.svelte";

  export let logs = [];
  export let branchName = "";
  export let position = { x: null, y: null };

  let expanded = false;
  let panelEl;
  let contentEl;
  let internalPosition = { x: 24, y: 40 };
  let dragOffset = { x: 0, y: 0 };
  let isDragging = false;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  $: orderedLogs = logs;
  $: if (expanded && contentEl) {
    contentEl.scrollTop = 0;
  }

  function normalizePosition(value) {
    return {
      x: Number.isFinite(value?.x) ? value.x : null,
      y: Number.isFinite(value?.y) ? value.y : null
    };
  }

  function getPanelSize() {
    if (!panelEl) {
      return { width: expanded ? 540 : 360, height: expanded ? 460 : 52 };
    }
    const rect = panelEl.getBoundingClientRect();
    return { width: rect.width || (expanded ? 540 : 360), height: rect.height || (expanded ? 460 : 52) };
  }

  function clampPosition(next) {
    if (typeof window === "undefined") return next;
    const { width, height } = getPanelSize();
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    return {
      x: clamp(next.x, 8, maxX),
      y: clamp(next.y, 8, maxY)
    };
  }

  function applyExternalPosition(value) {
    const next = normalizePosition(value);
    if (next.x === null || next.y === null) return;
    internalPosition = clampPosition(next);
  }

  function toggle() {
    expanded = !expanded;
    requestAnimationFrame(() => {
      persistPosition(clampPosition(internalPosition));
    });
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest(".toggle-main")) return;
    isDragging = true;
    dragOffset = {
      x: event.clientX - internalPosition.x,
      y: event.clientY - internalPosition.y
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handlePointerMove(event) {
    if (!isDragging) return;
    persistPosition(clampPosition({
      x: event.clientX - dragOffset.x,
      y: event.clientY - dragOffset.y
    }));
  }

  function handlePointerUp() {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    dispatchSavedPosition();
  }

  function persistPosition(nextPosition) {
    internalPosition = nextPosition;
    dispatchSavedPosition();
  }

  function dispatchSavedPosition() {
    panelEl?.dispatchEvent(new CustomEvent("positionchange", {
      detail: internalPosition,
      bubbles: true
    }));
  }

  function handleWindowResize() {
    persistPosition(clampPosition(internalPosition));
  }

  $: applyExternalPosition(position);

  onMount(() => {
    applyExternalPosition(position);
    const resizeHandler = () => handleWindowResize();
    window.addEventListener("resize", resizeHandler);
    requestAnimationFrame(() => {
      if (position?.x == null || position?.y == null) {
        persistPosition(clampPosition(internalPosition));
      } else {
        internalPosition = clampPosition(internalPosition);
      }
    });

    return () => {
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });
</script>

<div
  bind:this={panelEl}
  class="log-panel"
  class:expanded
  class:dragging={isDragging}
  style={`left: ${internalPosition.x}px; top: ${internalPosition.y}px;`}
>
  <div class="panel-header" on:pointerdown={handlePointerDown}>
    <div class="drag-handle" title="Drag panel">⋮⋮</div>
    <button type="button" class="toggle-btn toggle-main" on:click={toggle}>
      <span class="panel-label">Console</span>
      <span class="panel-branch" title={branchName || "No active branch"}>{branchName || "No active branch"}</span>
      <span class="count">{logs.length}</span>
      <span class="arrow">{expanded ? "▼" : "▲"}</span>
    </button>
  </div>

  {#if expanded}
    <div class="content-shell">
      <div class="content-titlebar">
        <span class="title">git-squash-ui</span>
        <span class="meta">terminal transcript</span>
      </div>

      <div class="content" bind:this={contentEl}>
        {#if orderedLogs.length === 0}
          <div class="empty">No execution logs yet.</div>
        {:else}
          {#each orderedLogs as log (log.id)}
            <ExecutionLogEntry {log} compact={true} />
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .log-panel {
    position: fixed;
    width: min(560px, calc(100vw - 16px));
    min-width: 380px;
    background: var(--terminal-raised-bg);
    border: 1px solid var(--terminal-border);
    border-radius: 14px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
    z-index: 1000;
    overflow: hidden;
    transition: max-height 0.24s ease, box-shadow 0.2s ease;
    max-height: 52px;
  }

  .log-panel.expanded {
    max-height: min(70vh, 560px);
  }

  .log-panel.dragging {
    box-shadow: 0 22px 48px rgba(0, 0, 0, 0.44);
  }

  .panel-header {
    display: flex;
    align-items: stretch;
    cursor: grab;
    user-select: none;
    touch-action: none;
    background: var(--terminal-titlebar-bg);
  }

  .log-panel.dragging .panel-header {
    cursor: grabbing;
  }

  .drag-handle {
    width: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--terminal-muted);
    border-right: 1px solid var(--terminal-border);
    font-size: 14px;
    letter-spacing: -1px;
  }

  .toggle-btn {
    width: 100%;
    min-width: 0;
    height: 52px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--terminal-text);
    font-size: 12px;
    font-weight: 700;
  }

  .panel-label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10px;
    color: var(--terminal-muted);
  }

  .panel-branch {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    color: var(--terminal-command);
    font-family: var(--font-mono);
  }

  .count {
    font-size: 10px;
    background: var(--terminal-chip-bg);
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--terminal-chip-text);
  }

  .arrow {
    opacity: 0.75;
    font-size: 10px;
  }

  .content-shell {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--terminal-border);
    background: var(--terminal-bg);
  }

  .content-titlebar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--terminal-muted);
  }

  .title {
    color: var(--terminal-text);
  }

  .content {
    height: 420px;
    overflow-y: scroll;
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .content::-webkit-scrollbar {
    width: 8px;
  }

  .content::-webkit-scrollbar-track {
    background: transparent;
  }

  .content::-webkit-scrollbar-thumb {
    background: var(--terminal-border);
    border-radius: 4px;
  }

  .content::-webkit-scrollbar-thumb:hover {
    background: var(--terminal-muted);
  }

  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--terminal-muted);
    font-style: italic;
    font-size: 12px;
  }

  @media (max-width: 840px) {
    .log-panel {
      min-width: min(92vw, 380px);
      width: min(92vw, 560px);
    }
  }
</style>
