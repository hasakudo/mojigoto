const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createRestoredLifecycleHarness({ source, names = ['復元ノート'], type = 'notes' } = {}) {
  const trace = [], handlers = new Map(), timers = new Map(), timerHistory = [], hooks = {};
  let timerId = 0;
  const group = { viewColumn: 1, tabs: names.map(label => ({ label, input: { viewType: type }, isActive: false })) };
  const vscode = { window: { tabGroups: { all: [group], activeTabGroup: group },
    registerWebviewPanelSerializer(name, handler) {
      hooks.register?.(); handlers.set(name, handler);
      return { dispose() { trace.push(['unregister', name]); if (handlers.get(name) === handler) handlers.delete(name); } };
    },
  }, commands: { async executeCommand(name, index) { trace.push(['command', name, index]); await hooks.command?.(name, index); } } };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/views/shared/restored-webviews.js'), 'utf8'), {
    module, process, require: name => { if (name === 'path') return path; throw Error('unexpected require: ' + name); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, fn); timerHistory.push(fn); trace.push(['timer', delay]); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function panel(title = names[0]) {
    const events = {};
    const result = { title, viewColumn: 0, active: false,
      onDidChangeViewState(fn) { events.change = fn; return { dispose() { delete events.change; trace.push(['remove', 'change']); } }; },
      onDidDispose(fn) { events.close = fn; return { dispose() { delete events.close; trace.push(['remove', 'close']); } }; },
    };
    return { panel: result, events };
  }
  return { trace, handlers, timers, timerHistory, hooks, vscode, group, panel, api: module.exports,
    register(name = type) { return module.exports.registerRestorableWebview(vscode, name, { async deserializeWebviewPanel(p, saved) {
      trace.push(['deserialize', saved]); await hooks.deserialize?.(p, saved); return saved;
    } }); },
    open(fn, name = type) { return module.exports.withRestoredWebviews(vscode, name, fn); },
  };
}
module.exports = { createRestoredLifecycleHarness };
