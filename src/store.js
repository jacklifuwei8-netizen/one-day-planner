(function exposeYiriStore(globalScope) {
  "use strict";

  const STORAGE_KEY = "yiri-state-v3";
  const PREVIOUS_KEY = "yiri-state-v2";
  const OLDER_KEY = "yiri-state-v1";
  const LEGACY_KEY = "yiri-prototype-v1";

  function read(storage = globalScope.localStorage) {
    try {
      for (const key of [STORAGE_KEY, PREVIOUS_KEY, OLDER_KEY, LEGACY_KEY]) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
          return globalScope.YiriCore.normalizeState(JSON.parse(raw));
        } catch {
          // 当前存储损坏时继续尝试较早版本，而不是直接丢弃可恢复的数据。
        }
      }
      return globalScope.YiriCore.initialState();
    } catch {
      return globalScope.YiriCore.initialState();
    }
  }

  function write(state, storage = globalScope.localStorage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, activeItemId: null, schemaVersion: 3 }));
      return true;
    } catch {
      return false;
    }
  }

  function createBackup(state, now = new Date()) {
    return JSON.stringify({
      format: "yiri-backup",
      version: 1,
      exportedAt: now.toISOString(),
      state: globalScope.YiriCore.normalizeState(state, now)
    }, null, 2);
  }

  function parseBackup(text, now = new Date()) {
    const payload = JSON.parse(String(text || ""));
    const candidate = payload?.format === "yiri-backup" ? payload.state : payload;
    if (!candidate || !Array.isArray(candidate.items)) throw new Error("备份文件格式不正确");
    return globalScope.YiriCore.normalizeState(candidate, now);
  }

  const api = { LEGACY_KEY, OLDER_KEY, PREVIOUS_KEY, STORAGE_KEY, createBackup, parseBackup, read, write };
  globalScope.YiriStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

