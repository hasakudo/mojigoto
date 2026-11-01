const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardWritingHarness: fixture } = require('./fixtures/dashboard-writing-harness.cjs');
const message = (h, overrides = {}) => ({ type: 'copyWritingMemoToConceptMemo', memoId: 'm', writingMemoFilePath: h.sourcePath, filePath: 'one.txt', excerpt: '見出し', body: '本文', ...overrides });
const destination = h => h.conceptPath(h.workA);
const data = h => h.conceptStores.get(destination(h));
const mode = (h, action) => { h.hooks.quickPick = items => items.find(item => item.action === action); if (action === 'update') h.confirm('上書き更新'); };
const writeCount = h => h.trace.filter(row => row[0] === 'concept.write').length;
async function created() { const h = fixture(); await h.controller.open(); await h.receive(message(h)); h.confirm('上書き更新'); return h; }

test('初回は確認なしで作成し、同じメモの更新は件数・ID・作成日時・配置設定を保つ', async () => {
  const h = await created(), memo = data(h).memos[0], id = memo.id, createdAt = memo.createdAt;
  assert.equal(h.trace.some(row => row[0] === 'quickPick'), false);
  Object.assign(memo, { tags: ['重要'], folderIds: ['custom'], folderId: 'custom', isPinned: true, isArchived: true, showInDashboard: true, order: 7, custom: 'keep' });
  mode(h, 'update'); await h.receive(message(h, { body: '新しい本文', excerpt: '新見出し' }));
  const next = data(h).memos[0];
  assert.equal(data(h).memos.length, 1); assert.equal(next.id, id); assert.equal(next.createdAt, createdAt);
  assert.equal(next.title, '新見出し'); assert.equal(next.body, '新しい本文');
  for (const key of ['tags', 'folderIds', 'folderId', 'isPinned', 'isArchived', 'showInDashboard', 'order', 'custom']) assert.deepEqual(next[key], memo[key]);
  assert.equal(h.trace.filter(row => row[0] === 'warning').length, 1);
  assert.match(h.trace.find(row => row[0] === 'warning')[2].detail, /現在の内容と反映する内容/);
  assert.match(h.notices.at(-1)[1], /更新しました/);
});

test('新規作成を明示した場合だけ同じ出典の別コピーを追加し、選択取消では保存しない', async () => {
  const h = await created(), original = JSON.stringify(data(h).memos[0]);
  mode(h, 'create'); await h.receive(message(h, { body: '別コピー' }));
  assert.equal(data(h).memos.length, 2); assert.notEqual(data(h).memos[0].id, data(h).memos[1].id);
  assert.equal(JSON.stringify(data(h).memos[1]), original);
  const writes = writeCount(h), notifications = h.trace.filter(row => row[0] === 'concept.notify').length;
  delete h.hooks.quickPick; await h.receive(message(h));
  assert.equal(writeCount(h), writes); assert.equal(h.trace.filter(row => row[0] === 'concept.notify').length, notifications);
});

test('構想メモ側の編集を検知して内容を示し、確認取消で内容を保持する', async () => {
  const h = await created(); data(h).memos[0].body = '構想側の加筆';
  mode(h, 'update'); h.confirm(undefined); await h.receive(message(h, { body: '原稿側の修正' }));
  assert.equal(writeCount(h), 1); assert.equal(data(h).memos[0].body, '構想側の加筆');
  const warning = h.trace.find(row => row[0] === 'warning');
  assert.match(warning[2].detail, /構想メモ側で内容が編集/); assert.match(warning[2].detail, /構想側の加筆/); assert.match(warning[2].detail, /原稿側の修正/);
  h.confirm('上書き更新'); await h.receive(message(h, { body: '原稿側の修正' }));
  assert.equal(data(h).memos[0].body, '原稿側の修正'); assert.equal(data(h).memos.length, 1);
});

test('形式を変更した構想メモは確認後にテキストへ置換し、不要になるリスト内容を残さない', async () => {
  const h = await created(); Object.assign(data(h).memos[0], { type: 'list', listItems: ['加筆'], tags: ['keep'] });
  mode(h, 'update'); h.confirm('上書き更新'); await h.receive(message(h));
  assert.equal(data(h).memos[0].type, 'text'); assert.deepEqual(data(h).memos[0].listItems, []);
  assert.deepEqual(data(h).memos[0].tags, ['keep']); assert.equal(h.trace.filter(row => row[0] === 'warning').length, 1);
});

