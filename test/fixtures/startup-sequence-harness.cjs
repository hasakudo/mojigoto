const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStartupHarness({ source } = {}) {
  const trace = [], hooks = {}, timers = new Map(), timerHistory = [];
  const context = { subscriptions: [] }, treeProvider = {}, workTreeView = {};
  let timerId = 0;
  const registerMojigotoTreeCommands = async (ctx, provider, view) => {
    if (ctx !== context || provider !== treeProvider || view !== workTreeView) throw Error('wrong tree arguments');
    trace.push(['tree']); await hooks.tree?.();
  };
  const firstRunSetup = async ctx => {
    if (ctx !== context) throw Error('wrong setup context');
    trace.push(['setup']); await hooks.setup?.();
  };
  const maybeRemindEventsSend = async (ctx, reason) => {
    if (ctx !== context) throw Error('wrong reminder context');
    trace.push(['remind', reason]); await hooks.remind?.();
  };
  let importSharedWritingRecords = async () => { trace.push(['import']); await hooks.import?.(); };
  const vscode = { commands: { executeCommand: async name => { trace.push(['command', name]); await hooks.command?.(); } } };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/setup/startup-sequence.js'), 'utf8'), {
    module, vscode, registerMojigotoTreeCommands, firstRunSetup, maybeRemindEventsSend,
    console: { error: (...args) => trace.push(['error', ...args.map(String)]) },
    require(name) {
      if (name === 'vscode') return vscode;
      if (name === '../tree/work-tree-commands') return { registerMojigotoTreeCommands };
      if (name === './setup-commands') return { firstRunSetup };
      if (name === '../stats/stats-reminder') return { maybeRemindEventsSend };
      throw Error('unexpected require: ' + name);
    },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, fn); timerHistory.push(fn); trace.push(['timer', delay]); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { trace, hooks, timers, timerHistory, context,
    run: () => module.exports.startStartupSequence(context, { treeProvider, workTreeView, importSharedWritingRecords: () => importSharedWritingRecords() }),
    replaceImport(fn) { importSharedWritingRecords = fn; },
    async flush() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); await Promise.resolve(); },
    dispose() { for (const subscription of context.subscriptions) subscription.dispose(); },
  };
}
module.exports = { createStartupHarness };
