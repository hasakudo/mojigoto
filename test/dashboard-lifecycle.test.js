const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardLifecycleHarness: fixture, createRefreshHub } = require('./fixtures/dashboard-lifecycle-harness.cjs');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('Dashboard: 最新の更新だけを採用し、閉じたタブの遅い結果は新しいタブへ表示しない', async () => {
  const h = fixture(), pending = [];
  h.hooks.build = () => { const d = deferred(); pending.push(d); return d.promise; };
  const first = h.controller.open(), second = h.controller.refresh();
  pending[1].resolve({ title: '最新' }); await second;
  pending[0].resolve({ title: '古い' }); await first;
  assert.deepEqual(h.states.map(x => x.state.title), ['最新']);
  const old = h.panels[0], closing = h.controller.refresh(); old.dispose();
  const reopening = h.controller.open(); pending[3].resolve({ title: '再開' }); await reopening;
  old.dispose(); assert.equal(h.controller.getPanel(), h.panels[1]);
  pending[2].resolve({ title: '閉じたタブ' }); await closing;
  assert.deepEqual(h.states.map(x => x.state.title), ['最新', '再開']);
  h.controller.dispose();
});

test('Dashboard: Markdown通知は表示中かつ現在の作品だけへ送り、作品切替中の旧通知を無視する', async () => {
  const h = fixture(); await h.controller.open();
  h.emit('markdown', h.currentDir(), { marker: 'current' });
  h.emit('markdown', 'unrelated', { marker: 'other' });
  const previous = h.currentDir(); h.switchWork();
  h.emit('markdown', previous, { marker: 'old' });
  h.emit('markdown', h.currentDir(), { marker: 'not-rendered' });
  await h.controller.refresh(); h.emit('markdown', h.currentDir(), { marker: 'new' });
  assert.deepEqual(h.posts.map(x => x.status.marker), ['current', 'new']);
  h.panels.at(-1).dispose(); h.emit('markdown', h.currentDir(), {});
  assert.equal(h.posts.length, 2); h.controller.dispose();
});

test('Dashboard: 自動保存・反映設定の変更は通知だけ、集計に関わる設定は再描画する', async () => {
  const h = fixture(); await h.controller.open();
  for (const key of ['webviewAutoSaveEnabled', 'noteMemoAutoSyncEnabled', 'conceptMemoAutoSyncEnabled']) {
    h.emit('config', h.config('mojigoto.' + key)); await h.drain();
  }
  assert.equal(h.builds.length, 1); assert.equal(h.posts.length, 3);
  assert.ok(h.posts.every(p => p.type === 'webviewSaveSettingsChanged'));
  for (const key of ['sheetsEnabled', 'webhookEventsMode', 'webhookEventsRemindMode', 'eventLogIntervalMinutes',
    'backupIntervalMinutes', 'backupMaxPerFile', 'eventsMaxCount', 'eventsRetentionDays', 'dailyRetentionDays',
    'dashboardShowProgressGraph', 'dashboardProgressGraphMode', 'countMode']) {
    h.emit('config', h.config('mojigoto.' + key)); await h.drain();
  }
  assert.equal(h.builds.length, 13);
  h.emit('config', h.config('unrelated')); await h.drain(); assert.equal(h.builds.length, 13);
  h.controller.dispose();
});

test('Dashboard: 原稿の編集対象変更と表示エディター変更で更新し、同じ対象・対象外では更新しない', async () => {
  const h = fixture(), editor = file => ({ document: { uri: { fsPath: file } } });
  h.emit('active', editor('before.md')); assert.equal(h.builds.length, 0);
  await h.controller.open(); assert.equal(h.builds[0].writingMemoTargetFsPath, 'before.md');
  for (const file of ['next.txt', 'next.txt', 'image.png']) { h.emit('active', editor(file)); await h.drain(); }
  h.emit('active', undefined); await h.drain(); assert.equal(h.builds.length, 2);
  h.emit('visible', []); await h.drain(); assert.equal(h.builds.length, 3);
  h.panels[0].dispose(); h.emit('visible', []); assert.equal(h.builds.length, 3); h.controller.dispose();
});

