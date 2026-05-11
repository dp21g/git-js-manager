# Terminal Command Architecture

How git commands flow from button click to process execution, and how the UI stays responsive.

---

## Table of Contents

1. [High-Level Flow](#high-level-flow)
2. [Frontend Layer](#frontend-layer)
3. [Tauri Native Path (Rust)](#tauri-native-path-rust)
4. [Server HTTP Fallback Path (Node.js)](#server-http-fallback-path-nodejs)
5. [Event Loop Blocking Analysis](#event-loop-blocking-analysis)
6. [Non-Blocking UI Strategy](#non-blocking-ui-strategy)
7. [Sidecar Architecture](#sidecar-architecture)
8. [Startup & Boot Sequence](#startup--boot-sequence)
9. [YubiKey PIN Automation](#yubikey-pin-automation)
10. [Key Files Reference](#key-files-reference)

---

## High-Level Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    User clicks git button                     │
│                    (Pull / Fetch / Push)                      │
└───────────────────────────┬──────────────────────────────────┘
                            │
               App.svelte:81  handleGitCommand()
                            │
               ┌────────────▼────────────┐
               │  Set loading state      │  ← gitCmdLoading = "pull"
               │  Set status message     │  ← gitCmdStatus = "Pulling from origin…"
               │  (UI re-renders now)    │
               └────────────┬────────────┘
                            │
               api.js:389   runGitCommand()
                            │
               ┌────────────▼────────────┐
               │  tryNativeInvoke(       │
               │    "git_command", ...)  │
               └─────┬──────────┬────────┘
                     │          │
              Tauri OK     Tauri absent/error
                     │          │
          ┌──────────▼──┐  ┌───▼──────────────┐
          │ Tauri Rust  │  │ HTTP POST to      │
          │ Path        │  │ :43174/api/git-   │
          │ (truly      │  │ command           │
          │  async)     │  └───┬───────────────┘
          └──────┬──────┘  ┌───▼───────────────┐
                 │          │ async route handler│
                 │          │ → runGitCommand()  │
                 │          │   (Promise-based)  │
                 │          │ NON-blocking       │
                 │          └───┬───────────────┘
                 │              │
                 └──────┬───────┘
                        │
            ┌───────────▼────────────┐
            │  Result returned       │
            │  Status updated in UI  │
            │  Views refreshed       │
            └────────────────────────┘
```

**Two execution paths exist** for every git command. Both are now fully non-blocking:
- The **Tauri native path** uses `tokio::process::Command` — a truly async process, no thread held.
- The **HTTP fallback path** uses `execFile` + Promise — event loop stays responsive during long operations.

---

## Frontend Layer

### API Dispatch (`src/lib/api.js`)

Every API call follows the same pattern: **try Tauri native first, fall back to HTTP**.

```javascript
// src/lib/api.js:15-25
async function tryNativeInvoke(command, args = {}) {
  const invoke = getTauriInvoke();       // window.__TAURI__?.core?.invoke
  if (!invoke) return null;              // Not in Tauri → fall through
  try {
    return await invoke(command, args);  // Tauri IPC call
  } catch (err) {
    console.warn(`Tauri invoke ${command} failed:`, err);
    return null;                         // Error → fall through to HTTP
  }
}
```

`tryNativeInvoke` returns `null` in two cases:
1. Running in a plain browser (no `window.__TAURI__`)
2. The Tauri invoke threw an error

Callers treat `null` as "try HTTP instead":

```javascript
// src/lib/api.js:389-398
export async function runGitCommand(command, repoPath) {
  const nativeResult = await tryNativeInvoke("git_command", {
    repoPath: targetPath, command
  });
  if (nativeResult) return nativeResult;   // Tauri path succeeded
  return request("/git-command", {         // HTTP fallback
    method: "POST",
    body: JSON.stringify({ command }),
  }, repoPath);
}
```

### HTTP Retry Strategy (`src/lib/api.js:55-94`)

The `request()` helper includes automatic retry with exponential-ish backoff for GET requests. This handles the race where the Tauri window opens before the Node.js sidecar finishes binding its port:

```javascript
const RETRY_DELAYS = [150, 250, 400, 700, 1000, 1500, 2000, 2500];
```

Only `fetch` network errors ("failed to fetch") trigger retries. HTTP errors (4xx, 5xx) are returned immediately. All requests carry `X-Repo-Path` header for multi-repo context.

### Frontend State During Operations (`src/App.svelte:68-69`)

```javascript
let gitCmdLoading = null;   // Which command is running ("pull"|"fetch"|"push")
let gitCmdStatus = "";      // Human-readable status text
```

The `handleGitCommand` function (`src/App.svelte:81-113`) follows this sequence:

1. **Set loading** → `gitCmdLoading = cmdId` (triggers Svelte reactivity)
2. **Set status** → `gitCmdStatus = "Pulling from origin…"`
3. **`await` the command** → yields to browser event loop
4. **On return** → `gitCmdStatus = "Pull completed"` or `"Pull failed"`
5. **Cleanup** → after 3s idle, clear status

The template (`src/App.svelte:821-849`) reflects these states in real-time:

```svelte
<button class="git-cmd-btn"
        class:loading={gitCmdLoading === cmd.id}
        disabled={gitCmdLoading === cmd.id}>
  {#if gitCmdLoading === cmd.id}
    <span class="spin-sm"></span>   <!-- CSS spinner -->
  {/if}
  {cmd.label}
</button>

{#if gitCmdStatus}
  <span class="git-cmd-status"
        class:error={gitCmdStatus.includes("failed")}>
    {gitCmdStatus}
  </span>
{/if}
```

---

## Tauri Native Path (Rust)

### Entry Point: `git_command` (`src-tauri/src/lib.rs`)

```rust
#[tauri::command]
async fn git_command(
  repo_path: String,
  command: String,
  locks: tauri::State<'_, RepoLocks>,
) -> Result<GitCommandResult, String> {
  // Acquire a per-repo lock so concurrent operations on the same repo are queued.
  // Different repos proceed in parallel.
  let lock = {
    let mut map = locks.0.lock().unwrap();
    map.entry(repo_path.clone())
      .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
      .clone()
  };
  let _guard = lock.lock().await;

  let repo = Path::new(&repo_path);
  let scripts_dir = repo_root().join("scripts");
  run_git_zsh(repo, &command, &scripts_dir).await
}
```

This is a `#[tauri::command]` — Tauri's IPC bridge exposes it to the frontend. It is `async`, so it never holds a tokio worker thread during execution.

### Truly Async Process Execution: `run_git_zsh` (`src-tauri/src/lib.rs`)

```rust
async fn run_git_zsh(repo_path: &Path, git_args: &str, scripts_dir: &Path)
  -> Result<GitCommandResult, String>
{
  let full_cmd = format!(
    "cd '{}' && PATH=\"{}:$PATH\" git-with-pin {}",
    repo_path.display(), scripts_dir.display(), git_args
  );
  let start = Instant::now();

  let mut cmd = tokio::process::Command::new("zsh");
  cmd.arg("-c").arg(&full_cmd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  if let Ok(pin) = std::env::var("GIT_SQUASH_YUBIKEY_PIN") {
    cmd.env("GIT_SQUASH_YUBIKEY_PIN", &pin);
  }

  // tokio::process::Command::output() suspends the Future at .await.
  // Zero threads held while git runs. stdout and stderr are drained
  // concurrently, eliminating the pipe-buffer deadlock risk.
  let output = tokio::time::timeout(
    Duration::from_secs(120),
    cmd.output(),
  )
  .await
  .map_err(|_| "Git command timed out after 120s".to_string())?
  .map_err(|e| format!("Failed to run zsh command: {e}"))?;

  let duration_ms = start.elapsed().as_millis() as u64;
  let stdout = String::from_utf8_lossy(&output.stdout)
    .replace("\r\n", "\n").trim_end().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr)
    .replace("\r\n", "\n").trim_end().to_string();

  Ok(GitCommandResult {
    ok: output.status.success(),
    command: full_cmd,
    stdout, stderr,
    exit_code: output.status.code().unwrap_or(-1),
    duration_ms,
  })
}
```

Key design decisions:
- **`tokio::process::Command`** not `std::process::Command` — suspends the async task at `.await`, no thread held
- **`tokio::time::timeout`** wraps the `.output()` future — 120s hard deadline, process killed on expiry
- **Concurrent pipe drain** — `output()` reads stdout and stderr simultaneously, eliminating the pipe-buffer deadlock that sequential draining risks
- **`stdin` is NOT attached** — the child cannot prompt the user; `git-with-pin` handles credential prompts (see [PIN Automation](#yubikey-pin-automation))

#### Previous design and why it was wrong

The old implementation used `std::process::Command::spawn()` followed by a `try_wait()` polling loop:

```rust
// OLD — do not use
loop {
    match child.try_wait() {
        Ok(None) => {
            thread::sleep(Duration::from_millis(200)); // starves a tokio worker thread
        }
    }
}
```

Tauri commands run on tokio's async runtime. `thread::sleep` inside an async context monopolises a worker thread for the full duration (up to 120s). With enough concurrent git operations this exhausts the thread pool. The new `tokio::process::Command` approach holds zero threads while waiting.

### Per-Repo Concurrency Guard

```rust
struct RepoLocks(Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>);
```

The outer `std::sync::Mutex` is held only long enough to retrieve (or create) the per-repo `tokio::sync::Mutex`. The inner async mutex is held for the duration of the git command, queuing subsequent operations on the same repo without dropping them. Different repos execute concurrently.

`RepoLocks` is registered as Tauri managed state in `run()`:
```rust
.manage(RepoLocks::default())
```

### Synchronous Operations: `run_git` (`src-tauri/src/lib.rs`)

For short-lived git operations (branch listing, switch, delete), the synchronous pattern is retained:

```rust
fn run_git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
  let output = Command::new("git")
    .arg("-C").arg(repo_path)
    .args(args)
    .output()                              // ← blocks current thread
    .map_err(...)?;
  // ...
}
```

These are fast operations (<1s) where blocking is negligible. Multiple independent reads are parallelised with `thread::spawn`.

### Tauri Command Threading Model

Each `#[tauri::command]` runs as an async task on tokio's runtime. With `tokio::process::Command`, the worker thread is suspended at `.await` and reused by other tasks while git runs. The browser window processes UI events independently of backend command execution.

---

## Server HTTP Fallback Path (Node.js)

### Route Handler (`server/routes.mjs`)

```javascript
router.post("/git-command", async (req, res) => {
  const { command } = req.body;
  const target = getTarget(req);           // X-Repo-Path header or state.repoPath
  res.json(await runGitCommand(target, command, state.logs));
});
```

The handler is `async` and `await`s the result, which means the event loop is free to process other requests (status polls, settings saves) while a long git pull is in progress.

### `runGitCommand` (`server/git.mjs`)

```javascript
export async function runGitCommand(repoPath, command, logs) {
  const needsUserShell = command.includes("push")
                      || command.includes("fetch")
                      || command.includes("pull");

  if (needsUserShell) {
    // Async path: event loop stays responsive during the network operation
    const r = await runInUserShellAsync(displayCommand, repoPath, 60000, extraEnv);
    if (!r.ok) return { error: r.err };
    return { ok: true, stdout: r.out };
  }

  // Fast local operations — sync path unchanged
  const r = git(command, repoPath, logs);
  if (!r.ok) return { error: r.err };
  return { ok: true, stdout: r.out };
}
```

### `runInUserShellAsync` (`server/git.mjs`)

```javascript
function runInUserShellAsync(command, cwd, timeout = 60000, extraEnv = {}) {
  return new Promise((resolve) => {
    execFile(USER_SHELL, ["-lc", command], {
      cwd,
      encoding: "utf-8",
      timeout,
      env: buildShellEnv(extraEnv),
      stdio: ["pipe", "pipe", "pipe"],
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, out: "", err: normalizeCommandError(...), exitCode: ... });
      } else {
        resolve({ ok: true, out: normalizeCommandOutput(stdout), ... });
      }
    });
  });
}
```

- **`execFile` + callback** not `execFileSync` — the event loop is never blocked; Node.js schedules the callback when the child exits
- **`-lc` flags**: `-l` makes it a login shell (loads `.zshrc`/`.bash_profile`), `-c` executes the command string
- **`stdio: ["pipe","pipe","pipe"]`**: no TTY — the `git-with-pin` wrapper handles credential prompts
- **`buildShellEnv()`** ensures `GIT_SQUASH_YUBIKEY_PIN` is always forwarded

#### Previous design and why it was wrong

The old `runInUserShell` used `execFileSync`:

```javascript
// OLD — do not use
const out = execFileSync(USER_SHELL, ["-lc", command], { ... });
```

`execFileSync` freezes the **entire Node.js event loop** for the duration of the command. During a 45s `git pull`:
- Status poll responses are queued, showing stale data
- Settings cannot be saved
- No other repos can be queried
- If the user clicks pull again, the second request queues and fires after the first completes — a double-pull hazard on push

---

## Event Loop Blocking Analysis

### Before vs After: Concurrency Comparison

```
                    Tauri Path (both old and new)      HTTP Fallback — OLD
                    ─────────────────────────────      ───────────────────

Command A:          [tokio task, .await]                [execFileSync BLOCK]
Command B:          [tokio task, .await] ← parallel     [queued.........]
UI events:          [processed] ← responsive            [queued.........]
Status poll:        [responsive]                        [queued.........]


                    HTTP Fallback — NEW
                    ───────────────────

Command A:          [execFile Promise, non-blocking]
Command B:          [queued by RepoLocks... then runs]
UI events:          [processed] ← responsive
Status poll:        [responsive — processed while git runs]
```

### Concurrency Table

| Operation | Typical Duration | Tauri Path | HTTP Path (new) |
|---|---|---|---|
| `git pull` | 5–60s | async, no thread held | async, event loop free |
| `git fetch` | 3–30s | async, no thread held | async, event loop free |
| `git push` | 2–20s | async, no thread held | async, event loop free |
| `git status` | <1s | sync `run_git` (negligible) | sync `execSync` (negligible) |

---

## Non-Blocking UI Strategy

The frontend achieves non-blocking UI through three mechanisms:

### 1. Async Event Handlers

```javascript
// App.svelte:81
async function handleGitCommand(cmdId) {
  // Synchronous state updates — Svelte re-renders NOW
  gitCmdLoading = cmdId;
  gitCmdStatus = "Pulling from origin…";

  // await yields to browser event loop
  const result = await runGitCommand(args, repoPath);
  //                                    ^^^^^
  // While waiting: scroll, click, resize all work.
  // CSS animations on spinner continue running.

  gitCmdStatus = result.ok ? "Pull completed" : "Pull failed";
}
```

When `await` suspends, control returns to the browser's event loop. The browser can:
- Paint updated DOM (spinner, status text)
- Handle user input (scroll, click other buttons)
- Continue CSS animations
- Process timers

### 2. Reactive State Guards

```javascript
if (!activeTab?.repoPath || gitCmdLoading) return;
```

The guard at `App.svelte:82` prevents double-submission. The buttons are also `disabled` when loading.

### 3. Decoupled Status Cleanup

```javascript
// App.svelte:107-112
finally {
  setTimeout(() => {
    if (gitCmdStatus && !gitCmdLoading) gitCmdStatus = "";
  }, 3000);
  gitCmdLoading = null;
}
```

The cleanup is a separate timer — it doesn't block the command result processing.

### Why the Browser Itself Never Freezes

The actual git execution happens in **a different process** (tokio task or Node.js async callback). The browser's main thread never runs git — it only:
1. Makes an IPC call (Tauri) or HTTP request (fetch)
2. Awaits the response Promise
3. Updates Svelte state on resolution

---

## Sidecar Architecture

### Process Tree

```
git-squash-ui (Tauri app, Rust)
  ├── webview (Chromium, renders Svelte frontend)
  └── node (sidecar, Express server on :43174)
        ├── /api/info          → read-only git queries
        ├── /api/status        → working directory status
        ├── /api/git-command   → user-initiated git commands (async)
        ├── /api/squash        → interactive rebase
        └── /api/commit        → commit creation
```

### Sidecar Spawning (`src-tauri/src/lib.rs`)

```rust
fn spawn_backend(app: &AppHandle<R>) -> AppResult<CommandChild> {
  let sidecar_paths = resolve_sidecar_paths(app)?;

  let command = if cfg!(debug_assertions) {
    app.shell().command("node")            // System node (dev)
  } else {
    app.shell().sidecar("node")?           // Bundled node binary (release)
  };

  let (rx, child) = command
    .arg(script_path)                      // server/tauri-sidecar.mjs
    .env("GIT_SQUASH_UI_API_PORT", "43174")
    .env("GIT_SQUASH_UI_CONFIG_DIR", ...)  // config directory
    .env("GIT_SQUASH_UI_SCRIPTS_DIR", ...) // scripts directory
    .env("GIT_SQUASH_YUBIKEY_PIN", pin)    // YubiKey PIN (from .env) — authoritative source
    .current_dir(cwd)
    .spawn()?;

  spawn_log_task(rx);
  Ok(child)
}
```

The Rust side is the **authoritative source** of the PIN: it reads `.env` once at startup and passes the value to the sidecar via the environment. The Node.js `loadDotEnv()` in `server/git.mjs` only acts as a fallback for standalone server mode (when running without Tauri), where Rust is not present to set the env var.

### Startup & Boot Sequence

```
main()                                   main.rs
  └── run()                              lib.rs
        └── .setup()
              ├── load_dotenv_key()      ← reads .env, sets GIT_SQUASH_YUBIKEY_PIN
              ├── spawn_backend()        ← launches Node.js sidecar, passes PIN via env
              └── create_main_window()
                    ├── wait_for_backend() ← TCP health-check poll (127.0.0.1:43174)
                    └── build window
```

### TCP Health Check

```rust
fn wait_for_backend() -> AppResult<()> {
  let deadline = Instant::now() + Duration::from_secs(10);
  let address = SocketAddr::from((Ipv4Addr::LOCALHOST, API_PORT_U16));

  while Instant::now() < deadline {
    if TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok() {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(150));
  }

  Err("Timed out waiting for backend on http://127.0.0.1:43174")
}
```

Guarantees the Express server is accepting connections before the window loads (release mode). In debug mode, the frontend's `request()` retry logic handles the race.

---

## YubiKey PIN Automation

### The Problem

Git operations that touch remotes (pull, fetch, push) may trigger a YubiKey PIN prompt. Since the git process is spawned with piped stdio (no TTY), it cannot interactively read the prompt. The process hangs until timeout, then fails.

### Architecture

The PIN comes from one of three sources, checked in order:

```
┌─────────────────────────────┐
│  1. GIT_SQUASH_YUBIKEY_PIN  │  ← env var (set from .env by Rust at startup)
│  2. ~/.yubikey-pin          │  ← local file
│  3. (none) → raw /usr/bin/git│  ← may prompt interactively in terminal
└─────────────────────────────┘
```

### `.env` → Env Var Bridge

```
.env file                 Rust/Tauri (authoritative)   Node.js Server
─────────                 ──────────────────────────   ──────────────
KEY=TYWKHYTW    ──────►   load_dotenv_key()    ────►   GIT_SQUASH_YUBIKEY_PIN
                          sets env var                  already set by Rust;
                          │                             loadDotEnv() only runs
                          └── spawn_backend()           as fallback in standalone
                              passes to sidecar         (non-Tauri) mode
                              via .env(...)
```

### The `git-with-pin` Wrapper (`scripts/git-with-pin`)

```bash
#!/bin/bash
PIN=""
if [ -n "$GIT_SQUASH_YUBIKEY_PIN" ]; then
    PIN="$GIT_SQUASH_YUBIKEY_PIN"
elif [ -f "$HOME/.yubikey-pin" ]; then
    PIN=$(cat "$HOME/.yubikey-pin")
fi

if [ -n "$PIN" ]; then
    expect -f - "$PIN" "$@" << 'DONE'
set pin [lindex $argv 0]
set gitargs [lrange $argv 1 end]
spawn /usr/bin/git {*}$gitargs
expect {
    "Enter PIN for" {
        send "$pin\r"
        exp_continue
    }
    eof
}
DONE
else
    /usr/bin/git "$@"
fi
```

`expect` spawns the real `/usr/bin/git` as a pseudo-TTY child and programmatically responds to the "Enter PIN for" prompt. `exp_continue` handles multiple prompts (e.g. multiple remotes).

---

## Key Files Reference

| File | Purpose |
|---|---|
| `src/App.svelte:81-113` | `handleGitCommand()` — entry point for git button clicks |
| `src/App.svelte:68-69` | `gitCmdLoading`, `gitCmdStatus` — reactive loading state |
| `src/App.svelte:821-849` | Template — git command buttons + status label |
| `src/lib/api.js:15-25` | `tryNativeInvoke()` — Tauri-vs-HTTP dispatch |
| `src/lib/api.js:55-94` | `request()` — HTTP with retry + `X-Repo-Path` header |
| `src/lib/api.js:389-398` | `runGitCommand()` — try Tauri, fallback to HTTP |
| `src-tauri/src/lib.rs` (`run_git_zsh`) | Async git runner via `tokio::process::Command` |
| `src-tauri/src/lib.rs` (`git_command`) | Async Tauri command with per-repo lock |
| `src-tauri/src/lib.rs` (`RepoLocks`) | Per-repo concurrency guard |
| `src-tauri/src/lib.rs` (`run_git`) | Synchronous git runner for short local ops |
| `src-tauri/src/lib.rs` (`load_dotenv_key`) | Parse `.env`, set PIN env var |
| `src-tauri/src/lib.rs` (`spawn_backend`) | Launch Node.js sidecar, pass PIN via env |
| `src-tauri/src/lib.rs` (`wait_for_backend`) | TCP health check loop |
| `src-tauri/src/lib.rs` (`run`) | App setup + boot sequence |
| `server/git.mjs` (`loadDotEnv`) | Parse `.env` — fallback for standalone (non-Tauri) mode only |
| `server/git.mjs` (`buildShellEnv`) | Ensure PIN forwarded in spawned shell env |
| `server/git.mjs` (`runInUserShell`) | Sync shell command — used by non-network git ops |
| `server/git.mjs` (`runInUserShellAsync`) | Async shell command via `execFile` + Promise |
| `server/git.mjs` (`runGitCommand`) | Async top-level for HTTP route — async for network ops |
| `server/routes.mjs` | `POST /api/git-command` — async route handler |
| `server/tauri-sidecar.mjs` | Sidecar entry point |
| `server/index.mjs` | Standalone server entry point |
| `scripts/git-with-pin` | `expect` wrapper — auto-enters YubiKey PIN |
| `scripts/git-env.sh` | Sourced git function override with PIN |
| `scripts/git-wrapper.sh` | Alternative `expect` wrapper (same logic) |
| `.env` | Local credentials file (gitignored): `KEY=<pin>` |

---

## Threading & Concurrency Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      THREADING MODEL                             │
├──────────────┬─────────────────────┬─────────────────────────────┤
│  Component   │  Threading          │  Blocking behavior          │
├──────────────┼─────────────────────┼─────────────────────────────┤
│  Webview     │  Chromium main      │  Never blocked (async JS)   │
│  (Svelte)    │  thread             │                             │
├──────────────┼─────────────────────┼─────────────────────────────┤
│  Tauri Rust  │  tokio async task   │  Suspended at .await;       │
│  git_command │  (no thread held)   │  zero threads consumed      │
├──────────────┼─────────────────────┼─────────────────────────────┤
│  Rust git    │  OS threads         │  Blocked per call, but      │
│  (sync)      │  (thread::spawn)    │  parallelised with spawn    │
├──────────────┼─────────────────────┼─────────────────────────────┤
│  Node.js     │  Single event loop  │  Non-blocking for git-      │
│  sidecar     │  + libuv workers    │  command (execFile async)   │
│              │                     │  execSync only for fast ops │
├──────────────┼─────────────────────┼─────────────────────────────┤
│  External    │  OS process         │  Blocked during execution   │
│  git/zsh     │  (spawned child)    │  (doesn't affect app)       │
└──────────────┴─────────────────────┴─────────────────────────────┘
```

**The design intent**: All network git commands (pull/fetch/push) are now fully non-blocking at every layer — both the Tauri path (tokio async) and the HTTP fallback (execFile Promise). Per-repo locking in the Tauri path queues concurrent operations on the same repo rather than running them interleaved.
