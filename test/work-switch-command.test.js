const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkSwitchCommandHarness: fixture } = require('./fixtures/work-switch-command-harness.cjs');
const { createWorkCandidatesHarness } = require('./fixtures/work-candidates-harness.cjs');

test('作品切替後: 参照変更後に作品名・タブ・集計差分・共有記録・サーバー・各画面を順に更新する', async () => {
  const h = fixture(); assert.equal(await h.run(), true);
  assert.deepEqual(h.trace.map(x => x[0] === 'command' ? x[1] : x[0]), ['switch.start', 'reference.changed', 'statusbar', 'ensure', 'close', 'reset', 'import', 'info',
    'mojigoto.serverRestart', 'mojigoto.syncPreviewToActiveEditor', 'recalc', 'stats', 'mojigoto.refreshWorkTree', 'workbench.view.extension.mojigoto']);
  assert.equal(h.itemWork.text, '$(bookmark) 次の作品');
  assert.deepEqual(h.trace.find(x => x[0] === 'ensure'), ['ensure', 'context', 'switchWork']);
});

test('作品切替後: 取消や切替失敗では後処理を実行しない', async () => {
  const h = fixture(); h.model.switchResult = false; assert.equal(await h.run(), false);
  assert.deepEqual(h.trace.map(x => x[0]), ['switch.start']); assert.equal(h.itemWork.text, '元の作品');
  h.hooks.switch = () => { throw new Error('切替失敗'); }; await assert.rejects(h.run(), /切替失敗/);
  assert.ok(!h.trace.some(x => x[0] === 'ensure'));
});

test('作品切替後: 再起動OFFはpingへ、プレビューOFFは同期せず、状態オブジェクトは処理時に参照する', async () => {
  const h = fixture({ options: { restartServer: false } }); h.previewState.enabled = false;
  await h.run(); assert.ok(h.trace.some(x => x[1] === 'mojigoto.ping')); assert.ok(!h.trace.some(x => x[1] === 'mojigoto.syncPreviewToActiveEditor'));
  const live = fixture(); live.previewState.enabled = false; live.hooks.ensure = () => { live.previewState.enabled = true; };
  await live.run(); assert.ok(live.trace.some(x => x[1] === 'mojigoto.syncPreviewToActiveEditor'));
});

test('作品切替後: ステータス項目・プレビュー・再集計がなくても更新できる', async () => {
  const h = fixture({ options: { itemWork: null, previewState: null, scheduleRecalc: null } });
  assert.equal(await h.run(), true); assert.ok(!h.trace.some(x => x[0] === 'statusbar' || x[0] === 'recalc'));
  assert.ok(h.trace.some(x => x[0] === 'stats'));
});

test('作品切替後: 名前補完・タブ終了・差分リセット・共有記録の失敗は後続を実行しない', async () => {
  const stages = ['ensure', 'close', 'reset', 'import'];
  for (const stage of stages) {
    const h = fixture(); h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await assert.rejects(h.run(), /境界失敗/); assert.ok(!h.trace.some(x => x[0] === 'stats'));
    for (const later of stages.slice(stages.indexOf(stage) + 1)) assert.ok(!h.trace.some(x => x[0] === later));
  }
});

test('作品切替後: サーバーとツリー更新の失敗は伝播し、プレビュー同期とサイドバー表示の失敗は継続する', async () => {
  for (const command of ['mojigoto.serverRestart', 'mojigoto.refreshWorkTree', 'mojigoto.syncPreviewToActiveEditor', 'workbench.view.extension.mojigoto']) {
    const h = fixture(); h.hooks.command = name => { if (name === command) throw new Error('コマンド失敗'); };
    if (command === 'mojigoto.serverRestart' || command === 'mojigoto.refreshWorkTree') await assert.rejects(h.run(), /コマンド失敗/);
    else assert.equal(await h.run(), true);
  }
});

test('作品切替後: 実サービスの候補選択・参照変更・現在作品更新の後に後処理へ進む', async () => {
  const service = createWorkCandidatesHarness(); const h = fixture({ switchService: service.service });
  service.hooks.switch = () => h.trace.push(['actual.reference.changed']);
  assert.equal(await h.run(), true);
  assert.ok(h.trace.findIndex(x => x[0] === 'ensure') > h.trace.findIndex(x => x[0] === 'actual.reference.changed'));
  assert.ok(service.trace.some(x => x[0] === 'currentWork')); assert.equal(h.itemWork.text, '$(bookmark) 作品2');
});

test('作品切替後: コマンド登録をコンテキストで管理し解除できる', () => {
  const h = fixture(); assert.deepEqual([...h.commands.keys()], ['mojigoto.switchWorkAndRestart', 'mojigoto.setWorkGoal', 'mojigoto.setWorkDeadline']);
  for (const registration of h.context.subscriptions) registration.dispose(); assert.equal(h.commands.size, 0);
});