test('以前のコピーも候補になり、複数候補では選択したメモだけを確認後に更新する', async () => {
  const h = fixture(); await h.controller.open();
  const legacy = id => ({ id, title: id, body: '古い本文', source: { kind: 'writingMemo', memoId: 'm', filePath: 'one.txt' } });
  h.conceptStores.set(destination(h), { custom: 'root', memos: [legacy('one'), legacy('two')] });
  h.hooks.quickPick = items => items[0].action ? items.find(item => item.action === 'update') : items.find(item => item.memo.id === 'two');
  h.confirm('上書き更新'); await h.receive(message(h));
  assert.equal(data(h).memos[0].body, '古い本文'); assert.equal(data(h).memos[1].body, '本文');
  assert.equal(data(h).memos[1].id, 'two'); assert.equal(data(h).custom, 'root');
  assert.equal(data(h).memos[1].source.writingMemoFilePath, h.sourcePath);
  assert.match(h.trace.find(row => row[0] === 'warning')[2].detail, /以前の反映内容を確認できない/);
});

test('保存元が異なる同IDは混同せず、同じ保存元での原稿名変更は同じ反映先を使う', async () => {
  const h = await created(), originalId = data(h).memos[0].id;
  await h.receive(message(h, { writingMemoFilePath: h.memoPath(h.workB) }));
  assert.equal(data(h).memos.length, 2);
  mode(h, 'update'); await h.receive(message(h, { filePath: 'renamed.txt', body: '変更' }));
  const original = data(h).memos.find(memo => memo.id === originalId);
  assert.equal(original.body, '変更'); assert.equal(original.source.filePath, 'renamed.txt'); assert.equal(data(h).memos.length, 2);
});

test('確認中に更新対象が変更・削除された場合は上書きしない', async () => {
  for (const removed of [false, true]) {
    const h = await created();
    h.hooks.quickPick = items => {
      if (removed) data(h).memos.length = 0; else data(h).memos[0].body = '確認中の変更';
      return items.find(item => item.action === 'update');
    };
    await h.receive(message(h));
    assert.equal(writeCount(h), 1); assert.equal(h.notices.at(-1)[0], 'error');
    if (!removed) assert.equal(data(h).memos[0].body, '確認中の変更');
  }
});

test('選択中に他のメモが追加されても、再読込した内容を保って更新する', async () => {
  const h = await created();
  h.hooks.quickPick = items => { data(h).memos.push({ id: 'other', body: '新規追加' }); return items.find(item => item.action === 'update'); };
  await h.receive(message(h, { body: '更新' }));
  assert.equal(data(h).memos.length, 2); assert.equal(data(h).memos[1].body, '新規追加'); assert.equal(data(h).memos[0].body, '更新');
});

test('連続した反映は直列化し、2回目は新規追加せず反映方法を選ぶ', async () => {
  const h = fixture(); await h.controller.open(); mode(h, 'update');
  await Promise.all([h.receive(message(h)), h.receive(message(h, { body: '2回目' }))]);
  assert.equal(data(h).memos.length, 1); assert.equal(data(h).memos[0].body, '2回目');
  assert.equal(h.trace.filter(row => row[0] === 'quickPick').length, 1);
});

test('更新失敗では成功通知を出さず、再試行後に同じ反映先を更新できる', async () => {
  const h = await created(); mode(h, 'update'); const original = JSON.stringify(data(h));
  h.hooks.conceptWrite = () => { throw new Error('競合'); };
  await h.receive(message(h, { body: '再試行' })); assert.equal(JSON.stringify(data(h)), original); assert.equal(h.notices.at(-1)[0], 'error');
  delete h.hooks.conceptWrite; await h.receive(message(h, { body: '再試行' }));
  assert.equal(data(h).memos.length, 1); assert.equal(data(h).memos[0].body, '再試行');
});

test('複数候補の選択取消では保存しない', async () => {
  const h = await created(); mode(h, 'create'); await h.receive(message(h));
  h.hooks.quickPick = items => items[0].action ? items.find(item => item.action === 'update') : undefined;
  const count = writeCount(h); await h.receive(message(h)); assert.equal(writeCount(h), count);
});

