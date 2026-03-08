const MAX_LOGS = 200;

export function createLogStore() {
  const entries = [];

  function add(type, message) {
    entries.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      type,
      message,
    });
    if (entries.length > MAX_LOGS) entries.length = MAX_LOGS;
  }

  return {
    list() {
      return entries;
    },
    info(message) {
      add("info", message);
    },
    success(message) {
      add("success", message);
    },
    error(message) {
      add("error", message);
    },
  };
}