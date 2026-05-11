# Git Squash UI - Project Context & Architectural Overview

> [!IMPORTANT]
> **AI MAINTENANCE RULE**: Update this file after structural changes, major features, or core pattern shifts.

## Project Goal
High-performance Git workspace for selective squashing, multi-branch comparison, and granular commit management.

## Tech Stack
- **Desktop Shell**: Tauri 2 macOS (`src-tauri/`)
- **Frontend**: Svelte 4 (Vite) + vanilla CSS
- **Backend**: Node.js + Express, launched as a Tauri sidecar
- **Git Interop**: Tauri Rust commands for read-only + branch mutating ops; shell scripts (`scripts/*.sh`) via `server/git.mjs` for auth-sensitive flows (commit, push, stash). All frontend API calls try Tauri native invoke first, fall back to HTTP.
- **API**: RESTful with `X-Repo-Path` header for repo context.

## Core Architecture

### 1. Workspace Layout (`App.svelte`)
- Left **repo drawer** with expandable repo rows → `Local Branches` / `Remote Branches` foldable sections. Local defaults open, remote defaults closed (lazy-fetched on expand).
- **Zoom shell** (`transform: scale()`) wraps the entire UI. Components that need `position: fixed` (ContextMenu, overlays) **must render outside** the zoom-shell or use viewport-relative coordinates.
- Top bar: drawer toggle, mode switcher (Squash/Diff/Compare/Commit/Logs), refresh + settings icons.
- Lazy tab mounting: only active tab loads `ProjectView` at startup. All repo summaries are preloaded on mount for instant drawer expansion.

### 2. Repo Drawer (`RepoDrawer.svelte`)
- Expansion state per tab (keyed by `tab.id`, fallback to `repoPath`) in `settings.drawerRepoState` → persisted in config.json.
- **Reactivity**: Expansion flags (`expanded`, `localExpanded`, `remoteExpanded`) are read directly in `{@const}` blocks from the `repoDrawerState` prop. NO intermediate reactive objects or helper functions — those break Svelte's dependency tracking.
- Branch rows: **double-click** to switch; **right-click** opens context menu.
- Loading spinners: right-aligned on section headers while fetching (detected via `repoSummaryLoads` prop).
- `slide` transition on keyed `{#each}` branch rows for delete animation.

### 3. Context Menu & Branch Operations
- `ContextMenu.svelte` renders in `App.svelte` at root level (outside zoom-shell) to avoid `position: fixed` being trapped by the CSS transform.
- **Flow**: right-click branch → `RepoDrawer` dispatches `ctx-open` → `App.svelte` shows context menu + overlay dialogs → actions call API (Tauri native first, HTTP fallback).
- **Actions**:
  - `git_delete_branch` (Tauri) / `scripts/delete-branch.sh` (Node): `git branch -D`, optional `git push --delete`
  - `git_rename_branch` (Tauri) / `scripts/rename-branch.sh` (Node): `git branch -m`
  - `git_switch_branch` (Tauri) / `switch-branch.sh` (Node): `git switch`
- **Overlays**: Rename (inline input) and Delete (checkbox for remote) dialogs with loading/error states. Sound effects via Web Audio API on success.
- **Bug to avoid**: API calls must pass explicit `repoPath` — never rely on `currentRepoPath` for non-active-tab operations.

### 4. Tauri Rust Commands (`src-tauri/src/lib.rs`)
| Command | Git Operation |
|---|---|
| `git_repo_summary` | `branch --show-current`, `for-each-ref refs/heads`, `for-each-ref refs/remotes` (lazy) |
| `git_repo_status` | `status --porcelain=v1` |
| `git_delete_branch` | `branch -D` + optional `push --delete` |
| `git_rename_branch` | `branch -m old new` |
| `git_switch_branch` | `switch` (with remote tracking branch creation) |
All use `std::process::Command::new("git")` via helper `run_git()`. Return types use `#[serde(rename_all = "camelCase")]`.

### 5. Commit View & Status Tracking
- **Staged-then-modified files**: `StatusList.svelte` filters `unstagedFiles` by `f.unstaged || f.untracked` (not `!f.staged`). A file with porcelain `MM` appears in **both** staged and unstaged sections. `getUnstagedLetter()` reads `f.y` for the correct unstaged badge. Files in unstaged section always stage (not toggle).
- Section collapses persisted in `collapsedSections` per repo.
- Section headers compacted: `8px 12px` padding, `32px` collapsed height.

### 6. State Persistence
- **Config**: `workspace-config/config.json` stores `tabs`, `settings` (theme, zoom, drawer widths/state), `repoStates` (per-repo sidebar widths, section collapse, diff splits, log panel position).
- **Flush-on-exit**: `ProjectView.svelte` flushes pending `persistState()` in `onDestroy`, on mode switch (`toggleMode`), and on resize stop (`stopResizing`). Debounce reduced to 300ms. This prevents data loss when switching tabs/views mid-resize.
- API functions that act on a specific repo accept `repoPath` as an optional last argument, passed through to `request()` as `repoPathOverride`.

### 7. Themes
- Three themes: `dark` (#1e1e1e), `medium` (#353535), `light` (#f3f3f3) — defined in `src/global.css` under `body[data-theme="..."]`.
- Available themes enumerated in `server/ui-settings.mjs` (`THEMES`, `THEME_OPTIONS`).
- Accent: `#4ea1ff` on dark/medium, `#005fb8` on light.

### 8. Components
| File | Purpose |
|---|---|
| `App.svelte` | Root: zoom-shell, drawer, top bar, context menu + overlays, settings/confirm modals, toast |
| `RepoDrawer.svelte` | Repo/branch tree with expand/collapse, tooltips, loading spinners, context menu events |
| `ContextMenu.svelte` | Fixed-position right-click menu (rendered in App, not RepoDrawer) |
| `Tooltip.svelte` | Animated hover tooltip (400ms delay, fade+slide, viewport-aware positioning) |
| `ProjectView.svelte` | Per-tab workspace with mode routing, resize handling, state persistence |
| `StatusList.svelte` | Commit sidebar: unpushed/staged/unstaged/excluded/stashes sections |
| `ConfirmModal.svelte` | Generic confirm/cancel dialog |

## Configuration & State
- `workspace-config/config.json` — `tabs`, `settings` (theme, zoom, drawer width/visibility, `drawerRepoState`), `repoStates` (per-repo sidebar sizes, section collapse, diff splits, log panel)
- `server/ui-settings.mjs` — `DEFAULT_SETTINGS`, `normalizeUiSettings()`, zoom/width clamps, theme list
- `server/config.mjs` — reads/writes config.json, seeds release config

## Key Conventions
- **API calls**: Always pass explicit `repoPath` for multi-repo safety. Use `tryNativeInvoke()` → HTTP fallback pattern.
- **Reactivity**: Read props directly in template `{@const}` blocks. Avoid intermediate reactive statements wrapping prop reads in helper functions.
- **Position fixed**: Components using `position: fixed` must render outside `.zoom-shell` (it has `transform: scale()` creating a new containing block).
- **Branch switching**: Double-click on branch row dispatches `switch-local-branch` / `switch-remote-branch`. Single click does NOT switch.
- **Events** over `bind:this` / `export function` for cross-component communication.
