const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardWritingHarness: fixture } = require('./fixtures/dashboard-writing-harness.cjs');
const copyMessage = overrides => ({ type: 'copyWritingMemoToConceptMemo', memoId: 'm', filePath: ' chapter/one.txt ', excerpt: ' 抜粋 ', body: ' メモ本文 ', ...overrides });
const state = h => h.states.at(-1);
const operations = h => h.trace.map(entry => entry[0]);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('外部からメモタブを開くとファイル一覧へ戻し、作品への戻り先を初期化してから表示する', async () => {
  const h = fixture(); await h.controller.open();
  await h.receive({ type: 'openWritingMemoWork', workId: 'A', workTitle: '作品A' });
  await h.controller.openWritingMemoTab({ absoluteFilePath: ' ' + h.targetPath + ' ', memoId: 'm' });
  assert.equal(state(h).writingMemoScope, 'file'); assert.equal(state(h).writingMemoTargetFsPath, h.targetPath);
  assert.equal(state(h).selectedWritingMemoWorkId, ''); assert.equal(state(h).lastOpenedWritingMemoWorkId, '');
  assert.deepEqual(h.posts.at(-1), { type: 'openWritingMemoTab', memoId: 'm' });
  assert.equal(h.trace.at(-2)[0], 'render'); assert.equal(h.trace.at(-1)[0], 'post');
  await h.controller.openWritingMemoTab({ memoId: 'other' });
  assert.equal(state(h).writingMemoTargetFsPath, h.targetPath);
  assert.equal(h.trace.some(entry => ['read', 'write'].includes(entry[0])), false);
});

test('作品一覧・作品別・ファイル別と編集開始／取消は同じホスト状態へ反映する', async () => {
  const h = fixture(); await h.controller.open();
  await h.receive({ type: 'openWritingMemoWork', workId: ' A ', workTitle: ' 作品A ' });
  assert.equal(state(h).writingMemoScope, 'work'); assert.equal(state(h).lastOpenedWritingMemoWorkId, 'A');
  await h.receive({ type: 'startEditingWritingMemo', memoId: 'm' }); assert.equal(state(h).editingWritingMemoId, 'm');
  await h.receive({ type: 'showWritingMemoWorkIndex' });
  assert.equal(state(h).writingMemoScope, 'workIndex'); assert.equal(state(h).selectedWritingMemoWorkId, '');
  assert.equal(state(h).lastOpenedWritingMemoWorkId, 'A'); assert.equal(state(h).editingWritingMemoId, 'm');
  await h.receive({ type: 'cancelEditingWritingMemo' }); assert.equal(state(h).editingWritingMemoId, '');
  await h.receive({ type: 'showCurrentFileWritingMemos', returnWorkId: ' B ', returnWorkTitle: ' 作品B ' });
  assert.equal(state(h).writingMemoScope, 'file'); assert.equal(state(h).lastOpenedWritingMemoWorkId, 'B');
  await h.receive({ type: 'showCurrentFileWritingMemos' }); assert.equal(state(h).lastOpenedWritingMemoWorkId, '');
  assert.equal(h.trace.some(entry => ['read', 'write'].includes(entry[0])), false);
});

test('一覧の再取得は表示・装飾更新後に完了を通知し、失敗も結果を返す', async () => {
  const h = fixture(); await h.controller.open(); await h.receive({ type: 'refreshWritingMemos' });
  assert.deepEqual(operations(h).slice(-3), ['render', 'decorations', 'post']);
  assert.deepEqual(h.posts.at(-1), { type: 'refreshWritingMemos.result', ok: true });
  for (const stage of ['build', 'decorations']) {
    h.hooks[stage] = () => { throw new Error('一覧更新失敗'); };
    await h.receive({ type: 'refreshWritingMemos' });
    assert.equal(h.posts.at(-1).ok, false); assert.equal(h.posts.at(-1).error, '一覧更新失敗');
    delete h.hooks[stage];
  }
});

test('執筆メモの装飾切替は設定・装飾・再描画の順を維持し、編集画面の有無を扱う', async () => {
  const h = fixture(); await h.controller.open();
  for (const active of [false, true]) {
    h.activeEditor(active ? { id: 'editor' } : undefined);
    await h.receive({ type: 'toggleWritingMemoDecorations' });
    assert.equal(h.posts.at(-1).enabled, active); assert.equal(h.config.writingMemoDecorationsEnabled, active);
    assert.deepEqual(operations(h).slice(-4), ['config', 'decorations', 'render', 'post']);
    assert.deepEqual(h.trace.at(-3), active ? ['decorations', { id: 'editor' }] : ['decorations']);
  }
  for (const stage of ['config', 'decorations', 'build']) {
    const broken = fixture(); await broken.controller.open(); broken.hooks[stage] = () => { throw new Error('装飾失敗'); };
    await broken.receive({ type: 'toggleWritingMemoDecorations' });
    assert.equal(broken.posts.at(-1).ok, false); assert.equal(broken.notices.at(-1)[0], 'error');
  }
});

