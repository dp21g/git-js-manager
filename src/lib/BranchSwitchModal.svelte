<script>
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";

  export let isOpen = false;
  export let currentBranch = "";
  export let branches = [];
  export let selectedBranch = "";
  export let dirtyCount = 0;
  export let loading = false;
  export let strategy = "direct";
  export let stashName = "";
  export let error = "";

  const dispatch = createEventDispatcher();

  $: availableBranches = branches.filter((branch) => branch && branch !== currentBranch);
  $: hasDirtyChanges = dirtyCount > 0;
  $: confirmLabel = hasDirtyChanges && strategy === "stash" ? "Stash & Change" : "Change Branch";

  function close() {
    if (loading) return;
    dispatch("close");
  }

  function submit() {
    if (loading || !selectedBranch || selectedBranch === currentBranch) return;
    dispatch("confirm");
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && isOpen) close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div class="modal-overlay" transition:fade={{ duration: 150 }} on:click={close}>
    <div
      class="modal-content"
      transition:scale={{ duration: 200, start: 0.96, opacity: 0 }}
      on:click|stopPropagation
    >
      <div class="modal-header">
        <div>
          <div class="eyebrow">Branch Switch</div>
          <h3>Change Branch</h3>
        </div>
        <button class="close-btn" on:click={close} aria-label="Close branch switch dialog">×</button>
      </div>

      <div class="modal-body">
        <div class="field-group">
          <label class="field-label" for="branch-target">Current Branch</label>
          <div class="current-branch">{currentBranch || "No active branch"}</div>
        </div>

        <div class="field-group">
          <label class="field-label" for="branch-target">Target Branch</label>
          <select id="branch-target" bind:value={selectedBranch} disabled={loading || availableBranches.length === 0}>
            <option value="" disabled>Select a branch</option>
            {#each availableBranches as branch}
              <option value={branch}>{branch}</option>
            {/each}
          </select>
        </div>

        {#if hasDirtyChanges}
          <div class="warning-card">
            <div class="warning-title">{dirtyCount} local change{dirtyCount === 1 ? "" : "s"} detected</div>
            <p>Git may block a direct switch if the target branch would overwrite your working tree.</p>
          </div>

          <div class="strategy-group">
            <label class="strategy-option">
              <input type="radio" bind:group={strategy} value="direct" disabled={loading} />
              <div>
                <div class="strategy-title">Change directly</div>
                <div class="strategy-copy">Try to carry your current changes across without creating a stash.</div>
              </div>
            </label>

            <label class="strategy-option">
              <input type="radio" bind:group={strategy} value="stash" disabled={loading} />
              <div>
                <div class="strategy-title">Stash and change</div>
                <div class="strategy-copy">Stash your current work first, then switch branches safely.</div>
              </div>
            </label>
          </div>

          {#if strategy === "stash"}
            <div class="field-group">
              <label class="field-label" for="stash-name">Stash Name</label>
              <input
                id="stash-name"
                type="text"
                bind:value={stashName}
                placeholder={`Branch switch: ${currentBranch || "current"} -> ${selectedBranch || "target"}`}
                disabled={loading}
              />
            </div>
          {/if}
        {/if}

        {#if error}
          <div class="error-message">{error}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" on:click={close} disabled={loading}>Cancel</button>
        <button class="btn-confirm" on:click={submit} disabled={loading || !selectedBranch || selectedBranch === currentBranch}>
          {loading ? "Switching..." : confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.74);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9998;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    width: min(520px, calc(100vw - 32px));
    border-radius: 16px;
    border: 1px solid var(--bdr);
    background: var(--surface);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px 16px;
    border-bottom: 1px solid var(--bdr);
    background:
      radial-gradient(circle at top left, rgba(88, 166, 255, 0.14), transparent 42%),
      linear-gradient(180deg, var(--surface), var(--surface-h));
  }

  .eyebrow {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--tx-d);
  }

  h3 {
    margin: 6px 0 0;
    font-size: 20px;
    line-height: 1.1;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--tx-d);
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    color: var(--tx-b);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tx-d);
  }

  .current-branch,
  select,
  input {
    border-radius: 10px;
    border: 1px solid var(--bdr);
    background: var(--surface-h);
    color: var(--tx-b);
    padding: 12px 14px;
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  select:focus,
  input:focus {
    border-color: var(--acc);
  }

  .current-branch {
    font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
    color: var(--acc);
    font-weight: 600;
  }

  .warning-card {
    border: 1px solid rgba(210, 153, 34, 0.28);
    border-radius: 12px;
    background: rgba(210, 153, 34, 0.08);
    padding: 14px;
  }

  .warning-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--amb);
  }

  .warning-card p {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--tx-d);
    line-height: 1.5;
  }

  .strategy-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .strategy-option {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border: 1px solid var(--bdr);
    border-radius: 12px;
    background: var(--surface-h);
    cursor: pointer;
  }

  .strategy-option input {
    margin-top: 2px;
  }

  .strategy-title {
    font-size: 13px;
    font-weight: 700;
  }

  .strategy-copy {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--tx-d);
  }

  .error-message {
    border: 1px solid rgba(248, 81, 73, 0.28);
    background: rgba(248, 81, 73, 0.08);
    color: var(--red);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px 18px;
    border-top: 1px solid var(--bdr);
    background: var(--surface-h);
  }

  .btn-cancel,
  .btn-confirm {
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-cancel {
    border: 1px solid var(--bdr);
    background: transparent;
    color: var(--tx-d);
  }

  .btn-cancel:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.04);
    color: var(--tx-b);
  }

  .btn-confirm {
    border: 1px solid rgba(88, 166, 255, 0.32);
    background: rgba(88, 166, 255, 0.16);
    color: var(--acc);
  }

  .btn-confirm:hover:not(:disabled) {
    background: rgba(88, 166, 255, 0.24);
    color: #fff;
  }

  button:disabled,
  select:disabled,
  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
