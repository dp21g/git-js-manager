<script>
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";

  export let isOpen = false;
  export let currentBranch = "";
  export let previousBranch = "";
  export let stashes = [];
  export let selectedStashRef = "";
  export let loading = false;

  const dispatch = createEventDispatcher();

  function close() {
    if (loading) return;
    dispatch("close");
  }

  function apply() {
    if (!selectedStashRef || loading) return;
    dispatch("apply");
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
          <div class="eyebrow">Post Switch</div>
          <h3>Apply a Stash?</h3>
        </div>
        <button class="close-btn" on:click={close} aria-label="Close stash restore dialog">×</button>
      </div>

      <div class="modal-body">
        <p class="intro">
          You switched from <strong>{previousBranch || "unknown"}</strong> to <strong>{currentBranch || "unknown"}</strong>.
          Pick a stash to reapply now, or leave everything stashed for later.
        </p>

        <div class="stash-list">
          {#each stashes as stash}
            <label class="stash-option">
              <input type="radio" bind:group={selectedStashRef} value={stash.ref} disabled={loading} />
              <div class="stash-copy">
                <div class="stash-topline">
                  <span class="stash-message">{stash.message || stash.label}</span>
                  <span class="stash-ref">{stash.ref}</span>
                </div>
                <div class="stash-meta">
                  <span class="branch-pill">{stash.branch || "Unknown branch"}</span>
                  {#if stash.shortHash}
                    <span class="hash">{stash.shortHash}</span>
                  {/if}
                </div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" on:click={close} disabled={loading}>Leave Stashed</button>
        <button class="btn-confirm" on:click={apply} disabled={loading || !selectedStashRef}>
          {loading ? "Applying..." : "Apply Selected Stash"}
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
    width: min(560px, calc(100vw - 32px));
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
    gap: 16px;
  }

  .intro {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--tx-d);
  }

  .stash-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: min(48vh, 360px);
    overflow-y: auto;
  }

  .stash-option {
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

  .stash-option input {
    margin-top: 2px;
  }

  .stash-copy {
    min-width: 0;
  }

  .stash-topline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .stash-message {
    font-size: 13px;
    font-weight: 700;
    color: var(--tx-b);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stash-ref,
  .hash {
    font-size: 11px;
    color: var(--tx-d);
    font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
  }

  .stash-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .branch-pill {
    border: 1px solid rgba(88, 166, 255, 0.28);
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--acc);
    background: rgba(88, 166, 255, 0.08);
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
  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
