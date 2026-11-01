const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createSharedNoteWatchersHarness({ source, writeIndex } = {}) {
  const trace = [], watchers = [], timers = new Map(), timerHistory = [], hooks = {};
  const model = { settingsPath: path.resolve('work/.mojigoto/work.json') };
  const context = { subscriptions: [] }; let nextTimer = 0;
  const refreshSharedWorkMetrics = (ctx, reason) => {
    if (ctx !== context) throw Error('wrong context');
    trace.push(['metrics', reason]);
  };
  const getCurrentWorkSettingsPath = ctx => {
    if (ctx !== context) throw Error('wrong context');
    trace.push(['settings']); return model.settingsPath;
  };
  const writeNoteIndex = dir => { trace.push(['index', dir]); return writeIndex?.(dir); };
  const vscode = { workspace: { createFileSystemWatcher(pattern) {
    hooks.create?.(watchers.length);
    const index = watchers.length;
    const watcher = { pattern, disposeCount: 0,
      onDidCreate(fn) { hooks.register?.(index, 'create'); this.create = fn; },
      onDidChange(fn) { hooks.register?.(index, 'change'); this.change = fn; },
      onDidDelete(fn) { hooks.register?.(index, 'delete'); this.delete = fn; },
      dispose() { this.disposeCount++; trace.push(['dispose', index]); },
    };
    trace.push(['watch', pattern]); watchers.push(watcher); return watcher;
  } } };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/shared-note-watchers.js'), 'utf8'), {
    module, vscode, path, refreshSharedWorkMetrics, getCurrentWorkSettingsPath, writeNoteIndex,
    require(name) {
      if (name === 'vscode') return vscode;
      if (name === 'path') return path;
      if (name === './stats-service') return { refreshSharedWorkMetrics };
      if (name === '../work/work-settings') return { getCurrentWorkSettingsPath };
      if (name === '../data/note-index') return { writeNoteIndex };
      throw Error('unexpected require: ' + name);
    },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, fn); timerHistory.push(fn); trace.push(['timer', delay]); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { context, model, watchers, trace, timers, timerHistory, hooks,
    register: () => module.exports.registerSharedNoteWatchers(context),
    emit(index, event, fsPath) { watchers[index][event](fsPath === undefined ? undefined : { fsPath }); },
    flush() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); },
    dispose() { for (const subscription of context.subscriptions) subscription.dispose(); },
  };
}
module.exports = { createSharedNoteWatchersHarness };
