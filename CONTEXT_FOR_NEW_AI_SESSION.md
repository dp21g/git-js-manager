# Git Squash UI - Project Context & Architectural Overview

> [!IMPORTANT]
> **AI MAINTENANCE RULE**: If you perform any structural changes, introduce major features, or alter core patterns (e.g., how tabs work, how state is persisted, or how backend scripts are invoked), you **MUST** update this file to reflect the latest state.

## Project Goal
A high-performance, web-based Git workspace designed for advanced workflows like selective squashing, multi-branch comparisons, and granular commit management.

## Tech Stack
- **Frontend**: Svelte (Vite) with vanilla CSS.
- **Backend**: Node.js + Express.
- **Git Interop**: Native shell scripts (`scripts/*.sh`) executed via `child_process` in `server/git.mjs`.
- **API**: RESTful communication with repository context passed via headers.

## Core Architectural Patterns

### 1. Integrated Workspace (Main Entry: `App.svelte`)
The application now uses a **left repository drawer** plus a global top bar.
- **Responsive Repo Drawer**: On large widths, the repo drawer can be manually shown or hidden to save horizontal space. On medium/small widths, it becomes an overlay drawer opened from a hamburger button.
- **Drawer-Owned Repo Controls**: The active repository metadata, source branch display, base-branch selector, and repo-change action all live inside the drawer.
- **Minimal Top Bar**: The global top bar is intentionally slim and contains the drawer toggle, the **Mode Switcher** (`Squash`, `Diff`, `Compare`, `Commit`, `Logs`), and right-aligned action icons such as Refresh and Settings.
- **Tab State**: Each repo tab tracks its own `repoPath` and UI state. `App.svelte` synchronizes active tab status with the top bar via a `status-update` event dispatched from `ProjectView.svelte`.
- **Persistence**: Tabs, settings, and per-repo UI state are stored in `workspace-config/config.json`.
- **Theme Sync**: The active theme (light/dark) is synchronized to the `document.body` class to ensure consistent rendering across all components and drawer states.

### 2. Multi-Repo Context Management (`api.js` & `routes.mjs`)
- **Frontend**: `setActiveRepo(path)` in `src/lib/api.js` adds the `X-Repo-Path` header to outgoing requests.
- **Backend**: Routes in `server/routes.mjs` use `getTarget(req)` to isolate git operations to the specific repo context of the active tab.

### 3. Squash Mode & Commit Management
The workspace separates history rewriting and working-tree management by mode:
- **Maximized View**: The "Rebase Plan Preview" has been removed to allow the Commit List to span the full height of the main panel.
- **Custom Commit Message**: A dedicated textarea at the bottom of the Squash view allows users to override the default commit message. If empty, it defaults to the message of the oldest commit in the selection.
- **Undo Integration**: The "Undo Last Squash" action is localized to the Squash toolbar for better contextual access.
- **Commit View Local Commits**: The Commit view’s top sidebar section now shows local-only commits (commits not present on a remote) and allows inline renaming of their commit messages.
- **Rename Backend Flow**: Commit-message rewriting is implemented via `scripts/rename-commit.sh`, exposed through `server/git.mjs` and `server/routes.mjs`, and is designed to stash/restore working tree changes while it rebases local history.

### 4. Logs Mode & Floating Panel
- **Dedicated Logs Page**: Logs are now a first-class workspace mode via a `Logs` button in the top bar. The logs page shows the full execution history with branch context and refresh controls.
- **Optional Floating Panel**: The old floating log overlay is now optional. It can be enabled or disabled from the Logs page, and the preference is persisted per repository in `repoStates.logPanelFloating`.
- **Mode-Aware Behavior**: When the full Logs page is open, the floating panel is hidden automatically to avoid covering the content.

### 5. Style & Aesthetics
The app uses a hybrid "Pill & Tab" design:
- **Focused Metadata**: Repository and branch information live primarily in the drawer, with a compact collapsed summary beside the drawer toggle when the desktop drawer is hidden.
- **Full-Height Tabs**: View modes are full-height buttons in the top bar, providing a browser-like feel when navigating between Git operations.
- **CSS System**: Scoped variables in `App.svelte` handle both premium dark and high-contrast light modes.

## Future Development Guidelines
- **Adding Git Commands**: Create a `.sh` script, add it to `server/git.mjs`, then expose via `server/routes.mjs`.
- **UI Components**: Keep components in `src/lib/`. Use `ConfirmModal.svelte` for any destructive or high-impact actions (like Undo Squash).
- **Communication**: Use `bind:this` and `export function` sparingly; prefer events for upward communication and props for downward data flow.


- **Optional Draggable Log Panel**: When enabled, the floating execution log displays the active branch name in a high-contrast accent header. Users can drag the panel anywhere in the viewport, and its last position is persisted per repository in `repoStates.logPanelPosition`.

## Configuration & State
- **Workspace Config**: `workspace-config/config.json` stores `tabs`, `settings`, and `repoStates` for this checkout of the app.
- **User Home Data**: `~/.git-squash-ui/` is still used for backups and script logs.
- **Session State**: `repoStates` and `tabs` are updated in real-time to allow for seamless resumption after a reload.