test('Dashboard: 復元した0件非表示を保持し、開き直しは既存タブを再利用する', async () => {
  const h = fixture(); const restored = await h.restore({ hideZeroGroups: true });
  assert.equal(h.states[0].state.hideZeroGroups, true);
  await h.controller.open(); assert.equal(h.panels.length, 1); assert.equal(h.controller.getPanel(), restored);
  const state = h.states.at(-1).state;
  await h.receive({ type: 'setHideZeroGroups', enabled: false, source: 'change', renderId: state.statsRenderId });
  await h.controller.refresh(); assert.equal(h.states.at(-1).state.hideZeroGroups, false);
  h.controller.dispose();
});

test('Dashboard: 管理処理の終了後は保留中の集計を破棄し出力・描画を作らない', async () => {
  const h = fixture(), d = deferred(); h.hooks.build = () => d.promise;
  const opening = h.controller.open(); h.controller.dispose();
  d.resolve({ title: '終了後' }); await opening;
  assert.equal(h.states.length, 0); assert.equal(h.controller.getPanel(), null);
  assert.ok(!h.trace.some(x => x[0] === 'output.create'));
  assert.equal(await h.refreshHub.triggerStatsRefresh(), false);
});

test('Dashboard: コンテキスト終了は全購読を一度だけ解除し遅延イベント・操作・再表示を受付しない', async () => {
  const h = fixture(); await h.controller.open();
  for (const name of ['markdown', 'active', 'visible', 'config']) assert.equal(h.listeners(name), 1);
  for (const subscription of h.context.subscriptions) subscription.dispose();
  h.controller.dispose();
  for (const name of ['markdown', 'active', 'visible', 'config']) assert.equal(h.listeners(name), 0);
  const before = JSON.stringify(h.trace);
  h.callbacks.markdown[0](h.currentDir(), {});
  h.callbacks.active[0]({ document: { uri: { fsPath: 'late.md' } } });
  h.callbacks.visible[0]([]); h.callbacks.config[0](h.config('mojigoto.countMode'));
  await h.receive({ type: 'setHideZeroGroups', enabled: true, renderId: h.states[0].state.statsRenderId });
  await h.controller.open(); await h.controller.openSaveSettings(); await h.controller.openWritingMemoTab();
  await h.controller.refresh(); await h.drain();
  assert.equal(JSON.stringify(h.trace), before);
  assert.equal(h.trace.filter(x => x[0] === 'unsubscribe').length, 4);
  assert.equal(h.trace.filter(x => x[0] === 'output.dispose').length, 1);
});

test('Dashboard: 古い更新登録の終了は新しいコントローラーの登録を解除しない', async () => {
  const hub = createRefreshHub(), first = fixture({ refreshHub: hub }), second = fixture({ refreshHub: hub });
  await first.controller.open(); await second.controller.open(); first.controller.dispose();
  assert.equal(await hub.triggerStatsRefresh(), true); assert.equal(second.builds.length, 2);
  second.controller.dispose(); assert.equal(await hub.triggerStatsRefresh(), false);
});

test('Dashboard: 同じ関数の再登録でも以前の解除は最新登録を消さず、明示解除にも対応する', async () => {
  const hub = createRefreshHub(); let calls = 0; const fn = () => { calls++; };
  const first = hub.setStatsRefreshHandler(fn), second = hub.setStatsRefreshHandler(fn);
  first.dispose(); assert.equal(await hub.triggerStatsRefresh(), true); assert.equal(calls, 1);
  second.dispose(); assert.equal(await hub.triggerStatsRefresh(), false);
  hub.setStatsRefreshHandler(fn); hub.setStatsRefreshHandler(null);
  assert.equal(await hub.triggerStatsRefresh(), false);
});

test('Dashboard: 目標・締切・書き出しのコマンド完了後に更新し、診断とCSVは更新しない', async () => {
  const h = fixture(); await h.controller.open(); h.trace.length = 0;
  for (const type of ['setWorkGoal', 'setWorkDeadline', 'openExportLauncher']) {
    h.trace.length = 0; await h.receive({ type }); await h.drain();
    assert.equal(h.trace[0][0], 'command'); assert.equal(h.trace[0][1], 'mojigoto.' + type);
    assert.equal(h.trace.filter(x => x[0] === 'build').length, 1);
  }
  h.trace.length = 0; await h.receive({ type: 'runDoctor' }); await h.receive({ type: 'exportCsv' });
  assert.deepEqual(h.trace, [['command', 'mojigoto.doctor'], ['csv', true]]);
  h.controller.dispose();
});

