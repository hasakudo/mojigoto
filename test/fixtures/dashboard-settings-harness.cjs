const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real public controller; replace only VS Code and persistence boundaries.
function createDashboardSettingsHarness({ source } = {}) {
  const calls = [], states = [], panels = [], values = new Map(), posts = [], commands = [], trace = [], configListeners = [], hooks = {};
  const settings = { webviewAutoSaveEnabled: true, noteMemoAutoSyncEnabled: false, conceptMemoAutoSyncEnabled: false };
  let current = path.resolve('.review-baseline/test-temp/dashboard-A/.mojigoto'), markdownChanged;
  const disposable = () => ({ dispose() {} });
  const service = {
    getStatus: dir => ({ available: !!dir, enabled: values.get(dir) || false, workKey: dir }),
    setEnabled: async (dir, enabled) => {
      calls.push([dir, enabled]); trace.push(['markdown.start', dir, enabled]);
      await hooks.markdown?.(dir, enabled); values.set(dir, enabled); trace.push(['markdown.done', dir, enabled]);
    },
    regenerate: async dir => {
      calls.push([dir, 'retry']); trace.push(['markdown.start', dir, 'retry']);
      await hooks.markdown?.(dir, 'retry'); trace.push(['markdown.done', dir, 'retry']);
    },
    onDidChange: fn => { markdownChanged = fn; return disposable(); },
  };
  const context = { subscriptions: [], globalState: { get() {} } };
  const api = {
    getWebviewSaveSettings: () => ({ ...settings }),
    updateWebviewSaveSetting: async (passedContext, key, enabled) => {
      trace.push(['setting.start', passedContext === context, key, enabled]);
      await hooks.setting?.(key, enabled);
      if (!(key in settings) || typeof enabled !== 'boolean') throw new Error('不正な設定');
      settings[key] = enabled; trace.push(['setting.done', key, enabled]);
      return { settings: { ...settings }, changed: true };
    },
  };
  const vscode = {
    ViewColumn: { Beside: 2 },
    commands: { executeCommand: async (...args) => { commands.push(args); trace.push(['command', ...args]); await hooks.command?.(...args); } },
    window: {
      onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
      createWebviewPanel: () => {
        const panel = { reveal() {}, webview: {
          postMessage: async value => { posts.push(value); trace.push(['post', value]); },
          onDidReceiveMessage(fn) { panel.receive = fn; },
        }, onDidDispose(fn) { panel.disposed = fn; }, dispose() { panel.disposed(); } };
        panels.push(panel); return panel;
      },
    },
    workspace: { onDidChangeConfiguration: fn => { configListeners.push(fn); return disposable(); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, console,
    require: name => name === 'vscode' ? vscode : ['fs', 'path'].includes(name) ? require(name)
      : name === './dashboard-stats-correction-actions' ? require('../../src/stats/dashboard-stats-correction-actions')
      : name === './dashboard-progress-image-actions' ? require('../../src/stats/dashboard-progress-image-actions')
      : name === './dashboard-writing-memo-actions' ? require('../../src/stats/dashboard-writing-memo-actions')
      : name === './dashboard-writing-memo-operations' ? require('../../src/stats/dashboard-writing-memo-operations')
      : name === './dashboard-writing-memo-navigation' ? require('../../src/stats/dashboard-writing-memo-navigation')
      : name === './dashboard-memo-actions' ? require('../../src/stats/dashboard-memo-actions')
      : name === './dashboard-highlight-actions' ? require('../../src/stats/dashboard-highlight-actions')
      : name === './dashboard-events' ? require('../../src/stats/dashboard-events')
      : name === './dashboard-settings-actions' ? require('../../src/stats/dashboard-settings-actions')
      : name === '../data/webview-save-settings' ? api
      : name === '../export/web-note-markdown' ? service
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === '../work/work-settings' ? { getCurrentWorkSettingsPath: () => current ? path.join(current, 'work.json') : '' }
      : name === './stats-html' ? { makeStatsHtml: state => { states.push(state); trace.push(['render', state]); return 'DASHBOARD'; } }
      : name === './stats-utils' ? { setStatsRefreshHandler() {} }
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} } : {},
  });
  const controller = module.exports.createStatsPanelController({ context, buildStatsState: async () => ({}),
    getHighlightManager: () => { trace.push(['highlightManager']); return null; } });
  const message = (overrides = {}) => ({ type: 'webMarkdownAction', action: 'enabled', enabled: true, workKey: current,
    renderId: states.at(-1).statsRenderId, ...overrides });
  return { calls, states, posts, commands, trace, hooks, settings, values, context, controller, panels, message, current: () => current,
    receive: msg => panels.at(-1).receive(msg),
    switchWork: (value = path.resolve('.review-baseline/test-temp/dashboard-B/.mojigoto')) => { current = value; },
    changed: key => configListeners.forEach(fn => fn({ affectsConfiguration: name => name === `mojigoto.${key}` })),
    markdownChanged: (dir, status) => markdownChanged(dir, status),
  };
}
module.exports = { createDashboardSettingsHarness };
