<script>
  let tipVisible = false;
  let tipX = 0;
  let tipY = 0;
  let tipAbove = false;
  let showTimer;
  let hideTimer;

  export let text = "";
  export let delay = 400;

  function show(e) {
    if (!text) return;
    clearTimeout(hideTimer);
    showTimer = setTimeout(() => {
      const rect = e.currentTarget.getBoundingClientRect();
      tipX = rect.left + rect.width / 2;
      const belowY = rect.bottom + 6;
      const aboveY = rect.top - 6;
      tipAbove = belowY + 28 > window.innerHeight;
      tipY = tipAbove ? aboveY : belowY;
      tipVisible = true;
    }, delay);
  }

  function hide() {
    clearTimeout(showTimer);
    hideTimer = setTimeout(() => {
      tipVisible = false;
    }, 80);
  }
</script>

<div
  class="tooltip-host"
  on:mouseenter={show}
  on:mouseleave={hide}
  on:focus={show}
  on:blur={hide}
>
  <slot />
</div>

{#if tipVisible && text}
  <div
    class="tooltip-tip"
    class:above={tipAbove}
    style={`left:${tipX}px;top:${tipY}px;`}
  >
    {text}
  </div>
{/if}

<style>
  .tooltip-host {
    display: contents;
  }

  .tooltip-tip {
    position: fixed;
    z-index: 250;
    background: var(--panel-elevated-bg);
    color: var(--tx-b);
    border: 1px solid var(--bdr-l);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    font-size: 11px;
    font-family: var(--font-mono);
    line-height: 1.4;
    max-width: 360px;
    word-break: break-word;
    white-space: pre-wrap;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    transform: translate(-50%, 0) scale(1);
    pointer-events: none;
    animation: tip-in 0.16s ease-out;
  }

  .tooltip-tip.above {
    transform: translate(-50%, -100%) scale(1);
  }

  @keyframes tip-in {
    from {
      opacity: 0;
      transform: translate(-50%, 4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  .tooltip-tip.above {
    animation-name: tip-in-above;
  }

  @keyframes tip-in-above {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-100% - 4px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%) scale(1);
    }
  }
</style>
