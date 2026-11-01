const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getUiPanelsScript } = require('../src/views/note-webview/script-ui-panels');

function menuFixture(anchor, width, height, viewport) {
  const panel = { hidden: true, style: {}, scrollHeight: 520 };
  const button = { getBoundingClientRect: () => anchor, setAttribute(name, value) { this[name] = value; } };
  const context = vm.createContext({ moreMenuPanel: panel, moreMenuBtn: button, isMoreMenuOpen: false,
    window: { innerWidth: width, innerHeight: height, visualViewport: viewport } });
  vm.runInContext(getUiPanelsScript(), context);
  context.setMoreMenuOpen(true);
  return { panel, button, context };
}

test('ノートのメニューを折り返し後の左右端と短い画面でも収め、全項目をスクロールで操作できる', () => {
  for (const width of [240, 320, 600, 900]) {
    for (const right of [38, 190, width - 12]) {
      for (const y of [30, 210]) {
        const { panel, button, context } = menuFixture({ right, top: y, bottom: y + 32 }, width, 300);
        const n = (key) => parseFloat(panel.style[key]);
        assert.ok(n('left') >= 8);
        assert.ok(n('left') + n('width') <= width - 8);
        assert.ok(n('top') >= 8);
        assert.ok(n('top') + Math.min(panel.scrollHeight + 2, n('maxHeight')) <= 292);
        assert.equal(button['aria-expanded'], 'true');
        context.setMoreMenuOpen(false);
        assert.equal(panel.hidden, true);
        assert.equal(button['aria-expanded'], 'false');
      }
    }
  }
});

test('ノートのメニューは拡大した可視領域の移動・リサイズに追従する', () => {
  const viewport = { offsetLeft: 60, offsetTop: 20, width: 250, height: 280 };
  const { panel, context } = menuFixture({ right: 260, top: 95, bottom: 127 }, 900, 700, viewport);
  assert.ok(parseFloat(panel.style.left) >= 68);
  assert.ok(parseFloat(panel.style.left) + parseFloat(panel.style.width) <= 302);
  viewport.offsetLeft = 100; viewport.width = 180;
  context.positionMoreMenu();
  assert.equal(parseFloat(panel.style.width), 164);
  assert.equal(parseFloat(panel.style.left), 108);
});

test('進捗日付の変換結果を再利用しても時差境界・変更された日時・別タイムゾーンを取り違えない', () => {
  const module = { exports: {} };
  let formats = 0;
  class CountingFormatter extends Intl.DateTimeFormat {
    constructor(...args) { super(...args); formats++; }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/progress/progress-summary.js'), 'utf8'), {
    module, Date, Intl: { DateTimeFormat: CountingFormatter },
  });
  const dateInTimeZone = module.exports.dateInTimeZone;
  const date = new Date('2026-10-14T16:00:00Z');
  assert.equal(dateInTimeZone(date), '2026-10-15');
  for (let i = 0; i < 100; i++) assert.equal(dateInTimeZone(date), '2026-10-15');
  assert.equal(formats, 1);
  assert.equal(dateInTimeZone(date, 'UTC'), '2026-10-14');
  date.setUTCDate(15);
  assert.equal(dateInTimeZone(date), '2026-10-16');
  assert.equal(dateInTimeZone(date, 'not-a-time-zone'), '2026-10-16');
  for (let i = 0; i < 4200; i++) dateInTimeZone(new Date(Date.UTC(2000, 0, i + 1)));
  assert.equal(dateInTimeZone(date), '2026-10-16');
});

