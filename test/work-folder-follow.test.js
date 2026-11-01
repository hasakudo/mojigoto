const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createWorkCandidatesHarness: fixture } = require('./fixtures/work-candidates-harness.cjs');
function setup() {
  const h = fixture(), work = path.join(h.root, 'New'), file = path.join(work, '.mojigoto', 'work.json');
  h.directories.add(work); h.directories.add(path.join(work, '原稿'));
  h.files.set(file, JSON.stringify({ title: '作品タイトル', folderName: 'Old', status: 'draft', genres: ['幻想'], custom: { keep: true }, targetChars: 5000 }));
  const event = { files: [{ oldUri: { fsPath: path.join(h.root, 'Old') }, newUri: { fsPath: work } }] };
  return { h, work, file, event };
}

test('作品名追従: フォルダ名を更新して状態・複数ジャンル・未知項目を保持する', async () => {
  const { h, file, event } = setup(); assert.equal(await h.rename(event), true);
  const data = JSON.parse(h.files.get(file)); assert.equal(data.folderName, 'New'); assert.equal(data.title, '作品タイトル');
  assert.equal(data.status, 'draft'); assert.deepEqual(data.genres, ['幻想']); assert.deepEqual(data.custom, { keep: true });
  assert.equal(data.targetChars, 5000); assert.equal(data.updatedAt, '2026-10-23T05:00:00.000Z');
  assert.ok(!h.trace.some(x => x[0] === 'switch')); assert.equal(h.trace.at(-1)[0], 'afterRename');
});

test('作品名追従: 現在作品では新しい原稿先と現在作品名を更新してから各画面を更新する', async () => {
  const { h, work, event } = setup(); h.values.set('mojigoto.currentWorkName', 'Old');
  assert.equal(await h.rename(event), true);
  assert.equal(h.trace.find(x => x[0] === 'switch')[2], path.join(work, '原稿'));
  assert.equal(h.values.get('mojigoto.currentWorkName'), 'New');
  const updates = h.trace.filter(x => x[0] === 'command').map(x => x[1]);
  assert.deepEqual(updates, ['workbench.files.action.refreshFilesExplorer', 'workbench.files.action.refreshFilesExplorer', 'mojigoto.refreshWorkTree', 'mojigoto.refreshStats', 'mojigoto.refreshWorkStatus']);
});

test('作品名追従: Single・範囲外・同名・_WORK・新フォルダなしでは処理しない', async () => {
  for (const mode of ['single', 'outside', 'nested', 'same', 'view', 'missing']) {
    const { h, event, work } = setup();
    if (mode === 'single') h.config.mode = 'single';
    if (mode === 'outside') event.files[0].newUri.fsPath = path.resolve('/outside/New');
    if (mode === 'nested') event.files[0].newUri.fsPath = path.join(work, 'nested');
    if (mode === 'same') event.files[0].oldUri.fsPath = work;
    if (mode === 'view') event.files[0].oldUri.fsPath = path.join(h.root, '_WORK');
    if (mode === 'missing') h.directories.delete(work);
    assert.equal(await h.rename(event), false); assert.ok(!h.trace.some(x => x[0] === 'write' || x[0] === 'switch'));
  }
});

test('作品名追従: 保存失敗の既存動作と切替失敗の伝播、更新コマンド失敗後の継続を維持する', async () => {
  const write = setup(); write.h.hooks.write = () => { throw new Error('保存失敗'); };
  assert.equal(await write.h.rename(write.event), true);
  const switching = setup(); switching.h.values.set('mojigoto.currentWorkName', 'Old'); switching.h.hooks.switch = () => { throw new Error('切替失敗'); };
  await assert.rejects(switching.h.rename(switching.event), /切替失敗/); assert.equal(switching.h.values.get('mojigoto.currentWorkName'), 'Old');
  const command = setup(); command.h.hooks.command = () => { throw new Error('画面更新失敗'); };
  assert.equal(await command.h.rename(command.event), true); assert.equal(command.h.trace.at(-1)[0], 'afterRename');
});

test('タブ終了: 原稿ルート配下の通常・差分タブを閉じ、類似名の別フォルダは保持する', async () => {
  const h = fixture(), root = h.config.manuscriptRoot;
  const tabs = [{ input: { uri: { fsPath: path.join(root, 'a.txt') } } }, { input: { modified: { fsPath: path.join(root, 'b.txt') } } },
    { input: { uri: { fsPath: root + '-other/a.txt' } } }, { input: {} }];
  let closed; h.vscode.window.tabGroups = { all: [{ tabs }], async close(items) { closed = [...items]; } };
  await h.service.closeEditorsUnderManuscriptRoot(); assert.deepEqual(closed, tabs.slice(0, 2));
});

test('タブ終了: Windowsのパス表記差を同一視し、Tab APIなしでは対象エディターだけ閉じる', async () => {
  const h = fixture(); h.config.manuscriptRoot = path.resolve('/Manuscript');
  const doc = { uri: { fsPath: path.resolve('/manuscript/a.txt') } };
  let closed = false; h.vscode.window.tabGroups = { all: [{ tabs: [{ input: { uri: doc.uri } }] }], async close() { closed = true; } };
  await h.service.closeEditorsUnderManuscriptRoot(); assert.equal(closed, process.platform === 'win32');
  delete h.vscode.window.tabGroups; h.vscode.window.visibleTextEditors = [{ document: doc }, { document: { uri: { fsPath: path.resolve('/Other/a.txt') } } }];
  const shown = []; h.vscode.window.showTextDocument = async document => shown.push(document);
  await h.service.closeEditorsUnderManuscriptRoot(); assert.equal(shown.length, process.platform === 'win32' ? 1 : 0);
});

test('実ファイル: フォルダ名への追従後も作品状態・ジャンル・拡張設定を保持する', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-work-follow-'));
  try {
    const old = path.join(root, 'Old'), next = path.join(root, 'New');
    await fs.mkdir(path.join(old, '.mojigoto'), { recursive: true });
    await fs.writeFile(path.join(old, '.mojigoto', 'work.json'), JSON.stringify({ title: '作品名', folderName: 'Old', status: 'revision', genres: ['幻想'], custom: { keep: true } }));
    assert.equal(path.dirname(path.resolve(old)), root); assert.equal(path.dirname(path.resolve(next)), root);
    await fs.rename(old, next);
    const h = fixture({ fileSystem: fs }); h.config.workRoot = root;
    assert.equal(await h.rename({ files: [{ oldUri: { fsPath: old }, newUri: { fsPath: next } }] }), true);
    const data = JSON.parse(await fs.readFile(path.join(next, '.mojigoto', 'work.json'), 'utf8'));
    assert.equal(data.folderName, 'New'); assert.equal(data.status, 'revision'); assert.deepEqual(data.genres, ['幻想']); assert.deepEqual(data.custom, { keep: true });
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('mojigoto-work-follow-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