test('Dashboard: コマンド失敗時は更新せず呼出元へエラーを返す', async () => {
  const h = fixture(); await h.controller.open(); h.trace.length = 0;
  h.hooks.command = () => { throw new Error('コマンド失敗'); };
  await assert.rejects(h.receive({ type: 'setWorkGoal' }), /コマンド失敗/);
  assert.equal(h.trace.filter(x => x[0] === 'build').length, 0); h.controller.dispose();
});

test('Dashboard: 終了済みタブの全操作を無視し、再表示・復元した現在タブの操作は受け付ける', async () => {
  const h = fixture(); await h.controller.open(); const old = h.panels[0]; old.dispose(); await h.controller.open();
  const before = JSON.stringify(h.trace);
  for (const type of ['setWorkGoal', 'exportCsv', 'refresh', 'mojigoto.sendMojigotoEvents', 'toggleDashboardCommonTodo']) {
    await old.receive({ type });
  }
  await h.drain(); assert.equal(JSON.stringify(h.trace), before);
  const replaced = h.panels.at(-1); await h.restore({ hideZeroGroups: true });
  const builds = h.builds.length; await replaced.receive({ type: 'refresh' }); await h.drain(); assert.equal(h.builds.length, builds);
  await h.receive({ type: 'exportCsv' }); assert.deepEqual(h.trace.at(-1), ['csv', true]); h.controller.dispose();
});

test('Dashboard: 送信の成功件数・既定0件・失敗を開始元の画面へ返す', async () => {
  const h = fixture(); await h.controller.open();
  await h.receive({ type: 'mojigoto.sendMojigotoEvents' });
  h.hooks.send = () => undefined; await h.receive({ type: 'mojigoto.sendMojigotoEvents' });
  h.hooks.send = () => { throw new Error('送信失敗'); }; await h.receive({ type: 'mojigoto.sendMojigotoEvents' });
  const posts = JSON.parse(JSON.stringify(h.posts));
  assert.deepEqual(posts, [
    { type: 'mojigoto.sendMojigotoEvents.result', ok: true, sent: 3 },
    { type: 'mojigoto.sendMojigotoEvents.result', ok: true, sent: 0 },
    { type: 'mojigoto.sendMojigotoEvents.result', ok: false, error: 'Error: 送信失敗' },
  ]); h.controller.dispose();
});

test('Dashboard: 送信中の終了・再表示・復元・管理終了で結果を別画面へ送らない', async () => {
  for (const end of ['close', 'reopen', 'restore', 'dispose']) {
    for (const failure of [false, true]) {
      const h = fixture(); await h.controller.open(); const d = deferred(); h.hooks.send = async () => {
        await d.promise; if (failure) throw new Error('遅延送信失敗'); return { sent: 7 };
      };
      const sending = h.receive({ type: 'mojigoto.sendMojigotoEvents' });
      if (end === 'dispose') h.controller.dispose();
      else if (end === 'restore') await h.restore({});
      else { h.panels[0].dispose(); if (end === 'reopen') await h.controller.open(); }
      d.resolve(); await sending; assert.equal(h.posts.length, 0, end);
      if (end === 'reopen' || end === 'restore') {
        h.hooks.send = () => ({ sent: 2 }); await h.receive({ type: 'mojigoto.sendMojigotoEvents' });
        assert.equal(h.posts.length, 1); assert.equal(h.posts[0].sent, 2);
      }
      h.controller.dispose();
    }
  }
});

test('Dashboard: 同じタブの再描画中は送信結果を受け取れる', async () => {
  const h = fixture(); await h.controller.open(); const d = deferred(); h.hooks.send = () => d.promise;
  const sending = h.receive({ type: 'mojigoto.sendMojigotoEvents' }); await h.controller.refresh();
  d.resolve({ sent: 5 }); await sending; assert.equal(h.posts[0].sent, 5); h.controller.dispose();
});
