const test = require('node:test');
const assert = require('node:assert/strict');
const { createTreeRenameHarness: fixture } = require('./fixtures/tree-rename-harness.cjs');
const types = h => h.trace.map(x => x[0]);
const item = h => ({ fsPath: h.normalize('/works/Old'), workName: 'Old' });

test('作品削除: 確認・通常タブ終了・OS移動・関連画面終了・更新の順序と成功値を維持する', async () => {
  const h = await fixture({ platform: 'win32' }), work = item(h);
  h.model.tabs = [{ input: new h.TextInput(work.fsPath + '/a.txt') }, { input: new h.TextInput('/other/a.txt') }];
  assert.equal(await h.call('deleteWork', work), true);
  assert.deepEqual(types(h), ['warning', 'tabs.close', 'spawn', 'child.exit', 'note.close', 'concept.close', 'settings.close', 'refresh', 'info']);
  assert.equal(h.trace[0][2].modal, true); assert.equal(h.trace[0][3], 'OSのごみ箱へ移動');
  assert.deepEqual(Array.from(h.trace[1][1]), [0]);
  for (const name of ['note.close', 'concept.close', 'settings.close']) assert.equal(h.trace.find(x => x[0] === name)[1], work.fsPath);
});

test('作品削除: Single・対象なし・View連携中・取消ではOS操作とタブ終了をしない', async () => {
  for (const mode of ['single', 'missing', 'current', 'cancel', 'otherAnswer']) {
    const h = await fixture(), work = item(h);
    if (mode === 'single') h.model.single = true;
    if (mode === 'current') h.model.currentWork = 'Old';
    if (mode === 'cancel') h.model.answer = undefined;
    if (mode === 'otherAnswer') h.model.answer = '別の選択';
    assert.equal(await h.call('deleteWork', mode === 'missing' ? undefined : work), false);
    assert.deepEqual(types(h), ['warning']);
  }
});

test('作品削除: 項目の作品名がないときはフォルダ名を表示し、現在作品の判定にも使う', async () => {
  const h = await fixture({ platform: 'win32' });
  assert.equal(await h.call('deleteWork', { fsPath: h.normalize('/works/Old') }), true);
  assert.match(h.trace[0][1], /作品「Old」/);
  const current = await fixture(); current.model.currentWork = 'Old';
  assert.equal(await current.call('deleteWork', { fsPath: current.normalize('/works/Old') }), false);
  assert.ok(!types(current).includes('spawn'));
});

test('作品削除: PowerShellの引数とごみ箱指定・単一引用符のエスケープを維持する', async () => {
  const h = await fixture({ platform: 'win32' }), work = { fsPath: h.normalize("/works/作者's作品"), workName: '作品' };
  await h.call('deleteWork', work); const spawn = h.trace.find(x => x[0] === 'spawn');
  assert.equal(spawn[1], 'powershell.exe');
  assert.deepEqual(Array.from(spawn[2].slice(0, 3)), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.ok(spawn[2][3].includes(work.fsPath.replace(/'/g, "''")));
  assert.match(spawn[2][3], /SendToRecycleBin/); assert.equal(spawn[3].stdio, 'ignore');
});

test('作品削除: OS処理が終わるまでは関連画面を閉じず、ツリーも更新しない', async () => {
  const h = await fixture({ platform: 'win32' }); h.model.processOutcome = 'pending';
  const operation = h.call('deleteWork', item(h)); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(types(h), ['warning', 'spawn']);
  h.hooks.child.get('exit')(0); assert.equal(await operation, true);
  assert.deepEqual(types(h).slice(2), ['note.close', 'concept.close', 'settings.close', 'refresh', 'info']);
});

test('作品削除: OS起動失敗・異常終了は成功にせず関連画面終了へ進まない', async () => {
  for (const outcome of ['error', 'exit', 'throw']) {
    const h = await fixture({ platform: 'win32' }); h.model.processOutcome = outcome;
    if (outcome === 'throw') h.hooks.spawn = () => { throw new Error('起動失敗'); };
    assert.equal(await h.call('deleteWork', item(h)), false);
    assert.equal(h.trace.at(-1)[0], 'error'); assert.ok(!types(h).includes('note.close')); assert.ok(!types(h).includes('refresh'));
  }
});

test('作品削除: 非対応OSではエラーを表示してOSプロセスを起動しない', async () => {
  const h = await fixture({ platform: 'linux' });
  assert.equal(await h.call('deleteWork', item(h)), false);
  assert.match(h.trace.at(-1)[1], /このOSの作品削除はまだ未対応/); assert.ok(!types(h).includes('spawn'));
});

test('作品削除: 確認・通常タブ終了・関連画面終了・更新の失敗は既存のエラーへ渡す', async () => {
  for (const stage of ['warning', 'close', 'note.close', 'concept.close', 'settings.close', 'refresh']) {
    const h = await fixture({ platform: 'win32' }), work = item(h);
    h.model.tabs = [{ input: new h.TextInput(work.fsPath + '/a.txt') }];
    h.hooks[stage] = () => { throw new Error('境界失敗'); };
    assert.equal(await h.call('deleteWork', work), false); assert.match(h.trace.at(-1)[1], /作品削除に失敗.*境界失敗/);
    if (stage === 'warning' || stage === 'close') assert.ok(!types(h).includes('spawn'));
    if (['note.close', 'concept.close', 'settings.close'].includes(stage)) {
      for (const name of ['note.close', 'concept.close', 'settings.close']) assert.ok(types(h).includes(name));
      assert.ok(!types(h).includes('refresh'));
    }
  }
});
