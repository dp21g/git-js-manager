<script>
  import { createEventDispatcher } from "svelte";

  export let branches = [];
  export let branch1 = "";
  export let branch2 = "";

  const dispatch = createEventDispatcher();

  function swap() {
    dispatch("swap");
  }
</script>

<div class="compare-selector">
  <div class="field">
    <label>Source Branch</label>
    <select 
      value={branch1} 
      on:change={(e) => dispatch("change", { branch1: e.target.value, branch2 })}
    >
      <option value="" disabled>Select branch</option>
      {#each branches as b}
        <option value={b}>{b}</option>
      {/each}
    </select>
  </div>

  <button class="swap-btn" on:click={swap} title="Swap branches">
    ⇄
  </button>

  <div class="field">
    <label>Target Branch</label>
    <select 
      value={branch2} 
      on:change={(e) => dispatch("change", { branch1, branch2: e.target.value })}
    >
      <option value="" disabled>Select branch</option>
      {#each branches as b}
        <option value={b}>{b}</option>
      {/each}
    </select>
  </div>

  <button 
    class="btn btn-primary compare-btn" 
    disabled={!branch1 || !branch2 || branch1 === branch2}
    on:click={() => dispatch("compare")}
  >
    Compare
  </button>
</div>

<style>
  .compare-selector {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    background: var(--surface);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid var(--bdr);
    margin-bottom: 20px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
    color: var(--tx-d);
  }

  select {
    background: var(--bg);
    border: 1px solid var(--bdr);
    color: var(--tx-b);
    padding: 8px 12px;
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    cursor: pointer;
  }

  select:focus {
    border-color: var(--acc);
  }

  .swap-btn {
    background: var(--surface-h);
    border: 1px solid var(--bdr);
    color: var(--tx-d);
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    margin-bottom: 2px;
    transition: all 0.2s;
  }

  .swap-btn:hover {
    color: var(--tx-b);
    background: var(--bdr);
  }

  .compare-btn {
    height: 34px;
    margin-bottom: 2px;
  }
</style>