function controllerFixture({ storage = new Map(), update } = {}) {
  const logs = [], states = [], pending = [], panel = { reveal() {}, webview: {} };
  let receive, disposePanel, configurationChanged, serializer;
  const commands = [];
  const disposable = () => ({ dispose() {} });
  panel.onDidDispose = (fn) => { disposePanel = fn; };
  panel.webview.onDidReceiveMessage = (fn) => { receive = fn; };
  const vscode = { ViewColumn: { Beside: 2 }, window: {
    createWebviewPanel: () => panel, onDidChangeActiveTextEditor: disposable, onDidChangeVisibleTextEditors: disposable,
    createOutputChannel: () => ({ appendLine: (line) => logs.push(line), dispose() {} }),
    registerWebviewPanelSerializer: (_, value) => { serializer = value; return disposable(); },
  }, workspace: { onDidChangeConfiguration: fn => { configurationChanged = fn; return disposable(); } },
    commands: { executeCommand: async (...args) => commands.push(args) } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/stats/stats-panel.js'), 'utf8'), {
    module, console, require: (name) => {
      if (name === "./dashboard-stats-correction-actions") return require("../src/stats/dashboard-stats-correction-actions");
      if (name === "./dashboard-progress-image-actions") return require("../src/stats/dashboard-progress-image-actions");
      if (name === "./dashboard-writing-memo-actions") return require("../src/stats/dashboard-writing-memo-actions");
      if (name === "./dashboard-writing-memo-operations") return require("../src/stats/dashboard-writing-memo-operations");
      if (name === "./dashboard-writing-memo-navigation") return require("../src/stats/dashboard-writing-memo-navigation");
      if (name === "./dashboard-memo-actions") return require("../src/stats/dashboard-memo-actions");
      if (name === "./dashboard-highlight-actions") return require("../src/stats/dashboard-highlight-actions");
      if (name === "./dashboard-events") return require("../src/stats/dashboard-events");
      if (name === "./dashboard-settings-actions") return require("../src/stats/dashboard-settings-actions");
      if (name === 'vscode') return vscode;
      if (name === '../views/shared/restored-webviews') return require('../src/views/shared/restored-webviews');
      if (name === 'fs' || name === 'path') return require(name);
      if (name === './stats-html') return { makeStatsHtml: (state) => { states.push(state); return JSON.stringify(state); } };
      if (name === './stats-utils') return { setStatsRefreshHandler() {} };
      if (name === '../views/shared/webview-panel-icon') return { setWebviewPanelThemeIcon() {} };
      return {};
    },
  });
  const controller = module.exports.createStatsPanelController({ context: { globalState: {
    get: key => storage.get(key), update: update || (async (key, value) => storage.set(key, value)),
  } }, buildStatsState: async (_, __, options) => {
    options.onTiming('進捗まとめ生成', 12);
    return new Promise((resolve) => pending.push(resolve));
  } });
  return { controller, panel, logs, states, pending, commands, storage,
    restore: saved => { controller.createSerializer(); return serializer.deserializeWebviewPanel(panel, saved); },
    changed: key => configurationChanged({ affectsConfiguration: name => name === key }),
    receive: (msg) => receive(msg), disposePanel: () => disposePanel() };
}

const hideZeroKey = 'mojigoto.stats.hideZeroGroups';
async function openController(f, state = {}) {
  const opened = f.controller.open(); f.pending.at(-1)(state); await opened;
}
const hideZeroMessage = (f, enabled, source = 'change', renderId = f.states.at(-1).statsRenderId) =>
  f.receive({ type: 'setHideZeroGroups', enabled, source, renderId });

test('0件を隠すは再描画・作品切替・閉じて開く・コントローラー再作成でもON/OFFを保持する', async () => {
  const storage = new Map();
  const first = controllerFixture({ storage });
  await openController(first);
  assert.equal(first.states.at(-1).hideZeroGroups, undefined);
  await hideZeroMessage(first, true);
  for (const title of ['元の作品', '切り替えた作品']) {
    const updated = first.controller.refresh(); first.pending.at(-1)({ title }); await updated;
    assert.equal(first.states.at(-1).hideZeroGroups, true);
  }
  first.disposePanel();
  await openController(first);
  assert.equal(first.states.at(-1).hideZeroGroups, true);
  const reopened = controllerFixture({ storage });
  await openController(reopened);
  assert.equal(reopened.states.at(-1).hideZeroGroups, true);
  await hideZeroMessage(reopened, false);
  const afterRestart = controllerFixture({ storage });
  await openController(afterRestart);
  assert.equal(afterRestart.states.at(-1).hideZeroGroups, false);
  assert.equal(storage.get(hideZeroKey), false);
});

test('復元時の旧Webview状態は未移行時だけ読み、保存済みOFFを古いONで上書きしない', async () => {
  const storage = new Map();
  const migrated = controllerFixture({ storage });
  const restored = migrated.restore({ hideZeroGroups: true });
  await new Promise(resolve => setImmediate(resolve));
  migrated.pending[0]({}); await restored;
  assert.equal(storage.get(hideZeroKey), true);
  assert.equal(migrated.states[0].hideZeroGroups, true);
  storage.set(hideZeroKey, false);
  const current = controllerFixture({ storage });
  const restoreAgain = current.restore({ hideZeroGroups: true });
  current.pending[0]({}); await restoreAgain;
  assert.equal(current.states[0].hideZeroGroups, false);
});

