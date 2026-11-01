const test = require('node:test');
const assert = require('node:assert/strict');
const { createTreeMetadataHarness: fixture } = require('./fixtures/tree-metadata-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('作品ツリー: 状態絞り込みの既選択と未設定を示し、複数選択を保存する', async () => {
  const h = await fixture(); h.model.statusFilters = ['__empty__', 'draft'];
  h.select([{ value: 'planning' }, { value: 'complete' }]); await h.run('filterWorksByStatus');
  const [_, items, options] = h.trace.find(x => x[0] === 'pick');
  assert.equal(items.length, 7); assert.equal(items[0].value, '__empty__'); assert.equal(items[0].picked, true);
  assert.equal(items.find(x => x.value === 'draft').picked, true); assert.equal(options.canPickMany, true);
  assert.deepEqual(h.model.statusFilters, ['planning', 'complete']);
});

test('作品ツリー: ジャンル絞り込みの候補と未設定・既選択を維持する', async () => {
  const h = await fixture(); h.model.genreFilters = ['__empty__', '恋愛'];
  h.select([{ value: '幻想' }]); await h.run('filterWorksByGenre');
  const items = h.trace.find(x => x[0] === 'pick')[1];
  assert.deepEqual(plain(items.map(x => [x.label, x.value, x.picked])), [['未設定', '__empty__', true], ['幻想', '幻想', false], ['恋愛', '恋愛', true]]);
  assert.deepEqual(h.model.genreFilters, ['幻想']);
});

test('作品ツリー: 絞り込みの取消は維持し、空選択で全件表示へ戻す', async () => {
  for (const [action, key] of [['filterWorksByStatus', 'statusFilters'], ['filterWorksByGenre', 'genreFilters']]) {
    const h = await fixture(), original = [...h.model[key]];
    h.select(undefined); await h.run(action); assert.deepEqual(h.model[key], original);
    h.select([]); await h.run(action); assert.deepEqual(h.model[key], []);
    assert.equal(h.trace.filter(x => x[0] === 'write').length, 0);
  }
});

test('作品ツリー: ジャンル候補なし・未設定なし・取得機能なしでも開ける', async () => {
  for (const mode of ['empty', 'noEmpty', 'missing']) {
    const h = await fixture();
    if (mode === 'empty') h.model.genres = { genres: [], hasEmpty: false };
    if (mode === 'noEmpty') h.model.genres.hasEmpty = false;
    if (mode === 'missing') delete h.provider.getAvailableWorkGenres;
    await h.run('filterWorksByGenre');
    const items = h.trace.find(x => x[0] === 'pick')[1];
    assert.equal(items.length, mode === 'noEmpty' ? 2 : 0);
  }
});

test('作品ツリー: 状態変更は読込元と保存先を使い分け、他設定を保持して保存後に更新・通知する', async () => {
  const h = await fixture(), item = { workName: '作品フォルダ' }; await h.run('changeWorkStatus', item);
  assert.equal(h.model.settings.status, 'complete'); assert.deepEqual(h.model.settings.custom, { keep: true });
  assert.deepEqual(h.trace.map(x => x[0]), ['resolve', 'read', 'pick', 'write', 'refresh', 'info']);
  assert.equal(h.trace[1][1], '/original/work.json'); assert.equal(h.trace[3][1], '/target/work.json');
  const pick = h.trace[2]; assert.match(pick[2].title, /作品フォルダ/);
  assert.match(pick[1].find(x => x.value === 'draft').label, /✓/);
});

test('作品ツリー: 状態の取消・解除と作品名がない場合の表示を維持する', async () => {
  const h = await fixture(); h.select(undefined); await h.run('changeWorkStatus');
  assert.equal(h.model.settings.status, 'draft'); assert.ok(!h.trace.some(x => x[0] === 'write'));
  assert.match(h.trace.find(x => x[0] === 'pick')[2].title, /現在の作品/);
  h.trace.length = 0; h.select({ value: '' }); await h.run('changeWorkStatus', { label: '作品ラベル' });
  assert.equal(h.model.settings.status, ''); assert.match(h.trace.at(-1)[1], /未設定/);
});

test('作品ツリー: 絞り込みの取得・選択・保存失敗はエラーを表示して既存値を維持する', async () => {
  for (const action of ['filterWorksByStatus', 'filterWorksByGenre']) for (const stage of ['get', 'pick', 'set']) {
    const h = await fixture(); h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await h.run(action); assert.match(h.trace.at(-1)[1], /絞り込みに失敗.*境界失敗/);
    assert.deepEqual(h.model.statusFilters, ['draft']); assert.deepEqual(h.model.genreFilters, ['幻想']);
  }
});

test('作品ツリー: 状態変更の失敗を通知し、保存失敗は再描画せず、再描画失敗では保存済み内容を戻さない', async () => {
  for (const stage of ['resolve', 'read', 'pick', 'write', 'refresh']) {
    const h = await fixture(); h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await h.run('changeWorkStatus'); assert.match(h.trace.at(-1)[1], /状態変更に失敗.*境界失敗/);
    assert.equal(h.model.settings.status, stage === 'refresh' ? 'complete' : 'draft');
    assert.ok(!h.trace.some(x => x[0] === 'info'));
  }
});

test('作品ツリー: コマンドをコンテキストへ登録し破棄で解除できる', async () => {
  const h = await fixture();
  for (const name of ['filterWorksByStatus', 'filterWorksByGenre', 'changeWorkStatus']) assert.ok(h.commands.has('mojigoto.' + name));
  for (const subscription of h.context.subscriptions) subscription.dispose();
  assert.equal(h.commands.size, 0);
});
