const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createWorkCandidatesHarness: fixture } = require('./fixtures/work-candidates-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('作品切替候補: 明示ルートを優先し、未指定時は原稿ルートから推定する', () => {
  const h = fixture(); h.config.workRoot = '  明示ルート  '; assert.equal(h.service.getWorkRoot(), '明示ルート');
  h.config.workRoot = ''; assert.equal(h.service.getWorkRoot(), h.root);
  h.config.manuscriptRoot = ''; assert.equal(h.service.getWorkRoot(), '');
});

test('作品切替候補: 除外・原稿フォルダ候補・上限の既定と個別指定を維持する', () => {
  const h = fixture(); assert.ok(h.service.getExcludeList().includes('_WORK'));
  assert.deepEqual(plain(h.service.getManuscriptCandidates()), ['manuscript', '原稿']);
  for (const [value, expected] of [[undefined, 20], ['7', 7], [3.8, 3], [0, 20], [-1, 20], ['invalid', 20]]) {
    h.config.workPickLimit = value; assert.equal(h.service.getPickLimit(), expected);
  }
  h.config.workExclude = []; h.config.manuscriptCandidates = [];
  assert.deepEqual(plain(h.service.getExcludeList()), []); assert.deepEqual(plain(h.service.getManuscriptCandidates()), []);
});

test('作品切替候補: タイトルと実フォルダ名を分け、自然順に並べる', async () => {
  const h = fixture(); h.files.set(path.join(h.root, '作品10', '.mojigoto', 'work.json'), JSON.stringify({ title: ' 作品1 ' }));
  const candidates = await h.collect();
  assert.deepEqual(Array.from(candidates, x => x.label), ['作品1', '作品2']);
  assert.equal(candidates[0].workName, '作品10'); assert.equal(candidates[0].description, 'フォルダ名: 作品10');
  assert.equal(candidates[0].detail, '原稿フォルダ: manuscript');
  assert.equal(candidates[1].description, '原稿フォルダ: manuscript');
});

test('作品切替候補: 除外作品・ファイル・原稿なしを除き、最初の有効な原稿フォルダだけを使う', async () => {
  const h = fixture(); h.model.entries = ['_WORK', '作品2', '資料.txt', '原稿なし', '日本語'];
  h.directories.add(path.join(h.root, '日本語', '原稿')); h.directories.add(path.join(h.root, '作品2', '原稿'));
  const candidates = await h.collect(); assert.deepEqual(Array.from(candidates, x => x.workName), ['作品2', '日本語']);
  assert.equal(candidates[0].manuPath, path.join(h.root, '作品2', 'manuscript')); assert.equal(candidates[1].manuPath, path.join(h.root, '日本語', '原稿'));
});

test('作品切替候補: 設定の破損・読込失敗は実フォルダ名に戻し、ルート一覧失敗は呼出元へ返す', async () => {
  for (const mode of ['invalid', 'read']) {
    const h = fixture(); h.files.set(path.join(h.root, '作品2', '.mojigoto', 'work.json'), '{invalid');
    if (mode === 'read') h.hooks.read = () => { throw new Error('読込失敗'); };
    assert.deepEqual(Array.from(await h.collect(), x => x.label), ['作品2', '作品10']);
  }
  const h = fixture(); h.hooks.readdir = () => { throw new Error('一覧失敗'); };
  await assert.rejects(h.collect(), /一覧失敗/);
});

test('作品切替候補: 並べた候補へ上限を適用して選択し、既存切替と後処理へ渡す', async () => {
  const h = fixture(); h.config.workPickLimit = 1; assert.equal(await h.switch(), true);
  const pick = h.trace.find(x => x[0] === 'pick'); assert.equal(pick[1].length, 1); assert.equal(pick[1][0].workName, '作品2');
  assert.equal(h.trace.find(x => x[0] === 'switch')[2], path.join(h.root, '作品2', 'manuscript'));
  assert.equal(h.trace.at(-1)[0], 'afterSwitch');
});

test('作品切替候補: 取消・候補なしでは参照先と現在作品を変更しない', async () => {
  for (const mode of ['cancel', 'empty']) {
    const h = fixture(); if (mode === 'cancel') h.model.cancel = true; else h.model.entries = [];
    assert.equal(await h.switch(), false); assert.ok(!h.trace.some(x => ['switch', 'currentWork', 'afterSwitch'].includes(x[0])));
  }
});

test('実ファイル: 日本語原稿フォルダと設定タイトルを探索できる', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-work-candidates-'));
  try {
    const h = fixture({ fileSystem: fs }); h.config.workRoot = root;
    await fs.mkdir(path.join(root, '作品A', '原稿'), { recursive: true }); await fs.mkdir(path.join(root, '作品A', '.mojigoto'));
    await fs.writeFile(path.join(root, '作品A', '.mojigoto', 'work.json'), JSON.stringify({ title: '表示タイトル' }));
    const candidates = await h.collect(); assert.equal(candidates.length, 1); assert.equal(candidates[0].label, '表示タイトル');
    assert.equal(candidates[0].workName, '作品A'); assert.equal(candidates[0].manuPath, path.join(root, '作品A', '原稿'));
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('mojigoto-work-candidates-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
