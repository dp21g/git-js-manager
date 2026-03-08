<script>
  import { toast } from "./toast.js";
</script>

{#if $toast}
  <div class="toast {$toast.type}">{$toast.message}</div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    z-index: 9999;
    border: 1px solid;
    animation: fadeIn 0.2s ease-out;
  }
  .ok {
    background: var(--grn-bg);
    color: var(--grn);
    border-color: rgba(74, 222, 128, 0.3);
  }
  .err {
    background: var(--red-bg);
    color: var(--red);
    border-color: rgba(248, 113, 113, 0.3);
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