test('実際の構想メモ保存でも出典と反映指紋が残り、直前の外部変更は競合として保護する', async t => {
  const fs = require('node:fs/promises'), path = require('node:path');
  const store = require('../src/data/concept-memo-store');
  const { createWritingMemoConceptCopier } = require('../src/stats/writing-memo-concept-copy');
  const root = path.resolve('.review-baseline/test-temp'); await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'writing-copy-'));
  t.after(async () => { assert.ok(directory.startsWith(root + path.sep)); await fs.rm(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'concept-memos.json');
  let concurrent = false;
  const copier = createWritingMemoConceptCopier({
    vscode: { window: { showQuickPick: async items => items.find(item => item.action === 'update'), showWarningMessage: async () => '上書き更新' } },
    readConceptMemos: store.readConceptMemos,
    writeConceptMemos: async (filePath, next) => {
      if (concurrent) {
        const current = await store.readConceptMemos(filePath);
        current.memos[0].body = '保存直前の外部編集'; await store.writeConceptMemos(filePath, current);
      }
      return store.writeConceptMemos(filePath, next);
    },
  });
  const input = { memoId: 'm', title: 'タイトル', body: '本文', excerpt: 'タイトル', filePath: 'one.txt', writingMemoFilePath: path.join(directory, 'writing-memos.json') };
  await copier.copy(file, input);
  let saved = await store.readConceptMemos(file);
  assert.equal(saved.memos[0].source.writingMemoFilePath, input.writingMemoFilePath);
  assert.match(saved.memos[0].source.writingMemoCopyFingerprint, /^[a-f0-9]{64}$/);
  const id = saved.memos[0].id;
  await copier.copy(file, { ...input, body: '更新本文' });
  saved = await store.readConceptMemos(file); assert.equal(saved.memos.length, 1); assert.equal(saved.memos[0].id, id); assert.equal(saved.memos[0].body, '更新本文');
  concurrent = true;
  await assert.rejects(copier.copy(file, { ...input, body: '上書きしない' }), error => error.code === 'conflict');
  saved = await store.readConceptMemos(file); assert.equal(saved.memos[0].body, '保存直前の外部編集');
});

test('反映ボタンは編集中の本文と保存元を送信し、未保存の入力を反映できる', () => {
  const vm = require('node:vm');
  const { makeStatsScript } = require('../src/stats/stats-html/stats-html-script');
  const script = makeStatsScript(), start = script.indexOf('      document.querySelectorAll("[data-writing-memo-copy-to-concept]")');
  const end = script.indexOf('      document.querySelectorAll("[data-writing-memo-edit-body]")', start);
  let click; const messages = [];
  const item = { body: '保存済み本文', writingMemoFilePath: 'work/writing-memos.json', filePath: 'one.txt', returnWorkId: 'A' };
  const button = { getAttribute: () => 'm', addEventListener: (_, fn) => { click = fn; } };
  vm.runInNewContext(script.slice(start, end), {
    document: { querySelectorAll: () => [button], querySelector: selector => selector.includes('edit-body') ? { value: '入力中の本文' } : { getAttribute: () => JSON.stringify(item) } },
    vscode: { postMessage: value => messages.push(value) },
  });
  click({ stopPropagation() {} });
  assert.equal(messages[0].body, '入力中の本文'); assert.equal(messages[0].writingMemoFilePath, item.writingMemoFilePath);
  assert.equal(messages[0].returnWorkId, 'A');
});

test('初回作成の途中で別の反映先が追加されていたら重複作成を中止する', async () => {
  const h = fixture(); await h.controller.open(); let reads = 0;
  h.hooks.conceptRead = () => {
    if (++reads === 2) h.conceptStores.set(destination(h), { memos: [{ id: 'external', source: { kind: 'writingMemo', memoId: 'm', filePath: 'one.txt' } }] });
  };
  await h.receive(message(h));
  assert.equal(writeCount(h), 0); assert.equal(data(h).memos[0].id, 'external'); assert.equal(h.notices.at(-1)[0], 'error');
});

test('次回から省略を選ぶと更新成功後に全体設定へ保存し、比較だけを省略する', async () => {
  const h = await created(); mode(h, 'update'); data(h).memos[0].body = '構想側編集';
  h.confirm('上書き更新して次回から省略'); await h.receive(message(h));
  assert.equal(h.config.confirmWritingMemoConceptOverwrite, false);
  const setting = h.trace.find(row => row[0] === 'config' && row[1] === 'confirmWritingMemoConceptOverwrite');
  assert.deepEqual(setting, ['config', 'confirmWritingMemoConceptOverwrite', false, 1]);
  assert.ok(h.trace.indexOf(setting) > h.trace.findLastIndex(row => row[0] === 'concept.write'));
  const warnings = h.trace.filter(row => row[0] === 'warning').length, picks = h.trace.filter(row => row[0] === 'quickPick').length;
  data(h).memos[0].body = 'もう一度編集'; h.confirm(undefined);
  await h.receive(message(h, { body: '2回目' }));
  assert.equal(data(h).memos[0].body, '2回目');
  assert.equal(h.trace.filter(row => row[0] === 'warning').length, warnings);
  assert.equal(h.trace.filter(row => row[0] === 'quickPick').length, picks + 1);
  h.config.confirmWritingMemoConceptOverwrite = true; data(h).memos[0].body = '再表示の確認';
  await h.receive(message(h));
  assert.equal(data(h).memos[0].body, '再表示の確認');
  assert.equal(h.trace.filter(row => row[0] === 'warning').length, warnings + 1);
});

