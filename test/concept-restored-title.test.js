const test = require('node:test');
const assert = require('node:assert/strict');
const { createConceptHostHarness } = require('./fixtures/concept-host-harness.cjs');

const posts = h => h.events.filter(([kind]) => kind === 'post').map(([, message]) => message);
async function restore(h, state) {
  // VS Code supplies a new panel to the registered serializer.
  const restored = h.createPanel();
  await h.host.createConceptMemoSerializer({}, {}).deserializeWebviewPanel(restored, state);
  return restored;
}

test('外部更新の作品情報を保ち、更新後に保存された状態でも作品名を復元する', async () => {
  const h = createConceptHostHarness(), panel = await h.open();
  await h.host.notifyConceptMemoUpdated('/work/.mojigoto/concept-memos.json');
  const payload = posts(h).at(-1).payload;
  assert.equal(payload.workDir, '/work'); assert.equal(payload.workTitle, '作品');
  const restoredHost = createConceptHostHarness();
  const restored = await restore(restoredHost, payload);
  assert.equal(restored.title, panel.title);
  assert.equal(restoredHost.bootStates.at(-1).workTitle, '作品');
  const reused = await restoredHost.open();
  assert.equal(reused, restored);
  assert.equal(restored.title, '構想メモ: 作品');
});

test('古い空の復元情報をファイル位置から補い、対象作品の最新名で復元する', async () => {
  const h = createConceptHostHarness({ workSettings: dir => ({ title: dir === '/novel' ? '改名後の作品' : '別作品' }) });
  const panel = await restore(h, { filePath: '/novel/.mojigoto/concept-memos.json', workDir: '', workTitle: '' });
  assert.equal(panel.title, '構想メモ: 改名後の作品');
  assert.equal(h.bootStates.at(-1).workDir, '/novel');
  assert.equal(h.bootStates.at(-1).workTitle, '改名後の作品');
  const changed = await restore(h, { filePath: '/novel/.mojigoto/concept-memos.json', workDir: '/novel', workTitle: '改名前' });
  assert.equal(changed.title, '構想メモ: 改名後の作品');
});

test('設定が読めない別作品や任意の保存先へ現在作品名を混ぜず、保存済み名・フォルダ名へ戻す', async () => {
  for (const [state, expected] of [
    [{ filePath: '/other/.mojigoto/concept-memos.json', workDir: '/other', workTitle: '保存済み名' }, '保存済み名'],
    [{ filePath: '/other/.mojigoto/concept-memos.json' }, 'other'],
    [{ filePath: '/storage/custom-memos.json' }, ''],
  ]) {
    const h = createConceptHostHarness({ workSettings: () => null });
    const panel = await restore(h, state);
    assert.equal(panel.title, expected ? '構想メモ: ' + expected : '構想メモ');
    assert.equal(h.bootStates.at(-1).workTitle, expected);
  }
});

test('複数作品を開き直した後の外部更新・共通TODO更新も各作品名を保持する', async () => {
  const h = createConceptHostHarness({ workSettings: dir => ({ title: dir === '/a' ? '作品A' : '作品B' }) });
  const a = await h.open({ filePath: '/a/.mojigoto/concept-memos.json', workDir: '/a', workTitle: '古いA' });
  const b = await h.open({ filePath: '/b/.mojigoto/concept-memos.json', workDir: '/b', workTitle: '古いB' });
  await h.open({ filePath: '/a/.mojigoto/concept-memos.json', workDir: '/a', workTitle: '' });
  assert.equal(a.__mojigotoConceptMemoWorkTitle, '作品A');
  assert.equal(a.title, '構想メモ: 作品A'); assert.equal(b.title, '構想メモ: 作品B');
  await h.host.notifyConceptMemoUpdated('/a/.mojigoto/concept-memos.json');
  assert.equal(posts(h).at(-1).payload.workTitle, '作品A');
  await h.host.notifyCommonTodoUpdated();
  assert.deepEqual(posts(h).slice(-2).map(message => message.payload.workTitle).sort(), ['作品A', '作品B']);
});
