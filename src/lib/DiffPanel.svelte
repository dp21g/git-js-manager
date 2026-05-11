<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let diff = "";
  export let allowReverse = true;

  let selectedIndices = new Set();
  let shiftAnchor = null;

  function parseDiff(text) {
    if (!text) return { lines: [], globalHeader: "" };
    
    // Check if it looks like a git diff
    if (!text.includes("@@") && !text.startsWith("diff ") && !text.startsWith("---") && !text.startsWith("+++")) {
        return { lines: [{ type: 'normal', text: text, raw: text, left: null, right: null, index: 0 }], globalHeader: "" };
    }
    
    const lines = [];
    let leftLine = 0;
    let rightLine = 0;

    const rawLines = text.split("\n");
    let headerLines = [];
    let i = 0;
    while (i < rawLines.length && (
        rawLines[i].startsWith("diff") || 
        rawLines[i].startsWith("index") || 
        rawLines[i].startsWith("---") || 
        rawLines[i].startsWith("+++") ||
        rawLines[i].startsWith("old mode") ||
        rawLines[i].startsWith("new mode") ||
        rawLines[i].startsWith("similarity index") ||
        rawLines[i].startsWith("rename from") ||
        rawLines[i].startsWith("rename to")
    )) {
        if (!rawLines[i].startsWith("index ")) {
            headerLines.push(rawLines[i]);
        }
        i++;
    }
    const globalHeader = headerLines.join("\n");

    rawLines.forEach((line, index) => {
      let type = "normal";
      let left = "";
      let right = "";
      let content = line;

      if (line.startsWith("@@")) {
        type = "hunk";
        const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
        if (match) {
          leftLine = parseInt(match[1]) - 1;
          rightLine = parseInt(match[3]) - 1; 
        }
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        type = "add";
        rightLine++;
        right = rightLine;
        content = line.substring(1); 
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        type = "del";
        leftLine++;
        left = leftLine;
        content = line.substring(1);
      } else if (line.startsWith("\\")) {
        type = "meta";
      } else if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ") || index < i) {
        type = "meta";
      } else {
        if (line.startsWith(" ")) {
            content = line.substring(1);
        }
        leftLine++;
        rightLine++;
        left = leftLine;
        right = rightLine;
      }

      lines.push({ type, text: content, raw: line, left, right, index });
    });
    return { lines, globalHeader };
  }

  $: data = parseDiff(diff);
  $: lines = data.lines;
  $: globalHeader = data.globalHeader;
  $: if (!allowReverse && selectedIndices.size > 0) {
    clearSelection();
  }

  function toggleLine(index, event) {
    if (!allowReverse) return;
    const next = new Set(selectedIndices);
    
    if (event.shiftKey && shiftAnchor !== null) {
      const start = Math.min(shiftAnchor, index);
      const end = Math.max(shiftAnchor, index);
      for (let i = start; i <= end; i++) {
        if (lines[i] && (lines[i].type === 'add' || lines[i].type === 'del')) {
          next.add(i);
        }
      }
    } else {
      if (next.has(index)) {
        next.delete(index);
      } else {
        if (lines[index] && (lines[index].type === 'add' || lines[index].type === 'del')) {
            next.add(index);
            shiftAnchor = index;
        }
      }
    }
    selectedIndices = next;
  }

  function clearSelection() {
    selectedIndices = new Set();
    shiftAnchor = null;
  }

  function discardSelection() {
    if (!allowReverse) return;
    if (selectedIndices.size === 0) return;
    if (!confirm(`Discard ${selectedIndices.size} selected lines?`)) return;
    
    let patchContent = globalHeader + "\n";
    let currentHunkHeader = null;
    let hunkLines = [];

    lines.forEach((line) => {
        if (line.type === 'hunk') {
            if (hunkLines.some(l => selectedIndices.has(l.index))) {
                patchContent += generateMinimalReverseHunk(currentHunkHeader, hunkLines);
            }
            currentHunkHeader = line;
            hunkLines = [];
        } else if (line.type !== 'meta') {
            hunkLines.push(line);
        }
    });
    
    if (hunkLines.some(l => selectedIndices.has(l.index))) {
        patchContent += generateMinimalReverseHunk(currentHunkHeader, hunkLines);
    }

    dispatch("reverse-patch", patchContent);
    clearSelection();
  }

  function discardAllHunks() {
      if (!allowReverse) return;
      if (!confirm("Discard ALL changes in this file?")) return;
      const allSelected = new Set();
      lines.forEach(l => {
          if (l.type === 'add' || l.type === 'del') allSelected.add(l.index);
      });
      selectedIndices = allSelected;
      discardSelection();
  }


  /**
   * Generates a minimal hunk by including only context lines immediately around 
   * the selected changes.
   */
  function generateMinimalReverseHunk(headerLine, hunkLines) {
    // 1. Map all lines to their intended patch state
    const mapped = hunkLines.map(line => {
        const isSelected = selectedIndices.has(line.index);
        if (line.type === 'normal') return { type: 'ctx', text: " " + line.text };
        if (line.type === 'add') {
            return isSelected ? { type: 'rem', text: "-" + line.text } : { type: 'ctx', text: " " + line.text };
        }
        if (line.type === 'del') {
            return isSelected ? { type: 'ins', text: "+" + line.text } : { type: 'skip' };
        }
        return { type: 'skip' };
    });

    // 2. Identify the range of lines to include (changes + small context)
    let firstChange = -1;
    let lastChange = -1;
    mapped.forEach((m, idx) => {
        if (m.type === 'rem' || m.type === 'ins') {
            if (firstChange === -1) firstChange = idx;
            lastChange = idx;
        }
    });

    if (firstChange === -1) return "";

    // Include 2 lines of context if possible
    const CONTEXT_SIZE = 2;
    const startIdx = Math.max(0, firstChange - CONTEXT_SIZE);
    const endIdx = Math.min(mapped.length - 1, lastChange + CONTEXT_SIZE);

    // 3. Filter mapped lines for this range
    let finalLines = [];
    let buffer = [];
    let oldLinesCount = 0;
    let newLinesCount = 0;

    const flush = () => {
        buffer.forEach(l => {
            if (l.type === 'rem') oldLinesCount++;
            if (l.type === 'ins') newLinesCount++;
            if (l.type === 'ctx') { oldLinesCount++; newLinesCount++; }
        });
        // Removals before additions within the block
        finalLines.push(...buffer.filter(l => l.type === 'rem').map(l => l.text));
        finalLines.push(...buffer.filter(l => l.type === 'ins').map(l => l.text));
        buffer = [];
    };

    for (let i = startIdx; i <= endIdx; i++) {
        const m = mapped[i];
        if (m.type === 'skip') continue;
        if (m.type === 'ctx') {
            flush();
            finalLines.push(m.text);
            oldLinesCount++;
            newLinesCount++;
        } else {
            buffer.push(m);
        }
    }
    flush();

    // 4. Calculate starting line number
    // We need to offset startLine based on how many 'old' (context/add) lines we skipped before startIdx
    const match = headerLine.raw.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    const originalStart = parseInt(match[3]);
    
    let lineOffset = 0;
    for (let i = 0; i < startIdx; i++) {
        const m = mapped[i];
        if (m.type === 'ctx' || m.type === 'rem') lineOffset++;
    }

    const startPos = originalStart + lineOffset;
    const newHeader = `@@ -${startPos},${oldLinesCount} +${startPos},${newLinesCount} @@\n`;
    
    return newHeader + finalLines.join("\n") + "\n";
  }

  function handleReverseHunk(hunkIndex) {
    if (!allowReverse) return;
    const next = new Set();
    let i = hunkIndex + 1;
    while (i < lines.length && lines[i].type !== 'hunk' && lines[i].type !== 'meta') {
        if (lines[i].type === 'add' || lines[i].type === 'del') {
            next.add(i);
        }
        i++;
    }
    selectedIndices = next;
    discardSelection();
  }

