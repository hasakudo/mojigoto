const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const copy = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T07:00:00.000Z'])); } static now() { return Date.parse('2026-10-22T07:00:00.000Z'); } }
function createDashboardWritingHarness({ source, single = false } = {}) {
  const base = path.resolve('.review-baseline/test-temp/writing-navigation');
  const workA = path.join(base, 'works', 'A'), workB = path.join(base, 'works', 'B');
  const configuredRoot = path.join(base, 'View', 'manuscript');
  const memoPath = work => path.join(work, '.mojigoto', 'writing-memos.json');
  const singleMemo = path.join(base, '.mojigoto', 'writing-memos.json');
  const conceptPath = work => path.join(work, '.mojigoto', 'concept-memos.json');
  const singleConceptPath = path.join(base, '.mojigoto', 'concept-memos.json');
  const conceptStores = new Map(), config = { writingMemoDecorationsEnabled: true };
  let randomCalls = 0;
  const fixedMath = Object.create(Math); fixedMath.random = () => 0.123456789 + (++randomCalls * 0.001);
  const sourcePath = single ? singleMemo : memoPath(workA), targetPath = path.join(configuredRoot, 'new.txt');
  const sourceMemo = { id: 'm', filePath: 'old.txt', fileName: 'old.txt', excerpt: '同じ文', startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 3, body: 'メモ', custom: { keep: true } };
  const stores = new Map([[sourcePath, { version: 1, custom: 'source', memos: [sourceMemo, { id: 'keep', body: '残す' }] }]]);
  const documents = new Map([[targetPath, '同じ文\n空行\n同じ文']]);
  const trace = [], states = [], panels = [], posts = [], notices = [], hooks = {};
  let selected = [targetPath], confirmation = '付け替える', currentWork = 'A';
  const disposable = () => ({ dispose() {} });
  class Position { constructor(line, character) { this.line = line; this.character = character; } }
  class Range { constructor(start, end) { this.start = start; this.end = end; } }
  class Selection extends Range {}
  function document(file) {
    const text = documents.get(file); if (text === undefined) throw new Error('原稿なし');
    return { uri: { fsPath: file }, getText: () => text,
      offsetAt(pos) { const lines = text.split('\n'); return lines.slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.character; },
      positionAt(offset) { const lines = text.slice(0, offset).split('\n'); return new Position(lines.length - 1, lines.at(-1).length); },
    };
  }
  const vscode = {
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    ViewColumn: { One: 1, Beside: 2 }, Position, Range, Selection, TextEditorRevealType: { InCenter: 1 },
    Uri: { file: fsPath => ({ fsPath }) },
    window: {
      async showQuickPick(items, options) {
        trace.push(['quickPick', items.map(({ memo, ...item }) => item), options]);
        return hooks.quickPick ? hooks.quickPick(items, options) : undefined;
      },
      onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
      createWebviewPanel() { const panel = { reveal() {}, webview: {
        postMessage: async value => { posts.push(copy(value)); trace.push(['post', copy(value)]); }, onDidReceiveMessage(fn) { panel.receive = fn; },
      }, onDidDispose(fn) { panel.dispose = fn; } }; panels.push(panel); return panel; },
      async showOpenDialog(options) { trace.push(['choose', copy(options)]); await hooks.choose?.(); return selected?.map(fsPath => ({ fsPath })); },
      async showWarningMessage(message, ...args) { notices.push(['warning', message]); trace.push(['warning', message, ...args]); await hooks.warning?.(message); return confirmation; },
      showInformationMessage(message) { notices.push(['info', message]); trace.push(['info', message]); },
      showErrorMessage(message) { notices.push(['error', message]); trace.push(['error', message]); },
      async showTextDocument(doc, options) {
        trace.push(['show', doc.uri.fsPath, options]); await hooks.show?.();
        return { set selection(value) { trace.push(['selection', copy(value)]); }, revealRange(range, type) { trace.push(['reveal', copy(range), type]); } };
      },
    },
    workspace: {
      onDidChangeConfiguration: disposable,
      getConfiguration: () => ({ get: (key, fallback) => config[key] ?? fallback, update: async (key, value, target) => { trace.push(['config', key, value, target]); await hooks.config?.(key, value); config[key] = value; } }),
      async openTextDocument(file) { trace.push(['open', file]); await hooks.open?.(file); return document(file); },
    },
  };
  const contained = (file, root) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
  const paths = { listWorkDirectories: () => [{ name: 'A', fsPath: workA }, { name: 'B', fsPath: workB }],
    getConceptMemosPathForWork: conceptPath, getConceptMemosPathForSingle: () => singleConceptPath,
    getWritingMemosPathForWork: memoPath, getWritingMemosPathForSingle: () => singleMemo,
    getWorkManuscriptRoot: work => path.join(work, 'manuscript') };
  const store = {
    async readWritingMemos(file) { trace.push(['read', file]); await hooks.read?.(file); return copy(stores.get(file) || { memos: [] }); },
    async writeWritingMemos(file, value) { trace.push(['write', file, copy(value)]); await hooks.write?.(file, value); stores.set(file, copy(value)); },
  };
  const conceptStore = {
    async readConceptMemos(file) { trace.push(['concept.read', file]); await hooks.conceptRead?.(file); return copy(conceptStores.get(file) || { memos: [] }); },
    async writeConceptMemos(file, value) { trace.push(['concept.write', file, copy(value)]); await hooks.conceptWrite?.(file, value); conceptStores.set(file, copy(value)); },
  };
  const resolver = {
    getConfiguredManuscriptRoot: () => configuredRoot, isSameOrChildPath: contained,
    toMemoRelativePath: (root, file) => path.relative(root, file).replace(/\\/g, '/'),
    resolveWritingMemoAbsolutePathFlexible: (context, file, options) => { trace.push(['resolve', file, copy(options)]); return hooks.resolve ? hooks.resolve(file, options) : options.absoluteFilePath || path.join(configuredRoot, file); },
  };
  const navigationModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/dashboard-writing-memo-navigation.js'), 'utf8'), { module: navigationModule, Date: FixedDate });
  const operationConsole = { error: (...args) => trace.push(['console.error', String(args[0])]) };
  const operationsModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/dashboard-writing-memo-operations.js'), 'utf8'), { module: operationsModule, Date: FixedDate, console: operationConsole });
  const actionsModule = { exports: {} };
  const copierModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/writing-memo-concept-copy.js'), 'utf8'), { module: copierModule, require, process, Date: FixedDate, Math: fixedMath });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/dashboard-writing-memo-actions.js'), 'utf8'), { module: actionsModule, require: () => copierModule.exports, Date: FixedDate, Math: fixedMath, console: operationConsole });
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/stats/stats-panel.js'), 'utf8'), {
    module, process, Date: FixedDate, Math: fixedMath, console: operationConsole,
    require: name => name === 'vscode' ? vscode : name === 'path' ? path
      : name === 'fs' ? { existsSync: file => documents.has(file) }
      : name === './dashboard-stats-correction-actions' ? require('../../src/stats/dashboard-stats-correction-actions')
      : name === './dashboard-progress-image-actions' ? require('../../src/stats/dashboard-progress-image-actions')
      : name === './dashboard-writing-memo-actions' ? actionsModule.exports
      : name === './dashboard-writing-memo-operations' ? operationsModule.exports
      : name === './dashboard-writing-memo-navigation' ? navigationModule.exports
      : name === './dashboard-memo-actions' ? require('../../src/stats/dashboard-memo-actions')
      : name === './dashboard-highlight-actions' ? require('../../src/stats/dashboard-highlight-actions')
      : name === './dashboard-events' ? require('../../src/stats/dashboard-events')
      : name === './dashboard-settings-actions' ? require('../../src/stats/dashboard-settings-actions')
      : name === '../views/shared/restored-webviews' ? require('../../src/views/shared/restored-webviews')
      : name === '../work/work-settings' ? { getWorkName: () => currentWork, getCurrentWorkTitleFromSettings: () => '現在の作品' }
      : name === '../core/mojigoto-context' ? { isSingleMode: () => single }
      : name === '../core/mojigoto-paths' ? paths
      : name === '../data/concept-memo-store' ? conceptStore
      : name === '../views/concept-memo-webview' ? { notifyConceptMemoUpdated: async file => { trace.push(['concept.notify', file]); await hooks.conceptNotify?.(file); } }
      : name === '../writing-memo/writing-memo-store' ? store
      : name === '../writing-memo/writing-memo-resolver' ? resolver
      : name === '../editor/writing-memo-decorations' ? { triggerWritingMemoDecorationRefresh: async editor => { trace.push(editor ? ['decorations', copy(editor)] : ['decorations']); await hooks.decorations?.(); } }
      : name === './stats-html' ? { makeStatsHtml: state => { states.push(copy(state)); trace.push(['render', copy(state)]); return ''; } }
      : name === './stats-utils' ? { setStatsRefreshHandler() {} }
      : name === '../views/shared/webview-panel-icon' ? { setWebviewPanelThemeIcon() {} } : {},
  });
  const controller = module.exports.createStatsPanelController({ context: { subscriptions: [], globalState: { get() {} } },
    buildStatsState: async (_, __, options) => { await hooks.build?.(); const { onTiming, ...state } = options; return state; } });
  return { trace, states, panels, posts, notices, hooks, stores, documents, controller, configuredRoot, targetPath, sourcePath, sourceMemo, workA, workB, memoPath, conceptPath, singleConceptPath, conceptStores, config,
    activeEditor: value => { vscode.window.activeTextEditor = value; },
    message: overrides => ({ type: 'relinkWritingMemo', writingMemoFilePath: sourcePath, memoId: 'm', absoluteFilePath: targetPath, ...overrides }),
    jump: overrides => ({ type: 'writingMemoJump', memoId: 'm', filePath: 'new.txt', absoluteFilePath: targetPath, excerpt: '同じ文', startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 3, ...overrides }),
    receive: msg => panels.at(-1).receive(msg), select: value => { selected = value; }, confirm: value => { confirmation = value; }, switchWork: name => { currentWork = name; },
  };
}
module.exports = { createDashboardWritingHarness };
