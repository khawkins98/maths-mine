// core/storage.js — one guarded handle on localStorage.
//
// Private browsing, blocked third-party storage and disabled cookies all make
// localStorage throw on ACCESS rather than on use, so it has to be probed
// rather than feature-detected. Anything that persists goes through here and
// degrades to memory-only rather than crashing a child's game.

export function localStore() {
  try {
    if (typeof localStorage === 'undefined') return null;
    localStorage.getItem('__probe');
    return localStorage;
  } catch (_) {
    return null;
  }
}

// Read and parse a JSON record. Returns null for missing, unreadable or
// corrupt data — callers treat all three the same way: start fresh.
export function readJSON(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function writeJSON(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (_) { /* quota or private mode: progress just will not persist */ }
}
