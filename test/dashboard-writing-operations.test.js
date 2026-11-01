const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardWritingHarness: fixture } = require('./fixtures/dashboard-writing-harness.cjs');
const types = ['setWritingMemoStatus', 'archiveDoneWritingMemos', 'clearArchivedWritingMemos', 'restoreWritingMemo', 'deleteWritingMemo', 'updateWritingMemo'];
const writes = h => h.trace.filter(row => row[0] === 'write');
const msg = type => ({ type, memoId: 'm', status: 'hold', body: '  更新本文  ' });
async function setup(options) {
  const h = fixture(options); await h.controller.open();
  h.stores.set(h.sourcePath, { version: 7, custom: 'root', memos: [
    { ...h.sourceMemo, status: 'active', isArchived: false },
    { id: 'hold', status: 'hold', isArchived: false },
    { id: 'done', status: 'done', isArchived: false },
    { id: 'archivedDone', status: 'done', isArchived: true },
    { id: 'archivedActive', status: 'active', isArchived: true },
  ] });
  return h;
}
function confirm(h, type) { h.confirm(type === 'archiveDoneWritingMemos' ? 'アーカイブする' : '削除する'); }
function saved(h, id = 'm') { return h.stores.get(h.sourcePath).memos.find(memo => memo.id === id); }
function assertSavedOrder(h) {
  const order = h.trace.map(row => row[0]);
  assert.equal(writes(h).length, 1); assert.equal(h.stores.get(h.sourcePath).custom, 'root');
  assert.ok(order.indexOf('write') < order.lastIndexOf('render'));
  assert.ok(order.lastIndexOf('render') < order.indexOf('decorations'));
}

test('本文更新は前後の空白だけを除き、未知の項目を保持して保存後に編集状態を解除する', async () => {
  for (const single of [true, false]) {
    const h = await setup({ single });
    await h.receive({ type: 'startEditingWritingMemo', memoId: 'm' });
    assert.equal(h.states.at(-1).editingWritingMemoId, 'm');
    await h.receive(msg('updateWritingMemo'));
    assert.equal(saved(h).body, '更新本文'); assert.deepEqual(saved(h).custom, { keep: true });
    assert.equal(saved(h).excerpt, h.sourceMemo.excerpt); assert.equal(saved(h).updatedAt, '2026-10-22T07:00:00.000Z');
    assert.equal(h.states.at(-1).editingWritingMemoId, '');
    assert.deepEqual(h.posts.at(-1), { type: 'updateWritingMemo.result', ok: true, memoId: 'm' });
    assert.equal(h.trace.at(-2)[0], 'decorations'); assert.equal(h.trace.at(-1)[0], 'post'); assertSavedOrder(h);
  }
});

test('空本文・見つからないIDは更新せず、失敗理由を返して編集状態を維持する', async () => {
  for (const overrides of [{ body: ' \n ' }, { memoId: 'missing' }]) {
    const h = await setup(); await h.receive({ type: 'startEditingWritingMemo', memoId: 'm' });
    await h.receive({ ...msg('updateWritingMemo'), ...overrides });
    assert.equal(writes(h).length, 0); assert.equal(h.states.at(-1).editingWritingMemoId, 'm');
    assert.equal(h.posts.at(-1).ok, false); assert.ok(h.posts.at(-1).error);
  }
});

test('状態変更はactive/hold/doneで保管を解除し、archiveは既存状態のまま保管する', async () => {
  for (const status of ['active', 'hold', 'done', 'archive']) {
    const h = await setup(); saved(h).isArchived = true;
    await h.receive({ ...msg('setWritingMemoStatus'), status });
    assert.equal(saved(h).status, status === 'archive' ? 'active' : status);
    assert.equal(saved(h).isArchived, status === 'archive');
    assert.deepEqual(saved(h).custom, { keep: true }); assertSavedOrder(h);
  }
});

test('不正状態・対象ID不在の状態変更や復元では保存しない', async () => {
  for (const message of [{ ...msg('setWritingMemoStatus'), status: 'unknown' }, { ...msg('setWritingMemoStatus'), memoId: 'missing' }, { ...msg('restoreWritingMemo'), memoId: 'missing' }]) {
    const h = await setup(); await h.receive(message);
    assert.equal(writes(h).length, 0); assert.equal(h.states.length, 1); assert.equal(h.posts.length, 0);
  }
});

test('完了メモの一括保管は未保管のdoneだけを変更し、確認取消では読み書きしない', async () => {
  const h = await setup(); confirm(h, 'archiveDoneWritingMemos');
  await h.receive(msg('archiveDoneWritingMemos'));
  assert.equal(saved(h, 'done').isArchived, true); assert.equal(saved(h, 'hold').isArchived, false);
  assert.equal(saved(h, 'archivedDone').updatedAt, undefined); assert.equal(saved(h).isArchived, false);
  assertSavedOrder(h); assert.match(h.notices.at(-1)[1], /アーカイブしました/);
  const cancelled = await setup(); cancelled.confirm(undefined);
  await cancelled.receive(msg('archiveDoneWritingMemos'));
  assert.equal(cancelled.trace.some(row => row[0] === 'read'), false);
});

