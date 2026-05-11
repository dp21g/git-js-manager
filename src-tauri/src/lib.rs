use std::{
  collections::{HashMap, HashSet},
  error::Error,
  fs,
  net::{Ipv4Addr, SocketAddr, TcpStream},
  path::{Path, PathBuf},
  process::{Command, Stdio},
  thread,
  time::{Duration, Instant},
  sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::{
  process::{CommandChild, CommandEvent},
  ShellExt,
};

const API_PORT: &str = "43174";
const API_PORT_U16: u16 = 43174;
type AppResult<T> = Result<T, Box<dyn Error>>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchStatus {
  name: String,
  has_upstream: bool,
  upstream: String,
  ahead: usize,
  behind: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteBranch {
  name: String,
  short_name: String,
  remote: String,
  local_exists: bool,
  local_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoSummary {
  branch: String,
  base: String,
  branches: Vec<String>,
  path: String,
  branch_statuses: Vec<BranchStatus>,
  remote_branches: Vec<RemoteBranch>,
  remote_branches_loaded: bool,
  branch_status: BranchStatus,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalCommit {
  hash: String,
  short_hash: String,
  message: String,
  full_message: String,
}

#[derive(Clone, Debug, Serialize)]
struct StatusFile {
  x: String,
  y: String,
  path: String,
  staged: bool,
  unstaged: bool,
  untracked: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoStatus {
  files: Vec<StatusFile>,
  unpushed: Vec<LocalCommit>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeleteBranchResult {
  ok: bool,
  deleted: String,
  remote_deleted: bool,
  upstream: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenameBranchResult {
  ok: bool,
  old_name: String,
  new_name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SwitchBranchResult {
  ok: bool,
  previous_branch: String,
  current_branch: String,
  stashed: bool,
  stash_ref: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommandResult {
  ok: bool,
  command: String,
  stdout: String,
  stderr: String,
  exit_code: i32,
  duration_ms: u64,
}

fn default_branch_status(name: String) -> BranchStatus {
  BranchStatus {
    name,
    has_upstream: false,
    upstream: String::new(),
    ahead: 0,
    behind: 0,
  }
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
  let output = Command::new("git")
    .arg("-C")
    .arg(repo_path)
    .args(args)
    .output()
    .map_err(|error| format!("Failed to run git {}: {error}", args.join(" ")))?;

  let stdout = String::from_utf8_lossy(&output.stdout).replace("\r\n", "\n");
  let stderr = String::from_utf8_lossy(&output.stderr).replace("\r\n", "\n");

  if output.status.success() {
    return Ok(stdout.trim_end_matches('\n').to_string());
  }

  let message = stderr.trim();
  if !message.is_empty() {
    return Err(message.to_string());
  }

  let fallback = stdout.trim();
  if !fallback.is_empty() {
    return Err(fallback.to_string());
  }

  Err(format!("git {} failed", args.join(" ")))
}

fn join_git_task<T>(handle: thread::JoinHandle<Result<T, String>>) -> Result<T, String> {
  handle
    .join()
    .map_err(|_| "A native git worker thread panicked.".to_string())?
}

fn read_current_branch(repo_path: &Path) -> Result<String, String> {
  run_git(repo_path, &["branch", "--show-current"])
}

fn parse_track_counts(track: &str) -> (usize, usize) {
  let trimmed = track
    .trim()
    .trim_start_matches('[')
    .trim_end_matches(']');

  if trimmed.is_empty() {
    return (0, 0);
  }

  let mut ahead = 0;
  let mut behind = 0;

  for segment in trimmed.split(',') {
    let value = segment.trim();
    if let Some(raw) = value.strip_prefix("ahead ") {
      ahead = raw.parse::<usize>().unwrap_or(0);
    } else if let Some(raw) = value.strip_prefix("behind ") {
      behind = raw.parse::<usize>().unwrap_or(0);
    }
  }

  (ahead, behind)
}

fn read_branch_statuses(repo_path: &Path) -> Result<Vec<BranchStatus>, String> {
  let raw = run_git(
    repo_path,
    &[
      "for-each-ref",
      "--sort=refname",
      "--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)",
      "refs/heads",
    ],
  )?;

  let mut statuses = Vec::new();

  for line in raw.split('\n').filter(|line| !line.is_empty()) {
    let mut parts = line.split('\0');
    let name = parts.next().unwrap_or("").trim().to_string();
    if name.is_empty() {
      continue;
    }

    let upstream = parts.next().unwrap_or("").trim().to_string();
    let track = parts.next().unwrap_or("").trim();
    let (ahead, behind) = parse_track_counts(track);

    statuses.push(BranchStatus {
      name,
      has_upstream: !upstream.is_empty(),
      upstream,
      ahead,
      behind,
    });
  }

  Ok(statuses)
}

fn read_remote_refs(repo_path: &Path) -> Result<Vec<String>, String> {
  let raw = run_git(
    repo_path,
    &[
      "for-each-ref",
      "--sort=refname",
      "--format=%(refname:short)",
      "refs/remotes",
    ],
  )?;

  Ok(
    raw
      .split('\n')
      .map(str::trim)
      .filter(|line| !line.is_empty() && !line.ends_with("/HEAD"))
      .map(ToOwned::to_owned)
      .collect(),
  )
}

fn detect_base_branch(branches: &[String], current_branch: &str) -> String {
  for candidate in ["main", "master", "develop"] {
    if candidate == current_branch {
      continue;
    }

    if branches.iter().any(|branch| branch == candidate) {
      return candidate.to_string();
    }
  }

  String::new()
}

fn build_remote_branches(remote_refs: Vec<String>, branch_statuses: &[BranchStatus]) -> Vec<RemoteBranch> {
  let upstream_map: HashMap<String, String> = branch_statuses
    .iter()
    .filter(|branch| branch.has_upstream)
    .map(|branch| (branch.upstream.clone(), branch.name.clone()))
    .collect();

  let local_names: HashSet<String> = branch_statuses
    .iter()
    .map(|branch| branch.name.clone())
    .collect();

  remote_refs
    .into_iter()
    .filter_map(|remote_ref| {
      let (remote, short_name) = remote_ref.split_once('/')?;
      let remote_name = remote.to_string();
      let short_name = short_name.to_string();
      let local_name = upstream_map
        .get(&remote_ref)
        .cloned()
        .or_else(|| local_names.contains(short_name.as_str()).then(|| short_name.clone()))
        .unwrap_or_default();

      Some(RemoteBranch {
        name: remote_ref,
        short_name,
        remote: remote_name,
        local_exists: !local_name.is_empty(),
        local_name,
      })
    })
    .collect()
}

fn normalize_quoted_path(path: &str) -> String {
  let trimmed = path.trim();

  if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
    return trimmed[1..trimmed.len() - 1].replace('\\', "");
  }

  trimmed.to_string()
}

fn parse_status_output(raw: &str) -> Vec<StatusFile> {
  raw
    .lines()
    .filter_map(|line| {
      if line.len() < 3 {
        return None;
      }

      let x = line.chars().nth(0).unwrap_or(' ');
      let y = line.chars().nth(1).unwrap_or(' ');
      let mut path = normalize_quoted_path(line.get(3..).unwrap_or(""));

      if matches!(x, 'R' | 'C') {
        if let Some((_, destination)) = path.split_once(" -> ") {
          path = normalize_quoted_path(destination);
        }
      }

      Some(StatusFile {
        x: x.to_string(),
        y: y.to_string(),
        path,
        staged: x != ' ' && x != '?' && x != '!',
        unstaged: y != ' ' && y != '?' && y != '!',
        untracked: x == '?' && y == '?',
      })
    })
    .collect()
}

fn parse_local_commits(raw: &str) -> Vec<LocalCommit> {
  raw
    .split('\u{1}')
    .filter_map(|entry| {
      let trimmed = entry.trim();
      if trimmed.is_empty() {
        return None;
      }

      let mut parts = trimmed.split('\0');
      let hash = parts.next().unwrap_or("").trim().to_string();
      if hash.is_empty() {
        return None;
      }

      let subject = parts.next().unwrap_or("").trim().to_string();
      let full_message = parts.collect::<Vec<_>>().join("\0").trim().to_string();
      let message = if subject.is_empty() {
        full_message
          .lines()
          .next()
          .unwrap_or("")
          .trim()
          .to_string()
      } else {
        subject.clone()
      };

      Some(LocalCommit {
        short_hash: hash.chars().take(7).collect(),
        hash,
        message,
        full_message,
      })
    })
    .collect()
}

fn read_commit_range(repo_path: &Path, range: &str) -> Result<Vec<LocalCommit>, String> {
  let raw = run_git(
    repo_path,
    &["log", range, "--format=%H%x00%s%x00%B%x01"],
  )?;

  Ok(parse_local_commits(&raw))
}

fn read_local_commits(repo_path: &Path, current_branch: &str, branches: &[String]) -> Vec<LocalCommit> {
  if let Ok(commits) = read_commit_range(repo_path, "@{u}..HEAD") {
    return commits;
  }

  let fallback_base = detect_base_branch(branches, current_branch);
  if !fallback_base.is_empty() {
    let fallback_range = format!("{fallback_base}..HEAD");
    if let Ok(commits) = read_commit_range(repo_path, fallback_range.as_str()) {
      return commits;
    }
  }

  read_commit_range(repo_path, "HEAD").unwrap_or_default()
}

async fn run_git_zsh(repo_path: &Path, git_args: &str, scripts_dir: &Path) -> Result<GitCommandResult, String> {
  let full_cmd = format!(
    "cd '{}' && PATH=\"{}:$PATH\" git-with-pin {}",
    repo_path.display(),
    scripts_dir.display(),
    git_args
  );
  let start = Instant::now();

  let mut cmd = tokio::process::Command::new("zsh");
  cmd.arg("-c")
    .arg(&full_cmd)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  if let Ok(pin) = std::env::var("GIT_SQUASH_YUBIKEY_PIN") {
    cmd.env("GIT_SQUASH_YUBIKEY_PIN", &pin);
  }

  // tokio::process::Command::output() drains stdout and stderr concurrently,
  // eliminating the pipe-buffer deadlock risk and the 200ms polling lag.
  let output = tokio::time::timeout(
    Duration::from_secs(120),
    cmd.output(),
  )
  .await
  .map_err(|_| "Git command timed out after 120s".to_string())?
  .map_err(|e| format!("Failed to run zsh command: {e}"))?;

  let duration_ms = start.elapsed().as_millis() as u64;
  let stdout = String::from_utf8_lossy(&output.stdout).replace("\r\n", "\n").trim_end().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).replace("\r\n", "\n").trim_end().to_string();
  let exit_code = output.status.code().unwrap_or(-1);

  Ok(GitCommandResult {
    ok: output.status.success(),
    command: full_cmd,
    stdout,
    stderr,
    exit_code,
    duration_ms,
  })
}

fn read_repo_summary(repo_path: String, include_remotes: bool) -> Result<RepoSummary, String> {
  if repo_path.trim().is_empty() {
    return Err("No repo selected".to_string());
  }

  let repo_path_buf = PathBuf::from(&repo_path);

  let branch_path = repo_path_buf.clone();
  let branch_status_path = repo_path_buf.clone();

  let current_branch_handle = thread::spawn(move || read_current_branch(&branch_path));
  let branch_statuses_handle = thread::spawn(move || read_branch_statuses(&branch_status_path));
  let remote_refs_handle = if include_remotes {
    let remote_path = repo_path_buf.clone();
    Some(thread::spawn(move || read_remote_refs(&remote_path)))
  } else {
    None
  };

  let branch = join_git_task(current_branch_handle)?;
  let branch_statuses = join_git_task(branch_statuses_handle)?;
  let remote_branches = match remote_refs_handle {
    Some(handle) => build_remote_branches(join_git_task(handle)?, &branch_statuses),
    None => Vec::new(),
  };

  let branches = branch_statuses
    .iter()
    .map(|status| status.name.clone())
    .collect::<Vec<_>>();

  let detected_base = detect_base_branch(&branches, &branch);
  let branch_status = branch_statuses
    .iter()
    .find(|status| status.name == branch)
    .cloned()
    .unwrap_or_else(|| default_branch_status(branch.clone()));

  Ok(RepoSummary {
    branch,
    base: if detected_base.is_empty() {
      "master".to_string()
    } else {
      detected_base
    },
    branches,
    path: path_to_string(&repo_path_buf),
    remote_branches,
    remote_branches_loaded: include_remotes,
    branch_statuses,
    branch_status,
  })
}

fn read_repo_status(repo_path: String) -> Result<RepoStatus, String> {
  if repo_path.trim().is_empty() {
    return Err("No repo selected".to_string());
  }

  let repo_path_buf = PathBuf::from(&repo_path);

  let status_path = repo_path_buf.clone();
  let branch_path = repo_path_buf.clone();
  let branch_status_path = repo_path_buf.clone();

  let status_handle = thread::spawn(move || run_git(&status_path, &["status", "--porcelain=v1"]));
  let current_branch_handle = thread::spawn(move || read_current_branch(&branch_path));
  let branch_statuses_handle = thread::spawn(move || read_branch_statuses(&branch_status_path));

  let status_output = join_git_task(status_handle)?;
  let current_branch = join_git_task(current_branch_handle)?;
  let branch_statuses = join_git_task(branch_statuses_handle)?;

  let branches = branch_statuses
    .iter()
    .map(|status| status.name.clone())
    .collect::<Vec<_>>();

  Ok(RepoStatus {
    files: parse_status_output(&status_output),
    unpushed: read_local_commits(&repo_path_buf, &current_branch, &branches),
  })
}

#[tauri::command]
fn git_repo_summary(repo_path: String, include_remotes: bool) -> Result<RepoSummary, String> {
  read_repo_summary(repo_path, include_remotes)
}

#[tauri::command]
fn git_repo_status(repo_path: String) -> Result<RepoStatus, String> {
  read_repo_status(repo_path)
}

#[tauri::command]
fn git_delete_branch(repo_path: String, branch: String, delete_remote: bool) -> Result<DeleteBranchResult, String> {
  let repo = Path::new(&repo_path);

  let current = run_git(repo, &["branch", "--show-current"])?;
  if current == branch {
    return Err(format!("Cannot delete the currently checked-out branch '{}'", branch));
  }

  let upstream = run_git(
    repo,
    &["for-each-ref", "--format=%(upstream:short)", &format!("refs/heads/{}", branch)],
  ).unwrap_or_default();

  run_git(repo, &["branch", "-D", &branch])?;

  let mut remote_deleted = false;
  if delete_remote && !upstream.is_empty() {
    if let Some((remote, remote_branch)) = upstream.split_once('/') {
      if run_git(repo, &["push", remote, "--delete", remote_branch]).is_ok() {
        remote_deleted = true;
      }
    }
  }

  Ok(DeleteBranchResult {
    ok: true,
    deleted: branch,
    remote_deleted,
    upstream,
  })
}

#[tauri::command]
fn git_rename_branch(repo_path: String, old_name: String, new_name: String) -> Result<RenameBranchResult, String> {
  let repo = Path::new(&repo_path);

  if old_name == new_name {
    return Err("New branch name is the same as the old name.".to_string());
  }

  run_git(repo, &["branch", "-m", &old_name, &new_name])?;

  Ok(RenameBranchResult {
    ok: true,
    old_name,
    new_name,
  })
}

#[tauri::command]
fn git_switch_branch(repo_path: String, target_branch: String) -> Result<SwitchBranchResult, String> {
  let repo = Path::new(&repo_path);
  let previous_branch = run_git(repo, &["branch", "--show-current"])?;

  if run_git(repo, &["show-ref", "--verify", "--quiet", &format!("refs/heads/{}", target_branch)]).is_ok() {
    run_git(repo, &["switch", &target_branch])?;
  } else if run_git(repo, &["show-ref", "--verify", "--quiet", &format!("refs/remotes/{}", target_branch)]).is_ok() {
    let local_branch = target_branch.split('/').last().unwrap_or(&target_branch);
    if run_git(repo, &["show-ref", "--verify", "--quiet", &format!("refs/heads/{}", local_branch)]).is_ok() {
      run_git(repo, &["switch", local_branch])?;
    } else {
      run_git(repo, &["switch", "--track", "-c", local_branch, &target_branch])?;
    }
  } else {
    return Err(format!("Branch '{}' not found.", target_branch));
  }

  Ok(SwitchBranchResult {
    ok: true,
    previous_branch,
    current_branch: run_git(repo, &["branch", "--show-current"])?,
    stashed: false,
    stash_ref: String::new(),
  })
}

#[tauri::command]
async fn git_command(
  repo_path: String,
  command: String,
  locks: tauri::State<'_, RepoLocks>,
) -> Result<GitCommandResult, String> {
  // Acquire a per-repo lock so concurrent operations on the same repo are queued,
  // not interleaved. Different repos proceed in parallel.
  let lock = {
    let mut map = locks.0.lock().unwrap();
    map.entry(repo_path.clone())
      .or_insert_with(|| std::sync::Arc::new(tokio::sync::Mutex::new(())))
      .clone()
  };
  let _guard = lock.lock().await;

  let repo = Path::new(&repo_path);
  let scripts_dir = repo_root().join("scripts");
  run_git_zsh(repo, &command, &scripts_dir).await
}

#[derive(Default)]
struct BackendChild(Mutex<Option<CommandChild>>);

struct RepoLocks(Mutex<HashMap<String, std::sync::Arc<tokio::sync::Mutex<()>>>>);

impl Default for RepoLocks {
  fn default() -> Self {
    RepoLocks(Mutex::new(HashMap::new()))
  }
}

struct SidecarPaths {
  cwd: PathBuf,
  script_path: PathBuf,
  scripts_dir: PathBuf,
  config_dir: PathBuf,
  default_config_path: Option<PathBuf>,
  frontend_dist: Option<PathBuf>,
}

fn repo_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("src-tauri must live inside the repo root")
    .to_path_buf()
}

fn load_dotenv_key() -> Option<String> {
  let env_path = repo_root().join(".env");
  let content = fs::read_to_string(env_path).ok()?;
  for line in content.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    if let Some((key, value)) = trimmed.split_once('=') {
      if key.trim() == "KEY" {
        let pin = value.trim().to_string();
        std::env::set_var("GIT_SQUASH_YUBIKEY_PIN", &pin);
        return Some(pin);
      }
    }
  }
  None
}

fn resolve_dev_paths() -> SidecarPaths {
  let root = repo_root();
  SidecarPaths {
    cwd: root.clone(),
    script_path: root.join("server").join("tauri-sidecar.mjs"),
    scripts_dir: root.join("scripts"),
    config_dir: root.join("workspace-config"),
    default_config_path: None,
    frontend_dist: None,
  }
}

fn resolve_release_paths<R: Runtime>(
  app: &AppHandle<R>,
) -> AppResult<SidecarPaths> {
  let resource_dir = app.path().resource_dir()?;
  let config_dir = app.path().app_config_dir()?;
  let server_dir = resolve_resource_subdir(&resource_dir, "server");
  let scripts_dir = resolve_resource_subdir(&resource_dir, "scripts");
  let defaults_dir = resolve_resource_subdir(&resource_dir, "defaults");
  let frontend_dist = resolve_resource_subdir(&resource_dir, "dist");

  Ok(SidecarPaths {
    cwd: resource_dir.clone(),
    script_path: server_dir.join("tauri-sidecar.mjs"),
    scripts_dir,
    config_dir,
    default_config_path: Some(defaults_dir.join("config.json")),
    frontend_dist: Some(frontend_dist),
  })
}

fn resolve_sidecar_paths<R: Runtime>(
  app: &AppHandle<R>,
) -> AppResult<SidecarPaths> {
  if cfg!(debug_assertions) {
    Ok(resolve_dev_paths())
  } else {
    resolve_release_paths(app)
  }
}

fn spawn_log_task(mut rx: tauri::async_runtime::Receiver<CommandEvent>) {
  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => {
          println!("[git-squash-sidecar] {}", String::from_utf8_lossy(&line).trim_end());
        }
        CommandEvent::Stderr(line) => {
          eprintln!("[git-squash-sidecar] {}", String::from_utf8_lossy(&line).trim_end());
        }
        CommandEvent::Error(message) => {
          eprintln!("[git-squash-sidecar] {message}");
        }
        CommandEvent::Terminated(payload) => {
          eprintln!(
            "[git-squash-sidecar] exited with code {:?} signal {:?}",
            payload.code, payload.signal
          );
        }
        _ => {}
      }
    }
  });
}

fn spawn_backend<R: Runtime>(
  app: &AppHandle<R>,
) -> AppResult<CommandChild> {
  let sidecar_paths = resolve_sidecar_paths(app)?;

  let script_path = sidecar_paths.script_path;
  let scripts_dir = sidecar_paths.scripts_dir;
  let config_dir = sidecar_paths.config_dir;
  let default_config_path = sidecar_paths.default_config_path;
  let frontend_dist = sidecar_paths.frontend_dist;

  if !script_path.exists() {
    return Err(format!("Missing sidecar entry at {}", script_path.display()).into());
  }

  if !scripts_dir.exists() {
    return Err(format!("Missing git scripts directory at {}", scripts_dir.display()).into());
  }

  if let Some(frontend_dist) = &frontend_dist {
    if !frontend_dist.exists() {
      return Err(format!("Missing frontend dist directory at {}", frontend_dist.display()).into());
    }
  }

  let command = if cfg!(debug_assertions) {
    app.shell().command("node")
  } else {
    app.shell().sidecar("node")?
  };

  let command = command
    .arg(path_to_string(&script_path))
    .env("GIT_SQUASH_UI_API_PORT", API_PORT)
    .env("GIT_SQUASH_UI_CONFIG_DIR", path_to_string(&config_dir))
    .env("GIT_SQUASH_UI_SCRIPTS_DIR", path_to_string(&scripts_dir));

  let command = match default_config_path {
    Some(path) if path.exists() => {
      command.env(
        "GIT_SQUASH_UI_DEFAULT_CONFIG_PATH",
        path_to_string(&path),
      )
    }
    _ => command,
  };

  let command = match frontend_dist {
    Some(path) if path.exists() => {
      command.env(
        "GIT_SQUASH_UI_FRONTEND_DIST",
        path_to_string(&path),
      )
    }
    _ => command,
  };

  let command = if let Ok(pin) = std::env::var("GIT_SQUASH_YUBIKEY_PIN") {
    command.env("GIT_SQUASH_YUBIKEY_PIN", &pin)
  } else {
    command
  };

  let (rx, child) = command.current_dir(sidecar_paths.cwd).spawn()?;

  spawn_log_task(rx);

  Ok(child)
}

fn path_to_string(path: &Path) -> String {
  path.to_string_lossy().into_owned()
}

fn wait_for_backend() -> AppResult<()> {
  let deadline = Instant::now() + Duration::from_secs(10);
  let address = SocketAddr::from((Ipv4Addr::LOCALHOST, API_PORT_U16));

  while Instant::now() < deadline {
    if TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok() {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(150));
  }

  Err(format!("Timed out waiting for backend on http://127.0.0.1:{API_PORT}").into())
}

fn create_main_window<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
  let mut window_config = app
    .config()
    .app
    .windows
    .first()
    .cloned()
    .ok_or("Missing main window configuration")?;

  if !cfg!(debug_assertions) {
    wait_for_backend()?;
    let url = format!("http://127.0.0.1:{API_PORT}").parse()?;
    window_config.url = WebviewUrl::External(url);
  }

  WebviewWindowBuilder::from_config(app, &window_config)?.build()?;
  Ok(())
}

fn resolve_resource_subdir(resource_dir: &Path, name: &str) -> PathBuf {
  let direct = resource_dir.join(name);
  if direct.exists() {
    return direct;
  }

  resource_dir.join("_up_").join(name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(BackendChild::default())
    .manage(RepoLocks::default())
    .invoke_handler(tauri::generate_handler![git_repo_summary, git_repo_status, git_delete_branch, git_rename_branch, git_switch_branch, git_command])
    .setup(|app| {
      load_dotenv_key();
      let app_handle = app.handle();
      let child = spawn_backend(&app_handle)?;
      let state = app.state::<BackendChild>();
      *state.0.lock().unwrap() = Some(child);
      create_main_window(&app_handle)?;
      Ok(())
    });

  let app = builder
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      let state = app_handle.state::<BackendChild>();
      let child = state.0.lock().unwrap().take();
      if let Some(child) = child {
        let _ = child.kill();
      }
    }
  });
}
