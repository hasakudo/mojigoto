const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTreeRenameHarness: fixture } = require('./fixtures/tree-rename-harness.cjs');
const item = (kind, file) => ({ kind, fsPath: file, workName: 'Old' });
const types = h => h.trace.map(x => x[0]);

test('名前変更: 原稿の拡張子を保持し、関連データ・タブ・表示を順に更新する', async () => {
  const h = await fixture(), old = h.normalize('/manuscript/Old.TXT'), target = path.join(path.dirname(old), '新しい名前.TXT');
  h.files.set(old, '原稿本文'); h.model.tabs = [{ input: new h.TextInput(old) }, { input: new h.DiffInput('/other', old) }, { input: new h.TextInput('/unrelated') }];
  await h.run(item('manuscriptFile', old));
  assert.equal(h.files.get(target), '原稿本文'); assert.equal(h.files.has(old), false);
  assert.deepEqual(types(h), ['input', 'fs.access', 'fs.rename', 'backup', 'displayNames', 'memo.file', 'tabs.close', 'refresh', 'command', 'reveal', 'info']);
  assert.deepEqual(Array.from(h.trace.find(x => x[0] === 'tabs.close')[1]), [0, 1]);
});

test('名前変更: ノートはJSONのタイトルと日時だけを更新し、旧パスの画面を閉じる', async () => {
  const h = await fixture(), old = h.normalize('/notes/Old.json'), target = path.join(path.dirname(old), '新しい名前.json');
  h.files.set(old, JSON.stringify({ title: '旧題', groups: [{ id: 'g' }], custom: true })); await h.run(item('noteFile', old));
  const data = JSON.parse(h.files.get(target)); assert.equal(data.title, '新しい名前'); assert.equal(data.custom, true);
  assert.deepEqual(data.groups, [{ id: 'g' }]); assert.equal(data.updatedAt, '2026-10-22T13:00:00.000Z');
  assert.ok(h.trace.some(x => x[0] === 'command' && x[1] === 'mojigoto.closeNoteWebviewByPath' && x[2] === old));
});

test('名前変更: 章フォルダの子原稿を保持し、フォルダ用メモ更新と対象タブ終了を行う', async () => {
  const h = await fixture(), old = h.normalize('/manuscript/Old'); h.files.set(old, null); h.files.set(path.join(old, 'a.txt'), '本文');
  h.model.tabs = [{ input: new h.TextInput(path.join(old, 'a.txt')) }, { input: new h.TextInput('/manuscript/OldOther/a.txt') }];
  await h.run(item('chapterFolder', old));
  assert.equal(h.files.get(path.join(path.dirname(old), '新しい名前', 'a.txt')), '本文');
  assert.ok(types(h).includes('memo.folder')); assert.deepEqual(Array.from(h.trace.find(x => x[0] === 'tabs.close')[1]), [0]);
});

test('名前変更: 作品フォルダ設定の他項目と集計情報を移行し、既存の作品移行サービスへ通知する', async () => {
  const h = await fixture(), old = h.normalize('/works/Old'), target = path.join(path.dirname(old), '新しい名前');
  h.files.set(old, null); h.files.set(path.join(old, '.mojigoto', 'work.json'), JSON.stringify({ title: '作品タイトル', folderName: 'Old', custom: 5 }));
  const key = h.keys.keyDailyByWorkName; h.values.set(key('Old'), { total: 123 }); await h.run(item('work', old));
  const data = JSON.parse(h.files.get(path.join(target, '.mojigoto', 'work.json')));
  assert.equal(data.title, '作品タイトル'); assert.equal(data.folderName, '新しい名前'); assert.equal(data.custom, 5);
  assert.deepEqual(h.values.get(key('新しい名前')), { total: 123 }); assert.equal(h.values.get(key('Old')), undefined);
  assert.ok(types(h).indexOf('work.rename') > types(h).indexOf('state.update'));
});

test('名前変更: 取消・同名・変更なし・View連携中・ルート未設定では実名を変更しない', async () => {
  for (const kind of ['manuscriptFile', 'noteFile', 'chapterFolder', 'work']) for (const mode of ['cancel', 'same', 'duplicate']) {
    const h = await fixture(), extension = kind === 'manuscriptFile' ? '.txt' : kind === 'noteFile' ? '.json' : '';
    const old = h.normalize('/parent/Old' + extension); h.files.set(old, '原本');
    if (mode === 'cancel') h.model.input = undefined;
    if (mode === 'same') h.model.input = 'Old';
    if (mode === 'duplicate') h.files.set(path.join(path.dirname(old), '新しい名前' + extension), '既存');
    await h.run(item(kind, old)); assert.equal(h.files.get(old), '原本'); assert.ok(!types(h).includes('fs.rename'));
  }
  for (const mode of ['current', 'root']) { const h = await fixture(); if (mode === 'current') h.model.currentWork = 'Old'; else h.model.root = '';
    await h.run(item('work', '/works/Old')); assert.ok(!types(h).includes('input')); assert.equal(h.trace.at(-1)[0], 'warning'); }
});

test('名前変更: 入力検証と対象なし・未対応の案内を維持する', async () => {
  const h = await fixture(); h.hooks.validation = validate => { assert.ok(validate('')); assert.ok(validate('a/b')); assert.equal(validate('有効名'), null); };
  h.model.input = undefined; await h.run(item('manuscriptFile', '/Old.txt'));
  await h.run(undefined); assert.equal(h.trace.at(-1)[0], 'warning');
  await h.run(item('unknown', '/Old')); assert.match(h.trace.at(-1)[1], /未対応/);
});

test('名前変更: 実名変更失敗は後続を止め、バックアップ移行失敗は警告して続ける', async () => {
  for (const stage of ['rename', 'backup', 'displayNames', 'memo.file']) {
    const h = await fixture(), old = h.normalize('/Old.txt'); h.files.set(old, '本文');
    h.hooks[stage] = () => { throw new Error('境界失敗'); }; await h.run(item('manuscriptFile', old));
    if (stage === 'rename') { assert.equal(h.files.get(old), '本文'); assert.ok(!types(h).includes('backup')); }
    else assert.equal(h.files.has(old), false);
    assert.equal(h.trace.at(-1)[0], stage === 'backup' || stage === 'displayNames' ? 'info' : 'error');
  }
});

test('実ファイル: 原稿とノートの名前変更後も本文・ノート構造を保持する', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-tree-rename-'));
  try {
    const h = await fixture({ fileSystem: fs }), old = path.join(root, 'Old.txt'); await fs.writeFile(old, '保存済み本文');
    await h.run(item('manuscriptFile', old)); assert.equal(await fs.readFile(path.join(root, '新しい名前.txt'), 'utf8'), '保存済み本文');
    const note = path.join(root, 'Old.json'); await fs.writeFile(note, JSON.stringify({ title: '旧', groups: [{ id: 'g' }], images: ['i'] }));
    await h.run(item('noteFile', note)); const data = JSON.parse(await fs.readFile(path.join(root, '新しい名前.json'), 'utf8'));
    assert.equal(data.title, '新しい名前'); assert.deepEqual(data.groups, [{ id: 'g' }]); assert.deepEqual(data.images, ['i']);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('mojigoto-tree-rename-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
