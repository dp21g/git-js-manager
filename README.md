# Git Squash UI

Interactive browser UI for selectively squashing git commits.

**Stack:** Svelte 4 + Vite + Express. Zero exotic dependencies.

## Quick Start

```bash
npm install
npm run dev
```

This starts Express (API on `:3174`) and Vite (UI on `:5173` with proxy).  
Open [http://localhost:5173](http://localhost:5173).

## Usage

```bash
# From inside a git repo:
cd your-repo && npm run dev --prefix /path/to/git-squash-ui

# Or pass repo path as arg:
node server/index.mjs /path/to/repo

# Production build:
npm run build && npm start
```

If no repo is detected, the UI shows a folder picker (native dialog + in-browser browser).

## Project Structure

```
server/
  index.mjs          Express entry (~30 lines)
  git.mjs             Git operations: info, commits, squash, undo
  routes.mjs          API route wiring
  folder-picker.mjs   Directory listing + native OS dialog
src/
  main.js             Svelte mount
  global.css          Theme variables + base button styles
  App.svelte          Main shell — view switching
  lib/
    api.js            Fetch wrappers for all endpoints
    toast.js          Toast notification store
    Toast.svelte      Toast display
    InfoBar.svelte    Repo path, branch, base selector
    CommitList.svelte Toolbar + commit rows + action buttons
    CommitRow.svelte  Single commit toggle
    OutputPanel.svelte Rebase plan preview
    FolderPicker.svelte Browse dirs / native dialog
```

Every file has one job and is under 100 lines.

## How It Works

1. **Pick a repo** — auto-detects cwd, or browse/use native dialog
2. **Select a base branch** — dropdown of all local branches
3. **Click commits** to toggle between `pick` and `fixup`
4. **Squash** — runs `git rebase -i` with generated `GIT_SEQUENCE_EDITOR`
5. **Undo** — restores from backup saved in `/tmp/`

Stashes uncommitted changes before rebase and restores after.
