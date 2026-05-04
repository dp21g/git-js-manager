<script>
  import { createEventDispatcher } from "svelte";
  import { updateSettings } from "./api.js";

  export let settings = { theme: "dark" };
  export let isOpen = false;

  const dispatch = createEventDispatcher();

  async function setTheme(theme) {
    const current = settings || { theme: 'dark' };
    const nextSettings = { ...current, theme };
    await updateSettings({ theme });
    dispatch("change", nextSettings);
  }

  function close() {
    dispatch("close");
  }

  function handleKeydown(e) {
    if (e.key === "Escape") close();
  }
</script>

{#if isOpen}
  {@const theme = settings?.theme || 'dark'}
  <div class="overlay" on:click={close} on:keydown={handleKeydown}>
    <div class="panel" on:click|stopPropagation>
      <div class="header">
        <h3>Settings</h3>
        <button class="close-btn" on:click={close}>×</button>
      </div>

      <div class="section">
        <label>UI Theme</label>
        <div class="theme-options">
          <button 
            class="theme-btn dark" 
            class:active={theme === 'dark'}
            on:click={() => setTheme('dark')}
          >
            <span class="icon">🌙</span> Dark Mode
          </button>
          <button 
            class="theme-btn light" 
            class:active={theme === 'light'}
            on:click={() => setTheme('light')}
          >
            <span class="icon">☀️</span> Light Mode
          </button>
        </div>
      </div>

      <div class="footer">
        <p>Git Squash UI v1.0.0</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    justify-content: flex-end;
  }

  .panel {
    width: 320px;
    height: 100%;
    background: var(--surface);
    border-left: 1px solid var(--bdr);
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
    padding: 24px;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }

  .header h3 {
    margin: 0;
    font-size: 18px;
    color: var(--tx-b);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--tx-d);
    font-size: 24px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }

  .close-btn:hover { color: var(--tx-b); }

  .section {
    margin-bottom: 24px;
  }

  .section label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--tx-d);
    margin-bottom: 12px;
    letter-spacing: 0.5px;
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-btn {
    background: var(--bg);
    border: 1px solid var(--bdr);
    color: var(--tx-b);
    padding: 12px 16px;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.2s;
  }

  .theme-btn:hover { background: var(--surface-h); border-color: var(--bdr-l); }
  .theme-btn.active { border-color: var(--acc); background: var(--acc-bg); color: var(--acc); }

  .icon { font-size: 16px; }

  .footer {
    margin-top: auto;
    padding-top: 24px;
    border-top: 1px solid var(--bdr);
    color: var(--tx-d);
    font-size: 11px;
    text-align: center;
  }
</style>
