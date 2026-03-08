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

### 1. Multi-Tab Workspace (Main Entry: `App.svelte`)
The application uses a browser-like tabbed interface. 
- **Tab State**: Each tab tracks its own `repoPath`, `activeMode`, and UI state (collapsed sections, resizer widths).
- **Persistence**: Navigation state and open tabs are saved to `~/.git-squash-ui/config.json` via the `/update-tabs` endpoint.
- **Implementation**: `App.svelte` manages the tab list; each tab renders an isolated `ProjectView.svelte`.

### 2. Multi-Repo Context Management (`api.js` & `routes.mjs`)
To support multiple repositories simultaneously across tabs:
- **Frontend**: The `setActiveRepo(path)` function in `src/lib/api.js` updates a global variable that adds the `X-Repo-Path` header to every outgoing API request.
- **Backend**: All routes in `server/routes.mjs` use `getTarget(req)` to extract this header. It overrides the default `state.repoPath` for that specific command.

### 3. Commit Mode Layout (`StatusList.svelte` & `ProjectView.svelte`)
"Commit Mode" uses a specialized "Studio" layout:
- **Vertical Sidebar**: Staged, Unstaged, and Local Exclusions are listed in a resizable left sidebar.
- **Integrated Commit Form**: The commit message textarea and "🚀 Commit" button are located at the bottom of the left sidebar (non-collapsible).
- **Maximized Diff**: The main panel is reserved entirely for the `DiffPanel.svelte`, providing maximum visibility for code review.
- **Local Exclusions**: Files added to "Local Exclusions" (managed via `manage-exclude.sh`) are automatically filtered out of the Staged/Unstaged lists in the UI for a zero-noise workspace.

### 4. Style & Aesthetics
The app follows a "Premium Dark" aesthetic (GitHub-inspired palette).
- **CSS Variables**: Defined in `App.svelte` and inherited globally.
- **Transitions**: Smooth hover effects and resizable transitions are required for all interactive elements.

## Future Development Guidelines
- **Adding Git Commands**: Create a `.sh` script, add it to `server/git.mjs`, then expose via `server/routes.mjs`.
- **UI Components**: Keep components in `src/lib/`. Use `createEventDispatcher` for communication back to the `ProjectView` parent.
- **State**: Prefer reactive Svelte declarations (`$:`) for UI filtering (like the exclusion filter).

## Current Configuration Path
`~/.git-squash-ui/config.json`
`lastRepo`, `repoStates`, `tabs` (contains the workspace layout).
