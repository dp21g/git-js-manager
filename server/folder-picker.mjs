import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { git } from "./git.mjs";

/** List a directory's subfolders, annotating which are git repos */
export function listDir(dirPath) {
  try {
    const resolved = path.resolve(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });

    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => {
        const full = path.join(resolved, e.name);
        return {
          name: e.name,
          path: full,
          isGit: fs.existsSync(path.join(full, ".git")),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      current: resolved,
      parent: path.dirname(resolved),
      dirs,
      isGit: fs.existsSync(path.join(resolved, ".git")),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/** Try to open a native OS folder dialog. Returns path or null. */
export function nativeDialog(startPath) {
  const platform = os.platform();
  try {
    if (platform === "darwin") {
      const r = execSync(
        `osascript -e 'set f to POSIX path of (choose folder with prompt "Select Git Repository")'`,
        { encoding: "utf-8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] }
      );
      return r.trim().replace(/\/$/, "");
    }
    if (platform === "linux") {
      const r = execSync(
        `zenity --file-selection --directory --title="Select Git Repository"`,
        { encoding: "utf-8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"] }
      );
      return r.trim();
    }
    if (platform === "win32") {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Git Repository'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }`;
      const r = execSync(`powershell -Command "${ps}"`, {
        encoding: "utf-8",
        timeout: 120000,
      });
      return r.trim();
    }
  } catch {
    // user cancelled or tool unavailable
  }
  return null;
}

/** Validate a path is a git repo */
export function isGitRepo(dirPath) {
  return git("rev-parse --git-dir", dirPath).ok;
}
