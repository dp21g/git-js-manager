<script>
  import { onMount } from "svelte";

  export let logs = [];
  export let branchName = "";
  export let position = { x: null, y: null };

  let expanded = false;
  let panelEl;
  let internalPosition = { x: 24, y: 40 };
  let dragOffset = { x: 0, y: 0 };
  let isDragging = false;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function normalizePosition(value) {
    return {
      x: Number.isFinite(value?.x) ? value.x : null,
      y: Number.isFinite(value?.y) ? value.y : null
    };
  }

  function getPanelSize() {
    if (!panelEl) {
      return { width: expanded ? 450 : 280, height: expanded ? 420 : 48 };
    }
    const rect = panelEl.getBoundingClientRect();
    return { width: rect.width || (expanded ? 450 : 280), height: rect.height || (expanded ? 420 : 48) };
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
    if (event.target.closest('.toggle-main')) return;
    isDragging = true;
    dragOffset = {
      x: event.clientX - internalPosition.x,
      y: event.clientY - internalPosition.y
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
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
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    dispatchSavedPosition();
  }

  function persistPosition(nextPosition) {
    internalPosition = nextPosition;
    dispatchSavedPosition();
  }

  function dispatchSavedPosition() {
    panelEl?.dispatchEvent(new CustomEvent('positionchange', {
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
    window.addEventListener('resize', resizeHandler);
    requestAnimationFrame(() => {
      if (position?.x == null || position?.y == null) {
        persistPosition(clampPosition(internalPosition));
      } else {
        internalPosition = clampPosition(internalPosition);
      }
    });

    return () => {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
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
    <button class="toggle-btn toggle-main" on:click={toggle}>
      <span class="icon">🌿</span>
      <span class="label" title={branchName || 'No active branch'}>{branchName || 'No active branch'}</span>
      <span class="count">{logs.length}</span>
      <span class="arrow">{expanded ? '▼' : '▲'}</span>
    </button>
  </div>

  {#if expanded}
    <div class="content">
      {#each logs as log}
        <div class="entry {log.type}">
          <div class="meta">
            <span class="time">{new Date(log.timestamp || log.time).toLocaleTimeString([], { hour12: false })}</span>
            <span class="type-badge">{log.type}</span>
          </div>
          <span class="text">{log.message}</span>
        </div>
      {/each}
      {#if logs.length === 0}
        <div class="empty">No execution logs yet.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .log-panel {
    position: fixed;
    width: min(520px, calc(100vw - 16px));
    min-width: 360px;
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 1000;
    overflow: hidden;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
    max-height: 48px;
  }

  .log-panel.expanded {
    width: min(520px, calc(100vw - 16px));
    max-height: 420px;
  }

  .log-panel.dragging {
    box-shadow: 0 16px 40px rgba(0,0,0,0.45);
  }

  .panel-header {
    display: flex;
    align-items: stretch;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .log-panel.dragging .panel-header {
    cursor: grabbing;
  }

  .drag-handle {
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--acc);
    background: rgba(88, 166, 255, 0.14);
    border-right: 1px solid rgba(88, 166, 255, 0.2);
    font-size: 14px;
    letter-spacing: -1px;
    text-shadow: 0 0 12px rgba(88, 166, 255, 0.4);
  }

  .toggle-btn {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(90deg, rgba(88, 166, 255, 0.18), rgba(46, 160, 67, 0.14));
    border: none;
    cursor: pointer;
    color: var(--tx-b);
    font-size: 13px;
    font-weight: 700;
    min-width: 0;
  }

  .toggle-btn:hover {
    background: linear-gradient(90deg, rgba(88, 166, 255, 0.28), rgba(46, 160, 67, 0.2));
  }

  .icon { font-size: 16px; filter: drop-shadow(0 0 10px rgba(88, 166, 255, 0.35)); }
  .label {
    flex: 1;
    text-align: left;
    color: #7ee787;
    text-shadow: 0 0 14px rgba(126, 231, 135, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    font-size: 10px;
    background: rgba(255,255,255,0.12);
    padding: 2px 6px;
    border-radius: 10px;
    color: var(--tx-b);
  }
  .arrow { opacity: 0.75; font-size: 10px; }

  .content {
    height: 360px;
    overflow-y: auto;
    padding: 12px;
    border-top: 1px solid var(--bdr);
    background: var(--surface-d);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    margin-bottom: 8px;
    font-size: 11px;
    border-radius: 6px;
    border: 1px solid var(--bdr);
    background: rgba(255,255,255,0.02);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .time { color: var(--tx-d); white-space: nowrap; opacity: 0.6; }

  .type-badge {
    text-transform: uppercase;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    opacity: 0.7;
  }

  .entry.error { border-color: rgba(248, 81, 73, 0.3); background: rgba(248, 81, 73, 0.05); }
  .entry.error .type-badge { color: #f85149; background: rgba(248, 81, 73, 0.1); }
  .entry.error .text { color: #f85149; }

  .entry.info .type-badge { color: #58a6ff; background: rgba(88, 166, 255, 0.1); }

  .entry.success { border-color: rgba(63, 185, 80, 0.3); background: rgba(63, 185, 80, 0.05); }
  .entry.success .type-badge { color: #3fb950; background: rgba(63, 185, 80, 0.1); }
  .entry.success .text { color: #3fb950; }

  .text { word-break: break-all; line-height: 1.4; color: var(--tx-b); }

  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--tx-d);
    font-style: italic;
    font-size: 12px;
  }
</style>
