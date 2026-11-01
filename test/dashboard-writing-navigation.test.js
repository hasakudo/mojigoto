const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createDashboardWritingHarness: fixture } = require('./fixtures/dashboard-writing-harness.cjs');
const writes = h => h.trace.filter(entry => entry[0] === 'write');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('執筆メモのジャンプは保存位置に近い抜粋へ移動し、作品への戻り先を保持する', async () => {
  const h = fixture(); await h.controller.open();
  await h.receive({ type: 'openWritingMemoWork', workId: 'A', workTitle: '作品A' });
  await h.receive(h.jump());
  const selection = h.trace.find(entry => entry[0] === 'selection')[1];
  assert.deepEqual(selection, { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } });
  assert.equal(h.states.at(-1).writingMemoTargetFsPath, h.targetPath);
  assert.equal(h.states.at(-1).writingMemoScope, 'file');
  assert.equal(h.states.at(-1).lastOpenedWritingMemoWorkId, 'A');
  assert.equal(h.states.at(-1).selectedWritingMemoWorkId, '');
  assert.deepEqual(h.posts.at(-1), { type: 'openWritingMemoTab', memoId: 'm' });
  assert.equal(writes(h).length, 0);
  assert.equal(h.trace.at(-2)[0], 'render'); assert.equal(h.trace.at(-1)[0], 'post');
});

test('抜粋なしでは保存済み範囲を使い、明示された戻り先を優先する', async () => {
  const h = fixture(); await h.controller.open();
  await h.receive(h.jump({ excerpt: '見つからない', startLine: 0, startCharacter: 1, endLine: 0, endCharacter: 2, returnWorkId: 'B', returnWorkTitle: '作品B' }));
  assert.deepEqual(h.trace.find(entry => entry[0] === 'selection')[1], { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } });
  assert.equal(h.states.at(-1).lastOpenedWritingMemoWorkId, 'B');
});

test('ジャンプ先がない・原稿が開けない場合は通知し、画面状態やメモを変更しない', async () => {
  for (const missing of [true, false]) {
    const h = fixture(); await h.controller.open();
    if (missing) h.hooks.resolve = () => ''; else h.documents.clear();
    await h.receive(h.jump());
    assert.equal(h.notices.at(-1)[0], missing ? 'warning' : 'error');
    assert.equal(h.states.length, 1); assert.equal(h.posts.length, 0); assert.equal(writes(h).length, 0);
  }
});

test('SingleとMultiのView側への再関連付けは同じ保存先を更新し、未知項目と他メモを残す', async () => {
  for (const single of [true, false]) {
    const h = fixture({ single }); await h.controller.open();
    await h.receive(h.message());
    assert.equal(writes(h).length, 1); assert.equal(writes(h)[0][1], h.sourcePath);
    const data = h.stores.get(h.sourcePath), memo = data.memos[0];
    assert.equal(data.custom, 'source'); assert.equal(data.memos[1].id, 'keep');
    assert.deepEqual(memo.custom, { keep: true }); assert.equal(memo.filePath, 'new.txt');
    assert.equal(memo.targetLocation, single ? '' : 'view');
    assert.equal(memo.updatedAt, '2026-10-22T07:00:00.000Z');
    assert.equal(memo.startLine, 2);
    assert.equal(h.states.at(-1).writingMemoTargetFsPath, h.targetPath);
    const order = h.trace.map(entry => entry[0]);
    assert.ok(order.indexOf('write') < order.lastIndexOf('render'));
    assert.ok(order.lastIndexOf('render') < order.indexOf('decorations'));
    assert.equal(h.trace.at(-1)[0], 'info');
  }
});

