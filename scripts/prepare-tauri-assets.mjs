import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const srcTauriDir = path.join(repoRoot, "src-tauri");
const binariesDir = path.join(srcTauriDir, "binaries");
const runtimeDir = path.join(srcTauriDir, ".tauri-runtime");
const runtimeNodeModulesDir = path.join(runtimeDir, "node_modules");
const runtimeDefaultsDir = path.join(runtimeDir, "defaults");
const sourceNodeModulesDir = path.join(repoRoot, "node_modules");
const workspaceConfigPath = path.join(repoRoot, "workspace-config", "config.json");
const runtimeEntryPackages = ["express"];

const hostTarget = execSync("rustc --print host-tuple", {
  cwd: repoRoot,
  encoding: "utf-8",
}).trim();

const sourceNodeBinary = process.execPath;
const destinationNodeBinary = path.join(binariesDir, `node-${hostTarget}`);

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolvePackageDir(packageName) {
  return path.join(sourceNodeModulesDir, ...packageName.split("/"));
}

function readPackageManifest(packageDir) {
  const manifestPath = path.join(packageDir, "package.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function copyRuntimePackageTree(entryPackages) {
  const seen = new Set();
  const pending = [...entryPackages];

  resetDir(runtimeNodeModulesDir);

  while (pending.length > 0) {
    const packageName = pending.pop();
    if (!packageName || seen.has(packageName)) continue;

    const packageDir = resolvePackageDir(packageName);
    if (!fs.existsSync(packageDir)) {
      throw new Error(`Missing runtime dependency: ${packageName}`);
    }

    const destinationDir = path.join(runtimeNodeModulesDir, ...packageName.split("/"));
    fs.mkdirSync(path.dirname(destinationDir), { recursive: true });
    fs.cpSync(packageDir, destinationDir, { recursive: true });

    seen.add(packageName);

    const manifest = readPackageManifest(packageDir);
    const dependencies = {
      ...(manifest.dependencies || {}),
      ...(manifest.optionalDependencies || {}),
    };

    for (const dependencyName of Object.keys(dependencies)) {
      pending.push(dependencyName);
    }
  }

  return [...seen].sort();
}

fs.mkdirSync(binariesDir, { recursive: true });
fs.copyFileSync(sourceNodeBinary, destinationNodeBinary);
fs.chmodSync(destinationNodeBinary, 0o755);

const runtimePackages = copyRuntimePackageTree(runtimeEntryPackages);

resetDir(runtimeDefaultsDir);
if (fs.existsSync(workspaceConfigPath)) {
  fs.copyFileSync(
    workspaceConfigPath,
    path.join(runtimeDefaultsDir, "config.json"),
  );
}

console.log(`Prepared Tauri node sidecar at ${destinationNodeBinary}`);
console.log(
  `Prepared ${runtimePackages.length} runtime package(s) for the app bundle: ${runtimePackages.join(", ")}`,
);
