const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createTreeWatchersHarness({ source } = {}) {
  const trace = [], watchers = [], callbacks = {}, timers = new Map(), timerHistory = [];
  const model = { root: '/warehouse' }, hooks = {}; let nextTimer = 0;
  const subscribe = name => fn => { callbacks[name] = fn; trace.push(['subscribe', name]); return { dispose() { trace.push(['unsubscribe', name]); } }; };
  const vscode = { Uri: { file: fsPath => ({ fsPath }) }, RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    workspace: { getConfiguration: () => ({}), workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      onDidChangeConfiguration: subscribe('config'), onDidCreateFiles: subscribe('create'), onDidDeleteFiles: subscribe('delete'), onDidRenameFiles: subscribe('rename'), onDidSaveTextDocument: subscribe('save'),
      createFileSystemWatcher(pattern, ...options) {
        hooks.create?.(); const index = watchers.length;
        const watcher = { disposeCount: 0, onDidCreate(fn) { this.create = fn; }, onDidDelete(fn) { hooks.register?.(); this.delete = fn; },
          dispose() { this.disposeCount++; trace.push(['watcher.dispose', index]); } };
        watchers.push(watcher); trace.push(['watcher.create', index, pattern, options]); return watcher;
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/tree/work-tree-watchers.js'), 'utf8'), {
    module, console: { error: (...args) => trace.push(['error', ...args.map(x => x instanceof Error ? x.message : String(x))]) },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, fn); timerHistory.push(fn); trace.push(['timer', delay]); return id; },
    clearTimeout: id => timers.delete(id),
    require: name => name === 'vscode' ? vscode : { getWarehousePath: () => model.root },
  });
  const context = { subscriptions: [] }, provider = { refresh() { trace.push(['refresh']); hooks.refresh?.(); } };
  return { trace, watchers, callbacks, timers, timerHistory, model, hooks, context, provider,
    register: () => module.exports.registerTreeRefreshWatchers(context, provider), api: module.exports,
    config: key => callbacks.config({ affectsConfiguration: name => name === 'mojigoto.' + key }),
    flush() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); },
    dispose() { for (const subscription of context.subscriptions) subscription.dispose(); },
  };
}
module.exports = { createTreeWatchersHarness };
