const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T12:00:00Z'])); } }

function createDashboardMemoHarness({ source } = {}) {
  const trace = [], hooks = {}, config = {}, panels = [];
  const model = { single: false, workName: 'A', workTitle: '単独作品',
    works: [{ name: 'A', title: '作品A', fsPath: '/works/A' }, { name: 'B', title: '作品B', fsPath: '/works/B' }],
    data: { custom: '維持', memos: [{ id: 'memo', title: 'メモ', showInDashboard: true, custom: 42,
      todoItems: [{ id: 'item', text: '作業', done: false, custom: '維持' }, { id: 'other', done: true }] }, { id: 'other' }] },
    common: [{ id: 'item', text: '共通作業', done: false, custom: '維持' }, { id: 'other', done: true }] };
  const disposable = () => ({ dispose() {} });
  const context = { subscriptions: [], globalState: { get() {} } };
  const logger = { error: (...args) => trace.push(['console.error', ...args.map(x => x instanceof Error ? x.message : String(x))]) };
  const service = {
    async readConceptMemos(file) { trace.push(['memo.read', file]); await hooks.read?.(); return structuredClone(model.data); },
    async writeConceptMemos(file, data) { trace.push(['memo.write', file, structuredClone(data)]); await hooks.write?.(); model.data = structuredClone(data); },
    async readCommonTodoItems() { trace.push(['common.read']); await hooks.read?.(); return structuredClone(model.common); },
    async writeCommonTodoItems(data) { trace.push(['common.write', structuredClone(data)]); await hooks.write?.(); model.common = structuredClone(data); },
  };
  const view = {
    async notifyConceptMemoUpdated(file) { trace.push(['memo.notify', file]); await hooks.notify?.(); },
    async notifyCommonTodoUpdated() { trace.push(['common.notify']); await hooks.notify?.(); },
    async openConceptMemoWebview(ctx, editor, options) { trace.push(['memo.open', ctx === context, editor, options]); await hooks.open?.(); },
  };
  const vscode = { ViewColumn: { One: 1, Beside: 2 }, ConfigurationTarget: { Workspace: 2 },
    workspace: { onDidChangeConfiguration: disposable, getConfiguration: scope => ({
      async update(...args) { trace.push(['config.update', scope, ...args]); await hooks.config?.(); config[args[0]] = args[1]; },
    }) },
    window: { onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
      showErrorMessage: message => trace.push(['error', message]), showWarningMessage: message => trace.push(['warning', message]),
      createWebviewPanel() { const p = { reveal() {}, webview: { onDidReceiveMessage(fn) { p.receive = fn; } }, onDidDispose(fn) { p.dispose = fn; } }; panels.push(p); return p; },
    },
  };
  const memoModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/dashboard-memo-actions.js'), 'utf8'), {
    module: memoModule, console: logger, Date: FixedDate,
  });
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, console: logger, Date: FixedDate,
    require: name => name === 'vscode' ? vscode : ['fs', 'path'].includes(name) ? require(name)
      : name === './dashboard-memo-actions' ? memoModule.exports
      : name.startsWith('./dashboard-') ? require('../../src/stats/' + name.slice(2))
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} }
      : name === './stats-utils' ? { setStatsRefreshHandler() {} }
      : name === './stats-html' ? { makeStatsHtml: state => { trace.push(['html', state]); return ''; } }
      : name === '../work/work-settings' ? { getWorkName: () => model.workName, getCurrentWorkTitleFromSettings: () => model.workTitle }
      : name === '../core/mojigoto-context' ? { isSingleMode: () => model.single }
      : name === '../core/mojigoto-paths' ? { listWorkDirectories: () => model.works,
        getConceptMemosPathForWork: dir => dir + '/concept.json', getConceptMemosPathForSingle: () => '/single/concept.json' }
      : name === '../data/concept-memo-store' || name === '../data/common-todo-store' ? service
      : name === '../views/concept-memo-webview' ? view : {},
  });
  const controller = module.exports.createStatsPanelController({ context,
    buildStatsState: async () => { trace.push(['build']); await hooks.build?.(); return {}; } });
  return { controller, trace, hooks, config, panels, model,
    receive: msg => panels.at(-1).receive(msg),
    async drain() { await new Promise(resolve => setImmediate(resolve)); },
  };
}
module.exports = { createDashboardMemoHarness };
