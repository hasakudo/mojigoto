const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function createDashboardCorrectionHarness({ source, withSender = true } = {}) {
  const trace = [], notices = [], panels = [], states = [], inputs = [], memory = {};
  const hooks = {}, config = { sheetsEnabled: false };
  const status = { total: 12345, recordedTotal: 15000, fileCount: 3, missingFileHistoryCount: 2, hasBackup: true };
  let action = 'rebase', scope = 'today', input = '1250', explicitConfirmation = false, confirmation, send = false;
  const disposable = () => ({ dispose() {} });
  const context = { subscriptions: [], globalState: { get: (_, fallback) => fallback } };
  const service = {
    async getStatsCorrectionStatus(passedContext) { trace.push(['status', passedContext === context]); await hooks.status?.(); return { ...status }; },
  };
  const operations = {
    rebaseStatsToCurrentManuscripts: ['rebase', () => ({ total: status.total, removedFileHistoryCount: 2 })],
    correctTodayDelta: ['delta', desired => ({ total: status.total, delta: desired })],
    resetStatsRecords: ['reset', () => ({ total: status.total })],
    undoLastStatsCorrection: ['undo', () => ({ total: status.recordedTotal })],
  };
  for (const [name, [kind, result]] of Object.entries(operations)) {
    service[name] = async (passedContext, ...args) => {
      trace.push(['operation', kind, passedContext === context, ...args]); await hooks.operation?.(kind, ...args);
      const value = result(...args); Object.assign(memory, { operation: kind, args, ...value });
      trace.push(['committed', kind, value]); return value;
    };
  }
  const vscode = {
    ViewColumn: { Beside: 2 },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => config[key] ?? fallback }), onDidChangeConfiguration: disposable },
    window: {
      onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
      async showQuickPick(items, options) {
        trace.push(['pick', items, options]); await hooks.pick?.(items, options);
        return items.find(item => item.action ? item.action === action : item.scope === scope);
      },
      async showInputBox(options) { inputs.push(options); trace.push(['input', { ...options, validateInput: undefined }]); await hooks.input?.(); return input; },
      async showWarningMessage(message, ...args) { notices.push(['warning', message]); trace.push(['warning', message, ...args]); await hooks.warning?.(); return explicitConfirmation ? confirmation : args.find(value => typeof value === 'string'); },
      async showInformationMessage(message, ...args) { notices.push(['info', message]); trace.push(['info', message, ...args]); await hooks.info?.(); return send && args.includes('Sheetsへ補正値を送信') ? 'Sheetsへ補正値を送信' : undefined; },
      showErrorMessage(message) { notices.push(['error', message]); trace.push(['error', message]); },
      createWebviewPanel() {
        const panel = { reveal() {}, webview: { onDidReceiveMessage(fn) { panel.receive = fn; }, async postMessage(value) { trace.push(['post', value]); } }, onDidDispose(fn) { panel.dispose = fn; } };
        panels.push(panel); return panel;
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, console,
    require: name => name === 'vscode' ? vscode : ['fs','path'].includes(name) ? require(name)
      : name === './stats-correction' ? service
      : name === './dashboard-stats-correction-actions' ? require('../../src/stats/dashboard-stats-correction-actions')
      : name === './dashboard-progress-image-actions' ? require('../../src/stats/dashboard-progress-image-actions')
      : name === './dashboard-writing-memo-actions' ? require('../../src/stats/dashboard-writing-memo-actions')
      : name === './dashboard-writing-memo-operations' ? require('../../src/stats/dashboard-writing-memo-operations')
      : name === './dashboard-writing-memo-navigation' ? require('../../src/stats/dashboard-writing-memo-navigation')
      : name === './dashboard-memo-actions' ? require('../../src/stats/dashboard-memo-actions')
      : name === './dashboard-highlight-actions' ? require('../../src/stats/dashboard-highlight-actions')
      : name === './dashboard-events' ? require('../../src/stats/dashboard-events')
      : name === './dashboard-settings-actions' ? require('../../src/stats/dashboard-settings-actions')
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === './stats-html' ? { makeStatsHtml: state => { states.push(state); trace.push(['render', state]); return ''; } }
      : name === './stats-utils' ? { setStatsRefreshHandler() {} }
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} } : {},
  });
  const controller = module.exports.createStatsPanelController({ context,
    buildStatsState: async () => { await hooks.build?.(); return {}; },
    ...(withSender ? { sendInitialProgressToWebhook: async passedContext => { trace.push(['send', passedContext === context]); await hooks.send?.(); return { total: 9999, daily: 125 }; } } : {}),
  });
  return { trace, notices, panels, states, inputs, memory, hooks, config, status, controller,
    receive: () => panels.at(-1).receive({ type: 'correctStats' }),
    pick: value => { action = value; }, scope: value => { scope = value; }, input: value => { input = value; },
    confirm: value => { explicitConfirmation = true; confirmation = value; }, sendOption: value => { send = value; },
  };
}
module.exports = { createDashboardCorrectionHarness };
