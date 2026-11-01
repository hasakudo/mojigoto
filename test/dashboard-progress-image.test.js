const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardProgressImageHarness: fixture, IMAGE_KEY, bytes } = require('./fixtures/dashboard-progress-image-harness.cjs');
const names = h => h.trace.map(entry => entry[0]);

test('SNS画像保存はPNGをそのまま書き、保存先を記憶してから結果と完了を通知する', async () => {
  const h = fixture(); await h.controller.open(); await h.receive(h.message());
  assert.equal(h.written[0][1], bytes.toString('base64'));
  assert.equal(h.storage.get(IMAGE_KEY), 'file:///D:/exports');
  assert.deepEqual(JSON.parse(JSON.stringify(h.posts.at(-1))), { type: 'saveProgressShareImage.result', ok: true, cancelled: false, fileName: 'custom.png', error: '' });
  assert.deepEqual(names(h).slice(-5), ['dialog', 'write', 'remember', 'post', 'info']);
  assert.equal(h.states.length, 1);
});

test('初期保存先は記憶したURIを優先し、無効・未指定ならワークスペースを使う', async () => {
  for (const stored of ['', 'invalid', 'file:///D:/past', 'vscode-remote://ssh-remote+host/home/export']) {
    const h = fixture(); await h.controller.open(); if (stored) h.storage.set(IMAGE_KEY, stored);
    h.select(undefined); await h.receive(h.message());
    const options = h.trace.find(entry => entry[0] === 'dialog')[1];
    const root = !stored || stored === 'invalid' ? 'file:///C:/workspace' : stored;
    assert.equal(options.defaultUri, root + '/もじごと進捗_20261001_星の物語.png');
    assert.equal(h.written.length, 0);
  }
});

test('ワークスペースなしでも保存でき、作品名を非表示ならファイル名にも含めない', async () => {
  const h = fixture(); await h.controller.open(); const workspace = h.workspace[0]; h.workspace.length = 0;
  await h.receive(h.message({ titleVisible: false }));
  assert.equal(h.trace.find(entry => entry[0] === 'dialog')[1].defaultUri, undefined);
  h.storage.clear(); h.workspace.push(workspace);
  await h.receive(h.message({ titleVisible: false }));
  const dialog = h.trace.filter(entry => entry[0] === 'dialog').at(-1)[1];
  assert.match(dialog.defaultUri, /_作品\.png$/); assert.doesNotMatch(dialog.defaultUri, /星の物語/);
});

test('作品名の禁止文字・未設定の作品名・不正日付のファイル名規則を維持する', async () => {
  const h = fixture(); await h.controller.open(); h.title('星:空/海?');
  await h.receive(h.message({ date: 'invalid' }));
  assert.match(h.trace.find(entry => entry[0] === 'dialog')[1].defaultUri, /20261022_星 空 海\.png$/);
  h.title(''); h.workName('fallback'); await h.receive(h.message());
  assert.match(h.trace.filter(entry => entry[0] === 'dialog').at(-1)[1].defaultUri, /_fallback\.png$/);
});

test('取消は保存や設定変更をせず、エラー通知も出さない', async () => {
  const h = fixture(); await h.controller.open(); h.select(undefined); await h.receive(h.message());
  assert.equal(h.written.length, 0); assert.equal(h.storage.has(IMAGE_KEY), false);
  assert.equal(h.posts.at(-1).cancelled, true); assert.equal(h.posts.at(-1).ok, false); assert.equal(h.notices.length, 0);
});

test('不正な画像はダイアログ前に失敗を返し、PNG以外を保存しない', async () => {
  for (const dataUrl of ['data:image/jpeg;base64,AAAA', 'data:image/png;base64,', 'data:image/png;base64,AAAA']) {
    const h = fixture(); await h.controller.open(); await h.receive(h.message({ dataUrl }));
    assert.equal(h.trace.some(entry => entry[0] === 'dialog'), false); assert.equal(h.written.length, 0);
    assert.equal(h.posts.at(-1).ok, false); assert.ok(h.posts.at(-1).error); assert.equal(h.notices.at(-1)[0], 'error');
  }
});

test('ダイアログ・ファイル保存・保存先記憶の失敗は成功通知を出さず、失敗後は再試行できる', async () => {
  for (const stage of ['dialog', 'write', 'remember']) {
    const h = fixture(); await h.controller.open(); h.hooks[stage] = () => { throw new Error('保存失敗'); };
    await h.receive(h.message());
    assert.equal(h.posts.at(-1).ok, false); assert.equal(h.posts.at(-1).error, '保存失敗');
    assert.equal(h.written.length, stage === 'remember' ? 1 : 0); assert.equal(h.notices.at(-1)[0], 'error');
    delete h.hooks[stage]; await h.receive(h.message()); assert.equal(h.posts.at(-1).ok, true);
  }
});

test('リモート保存先のscheme・authorityを残し、記憶する親URIのquery・fragmentを除く', async () => {
  const h = fixture(); await h.controller.open(); h.select('vscode-remote://ssh-remote+host/home/share/image.png?x=1#fragment');
  await h.receive(h.message());
  assert.equal(h.storage.get(IMAGE_KEY), 'vscode-remote://ssh-remote+host/home/share'); assert.equal(h.posts.at(-1).fileName, 'image.png');
});

test('保存ダイアログ中に作品が変わってもファイル名は選択開始時の作品を使う', async () => {
  const h = fixture(); await h.controller.open(); h.hooks.dialog = () => h.title('切替後');
  await h.receive(h.message());
  assert.match(h.trace.find(entry => entry[0] === 'dialog')[1].defaultUri, /星の物語/);
  assert.equal(h.posts.at(-1).ok, true);
});

test('保存途中にDashboardを閉じても書込みは完了し、破棄済みパネルへ応答しない', async () => {
  const h = fixture(); await h.controller.open(); h.hooks.write = () => h.panels[0].dispose();
  await h.receive(h.message());
  assert.equal(h.written.length, 1); assert.equal(h.storage.has(IMAGE_KEY), true); assert.equal(h.posts.length, 0);
});