test('復元は保管フラグだけを解除し、一括削除は保管中のメモだけを除く', async () => {
  const h = await setup(); await h.receive({ ...msg('restoreWritingMemo'), memoId: 'archivedDone' });
  assert.equal(saved(h, 'archivedDone').isArchived, false); assert.equal(saved(h, 'archivedDone').status, 'done'); assertSavedOrder(h);
  const clear = await setup(); confirm(clear, 'clearArchivedWritingMemos');
  await clear.receive(msg('clearArchivedWritingMemos'));
  assert.deepEqual(clear.stores.get(clear.sourcePath).memos.map(memo => memo.id), ['m', 'hold', 'done']); assertSavedOrder(clear);
});

test('単体削除は確認後に対象だけを除き、削除取消では保存しない', async () => {
  const h = await setup(); confirm(h, 'deleteWritingMemo'); await h.receive(msg('deleteWritingMemo'));
  assert.equal(saved(h), undefined); assert.equal(h.stores.get(h.sourcePath).memos.length, 4); assertSavedOrder(h);
  for (const type of ['deleteWritingMemo', 'clearArchivedWritingMemos']) {
    const cancel = await setup(); cancel.confirm(undefined); await cancel.receive(msg(type));
    assert.equal(writes(cancel).length, 0); assert.equal(cancel.states.length, 1);
  }
});

test('一括操作で対象がない場合は通知だけにとどめ、書込み・装飾更新はしない', async () => {
  for (const type of ['archiveDoneWritingMemos', 'clearArchivedWritingMemos']) {
    const h = await setup(); h.stores.set(h.sourcePath, { memos: [] }); confirm(h, type); await h.receive(msg(type));
    assert.equal(writes(h).length, 0); assert.equal(h.trace.some(row => row[0] === 'decorations'), false);
    assert.match(h.notices.at(-1)[1], /ありませんでした/);
  }
});

test('各操作の読込・保存失敗では元の内容を保ち、更新失敗でも編集状態を消さない', async () => {
  for (const type of types) for (const stage of ['read', 'write']) {
    const h = await setup(); confirm(h, type);
    await h.receive({ type: 'startEditingWritingMemo', memoId: 'm' });
    const before = JSON.stringify(h.stores.get(h.sourcePath));
    h.hooks[stage] = () => { throw new Error('保存境界失敗'); };
    await h.receive(msg(type));
    assert.equal(JSON.stringify(h.stores.get(h.sourcePath)), before);
    assert.equal(h.states.at(-1).editingWritingMemoId, 'm');
    assert.equal(h.trace.some(row => row[0] === 'decorations'), false);
    assert.equal(h.notices.at(-1)[0], 'error');
    if (type === 'updateWritingMemo') { assert.equal(h.posts.at(-1).ok, false); assert.equal(h.posts.at(-1).error, '保存境界失敗'); }
  }
});

test('明示の保存先を持つ本文・状態変更はその保存先を使い、他の操作は現在作品を使う', async () => {
  for (const type of ['updateWritingMemo', 'setWritingMemoStatus']) {
    const h = await setup(), other = h.memoPath(h.workB);
    h.stores.set(other, JSON.parse(JSON.stringify(h.stores.get(h.sourcePath))));
    await h.receive({ ...msg(type), writingMemoFilePath: other });
    assert.equal(writes(h)[0][1], other); assert.equal(saved(h).body, 'メモ'); assert.equal(saved(h).status, 'active');
  }
});

test('確認中に現在作品が変わっても、確認前に解決した保存先への操作を維持する', async () => {
  const h = await setup(); confirm(h, 'deleteWritingMemo');
  const other = h.memoPath(h.workB); h.stores.set(other, { memos: [{ id: 'm', body: '他作品' }] });
  h.hooks.warning = () => h.switchWork('B');
  await h.receive(msg('deleteWritingMemo'));
  assert.equal(writes(h)[0][1], h.sourcePath); assert.equal(h.stores.get(other).memos[0].body, '他作品');
});

test('作品未選択の操作は保存せず、保存待ち中は成功応答や編集解除を先に行わない', async () => {
  for (const type of types) {
    const h = await setup(); h.switchWork(''); await h.receive(msg(type)); assert.equal(writes(h).length, 0);
  }
  const h = await setup(); await h.receive({ type: 'startEditingWritingMemo', memoId: 'm' });
  let complete, started; const waiting = new Promise(resolve => { started = resolve; });
  h.hooks.write = () => new Promise(resolve => { complete = resolve; started(); });
  const action = h.receive(msg('updateWritingMemo'));
  await waiting;
  assert.equal(h.posts.length, 0); assert.equal(h.states.at(-1).editingWritingMemoId, 'm');
  complete(); await action;
  assert.equal(h.states.at(-1).editingWritingMemoId, ''); assert.equal(h.posts.at(-1).ok, true);
});
