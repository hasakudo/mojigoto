const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createTreeMetadataHarness } = require('./fixtures/tree-metadata-harness.cjs');
const fixture = options => createTreeMetadataHarness({ creation: true, ...options });
const types = h => h.trace.map(x => x[0]);

test('作品作成: 必要なフォルダ・初期設定を作り、ツリー更新後にコピー案内と設定画面を開く', async () => {
  const h = await fixture(); await h.run('treeCreateWork');
  const work = path.join(h.model.workRoot, h.model.input), meta = path.join(work, '.mojigoto');
  assert.deepEqual([...h.directories], [path.join(work, 'manuscript'), path.join(meta, 'plots'), path.join(meta, 'references')]);
  assert.deepEqual(JSON.parse(h.files.get(path.join(meta, 'work.json'))), { schemaVersion: 1, folderName: '新規作品', title: '新規作品', subtitle: '', genre: '', genres: [], status: 'planning', targetChars: 0, deadline: '', summary: '' });
  assert.deepEqual(types(h), ['input', 'fs.access', 'fs.mkdir', 'fs.mkdir', 'fs.mkdir', 'fs.write', 'refresh', 'info', 'settings.open', 'info']);
});

test('作品作成: コピーを選ぶ場合は対象作品を渡し、コピー完了後に設定画面を開く', async () => {
  const h = await fixture(); h.model.copyChoice = '他作品からコピー'; h.model.manuscriptDir = '原稿';
  await h.run('treeCreateWork');
  const command = h.trace.find(x => x[0] === 'command');
  assert.equal(command[1], 'mojigoto.copyFromOtherWork'); assert.equal(command[2].workName, h.model.input);
  assert.equal(h.trace.at(-1)[0], 'settings.open'); assert.equal(h.trace.filter(x => x[0] === 'info').length, 1);
  assert.ok([...h.directories][0].endsWith('原稿'));
});

test('作品作成: Single・作品ルートなし・入力取消・同名作品では作成しない', async () => {
  for (const mode of ['single', 'root', 'cancel', 'duplicate']) {
    const h = await fixture();
    if (mode === 'single') h.model.single = true;
    if (mode === 'root') h.model.workRoot = '';
    if (mode === 'cancel') h.model.input = undefined;
    if (mode === 'duplicate') h.directories.add(path.join(h.model.workRoot, h.model.input));
    await h.run('treeCreateWork'); assert.equal(h.files.size, 0);
    assert.ok(!h.trace.some(x => ['fs.mkdir', 'refresh', 'settings.open'].includes(x[0])));
  }
});

test('作品作成: フォルダ・保存・コピー・画面表示の失敗を通知し、作成済み内容は削除しない', async () => {
  for (const stage of ['mkdir', 'fileWrite', 'command', 'open']) {
    const h = await fixture(); h.model.copyChoice = '他作品からコピー';
    h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await h.run('treeCreateWork'); assert.match(h.trace.at(-1)[1], /新規作品の作成に失敗/);
    assert.equal(h.files.size, stage === 'command' || stage === 'open' ? 1 : 0);
  }
});

test('原稿作成: 拡張子補完・既存拡張子・大文字の拡張子を維持し、作成後に開く', async () => {
  for (const [input, extension, expected] of [[' 第一話 ', '.txt', '第一話.txt'], ['第一話', '.md', '第一話.md'], ['第一話.md', '.txt', '第一話.md'], ['第一話.TXT', '.md', '第一話.TXT']]) {
    const h = await fixture(); h.model.input = input; h.model.extension = extension;
    await h.run('createManuscriptFile', { fsPath: '/manuscript' });
    const target = path.join('/manuscript', expected); assert.equal(h.files.get(target), '');
    assert.deepEqual(types(h), ['input', 'fs.access', 'fs.write', 'command', 'info', 'refresh']);
    assert.equal(h.trace[3][1], 'vscode.open'); assert.equal(h.trace[3][2].fsPath, target);
  }
});

test('原稿作成: 同名を上書きせず、取消でも従来どおりツリーを更新する', async () => {
  const h = await fixture(); h.model.input = '既存'; const target = path.join('/manuscript', '既存.txt'); h.files.set(target, '原稿本文');
  await h.run('createManuscriptFile', { fsPath: '/manuscript' }); assert.equal(h.files.get(target), '原稿本文');
  assert.deepEqual(types(h), ['input', 'fs.access', 'warning', 'refresh']);
  h.trace.length = 0; h.model.input = undefined; await h.run('createManuscriptFile', { fsPath: '/manuscript' });
  assert.deepEqual(types(h), ['input', 'refresh']);
});

test('原稿作成: 保存失敗は開かず、開く操作の失敗では作成済み内容を残す', async () => {
  for (const stage of ['fileWrite', 'command']) {
    const h = await fixture(); h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await assert.rejects(h.run('createManuscriptFile', { fsPath: '/manuscript' }), /境界失敗/);
    assert.ok(!types(h).includes('refresh')); assert.equal(h.files.size, stage === 'command' ? 1 : 0);
  }
});

test('章フォルダ作成: 空白を除いたパスを作成し、取消と失敗の動作を維持する', async () => {
  const h = await fixture(); h.model.input = ' 第1章 '; await h.run('createManuscriptFolder', { fsPath: '/manuscript' });
  assert.ok(h.directories.has(path.join('/manuscript', '第1章'))); assert.deepEqual(types(h), ['input', 'fs.mkdir', 'info', 'refresh']);
  h.trace.length = 0; h.model.input = undefined; await h.run('createManuscriptFolder', { fsPath: '/manuscript' });
  assert.deepEqual(types(h), ['input', 'refresh']);
  h.model.input = '第2章'; h.hooks.mkdir = () => { throw new Error('作成失敗'); };
  await assert.rejects(h.run('createManuscriptFolder', { fsPath: '/manuscript' }), /作成失敗/);
});

test('実ファイル: 原稿の既存本文を保持し、新規原稿と作品初期設定を読み戻せる', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-tree-create-'));
  try {
    const h = await fixture({ fileSystem: fs }); h.model.workRoot = root; h.model.input = '実作品';
    await h.run('treeCreateWork');
    const manuscript = path.join(root, '実作品', 'manuscript');
    assert.equal(JSON.parse(await fs.readFile(path.join(root, '実作品', '.mojigoto', 'work.json'), 'utf8')).status, 'planning');
    h.model.input = '第一話'; await h.run('createManuscriptFile', { fsPath: manuscript });
    const target = path.join(manuscript, '第一話.txt'); assert.equal(await fs.readFile(target, 'utf8'), '');
    await fs.writeFile(target, '既存の本文'); await h.run('createManuscriptFile', { fsPath: manuscript });
    assert.equal(await fs.readFile(target, 'utf8'), '既存の本文');
    h.model.input = '第1章'; await h.run('createManuscriptFolder', { fsPath: manuscript });
    assert.ok((await fs.stat(path.join(manuscript, '第1章'))).isDirectory());
  } finally {
    // Only the absolute temporary directory allocated by this test is removed.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('mojigoto-tree-create-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
