const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class FixedDate extends Date { static now() { return 1000; } }
function createRefreshHub() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/stats-utils.js'), 'utf8'), { module });
  return module.exports;
}
function createDashboardLifecycleHarness({ source, refreshHub = createRefreshHub() } = {}) {
  const trace = [], panels = [], states = [], posts = [], builds = [], hooks = {}, callbacks = {}, active = new Map(), values = new Map();
  let currentDir = path.resolve('.review-baseline/test-temp/lifecycle/A/.mojigoto'), serializer;
  const subscribe = (name, fn) => {
    if (!active.has(name)) active.set(name, new Set()); active.get(name).add(fn);
    (callbacks[name] ||= []).push(fn); trace.push(['subscribe', name]); let disposed = false;
    return { dispose() { if (disposed) return; disposed = true; active.get(name).delete(fn); trace.push(['unsubscribe', name]); } };
  };
  function panel() {
    const index = panels.length, p = { viewColumn: 2, title: 'もじごと: Dashboard', reveal: (...args) => trace.push(['reveal', index, ...args]),
      webview: { options: {}, async postMessage(value) { posts.push(value); trace.push(['post', index, value]); }, onDidReceiveMessage(fn) { p.receive = fn; } },
      onDidDispose(fn) { p.closed = fn; }, dispose() { p.closed?.(); trace.push(['panel.close', index]); } };
    Object.defineProperty(p.webview, 'html', { set(value) { const state = JSON.parse(value); states.push({ index, state }); trace.push(['html', index, state]); } });
    panels.push(p); return p;
  }
  const vscode = { ViewColumn: { Beside: 2 },
    commands: { async executeCommand(...args) { trace.push(['command', ...args]); return hooks.command?.(...args); } },
    window: {
      onDidChangeActiveTextEditor: fn => subscribe('active', fn), onDidChangeVisibleTextEditors: fn => subscribe('visible', fn),
      registerWebviewPanelSerializer: (_, value) => { serializer = value; return { dispose() {} }; },
      createWebviewPanel: () => panel(), showWarningMessage: message => trace.push(['warning', message]),
      createOutputChannel: () => { let closed = false; trace.push(['output.create']); return {
        appendLine(value) { if (closed) throw new Error('closed output'); trace.push(['log', value]); },
        dispose() { closed = true; trace.push(['output.dispose']); },
      }; },
    }, workspace: { onDidChangeConfiguration: fn => subscribe('config', fn) },
  };
  const context = { subscriptions: [], globalState: { get: (key, fallback) => values.get(key) ?? fallback,
    async update(key, value) { trace.push(['persist', key, value]); await hooks.persist?.(key, value); values.set(key, value); } } };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, console, Date: FixedDate,
    require: name => name === 'vscode' ? vscode : ['fs', 'path'].includes(name) ? require(name)
      : name.startsWith('./dashboard-') ? require('../../src/stats/' + name.slice(2))
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === '../export/web-note-markdown' ? { onDidChange: fn => subscribe('markdown', fn), getStatus: dir => ({ enabled: false, workKey: dir }) }
      : name === '../data/webview-save-settings' ? { getWebviewSaveSettings: () => ({ webviewAutoSaveEnabled: true }) }
      : name === '../work/work-settings' ? { getCurrentWorkSettingsPath: () => path.join(currentDir, 'work.json') }
      : name === './stats-html' ? { makeStatsHtml: state => JSON.stringify(state) }
      : name === './stats-utils' ? refreshHub
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} } : {},
  });
  const controller = module.exports.createStatsPanelController({ context,
    exportStatsCsv: async passedContext => { trace.push(['csv', passedContext === context]); await hooks.csv?.(); },
    sendUnsyncedMojigotoEventsToWebhook: async passedContext => { trace.push(['send', passedContext === context]); return hooks.send ? hooks.send() : { sent: 3 }; },
    buildStatsState: async (_, __, options) => { builds.push(options); trace.push(['build', JSON.parse(JSON.stringify(options))]); return hooks.build ? hooks.build(options) : { title: '現在の作品' }; } });
  return { controller, context, panels, states, posts, trace, hooks, callbacks, values, builds, refreshHub, panel,
    currentDir: () => currentDir, switchWork: () => { currentDir = path.resolve('.review-baseline/test-temp/lifecycle/B/.mojigoto'); },
    receive: msg => panels.at(-1).receive(msg),
    emit(name, ...args) { for (const fn of active.get(name) || []) fn(...args); },
    config: (...keys) => ({ affectsConfiguration: key => keys.includes(key) }),
    listeners: name => active.get(name)?.size || 0,
    restore: async saved => { controller.createSerializer(); const p = panel(); await serializer.deserializeWebviewPanel(p, saved); return p; },
    async drain() { await new Promise(resolve => setImmediate(resolve)); },
  };
}
module.exports = { createDashboardLifecycleHarness, createRefreshHub };
