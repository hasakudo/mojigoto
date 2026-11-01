const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createTreeRenameHarness: fixture } = require('./fixtures/tree-rename-harness.cjs');
async function setup() {
  const h = await fixture(), old = h.normalize('/manuscript/章2/第一話.txt');
  for (const dir of ['/manuscript/章10', '/manuscript/章2', '/manuscript/章2/節', '/manuscript/.mojigoto', '/manuscript/.mojigoto/hidden']) h.files.set(h.normalize(dir), null);
  h.files.set(old, '原稿本文'); return { h, old, item: { fsPath: old, kind: 'manuscriptFile' } };
}
const types = h => h.trace.map(x => x[0]);

test('原稿移動: 章と子フォルダを自然順で列挙し、隠しフォルダとファイルを候補にしない', async () => {
  const { h, item } = await setup(); h.model.pickPath = undefined; await h.move(item);
  const pick = h.trace.find(x => x[0] === 'pick');
  assert.deepEqual(Array.from(pick[1], x => x.description), ['/manuscript', '章2', path.join('章2', '節'), '章10']);
  assert.equal(pick[2].matchOnDescription, true); assert.equal(pick[2].ignoreFocusOut, true);
  assert.ok(!h.trace.some(x => x[0] === 'fs.readdir' && String(x[1]).includes('.mojigoto')));
});

test('原稿移動: 本文を維持し、関連更新・旧タブ終了・ツリー更新・再表示を順に行う', async () => {
  const { h, old, item } = await setup(); const target = h.normalize('/manuscript/第一話.txt');
  h.model.tabs = [{ input: new h.TextInput(old) }, { input: new h.TextInput('/other.txt') }];
  await h.move(item); assert.equal(h.files.get(target), '原稿本文'); assert.equal(h.files.has(old), false);
  const start = types(h).indexOf('fs.rename');
  assert.deepEqual(types(h).slice(start), ['fs.rename', 'backup', 'displayNames', 'memo.file', 'tabs.close', 'refresh', 'command', 'reveal', 'info']);
  assert.deepEqual(Array.from(h.trace.find(x => x[0] === 'tabs.close')[1]), [0]);
  assert.equal(h.normalize(h.trace.find(x => x[0] === 'memo.file')[3]), target);
});

test('原稿移動: 選択した子フォルダへ移動し、ファイル名と拡張子を変えない', async () => {
  const { h, old, item } = await setup(); h.model.pickPath = h.normalize('/manuscript/章2/節');
  await h.move(item); assert.equal(h.files.get(path.join(h.model.pickPath, path.basename(old))), '原稿本文');
});

test('原稿移動: 対象なし・ルート不明・取消・同じ場所・同名では移動しない', async () => {
  for (const mode of ['missing', 'root', 'cancel', 'same', 'duplicate']) {
    const { h, old, item } = await setup();
    if (mode === 'root') h.model.manuscriptRoot = '';
    if (mode === 'cancel') h.model.pickPath = undefined;
    if (mode === 'same') h.model.pickPath = path.dirname(old);
    if (mode === 'duplicate') h.files.set(h.normalize('/manuscript/第一話.txt'), '既存本文');
    await h.move(mode === 'missing' ? undefined : item);
    assert.equal(h.files.get(old), '原稿本文'); assert.ok(!types(h).includes('fs.rename'));
    if (mode === 'duplicate') assert.equal(h.files.get(h.normalize('/manuscript/第一話.txt')), '既存本文');
  }
});

test('原稿移動: 推定ルートへのフォールバックと読めない章の除外を維持する', async () => {
  const { h, item } = await setup(); h.model.manuscriptRoot = ''; h.model.fallbackRoot = '/manuscript';
  h.model.pickPath = undefined; h.hooks.readdir = dir => { if (h.normalize(dir) === h.normalize('/manuscript/章2')) throw new Error('読込不可'); };
  await h.move(item); const candidates = h.trace.find(x => x[0] === 'pick')[1];
  assert.deepEqual(Array.from(candidates, x => x.description), ['/manuscript', '章2', '章10']);
});

test('原稿移動: 実名変更と関連更新の失敗を従来どおり扱う', async () => {
  for (const stage of ['pick', 'rename', 'backup', 'displayNames', 'memo.file', 'close', 'refresh']) {
    const { h, old, item } = await setup(); h.model.tabs = [{ input: new h.TextInput(old) }];
    h.hooks[stage] = () => { throw new Error('境界失敗'); }; await h.move(item);
    assert.equal(h.trace.at(-1)[0], stage === 'backup' || stage === 'displayNames' ? 'info' : 'error');
    assert.equal(h.files.has(old), stage === 'pick' || stage === 'rename');
  }
});

test('原稿移動: 再表示の失敗は既存の再試行を行い、移動済みの原稿を戻さない', async () => {
  const { h, old, item } = await setup(); h.hooks.reveal = () => { throw new Error('再表示失敗'); };
  await h.move(item); assert.equal(h.files.has(old), false);
  assert.equal(h.trace.filter(x => x[0] === 'reveal').length, 6); assert.equal(h.trace.at(-1)[0], 'info');
});

test('実ファイル: 章から原稿ルートへ移動して本文を読み戻せ、同名原稿を上書きしない', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-tree-move-'));
  try {
    const chapter = path.join(root, '章'); await fs.mkdir(chapter); const old = path.join(chapter, '第一話.txt');
    await fs.writeFile(old, '保存済み本文'); const h = await fixture({ fileSystem: fs }); h.model.manuscriptRoot = root;
    await h.move({ fsPath: old }); assert.equal(await fs.readFile(path.join(root, '第一話.txt'), 'utf8'), '保存済み本文');
    await fs.writeFile(old, '別の本文'); await h.move({ fsPath: old });
    assert.equal(await fs.readFile(old, 'utf8'), '別の本文'); assert.equal(await fs.readFile(path.join(root, '第一話.txt'), 'utf8'), '保存済み本文');
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('mojigoto-tree-move-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
