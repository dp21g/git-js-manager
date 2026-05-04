<script>
  import { createEventDispatcher, onMount } from "svelte";
  import { fade, scale } from "svelte/transition";

  export let isOpen = false;
  export let title = "Confirm Action";
  export let message = "Are you sure you want to proceed?";
  export let confirmText = "Confirm";
  export let cancelText = "Cancel";
  export let danger = false;

  const dispatch = createEventDispatcher();

  function close() {
    isOpen = false;
    dispatch("close");
  }

  function confirm() {
    dispatch("confirm");
    close();
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && isOpen) close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div class="modal-overlay" transition:fade={{ duration: 150 }} on:click={close}>
    <div 
      class="modal-content" 
      transition:scale={{ duration: 200, start: 0.95, opacity: 0 }}
      on:click|stopPropagation
    >
      <div class="modal-header">
        <h3>{title}</h3>
        <button class="close-btn" on:click={close}>&times;</button>
      </div>
      
      <div class="modal-body">
        <p>{message}</p>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" on:click={close}>{cancelText}</button>
        <button 
          class="btn-confirm" 
          class:danger 
          on:click={confirm}
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 12px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--bdr);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--tx-b);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--tx-d);
    font-size: 24px;
    margin-top: -4px;
    cursor: pointer;
  }
  .close-btn:hover { color: var(--tx-b); }

  .modal-body {
    padding: 24px 20px;
  }

  .modal-body p {
    margin: 0;
    font-size: 14px;
    color: var(--tx-d);
    line-height: 1.5;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    background: var(--surface-h);
    border-top: 1px solid var(--bdr);
  }

  button {
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--bdr);
    color: var(--tx-d);
  }
  .btn-cancel:hover { background: rgba(255,255,255,0.05); color: var(--tx-b); }

  .btn-confirm {
    background: var(--acc);
    border: 1px solid var(--acc);
    color: white;
  }
  .btn-confirm:hover { filter: brightness(1.1); box-shadow: 0 0 15px var(--acc-bg); }

  .btn-confirm.danger {
    background: var(--red);
    border-color: var(--red);
  }
  .btn-confirm.danger:hover { box-shadow: 0 0 15px rgba(248, 81, 73, 0.2); }
</style>