test('コピー先は現在作品または指定された作品とし、Singleでは現在の保存先を使う', async () => {
  for (const single of [true, false]) for (const explicit of [false, true]) {
    const h = fixture({ single }); await h.controller.open();
    await h.receive(copyMessage(explicit ? { returnWorkId: ' B ' } : {}));
    const destination = single ? h.singleConceptPath : h.conceptPath(explicit ? h.workB : h.workA);
    assert.ok(h.conceptStores.has(destination)); assert.equal(h.conceptStores.size, 1);
    assert.equal(h.trace.at(-2)[0], 'concept.notify'); assert.equal(h.trace.at(-1)[0], 'info');
  }
});

test('コピーは元のメモを保持し、フォルダ・既存内容・出典・表示設定を保って先頭に追加する', async () => {
  const h = fixture(); await h.controller.open(); const destination = h.conceptPath(h.workA);
  h.conceptStores.set(destination, { custom: 'keep', folders: [{ id: 'writing' }, { id: 'other' }], memos: [{ id: 'existing' }] });
  const original = JSON.stringify([...h.stores]); await h.receive(copyMessage());
  const data = h.conceptStores.get(destination), memo = data.memos[0];
  assert.equal(data.custom, 'keep'); assert.equal(data.memos[1].id, 'existing'); assert.equal(memo.folderId, 'writing');
  assert.equal(memo.title, '抜粋'); assert.equal(memo.body, 'メモ本文');
  const { writingMemoCopyFingerprint, ...origin } = memo.source;
  assert.deepEqual(origin, { kind: 'writingMemo', filePath: 'chapter/one.txt', excerpt: '抜粋', memoId: 'm' });
  assert.match(writingMemoCopyFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(memo.isPinned, false); assert.equal(memo.isArchived, false); assert.equal(memo.showInDashboard, false);
  assert.deepEqual(memo.tags, []); assert.match(memo.id, /^cm_/);
  assert.equal(memo.createdAt, '2026-10-22T07:00:00.000Z'); assert.equal(memo.createdAt, memo.updatedAt);
  assert.equal(JSON.stringify([...h.stores]), original); assert.equal(h.states.length, 1);
});

test('抜粋なし・writingフォルダなし・不正なメモ配列でも既定値でコピーする', async () => {
  const h = fixture(); await h.controller.open(); const destination = h.conceptPath(h.workA);
  h.conceptStores.set(destination, { custom: 'keep', folders: [], memos: null });
  await h.receive(copyMessage({ excerpt: '' }));
  const memo = h.conceptStores.get(destination).memos[0];
  assert.equal(memo.title, '執筆メモからコピー'); assert.equal(memo.folderId, '');
  assert.equal(h.conceptStores.get(destination).custom, 'keep');
});

test('保存先不明・空本文ではコピーせず、現在作品と別の明示作品を混同しない', async () => {
  for (const mode of ['unknownWork', 'noCurrentWork', 'emptyBody']) {
    const h = fixture(); await h.controller.open(); if (mode === 'noCurrentWork') h.switchWork('');
    await h.receive(copyMessage(mode === 'unknownWork' ? { returnWorkId: 'missing' } : mode === 'emptyBody' ? { body: ' \n ' } : {}));
    assert.equal(h.conceptStores.size, 0); assert.equal(h.notices.at(-1)[0], 'warning');
    assert.equal(h.trace.some(entry => entry[0] === 'concept.read'), false);
  }
});

test('コピーの読込・保存・通知失敗では成功を通知せず、保存後の通知失敗でも保存内容を保つ', async () => {
  for (const stage of ['conceptRead', 'conceptWrite', 'conceptNotify']) {
    const h = fixture(); await h.controller.open(); h.hooks[stage] = () => { throw new Error('コピー失敗'); };
    await h.receive(copyMessage());
    assert.equal(h.notices.at(-1)[0], 'error'); assert.equal(h.notices.some(entry => entry[0] === 'info'), false);
    assert.equal(h.conceptStores.size, stage === 'conceptNotify' ? 1 : 0);
  }
});

test('コピー保存中に現在作品が変わっても最初に決めた保存先を使い、完了まで通知を待つ', async () => {
  const h = fixture(); await h.controller.open();
  const pending = deferred(), started = deferred();
  h.hooks.conceptWrite = () => { started.resolve(); return pending.promise; };
  const copying = h.receive(copyMessage()); await started.promise;
  h.switchWork('B');
  assert.equal(h.trace.some(entry => entry[0] === 'concept.notify'), false); assert.equal(h.notices.length, 0);
  pending.resolve(); await copying;
  assert.ok(h.conceptStores.has(h.conceptPath(h.workA))); assert.equal(h.conceptStores.has(h.conceptPath(h.workB)), false);
  assert.deepEqual(operations(h).slice(-3), ['concept.write', 'concept.notify', 'info']);
});
