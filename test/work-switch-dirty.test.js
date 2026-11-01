const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createWorkDirtyHarness: fixture } = require('./fixtures/work-dirty-harness.cjs');
const types = h => h.trace.map(x => x[0]);

test('未保存確認: 対象ルート配下の未保存file文書だけを扱う', async () => {
  const h = fixture(); h.doc('clean.txt', { isDirty: false });
  h.doc('untitled', { uri: { scheme: 'untitled', fsPath: path.join(h.root, 'b.txt') } });
  h.doc('outside', { uri: { scheme: 'file', fsPath: h.root + '-other/a.txt' } });
  assert.equal(await h.run(), true); assert.deepEqual(h.trace, []);
  h.doc(); assert.equal(await h.run(''), true); assert.deepEqual(h.trace, []);
});

test('未保存確認: 通常保存後に閉じ、完了してから作品参照を切り替える', async () => {
  const h = fixture(), doc = h.doc(); assert.equal(await h.switch(), true);
  assert.equal(doc.isClosed, true); assert.ok(types(h).indexOf('switch') > types(h).indexOf('save'));
  assert.deepEqual(types(h).slice(0, 5), ['mkdir', 'pick', 'pick', 'save', 'show']);
});

test('未保存確認: 通常保存の取消・未完了では切替せず、残りの文書も処理しない', async () => {
  for (const mode of ['false', 'dirty']) {
    const h = fixture(); h.doc('a.txt'); h.doc('b.txt');
    if (mode === 'false') h.model.saveResult = false; else h.model.keepDirty = true;
    assert.equal(await h.switch(), false); assert.equal(h.documents[0].isDirty, true);
    assert.equal(h.trace.filter(x => x[0] === 'save').length, 1);
    assert.ok(!types(h).includes('switch')); assert.ok(!types(h).includes('show'));
    assert.match(h.trace.at(-1)[1], /保存が完了していないため作品切替を中止/);
  }
});

test('未保存確認: 全破棄は保存方法を尋ねず、全保存は個別指定を上書きする', async () => {
  const discarded = fixture(); discarded.doc(); discarded.doc('b.txt'); discarded.model.choices = ['discard'];
  assert.equal(await discarded.run(), true); assert.equal(discarded.trace.filter(x => x[0] === 'pick').length, 1);
  assert.equal(discarded.trace.filter(x => x[0] === 'save').length, 0); assert.ok(discarded.documents.every(x => x.isClosed));
  const saved = fixture(); saved.doc(); saved.doc('b.txt'); saved.model.choices = ['doc:a.txt', 'save', 'normal'];
  assert.equal(await saved.run(), true); assert.equal(saved.trace.filter(x => x[0] === 'save').length, 2);
});

test('未保存確認: 文書ごとに保存と破棄を選べ、再選択で保存へ戻せる', async () => {
  const h = fixture(); h.doc(); h.doc('b.txt'); h.model.choices = ['doc:a.txt', 'execute', 'normal'];
  assert.equal(await h.run(), true); assert.equal(h.trace.filter(x => x[0] === 'save').length, 1);
  assert.ok(h.trace.find(x => x[0] === 'save')[1].endsWith('b.txt'));
  const restored = fixture(); restored.doc(); restored.model.choices = ['doc:a.txt', 'doc:a.txt', 'execute', 'normal'];
  assert.equal(await restored.run(), true); assert.equal(restored.trace.filter(x => x[0] === 'save').length, 1);
});

test('未保存確認: ファイル行は実行ではなく処理設定と示し、確定方法と変更先を表示する', async () => {
  const h = fixture(); h.doc(); h.doc('b.txt');
  h.model.choices = ['doc:a.txt', 'execute', 'normal'];
  assert.equal(await h.run(), true);
  const picks = h.trace.filter(x => x[0] === 'pick');
  const first = picks[0][1].find(x => x.__doc?.endsWith('a.txt'));
  const changed = picks[1][1].find(x => x.__doc?.endsWith('a.txt'));
  assert.match(first.label, /【保存】/); assert.match(first.detail, /選択中：保存.*押すと「破棄」に変更/);
  assert.match(changed.label, /【破棄】/); assert.match(changed.detail, /選択中：破棄.*押すと「保存」に変更/);
  assert.ok(picks[0][1].some(x => x.kind === -1 && /ファイルごとの処理設定/.test(x.label)));
  assert.match(picks[0][2].placeHolder, /一覧の直後にある「この内容で切替（実行）」で確定/);
  const items = picks[0][1];
  const executeIndex = items.findIndex(item => item.label === '✅ この内容で切替（実行）');
  const fileIndexes = items.flatMap((item, index) => item.__doc ? [index] : []);
  assert.equal(executeIndex, Math.max(...fileIndexes) + 1);
  assert.ok(executeIndex < items.findIndex(item => item.label === '💾 すべて保存して切替'));
  assert.equal(h.trace.filter(x => x[0] === 'save').length, 1);
});

test('未保存確認: ダイアログ取消と保存方法取消は保存・破棄せず切替を止める', async () => {
  for (const choices of [[undefined], ['cancel'], ['execute', undefined]]) {
    const h = fixture(); h.doc(); h.model.choices = choices;
    assert.equal(await h.switch(), false); assert.ok(h.documents[0].isDirty);
    assert.ok(!types(h).some(x => ['save', 'show', 'write', 'switch'].includes(x)));
  }
});

test('未保存確認: リンク元の解決後に相対パスを保って保存し、閉じてから切り替える', async () => {
  const h = fixture(); h.doc(path.join('章', 'a.txt')); h.model.choices = ['execute', 'real'];
  assert.equal(await h.switch(), true);
  const write = h.trace.find(x => x[0] === 'write');
  assert.equal(write[1], path.join(h.model.realRoot, '章', 'a.txt')); assert.equal(write[2], '未保存の本文');
  assert.ok(types(h).indexOf('write') < types(h).indexOf('show')); assert.ok(types(h).indexOf('show') < types(h).indexOf('switch'));
  assert.ok(!types(h).includes('save'));
});

test('未保存確認: 保存・実体解決・実体書込・選択失敗は切替を中止する', async () => {
  for (const stage of ['save', 'realpath', 'write', 'pick']) {
    const h = fixture(); h.doc(); h.model.choices = ['execute', stage === 'save' ? 'normal' : 'real'];
    h.hooks[stage] = () => { throw new Error('境界失敗'); };
    assert.equal(await h.switch(), false); assert.ok(!types(h).includes('switch')); assert.equal(h.trace.at(-1)[0], 'error');
  }
});

test('実ファイル: リンク元保存は現在作品の実フォルダへ本文を書き込み、別作品の本文を保持する', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mojigoto-work-dirty-'));
  try {
    const h = fixture({ fileSystem: fs }); h.model.realRoot = path.join(root, '現在作品', '原稿');
    const other = path.join(root, '次作品', 'a.txt'); await fs.mkdir(path.dirname(other), { recursive: true }); await fs.writeFile(other, '次作品の本文');
    h.doc(path.join('章', 'a.txt')); h.model.choices = ['execute', 'real']; assert.equal(await h.run(), true);
    assert.equal(await fs.readFile(path.join(h.model.realRoot, '章', 'a.txt'), 'utf8'), '未保存の本文');
    assert.equal(await fs.readFile(other, 'utf8'), '次作品の本文');
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('mojigoto-work-dirty-'));
    await fs.rm(root, { recursive: true, force: true });
  }
});
