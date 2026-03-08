<script>
  import { showToast } from "./toast.js";

  export let commits = [];
  export let selected = new Set();

  $: selectedIndexes = Array.from(selected).sort((a, b) => a - b);
  $: fixupCount = selectedIndexes.length;
  $: squashCount = fixupCount > 0 ? fixupCount + 1 : 0;
  $: expectedTail = fixupCount
    ? Array.from({ length: fixupCount }, (_, i) => commits.length - fixupCount + i)
    : [];
  $: isTailSquash = fixupCount > 0 && selectedIndexes.every((value, index) => value === expectedTail[index]);
  $: squashedCommits = isTailSquash ? commits.slice(commits.length - squashCount) : [];

  $: plan = isTailSquash
    ? [
        "scripts/squash.sh will run:",
        "",
        `git reset --soft HEAD~${squashCount}`,
        `git commit --no-verify --file /tmp/git-squash-message-<timestamp>.txt`,
        "",
        "Commits being combined:",
        ...squashedCommits.map((commit) => `- ${commit.hash} ${commit.message}`),
      ].join("\n")
    : "Select a contiguous block of the latest commits to see the exact squash script plan.";

  function copy() {
    navigator.clipboard.writeText(plan).then(() => showToast("Copied!"));
  }
</script>

{#if selected.size > 0}
  <div class="output">
    <div class="header">
      <span class="label">Rebase Plan Preview</span>
      <button class="copy-btn" on:click={copy}>Copy</button>
    </div>
    <pre class="plan">{plan}</pre>
  </div>
{/if}

<style>
  .output {
    margin-top: 24px;
    border-radius: 8px;
    border: 1px solid var(--bdr);
    overflow: hidden;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    border-bottom: 1px solid var(--bdr);
    background: var(--surface);
  }
  .label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--tx-d);
  }
  .copy-btn {
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--bdr);
    background: transparent;
    color: var(--grn);
  }
  .copy-btn:hover { background: var(--surface); }
  .plan {
    margin: 0;
    padding: 14px;
    font-size: 11px;
    line-height: 1.8;
    color: var(--tx-b);
    background: var(--bg);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
