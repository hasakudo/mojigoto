const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardMemoHarness: fixture } = require('./fixtures/dashboard-memo-harness.cjs');
async function open() { const h = fixture(); await h.controller.open(); h.trace.length = 0; return h; }
const msg = type => ({ type, memoId: 'memo', itemId: 'item' });

test('Dashboard: 構想TODOは対象だけ切替し本文と未知項目を保持、保存後に通知・更新する', async () => {
  const h = await open(); await h.receive(msg('toggleDashboardTodo')); await h.drain();
  const memo = h.model.data.memos[0];
  assert.equal(memo.todoItems[0].done, true); assert.equal(memo.todoItems[0].custom, '維持');
  assert.equal(memo.todoItems[1].done, true); assert.equal(memo.custom, 42); assert.equal(h.model.data.custom, '維持');
  assert.equal(memo.updatedAt, '2026-10-22T12:00:00.000Z');
  assert.deepEqual(h.trace.map(x => x[0]), ['memo.read', 'memo.write', 'memo.notify', 'build', 'html']);
  await h.receive(msg('toggleDashboardTodo')); await h.drain(); assert.equal(h.model.data.memos[0].todoItems[0].done, false);
});

test('Dashboard: 対象のない構想TODOは保存・通知しない', async () => {
  for (const change of [h => { h.model.workName = ''; }, h => { h.model.works = []; },
    h => { h.model.data.memos = []; }, h => { h.model.data.memos[0].todoItems = null; },
    h => { h.model.data.memos[0].todoItems = []; }]) {
    const h = await open(); change(h); await h.receive(msg('toggleDashboardTodo')); await h.drain();
    assert.ok(!h.trace.some(x => ['memo.write', 'memo.notify', 'build'].includes(x[0])));
  }
});

test('Dashboard: 共通TODOは対象だけ切替し保存・通知・再描画する', async () => {
  const h = await open(); await h.receive(msg('toggleDashboardCommonTodo'));
  assert.equal(h.model.common[0].done, true); assert.equal(h.model.common[0].custom, '維持');
  assert.equal(h.model.common[1].done, true);
  assert.deepEqual(h.trace.map(x => x[0]), ['common.read', 'common.write', 'common.notify', 'build', 'html']);
  h.trace.length = 0; await h.receive({ type: 'toggleDashboardCommonTodo', itemId: 'missing' });
  assert.deepEqual(h.trace.map(x => x[0]), ['common.read']);
});

test('Dashboard: 個別メモの表示切替は他メモと本文を保持する', async () => {
  const h = await open(), previous = structuredClone(h.model.data.memos[1]);
  await h.receive(msg('toggleDashboardVisibility'));
  assert.equal(h.model.data.memos[0].showInDashboard, false); assert.equal(h.model.data.memos[0].title, 'メモ');
  assert.deepEqual(h.model.data.memos[1], previous); assert.equal(h.model.data.custom, '維持');
  assert.deepEqual(h.trace.map(x => x[0]), ['memo.read', 'memo.write', 'memo.notify', 'build', 'html']);
});

test('Dashboard: 表示設定6種類をWorkspaceへ保存し、グラフ方式はdaily/totalに限定する', async () => {
  const keys = { progressGraph: 'dashboardShowProgressGraph', progressGraphMode: 'dashboardProgressGraphMode',
    commonTodo: 'dashboardShowCommonTodo', text: 'dashboardShowTextMemos', list: 'dashboardShowListMemos', todo: 'dashboardShowTodoMemos' };
  for (const [key, setting] of Object.entries(keys)) {
    const h = await open(); await h.receive({ type: 'setDashboardMemoVisibility', key, enabled: false, value: 'total' });
    assert.deepEqual(h.trace[0], ['config.update', 'mojigoto', setting, key === 'progressGraphMode' ? 'total' : false, 2]);
    assert.equal(h.trace.at(-1)[0], 'html');
  }
  const h = await open(); await h.receive({ type: 'setDashboardMemoVisibility', key: 'progressGraphMode', value: 'unknown' });
  assert.equal(h.config.dashboardProgressGraphMode, 'daily');
  h.trace.length = 0; await h.receive({ type: 'setDashboardMemoVisibility', key: 'unknown' });
  assert.deepEqual(h.trace.map(x => x[0]), ['build', 'html']);
});

test('Dashboard: 構想メモを現在の作品または単独モードの対象で開く', async () => {
  for (const single of [false, true]) {
    const h = await open(); h.model.single = single; await h.receive(msg('openConceptMemoFromDashboard'));
    const options = h.trace[0][3];
    assert.equal(options.filePath, single ? '/single/concept.json' : '/works/A/concept.json');
    assert.equal(options.title, single ? '構想メモ: 単独作品' : '構想メモ: 作品A');
    assert.equal(options.selectedMemoId, 'memo'); assert.equal(options.preserveFocus, false); assert.equal(options.viewColumn, 1);
  }
  const absent = await open(); absent.model.workName = ''; await absent.receive(msg('openConceptMemoFromDashboard'));
  assert.equal(absent.trace[0][0], 'warning');
});

test('Dashboard: 各保存失敗は通知・再描画へ進まず、共通TODOと表示切替はエラーを表示する', async () => {
  for (const type of ['toggleDashboardTodo', 'toggleDashboardCommonTodo', 'toggleDashboardVisibility']) {
    const h = await open(), original = structuredClone(h.model); h.hooks.write = () => { throw new Error('保存失敗'); };
    await h.receive(msg(type)); await h.drain();
    assert.deepEqual(h.model, original); assert.ok(!h.trace.some(x => ['memo.notify', 'common.notify', 'build'].includes(x[0])));
    assert.equal(h.trace.some(x => x[0] === 'error'), type !== 'toggleDashboardTodo');
  }
});

test('Dashboard: 保存後の通知失敗は保存済み内容を戻さず、表示設定失敗は呼出元へ返す', async () => {
  const h = await open(); h.hooks.notify = () => { throw new Error('通知失敗'); };
  await h.receive(msg('toggleDashboardCommonTodo')); assert.equal(h.model.common[0].done, true);
  assert.ok(h.trace.some(x => x[0] === 'error')); assert.ok(!h.trace.some(x => x[0] === 'build'));
  const settings = await open(); settings.hooks.config = () => { throw new Error('設定失敗'); };
  await assert.rejects(settings.receive({ type: 'setDashboardMemoVisibility', key: 'text', enabled: true }), /設定失敗/);
  assert.deepEqual(settings.config, {});
});

test('Dashboard: 保存中のタブ終了でも保存と通知を完了し破棄済み画面を描画しない', async () => {
  const h = await open(); h.hooks.write = () => h.panels[0].dispose();
  await h.receive(msg('toggleDashboardVisibility'));
  assert.equal(h.model.data.memos[0].showInDashboard, false);
  assert.ok(h.trace.some(x => x[0] === 'memo.notify')); assert.ok(!h.trace.some(x => x[0] === 'html'));
});
