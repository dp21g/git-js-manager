<script>
  import { createEventDispatcher } from "svelte";
  import { updateSettings } from "./api.js";
  import {
    DEFAULT_SETTINGS,
    THEME_OPTIONS,
    ZOOM_STEP,
    clampZoomLevel,
    getZoomLabel,
    normalizeUiSettings
  } from "../../server/ui-settings.mjs";

  export let settings = { ...DEFAULT_SETTINGS };
  export let isOpen = false;

  const dispatch = createEventDispatcher();

  async function updatePanelSettings(patch) {
    const nextSettings = normalizeUiSettings({
      ...(settings || DEFAULT_SETTINGS),
      ...patch
    });

    await updateSettings(patch);
    dispatch("change", nextSettings);
  }

  function setTheme(theme) {
    updatePanelSettings({ theme });
  }

  function adjustZoom(direction) {
    const nextZoom = clampZoomLevel(
      (settings?.zoomLevel ?? DEFAULT_SETTINGS.zoomLevel) + direction * ZOOM_STEP
    );
    updatePanelSettings({ zoomLevel: nextZoom });
  }

  function resetZoom() {
    updatePanelSettings({ zoomLevel: DEFAULT_SETTINGS.zoomLevel });
  }

  function close() {
    dispatch("close");
  }

  function handleKeydown(e) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  {@const uiSettings = normalizeUiSettings(settings)}
  <div class="overlay">
    <button class="overlay-dismiss" on:click={close} aria-label="Close settings panel"></button>
    <div class="panel" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
      <div class="header">
        <h3 id="appearance-title">Appearance</h3>
        <button class="close-btn" on:click={close}>×</button>
      </div>

      <div class="section">
        <div class="section-label">UI Theme</div>
        <div class="theme-options">
          {#each THEME_OPTIONS as option}
            <button
              class="theme-btn"
              class:active={uiSettings.theme === option.id}
              on:click={() => setTheme(option.id)}
            >
              <span class="theme-name">{option.label}</span>
              <span class="theme-description">{option.description}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="section">
        <div class="section-label">Zoom</div>
        <div class="zoom-row">
          <button class="zoom-btn" on:click={() => adjustZoom(-1)} aria-label="Zoom out">−</button>
          <div class="zoom-value">{getZoomLabel(uiSettings.zoomLevel)}</div>
          <button class="zoom-btn" on:click={() => adjustZoom(1)} aria-label="Zoom in">+</button>
          <button class="zoom-reset" on:click={resetZoom}>Reset</button>
        </div>
        <p class="hint">Shortcut: Cmd/Ctrl with `+`, `-`, or `0`.</p>
      </div>

      <div class="footer">
        <p>Stored in workspace config and restored on next launch.</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: flex-end;
  }

  .overlay-dismiss {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.42);
    padding: 0;
  }

  .panel {
    position: relative;
    z-index: 1;
    width: 320px;
    height: 100%;
    background: var(--panel-bg);
    border-left: 1px solid var(--bdr);
    box-shadow: -10px 0 28px var(--panel-shadow);
    padding: 20px;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.18s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }

    to {
      transform: translateX(0);
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--tx-b);
    letter-spacing: 0.02em;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--tx-d);
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    border-radius: var(--radius-sm);
  }

  .close-btn:hover {
    background: var(--list-hover);
    border-color: var(--bdr);
    color: var(--tx-b);
  }

  .section {
    margin-bottom: 22px;
  }

  .section-label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--tx-d);
    margin-bottom: 10px;
    letter-spacing: 0.08em;
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-btn {
    width: 100%;
    background: var(--panel-section-bg);
    border: 1px solid var(--bdr);
    color: var(--tx-b);
    padding: 12px;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .theme-btn:hover {
    background: var(--list-hover);
    border-color: var(--bdr-l);
  }

  .theme-btn.active {
    border-color: var(--acc);
    background: var(--acc-bg);
  }

  .theme-name {
    font-size: 13px;
    font-weight: 600;
  }

  .theme-description {
    font-size: 11px;
    color: var(--tx-d);
  }

  .zoom-row {
    display: grid;
    grid-template-columns: 34px 1fr 34px auto;
    gap: 8px;
    align-items: center;
  }

  .zoom-btn,
  .zoom-reset {
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--bdr);
    background: var(--panel-section-bg);
    color: var(--tx-b);
  }

  .zoom-btn:hover,
  .zoom-reset:hover {
    background: var(--list-hover);
    border-color: var(--bdr-l);
  }

  .zoom-value {
    height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--bdr);
    background: var(--editor-inset-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--tx-b);
    font-family: var(--font-mono);
  }

  .zoom-reset {
    padding: 0 10px;
    font-size: 11px;
    font-weight: 600;
  }

  .hint {
    margin-top: 8px;
    font-size: 11px;
    color: var(--tx-d);
    line-height: 1.4;
  }

  .footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--bdr);
    color: var(--tx-d);
    font-size: 11px;
    line-height: 1.4;
  }
</style>