test('他作品への修復は移動先を先に保存し、同じIDを置換してから移動元を更新する', async () => {
  const h = fixture(); await h.controller.open();
  const target = path.join(h.workB, 'manuscript', 'chapter', 'new.md'), destination = h.memoPath(h.workB);
  h.select([target]); h.documents.set(target, '同じ文');
  h.stores.set(destination, { custom: 'target', memos: [{ id: 'm', body: '古い重複' }, { id: 'other' }] });
  await h.receive(h.message());
  assert.deepEqual(writes(h).map(entry => entry[1]), [destination, h.sourcePath]);
  assert.deepEqual(h.stores.get(h.sourcePath).memos.map(memo => memo.id), ['keep']);
  const data = h.stores.get(destination);
  assert.equal(data.custom, 'target'); assert.deepEqual(data.memos.map(memo => memo.id), ['m', 'other']);
  assert.equal(data.memos[0].filePath, 'chapter/new.md'); assert.equal(data.memos[0].targetLocation, 'work');
});

test('修復の保存途中で失敗しても移動元を消さず、成功通知や装飾更新を出さない', async () => {
  for (const failAt of ['target', 'source']) {
    const h = fixture(); await h.controller.open();
    const target = path.join(h.workB, 'manuscript', 'new.md'), destination = h.memoPath(h.workB);
    h.select([target]); h.documents.set(target, '同じ文');
    h.hooks.write = file => { if (file === (failAt === 'target' ? destination : h.sourcePath)) throw new Error('保存失敗'); };
    await h.receive(h.message());
    assert.ok(h.stores.get(h.sourcePath).memos.some(memo => memo.id === 'm'));
    assert.equal(h.stores.has(destination), failAt === 'source');
    assert.equal(h.states.length, 1);
    assert.equal(h.trace.some(entry => entry[0] === 'decorations'), false);
    assert.equal(h.notices.at(-1)[0], 'error');
  }
});

test('修復の選択取消・確認取消・対象外・メモ不在では保存しない', async () => {
  for (const mode of ['chooseCancel', 'confirmCancel', 'outside', 'missingId', 'missingMemo']) {
    const h = fixture(); await h.controller.open();
    if (mode === 'chooseCancel') h.select(undefined);
    if (mode === 'confirmCancel') h.confirm(undefined);
    if (mode === 'outside') h.select([path.resolve('outside.txt')]);
    await h.receive(h.message(mode === 'missingId' ? { memoId: '' } : mode === 'missingMemo' ? { memoId: 'missing' } : {}));
    assert.equal(writes(h).length, 0); assert.equal(h.states.length, 1);
    assert.equal(h.trace.some(entry => entry[0] === 'decorations'), false);
  }
});

test('修復時に抜粋が見つからない・原稿を読めない場合は以前の位置を残す', async () => {
  for (const missingDoc of [true, false]) {
    const h = fixture(); await h.controller.open();
    if (missingDoc) h.documents.clear(); else h.documents.set(h.targetPath, '違う本文');
    await h.receive(h.message());
    const memo = h.stores.get(h.sourcePath).memos[0];
    assert.equal(memo.startLine, h.sourceMemo.startLine); assert.equal(memo.endLine, h.sourceMemo.endLine);
    assert.match(h.notices.at(-1)[1], /以前の情報を保持/);
  }
});

test('ジャンプ処理中に作品一覧の選択が変わった場合、最新の戻り先状態を使う', async () => {
  const h = fixture(); await h.controller.open();
  const pending = deferred(); h.hooks.show = () => pending.promise;
  const jumping = h.receive(h.jump());
  await h.receive({ type: 'openWritingMemoWork', workId: 'B', workTitle: '作品B' });
  pending.resolve(); await jumping;
  assert.equal(h.states.at(-1).lastOpenedWritingMemoWorkId, 'B');
  assert.equal(h.states.at(-1).lastOpenedWritingMemoWorkTitle, '作品B');
  assert.equal(h.states.at(-1).writingMemoScope, 'file');
});

test('修復ダイアログの後の対象解決でも現在の作品を参照する', async () => {
  const h = fixture(); await h.controller.open();
  h.hooks.choose = () => h.switchWork('B');
  await h.receive(h.message());
  assert.deepEqual(writes(h).map(entry => entry[1]), [h.memoPath(h.workB), h.sourcePath]);
  assert.equal(h.stores.get(h.memoPath(h.workB)).memos[0].targetLocation, 'view');
});