test('初回の旧UI状態を移行し、不正値・古い画面・遅れた初期通知は採用しない', async () => {
  const f = controllerFixture(); await openController(f);
  await hideZeroMessage(f, true, 'initial');
  assert.equal(f.storage.get(hideZeroKey), true);
  await hideZeroMessage(f, false, 'initial');
  await hideZeroMessage(f, 'false');
  await hideZeroMessage(f, false, 'unknown');
  const oldRender = f.states.at(-1).statsRenderId;
  await openController(f);
  await hideZeroMessage(f, false, 'change', oldRender);
  assert.equal(f.storage.get(hideZeroKey), true);
});

test('描画中のチェック変更を最新HTMLへ渡し、連続した保存を順番どおり永続化する', async () => {
  const writes = [], storage = new Map();
  const f = controllerFixture({ storage, update: (key, value) => new Promise(resolve => writes.push(() => { storage.set(key, value); resolve(); })) });
  await openController(f);
  const redraw = f.controller.refresh();
  const on = hideZeroMessage(f, true), off = hideZeroMessage(f, false);
  f.pending.at(-1)({}); await redraw;
  assert.equal(f.states.at(-1).hideZeroGroups, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  writes[0](); await on;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 2);
  writes[1](); await off;
  assert.equal(storage.get(hideZeroKey), false);
});

test('Dashboardのバックアップ設定ボタンは該当設定を開く', async () => {
  const f = controllerFixture();
  const opened = f.controller.open(); f.pending[0]({}); await opened;
  await f.receive({ type: 'openBackupSettings' });
  assert.deepEqual(f.commands[0], ['workbench.action.openSettings', '@ext:hasakudo.mojigoto backup']);
});

test('バックアップ間隔・件数の設定変更でDashboardを更新する', async () => {
  const f = controllerFixture();
  const opened = f.controller.open(); f.pending[0]({ backupSettings: { intervalMinutes: 0, maxPerFile: 50 } }); await opened;
  for (const [index, key, backupSettings] of [[1, 'mojigoto.backupIntervalMinutes', { intervalMinutes: 15, maxPerFile: 50 }], [2, 'mojigoto.backupMaxPerFile', { intervalMinutes: 15, maxPerFile: 5 }]]) {
    f.changed(key);
    assert.equal(f.pending.length, index + 1);
    f.pending[index]({ backupSettings });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.states.at(-1).backupSettings, backupSettings);
  }
});

test('DashboardはバックアップのOFF・設定値・1ファイルの単位を表示する', () => {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/stats/stats-html/stats-html-dashboard.js'), 'utf8');
  vm.runInNewContext(source + '\nmodule.exports.retention = renderRetentionCard;', { module });
  const esc = value => String(value);
  assert.match(module.exports.retention({ backupSettings: { intervalMinutes: 0, maxPerFile: 50 } }, esc), /OFF（0分）/);
  const html = module.exports.retention({ backupSettings: { intervalMinutes: 15, maxPerFile: 5 } }, esc);
  assert.match(html, /15分ごと（保存後）/);
  assert.match(html, /5件／1ファイル/);
  assert.match(html, /保護した履歴は件数に含めません/);
});

test('重なったDashboard更新は最新の結果だけを表示し、画面準備の計測を一度だけ記録する', async () => {
  const f = controllerFixture();
  const first = f.controller.open(), second = f.controller.refresh();
  f.pending[1]({ title: '最新' }); await second;
  f.pending[0]({ title: '旧結果' }); await first;
  assert.equal(f.states.length, 1);
  assert.equal(f.states[0].title, '最新');
  assert.match(f.logs[0], /進捗まとめ生成 12ms/);
  await f.receive({ type: 'statsViewReady', renderId: f.states[0].statsRenderId, scriptMs: 25 });
  await f.receive({ type: 'statsViewReady', renderId: f.states[0].statsRenderId, scriptMs: 25 });
  assert.equal(f.logs.length, 2);
  assert.match(f.logs[1], /Webview初期処理 25ms/);
});

test('Dashboardを閉じてから完了した更新で破棄済みパネルへ書き込まない', async () => {
  const f = controllerFixture();
  const opened = f.controller.open();
  f.disposePanel();
  f.pending[0]({}); await opened;
  assert.equal(f.states.length, 0);
});