test('通常の更新・比較確認の取消では省略設定を変更しない', async () => {
  for (const choice of ['上書き更新', undefined]) {
    const h = await created(); mode(h, 'update'); data(h).memos[0].body = '編集'; h.confirm(choice);
    await h.receive(message(h));
    assert.equal(h.trace.some(row => row[0] === 'config'), false);
  }
});

test('更新に失敗した場合は次回から省略の選択も保存しない', async () => {
  const h = await created(); mode(h, 'update'); data(h).memos[0].body = '編集'; h.confirm('上書き更新して次回から省略');
  h.hooks.conceptWrite = () => { throw new Error('保存失敗'); };
  await h.receive(message(h));
  assert.equal(data(h).memos[0].body, '編集'); assert.equal(h.config.confirmWritingMemoConceptOverwrite, undefined);
  assert.equal(h.trace.some(row => row[0] === 'config'), false);
});

test('省略設定の保存失敗は更新済みの内容を維持し、設定の失敗だけを知らせる', async () => {
  const h = await created(); mode(h, 'update'); data(h).memos[0].body = '編集'; h.confirm('上書き更新して次回から省略');
  h.hooks.config = () => { throw new Error('設定失敗'); };
  await h.receive(message(h));
  assert.equal(data(h).memos[0].body, '本文'); assert.equal(h.config.confirmWritingMemoConceptOverwrite, undefined);
  assert.ok(h.notices.some(row => row[0] === 'warning' && row[1].includes('更新は完了しましたが')));
  assert.equal(h.notices.at(-1)[0], 'info');
});

test('比較を省略しても複数候補の選択取消と外部変更の保護は維持する', async () => {
  const h = await created(); mode(h, 'create'); await h.receive(message(h)); h.config.confirmWritingMemoConceptOverwrite = false;
  h.hooks.quickPick = items => items[0].action ? items.find(item => item.action === 'update') : undefined;
  let count = writeCount(h); await h.receive(message(h)); assert.equal(writeCount(h), count);
  h.hooks.quickPick = items => {
    if (items[0].action) return items.find(item => item.action === 'update');
    data(h).memos[0].body = '選択中の変更'; return items[0];
  };
  await h.receive(message(h)); assert.equal(writeCount(h), count); assert.equal(h.notices.at(-1)[0], 'error');
});

test('比較確認の設定は初期ON・全作品共通で、VS Code設定から戻せる', () => {
  const settings = require('../package.json').contributes.configuration.properties;
  assert.equal(settings['mojigoto.confirmWritingMemoConceptOverwrite'].default, true);
  assert.equal(settings['mojigoto.confirmWritingMemoConceptOverwrite'].scope, 'application');
  assert.match(settings['mojigoto.confirmWritingMemoConceptOverwrite'].markdownDescription, /ONに戻すと比較確認を再表示/);
});

test('設定ONでは構想側が未編集でも同じ内容でも毎回比較を表示する', async () => {
  const h = await created(); mode(h, 'update'); h.config.confirmWritingMemoConceptOverwrite = true;
  await h.receive(message(h, { body: '執筆側だけの変更' }));
  await h.receive(message(h, { body: '執筆側だけの変更' }));
  const warnings = h.trace.filter(row => row[0] === 'warning');
  assert.equal(warnings.length, 2); assert.equal(data(h).memos.length, 1);
  assert.ok(warnings.every(row => row[2].detail.includes('現在の内容と反映する内容')));
});

test('設定ONの未編集コピーでも比較取消なら上書きせず、OFFなら比較だけを省略する', async () => {
  const h = await created(); mode(h, 'update'); h.confirm(undefined);
  await h.receive(message(h, { body: '更新しない' }));
  assert.equal(data(h).memos[0].body, '本文'); assert.equal(writeCount(h), 1);
  h.config.confirmWritingMemoConceptOverwrite = false;
  await h.receive(message(h, { body: '確認省略で更新' }));
  assert.equal(data(h).memos[0].body, '確認省略で更新');
  assert.equal(h.trace.filter(row => row[0] === 'warning').length, 1);
  assert.equal(h.trace.filter(row => row[0] === 'quickPick').length, 2);
});
