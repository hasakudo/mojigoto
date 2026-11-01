function createConceptMemoPanelLifecycle(panel, timers = { setTimeout, clearTimeout }) {
  let disposed = false;
  let pending = null;

  function clearPending(id) {
    timers.clearTimeout(id);
    if (pending?.id === id) pending = null;
  }

  function run(task) {
    try { Promise.resolve(task()).catch(() => undefined); }
    catch { /* Save tasks report their own failures while the panel is open. */ }
  }

  return {
    get disposed() { return disposed; },
    postMessage(message) {
      if (disposed) return Promise.resolve(false);
      try { return Promise.resolve(panel.webview.postMessage(message)).catch(() => false); }
      catch { return Promise.resolve(false); }
    },
    setTimeout(task, delay) {
      if (disposed) return null;
      if (pending) clearPending(pending.id);
      const entry = { task, id: null };
      entry.id = timers.setTimeout(() => {
        if (pending !== entry || disposed) return;
        pending = null;
        run(task);
      }, delay);
      pending = entry;
      return entry.id;
    },
    clearTimeout: clearPending,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Preserve accepted autosave input on native tab close; explicit discard
      // cancels its timer before disposing the panel.
      if (pending) {
        const task = pending.task;
        clearPending(pending.id);
        run(task);
      }
    },
  };
}

module.exports = { createConceptMemoPanelLifecycle };
