const test = require('node:test');
const assert = require('node:assert/strict');
const { createTreeMetadataHarness: fixture } = require('./fixtures/tree-metadata-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('作品ツリー: ノートの種類と作品情報を解決して既存ノートを開く', async () => {
  const h = await fixture();
  await h.run('treeOpenNote', { fsPath: '/notes/n.json', workDir: '/work', workName: 'A', noteType: 'reference' });
  assert.deepEqual(h.trace.map(x => x[0]), ['read', 'note.open']);
  assert.deepEqual(plain(h.trace[1].slice(1)), [true, true, { filePath: '/notes/n.json', type: 'reference', workDir: '/work', workName: 'A', workTitle: '作品' }]);
  h.trace.length = 0; await h.run('treeOpenNote'); assert.equal(h.trace[0][0], 'warning');
});

test('作品ツリー: 作品名はタイトル・フォルダ名・ディレクトリ名・現在作品の順に補う', async () => {
  for (const [settings, workDir, expected] of [[{ title: ' 表題 ' }, '/work', '表題'], [{ folderName: ' 名前 ' }, '/work', '名前'], [{}, '/work', 'work'], [{}, '', 'n.json']]) {
    const h = await fixture(); h.model.settings = settings;
    await h.run('treeOpenNote', { fsPath: '/notes/n.json', workDir });
    assert.equal(h.trace.at(-1)[3].workTitle, expected);
  }
  const h = await fixture(); h.hooks.read = () => { throw new Error('読込失敗'); };
  await h.run('treeOpenNote', { fsPath: '/n.json', workDir: '/fallback' });
  assert.equal(h.trace.at(-1)[3].workTitle, 'fallback');
});

test('作品ツリー: プロットと資料を作成後に更新し、作成済みファイルを開く', async () => {
  for (const [action, type] of [['treeCreatePlot', 'plot'], ['treeCreateReference', 'reference']]) {
    const h = await fixture(), item = { fsPath: '/work', workDir: '/other', workName: 'A' };
    await h.run(action, item);
    assert.deepEqual(h.trace.map(x => x[0]), ['note.create', 'refresh', 'read', 'note.open']);
    assert.deepEqual(plain(h.trace[0]), ['note.create', type, item, '']);
    assert.equal(h.trace.at(-1)[3].filePath, '/created/note.json');
    assert.equal(h.trace.at(-1)[3].workDir, '/work'); assert.equal(h.trace.at(-1)[3].type, type);
  }
});

test('作品ツリー: 作成失敗は更新せず、表示失敗では作成済みノートを取り消さない', async () => {
  for (const action of ['treeCreatePlot', 'treeCreateReference']) for (const stage of ['create', 'refresh', 'open']) {
    const h = await fixture(); h.hooks[stage] = () => { throw new Error('境界失敗'); };
    await h.run(action, { workDir: '/work' }); assert.equal(h.trace.at(-1)[0], 'error');
    assert.equal(h.trace.filter(x => x[0] === 'note.create').length, 1);
    if (stage === 'create') assert.ok(!h.trace.some(x => x[0] === 'refresh'));
  }
});

test('作品ツリー: 構想メモは項目のworkDir・fsPath・現在作品の順で保存先を決める', async () => {
  for (const [item, expected] of [[{ workDir: '/work', fsPath: '/other' }, '/work'], [{ fsPath: '/folder' }, '/folder'], [undefined, '/current']]) {
    const h = await fixture(); await h.run('createEmptyConceptMemos', item);
    assert.equal(h.trace.at(-1)[0], 'concept.open'); assert.equal(h.trace.at(-1)[3].workDir, expected);
    assert.equal(h.trace.at(-1)[3].filePath, expected + '/concept.json');
  }
});

test('作品ツリー: Singleでは現在作品名と単独の構想メモ保存先を使用する', async () => {
  const h = await fixture(); h.model.single = true;
  await h.run('createEmptyConceptMemos', { workDir: '/ignored' });
  assert.deepEqual(plain(h.trace[0].slice(1)), [true, true, { filePath: '/single/concept.json', workDir: '', workTitle: '現在作品' }]);
  h.trace.length = 0; await h.run('treeOpenNote', { fsPath: '/n.json' });
  assert.equal(h.trace[0][3].workTitle, '現在作品'); assert.equal(h.trace[0][3].type, 'plot');
});

test('作品ツリー: 構想メモの保存先なしは警告し、表示失敗はエラーを返す', async () => {
  const h = await fixture(); h.model.conceptPath = '';
  await h.run('createEmptyConceptMemos'); assert.equal(h.trace.at(-1)[0], 'warning');
  assert.ok(!h.trace.some(x => x[0] === 'concept.open'));
  const failed = await fixture(); failed.hooks.open = () => { throw new Error('表示失敗'); };
  for (const action of ['treeOpenNote', 'createEmptyConceptMemos', 'treeOpenSettings']) {
    await failed.run(action, { fsPath: '/n.json' }); assert.match(failed.trace.at(-1)[1], /開けませんでした/);
  }
});

test('作品ツリー: 設定画面と拡張設定を既存の入口で開き、失敗を通知する', async () => {
  const h = await fixture(), item = { workDir: '/work' };
  await h.run('treeOpenSettings', item); assert.deepEqual(plain(h.trace[0]), ['settings.open', true, true, item]);
  await h.run('openVsCodeSettings'); assert.deepEqual(h.trace.at(-1), ['command', 'workbench.action.openSettings', '@ext:hasakudo.mojigoto']);
  h.hooks.command = () => { throw new Error('設定失敗'); }; await h.run('openVsCodeSettings');
  assert.match(h.trace.at(-1)[1], /VS Code 設定を開けませんでした/);
});
