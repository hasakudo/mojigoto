const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const IMAGE_KEY = 'mojigoto.progressImageSaveDirectory';
const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T07:00:00.000Z'])); } static now() { return Date.parse('2026-10-22T07:00:00.000Z'); } }
class Uri {
  constructor(scheme, authority, pathname, query = '', fragment = '') { Object.assign(this, { scheme, authority, path: pathname, query, fragment }); }
  get fsPath() { return this.path.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, path.sep); }
  toString() { return `${this.scheme}://${this.authority}${this.path}${this.query ? '?' + this.query : ''}${this.fragment ? '#' + this.fragment : ''}`; }
  with(parts) { return new Uri(parts.scheme ?? this.scheme, parts.authority ?? this.authority, parts.path ?? this.path, parts.query ?? this.query, parts.fragment ?? this.fragment); }
  static parse(value) { const url = new URL(value); return new Uri(url.protocol.slice(0, -1), url.host, decodeURIComponent(url.pathname), url.search.slice(1), url.hash.slice(1)); }
  static joinPath(uri, suffix) { return uri.with({ path: path.posix.join(uri.path, suffix) }); }
}
function createDashboardProgressImageHarness({ source } = {}) {
  const trace = [], posts = [], notices = [], panels = [], states = [], storage = new Map(), hooks = {}, written = [];
  let selected = Uri.parse('file:///D:/exports/custom.png'), title = '星の物語', workName = 'workA';
  const workspace = [ { uri: Uri.parse('file:///C:/workspace') } ];
  const disposable = () => ({ dispose() {} });
  const vscode = {
    Uri, ViewColumn: { Beside: 2 },
    workspace: { workspaceFolders: workspace, onDidChangeConfiguration: disposable,
      fs: { writeFile: async (uri, value) => { trace.push(['write', uri.toString(), Buffer.from(value).toString('base64')]); await hooks.write?.(uri, value); written.push([uri.toString(), Buffer.from(value).toString('base64')]); } },
    },
    window: {
      onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
      async showSaveDialog(options) { trace.push(['dialog', { ...options, defaultUri: options.defaultUri?.toString() }]); await hooks.dialog?.(); return selected; },
      showInformationMessage(message) { notices.push(['info', message]); trace.push(['info', message]); },
      showErrorMessage(message) { notices.push(['error', message]); trace.push(['error', message]); },
      createWebviewPanel() {
        const panel = { reveal() {}, webview: {
          async postMessage(message) { posts.push(message); trace.push(['post', message]); await hooks.post?.(); },
          onDidReceiveMessage(fn) { panel.receive = fn; },
        }, onDidDispose(fn) { panel.dispose = fn; } }; panels.push(panel); return panel;
      },
    },
  };
  const context = { subscriptions: [], globalState: {
    get: (key, fallback) => storage.get(key) ?? fallback,
    async update(key, value) { trace.push(['remember', key, value]); await hooks.remember?.(); storage.set(key, value); },
  } };
  const imageModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/dashboard-progress-image-actions.js'), 'utf8'), {
    module: imageModule, Date: FixedDate, require: name => name === 'path' ? path : require('../../src/progress/progress-image'),
  });
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, console, Date: FixedDate,
    require: name => name === 'vscode' ? vscode : ['fs', 'path'].includes(name) ? require(name)
      : name === './dashboard-stats-correction-actions' ? require('../../src/stats/dashboard-stats-correction-actions')
      : name === './dashboard-progress-image-actions' ? imageModule.exports
      : name === '../progress/progress-image' ? require('../../src/progress/progress-image')
      : name === './dashboard-writing-memo-actions' ? require('../../src/stats/dashboard-writing-memo-actions')
      : name === './dashboard-writing-memo-operations' ? require('../../src/stats/dashboard-writing-memo-operations')
      : name === './dashboard-writing-memo-navigation' ? require('../../src/stats/dashboard-writing-memo-navigation')
      : name === './dashboard-memo-actions' ? require('../../src/stats/dashboard-memo-actions')
      : name === './dashboard-highlight-actions' ? require('../../src/stats/dashboard-highlight-actions')
      : name === './dashboard-events' ? require('../../src/stats/dashboard-events')
      : name === './dashboard-settings-actions' ? require('../../src/stats/dashboard-settings-actions')
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === '../work/work-settings' ? { getCurrentWorkTitleFromSettings: () => title, getWorkName: () => workName }
      : name === './stats-html' ? { makeStatsHtml: state => { states.push(state); trace.push(['render', state]); return ''; } }
      : name === './stats-utils' ? { setStatsRefreshHandler() {} }
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} } : {},
  });
  const controller = module.exports.createStatsPanelController({ context, buildStatsState: async () => ({}) });
  return { controller, trace, posts, notices, panels, states, storage, hooks, written, workspace,
    message: overrides => ({ type: 'saveProgressShareImage', date: '2026-10-01', dataUrl: 'data:image/png;base64,' + bytes.toString('base64'), ...overrides }),
    receive: message => panels.at(-1).receive(message), select: value => { selected = value ? Uri.parse(value) : undefined; },
    title: value => { title = value; }, workName: value => { workName = value; },
  };
}
module.exports = { createDashboardProgressImageHarness, IMAGE_KEY, bytes };
