// core/timers.js — a cancellable timer pool, one per game.
//
// Games schedule a lot of delayed work: reveal beats, count-ups, celebration
// staging. If a child leaves mid-round, every one of those pending callbacks
// still fires — against a game whose `round` is already null. That was a real
// crash in Block Builder.
//
// Own a pool, schedule through it, and call `clearAll()` in teardown.
//
//   const timers = createTimers();
//   timers.later(() => finishRound(), 1000);
//   function teardown() { timers.clearAll(); }

export function createTimers() {
  const ids = new Set();

  // setTimeout that is cancelled by clearAll()
  function later(fn, ms) {
    const id = setTimeout(() => { ids.delete(id); fn(); }, ms);
    ids.add(id);
    return id;
  }

  // cancel a single pending timer
  function cancel(id) { clearTimeout(id); ids.delete(id); }

  // cancel everything still pending — call this in teardown()
  function clearAll() {
    for (const id of ids) clearTimeout(id);
    ids.clear();
  }

  return { later, cancel, clearAll, get pending() { return ids.size; } };
}