</script>

<div class="diff-container" class:has-selection={selectedIndices.size > 0}>
  {#if !diff}
    <div class="empty">Select a file to view diff</div>
  {:else}
    <div class="diff-header-bar">
        <div class="header-left">
            {#if !allowReverse}
                <span class="hint">Review this stash diff, then apply the file or the whole stash from the panel above.</span>
            {:else if selectedIndices.size > 0}
                <button class="btn btn-primary btn-sm discard-sel-btn" on:click={discardSelection}>
                    🗑 Discard Selected ({selectedIndices.size} lines)
                </button>
                <button class="btn btn-ghost btn-sm" on:click={clearSelection}>
                    Clear
                </button>
            {:else}
                <span class="hint">Select red/green lines to undo specific changes from this view.</span>
            {/if}
        </div>
        
        <div class="header-right">
            {#if diff && allowReverse}
                <button class="btn btn-ghost btn-sm discard-all-btn" on:click={discardAllHunks}>
                    🗑 Discard All Hunks
                </button>
            {/if}
        </div>
    </div>


    <div class="diff-view">
      {#each lines as line}
        <div 
            class="line" 
            class:add={line.type === "add"} 
            class:del={line.type === "del"} 
            class:hunk={line.type === "hunk"} 
            class:meta={line.type === "meta"}
            class:selected={selectedIndices.has(line.index)}
        >
          <div
            class="line-nums"
            class:disabled={!allowReverse}
            on:click={(e) => toggleLine(line.index, e)}
            on:keydown={(e) => (e.key === "Enter" || e.key === " ") && toggleLine(line.index, e)}
            role="button"
            aria-disabled={!allowReverse}
            tabindex="0"
          >
            {#if line.type !== 'hunk' && line.type !== 'meta'}
                <span class="ln">{line.left || ''}</span>
                <span class="ln">{line.right || ''}</span>
            {:else}
                <span class="ln-pad"></span>
            {/if}
          </div>
          
          {#if line.type === 'hunk'}
            {#if allowReverse}
              <button class="hunk-reverse-btn" on:click={() => handleReverseHunk(line.index)} title="Discard this entire hunk">
                  🗑 Discard Hunk
              </button>
            {/if}
          {/if}


          <pre>{line.text}</pre>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .diff-container {
    background: var(--surface);
    border: 1px solid var(--bdr);
    border-radius: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
  }

  .diff-header-bar {
      padding: 8px 16px;
      background: var(--surface-h);
      border-bottom: 1px solid var(--bdr);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      min-height: 48px;
  }
  .header-left, .header-right { display: flex; align-items: center; gap: 8px; }

  .discard-sel-btn { background: var(--red) !important; border-color: var(--red) !important; }
  .discard-all-btn { color: var(--red); }
  .discard-all-btn:hover { background: rgba(248, 81, 73, 0.1); }


  .hint { font-size: 11px; color: var(--tx-d); }

  .diff-view {
    flex: 1;
    overflow: auto;
    padding: 16px 0;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--tx-d);
    font-style: italic;
  }

  .line {
    display: flex;
    white-space: pre;
    min-height: 1.4em;
    padding-right: 16px;
    position: relative;
  }

  .line-nums {
    display: flex;
    gap: 0;
    width: 80px;
    flex-shrink: 0;
    user-select: none;
    background: var(--surface-h);
    border-right: 1px solid var(--bdr);
    margin-right: 12px;
    cursor: pointer;
  }

  .line-nums:hover {
      background: var(--bdr);
  }

  .line-nums.disabled {
      cursor: default;
  }

  .line-nums.disabled:hover {
      background: var(--surface-h);
  }

  .ln, .ln-pad {
    width: 40px;
  }

  .ln {
    text-align: right;
    padding-right: 8px;
    color: var(--tx-d);
    opacity: 0.5;
    font-size: 10px;
  }

  .line pre {
    margin: 0;
    padding: 0;
    white-space: pre;
  }

  .add { background: rgba(46, 160, 67, 0.15); }
  .add pre { color: #3fb950; }
  .del { background: rgba(248, 81, 73, 0.15); }
  .del pre { color: #f85149; }
  
  .selected {
      background: rgba(129, 140, 248, 0.3) !important;
  }
  .add.selected {
      background: rgba(129, 140, 248, 0.4) !important;
  }

  .hunk { background: rgba(56, 139, 253, 0.1); }
  .hunk pre { color: #7d8590; font-weight: bold; }
  
  .hunk-reverse-btn {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--red);
      border: 1px solid var(--red);
      color: white;
      font-size: 10px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: all 0.2s;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }
  .line:hover .hunk-reverse-btn { opacity: 0.8; }
  .hunk-reverse-btn:hover { opacity: 1 !important; transform: translateY(-50%) scale(1.05); }


  .meta { color: var(--tx-d); background: var(--surface-h); }
</style>
