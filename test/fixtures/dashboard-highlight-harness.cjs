const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDashboardHighlightHarness({ source, managerAvailable = true, editorAvailable = true,
  toggleAvailable = true, groupAvailable = true } = {}) {
  const trace = [], hooks = {}, config = {}, panels = [];
  const disposable = () => ({ dispose() {} });
  const context = { subscriptions: [], globalState: { get() {} } };
  const document = { uri: { fsPath: path.resolve('manuscript.txt') }, fileName: 'manuscript.txt' };
  const editor = { document, viewColumn: 3, revealRange: (...args) => trace.push(['reveal', ...args]) };
  Object.defineProperty(editor, 'selection', { set: value => trace.push(['selection', value]) });
  const manager = {
    refreshEditor(value) { trace.push(['highlight.refresh', value === editor]); hooks.highlight?.(); },
    clearAllEditors() { trace.push(['highlight.clear']); hooks.clear?.(); },
  };
  const vscode = { ViewColumn: { One: 1, Beside: 2 }, ConfigurationTarget: { Workspace: 2 }, TextEditorRevealType: { InCenter: 1 },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    Selection: class { constructor(start, end) { this.start = start; this.end = end; } },
    commands: { async executeCommand(...args) { trace.push(['command', ...args]); await hooks.command?.(...args); } },
    workspace: { onDidChangeConfiguration: disposable, getConfiguration: scope => ({
      get(key, fallback) { trace.push(['config.get', scope, key, fallback]); return config[key] ?? fallback; },
      async update(...args) { trace.push(['config.update', scope, ...args]); await hooks.config?.(...args); config[args[0]] = args[1]; },
    }) },
    window: { activeTextEditor: editorAvailable ? editor : null, visibleTextEditors: editorAvailable ? [editor] : [],
      onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
      async showTextDocument(doc, options) { trace.push(['document.show', doc === document, options]); await hooks.show?.(); return editor; },
      showErrorMessage: message => trace.push(['error', message]),
      createWebviewPanel() { const p = { reveal() {}, webview: { onDidReceiveMessage(fn) { p.receive = fn; } }, onDidDispose(fn) { p.dispose = fn; } }; panels.push(p); return p; },
    },
  };
  const logger = { error: (...args) => trace.push(['console.error', ...args.map(x => x instanceof Error ? x.message : String(x))]) };
  const highlightModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/dashboard-highlight-actions.js'), 'utf8'), {
    module: highlightModule, process, console: logger, require,
  });
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, process, console: logger,
    require: name => name === 'vscode' ? vscode : ['fs', 'path'].includes(name) ? require(name)
      : name === './dashboard-highlight-actions' ? highlightModule.exports
      : name.startsWith('./dashboard-') ? require('../../src/stats/' + name.slice(2))
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} }
      : name === './stats-utils' ? { setStatsRefreshHandler() {} }
      : name === './stats-html' ? { makeStatsHtml: state => { trace.push(['html', state]); return ''; } } : {},
  });
  const controller = module.exports.createStatsPanelController({ context,
    buildStatsState: async () => { trace.push(['build']); await hooks.build?.(); return {}; },
    getHighlightManager: () => managerAvailable ? manager : null,
    getPreferredHighlightEditor: () => { hooks.preferred?.(); return editorAvailable ? editor : null; },
    ...(toggleAvailable ? { toggleHighlightsEnabled: async () => { trace.push(['highlight.toggle']); await hooks.toggle?.(); } } : {}),
    ...(groupAvailable ? { applyHighlightGroupEnabled: async (...args) => { trace.push(['highlight.group', ...args]); await hooks.group?.(); } } : {}),
  });
  return { controller, trace, config, hooks, panels, editor, vscode,
    receive: msg => panels.at(-1).receive(msg),
    async drain() { await new Promise(resolve => setImmediate(resolve)); },
  };
}
module.exports = { createDashboardHighlightHarness };
