const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createActivationHarness({ extensionSource, countsSource } = {}) {
  const trace = [], hooks = {}, timers = new Map(), timerHistory = [], items = [];
  const callbacks = { save: [], active: [], edit: [], config: [], rename: [] };
  const model = { mode: 'single', enabled: true, rootExists: true, editor: null, content: '本文', state: new Map() };
  const root = path.resolve('manuscript'); let nextTimer = 0, nextRecords = 0;
  const context = { subscriptions: [], globalState: {
    get: (key, fallback) => model.state.has(key) ? model.state.get(key) : fallback,
    async update(key, value) { trace.push(['state', key, value]); await hooks.update?.(key); model.state.set(key, value); },
  } };
  const subscribe = name => fn => { callbacks[name].push(fn); return { dispose() {} }; };
  const disposable = () => ({ dispose() {} });
  const vscode = {
    StatusBarAlignment: { Right: 2 }, ConfigurationTarget: { Workspace: 2 },
    commands: { registerCommand: () => disposable(), async executeCommand(name) { trace.push(['command', name]); } },
    workspace: {
      getConfiguration: () => ({ get(key, fallback) { return key === 'mode' ? model.mode : key === 'manuscriptRoot' ? root : fallback; } }),
      onDidSaveTextDocument: subscribe('save'), onDidChangeTextDocument: subscribe('edit'),
      onDidChangeConfiguration: subscribe('config'), onDidRenameFiles: subscribe('rename'),
    },
    window: { get activeTextEditor() { return model.editor; },
      createTreeView: () => disposable(), onDidChangeActiveTextEditor: subscribe('active'),
      createStatusBarItem() {
        const index = items.length; let text = '';
        const item = { get text() { return text; }, set text(value) { text = value; trace.push(['text', index, value]); },
          show() { trace.push(['show', index]); }, hide() { trace.push(['hide', index]); },
          dispose() { trace.push(['disposeItem', index]); },
        }; items.push(item); return item;
      },
      setStatusBarMessage: value => trace.push(['status', value]),
    },
  };
  const overrides = {
    createNoteSerializer: disposable, createNoteDisplaySerializer: disposable,
    createConceptMemoSerializer: disposable, createSettingsSerializer: disposable,
    HighlightManager: class { dispose() {} refreshActiveEditor() {} },
    MojigotoWorkTreeProvider: class {},
    createServerStatusBarItem: () => ({ update() {} }),
    createStatsPanelController: () => ({ refresh() {}, createSerializer: disposable }),
    createWorkStatusController: () => ({ initialize() {} }),
    createWritingMemoDecorationController: () => ({ dispose() {}, refreshWritingMemoDecorations() {} }),
    registerSharedWritingRecords: () => { const id = ++nextRecords; return { async run() { trace.push(['import', id]); } }; },
    registerMojigotoTreeCommands: async () => { trace.push(['tree']); await hooks.tree?.(); },
    firstRunSetup: async () => { trace.push(['setup']); await hooks.setup?.(); },
    maybeRemindEventsSend: async () => trace.push(['remind']),
    logOnSave: async () => trace.push(['logSave']),
    getCountModeLabel: () => '標準', countLikeCountChars: value => value.length,
    safeRead: () => model.content, listTextFiles: () => [path.join(root, 'chapter', 'a.txt')],
    detectChapter: () => 'chapter', getCurrentWorkGoal: () => 100,
    diffKeyForWork: (ctx, kind, key) => kind + ':' + key,
    isStatusBarCountsEnabled: () => model.enabled,
    getResolvedManuscriptRoot: () => root,
    listWorkDirectories: () => [], getWorkManuscriptRoot: () => '',
  };
  const cache = new Map();
  const actual = new Set(['extension.js', 'src/setup/startup-sequence.js', 'src/statusbar/counts-status.js', 'src/stats/stats-commands.js']);
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} }; cache.set(relative, module.exports);
    const source = relative === 'extension.js' && extensionSource ? extensionSource : relative === 'src/statusbar/counts-status.js' && countsSource ? countsSource : fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');
    vm.runInNewContext(source, {
      module, exports: module.exports,
      console: { error: (...args) => trace.push(['error', ...args.map(String)]), log() {} },
      setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, fn); timerHistory.push(fn); trace.push(['timer', delay]); return id; },
      clearTimeout(id) { timers.delete(id); },
      require(name) {
        if (name === 'vscode') return vscode;
        if (name === 'path') return path;
        if (name === 'fs') return { existsSync: () => model.rootExists };
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)).replace(/\.js$/, '') + '.js';
        if (actual.has(target)) return load(target);
        return new Proxy({}, { get: (obj, key) => overrides[key] || (() => { trace.push(['call', key]); }) });
      },
    });
    cache.set(relative, module.exports); return module.exports;
  }
  const countsDeps = {
    countChars: overrides.countLikeCountChars, getCountModeLabel: overrides.getCountModeLabel,
    safeRead: overrides.safeRead, listTextFiles: overrides.listTextFiles, detectChapter: overrides.detectChapter,
    getCurrentWorkGoal: overrides.getCurrentWorkGoal, getDiffKeyForWork: overrides.diffKeyForWork,
    isEnabled: overrides.isStatusBarCountsEnabled, getManuscriptRoot: () => root,
    getCurrentWorkName: () => '', listWorkDirectories: () => [], getWorkManuscriptRoot: () => '',
  };
  return { trace, hooks, model, context, callbacks, timers, timerHistory, items, root,
    activate: () => load('extension.js').activate(context),
    createCounts: () => load('src/statusbar/counts-status.js').createCountsStatusController(context, countsDeps),
    setEditor() { model.editor = { document: { uri: { fsPath: path.join(root, 'chapter', 'a.txt') }, getText: () => model.content, isDirty: false } }; },
    async emit(name, value) { for (const fn of callbacks[name]) await fn(value); },
    async flush() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) await fn(); await new Promise(resolve => setImmediate(resolve)); },
    dispose() { for (const subscription of context.subscriptions) subscription.dispose(); },
  };
}
module.exports = { createActivationHarness };
