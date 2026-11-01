const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTreeRenameHarness: fixture } = require('./fixtures/tree-rename-harness.cjs');
const types = h => h.trace.map(x => x[0]);

test('ゴミ箱: 原稿・章は確認後に移動し、対象タブを閉じてツリー更新する', async () => {
  for (const action of ['deleteManuscriptFile', 'deleteChapterFolder']) {
    const h = await fixture(), file = h.normalize('/work/章');
    h.model.tabs = [{ input: new h.TextInput(action === 'deleteChapterFolder' ? path.join(file, 'a.txt') : file) }];
    await h.call(action, { fsPath: file });
    assert.deepEqual(types(h), ['warning', 'trash.move', 'tabs.close', 'refresh', 'info']);
    assert.equal(h.trace[0][2].modal, true); assert.equal(h.trace[0][3], 'ゴミ箱へ移動');
  }
});

test('ゴミ箱: ノートは旧Webviewも閉じ、成功・取消・失敗の戻り値を維持する', async () => {
  const h = await fixture(), item = { fsPath: '/note.json', title: '表示名' };
  assert.equal(await h.call('deleteNote', item), true); assert.match(h.trace[0][1], /表示名/);
  assert.deepEqual(types(h), ['warning', 'trash.move', 'command', 'refresh', 'info']);
  assert.equal(h.trace[2][1], 'mojigoto.closeNoteWebviewByPath');
  h.model.answer = undefined; assert.equal(await h.call('deleteNote', item), false);
  h.model.answer = null; h.hooks['trash.move'] = () => { throw new Error('移動失敗'); };
  assert.equal(await h.call('deleteNote', item), false); assert.equal(h.trace.at(-1)[0], 'error');
});

test('ゴミ箱: 対象なしと取消では移動・復元・削除をしない', async () => {
  for (const action of ['deleteManuscriptFile', 'deleteChapterFolder', 'deleteNote', 'restoreTrashItem', 'emptyTrash']) {
    const h = await fixture(); await h.call(action); assert.equal(h.trace[0][0], 'warning');
    h.trace.length = 0; h.model.answer = undefined; await h.call(action, { fsPath: '/trash' });
    assert.ok(!types(h).some(x => ['trash.move', 'trash.restore', 'fs.rm', 'refresh'].includes(x)));
  }
});

test('ゴミ箱: 復元は確認後に既存ストアへ渡し、更新して通知する', async () => {
  const h = await fixture(), item = { fsPath: '/trash/item', label: '第一話' };
  await h.call('restoreTrashItem', item);
  assert.deepEqual(types(h), ['warning', 'trash.restore', 'refresh', 'info']);
  assert.match(h.trace[0][1], /第一話/); assert.equal(h.trace[1][1], item);
});

test('ゴミ箱: フォルダは直接指定・Single・実作品パスの優先順で解決して開く', async () => {
  for (const mode of ['direct', 'single', 'work']) {
    const h = await fixture(); h.model.single = mode === 'single'; h.model.resolvedWork = '/real';
    const direct = path.join('/direct', '.mojigoto', 'trash');
    await h.call('openTrashFolder', { fsPath: mode === 'direct' ? direct : '/other', workDir: '/view' });
    assert.equal(h.trace[0][0], 'fs.mkdir'); assert.equal(h.trace[0][1], mode === 'direct' ? direct : mode === 'single' ? h.model.singleTrash : path.join('/real', '.mojigoto', 'trash'));
    assert.equal(types(h).includes('spawn'), true);
  }
  const h = await fixture(); await h.call('openTrashFolder'); assert.equal(h.trace.at(-1)[0], 'warning');
});

test('ゴミ箱: ファイル表示とエクスプローラー表示のコマンドを維持する', async () => {
  const h = await fixture();
  await h.call('openTrashEntry', { fsPath: '/trash/item' }); assert.equal(h.trace.at(-1)[1], 'vscode.open');
  await h.call('revealTrashEntryInExplorer', { fsPath: '/trash/dir' }); assert.equal(h.trace.at(-1)[1], 'revealInExplorer');
  for (const action of ['openTrashEntry', 'revealTrashEntryInExplorer']) { await h.call(action); assert.equal(h.trace.at(-1)[0], 'warning'); }
});

test('ゴミ箱: 空にする操作は確認後だけ項目を削除し、ゴミ箱フォルダ自体を保持する', async () => {
  const h = await fixture(), trash = h.normalize('/work/.mojigoto/trash');
  for (const [file, data] of [[trash, null], [path.join(trash, 'a.txt'), '本文'], [path.join(trash, 'folder'), null], [path.join(trash, 'folder', 'child'), '本文']]) h.files.set(file, data);
  await h.call('emptyTrash', { fsPath: trash });
  assert.deepEqual([...h.files.keys()], [trash]); assert.equal(h.trace.filter(x => x[0] === 'fs.rm').length, 2);
  assert.deepEqual(types(h).slice(0, 3), ['fs.mkdir', 'warning', 'fs.readdir']); assert.equal(h.trace.at(-1)[0], 'info');
});

test('ゴミ箱: ストア・タブ終了・通知後の更新・フォルダ表示・削除の失敗をエラー表示する', async () => {
  for (const [action, stage] of [['deleteManuscriptFile', 'trash.move'], ['deleteChapterFolder', 'close'], ['deleteNote', 'command'], ['restoreTrashItem', 'trash.restore'], ['restoreTrashItem', 'refresh'], ['openTrashFolder', 'mkdir'], ['openTrashFolder', 'spawn'], ['emptyTrash', 'rm']]) {
    const h = await fixture(), trash = h.normalize('/work/.mojigoto/trash'); h.files.set(path.join(trash, 'a'), '本文');
    h.model.tabs = [{ input: new h.TextInput(path.join(trash, 'a')) }]; h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await h.call(action, { fsPath: trash, workDir: '/work' }); assert.equal(h.trace.at(-1)[0], 'error', action + stage);
  }
});

test('実ファイル: 原稿を既存ゴミ箱ストアで移動・復元し、同名復元でも本文を両方保持する', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-tree-trash-'));
  try {
    const h = await fixture({ fileSystem: fs, realTrash: true }), original = path.join(root, '第一話.txt');
    await fs.writeFile(original, '元の本文'); await h.call('deleteManuscriptFile', { fsPath: original, workDir: root });
    const trash = path.join(root, '.mojigoto', 'trash'), entries = await fs.readdir(trash);
    const stored = entries.find(x => !x.endsWith('.mojigoto-trash.json')); assert.ok(stored);
    await fs.writeFile(original, '別の本文'); await h.call('restoreTrashItem', { fsPath: path.join(trash, stored), workDir: root });
    assert.equal(await fs.readFile(original, 'utf8'), '別の本文');
    assert.equal(await fs.readFile(path.join(root, '第一話__001.txt'), 'utf8'), '元の本文');
    assert.deepEqual(await fs.readdir(trash), []);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('mojigoto-tree-trash-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
