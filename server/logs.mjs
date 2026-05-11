const MAX_LOGS = 400;

export function createLogStore() {
  const entries = [];

  function add(type, message, details = {}) {
    entries.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      type,
      message,
      ...details,
    });
    if (entries.length > MAX_LOGS) entries.length = MAX_LOGS;
  }

  return {
    list() {
      return entries;
    },
    info(message, details = {}) {
      add("info", message, details);
    },
    success(message, details = {}) {
      add("success", message, details);
    },
    error(message, details = {}) {
      add("error", message, details);
    },
    command(details = {}) {
      const exitCode =
        Number.isFinite(details.exitCode) ? Number(details.exitCode) : null;
      const status =
        details.status ||
        (exitCode === null ? "info" : exitCode === 0 ? "success" : "error");
      const type = status === "success" ? "success" : status === "error" ? "error" : "info";

      add(type, details.message || "Command finished", {
        kind: "command",
        command: details.command || "",
        cwd: details.cwd || "",
        runner: details.runner || "command",
        stdout: details.stdout || "",
        stderr: details.stderr || "",
        exitCode,
        durationMs:
          Number.isFinite(details.durationMs) ? Number(details.durationMs) : null,
        status,
      });
    },
  };
}
