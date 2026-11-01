const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardSettingsHarness } = require('./fixtures/dashboard-settings-harness.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('Dashboardの保存設定3種は保存を待って応答し、全画面の再描画はしない', async () => {
  const h = createDashboardSettingsHarness(); await h.controller.open();
  for (const key of Object.keys(h.settings)) {
    const pending = deferred(); h.hooks.setting = () => pending.promise;
    const enabled = !h.settings[key];
    const action = h.receive({ type: 'updateWebviewSaveSetting', key, enabled });
    assert.equal(h.posts.length, 0);
    assert.equal(h.trace.at(-1)[0], 'setting.start');
    pending.resolve(); await action;
    assert.equal(h.posts.at(-1).settings[key], enabled);
    assert.equal(h.posts.at(-1).type, 'webviewSaveSettingResult');
    assert.equal(h.states.length, 1);
    assert.ok(h.trace.find(entry => entry[0] === 'setting.start' && entry[1] === true));
    h.posts.length = 0;
  }
});

test('設定保存失敗は実際の設定とエラーを返し、再試行できる', async () => {
  const h = createDashboardSettingsHarness(); await h.controller.open();
  h.hooks.setting = () => { throw new Error('保存失敗'); };
  await h.receive({ type: 'updateWebviewSaveSetting', key: 'webviewAutoSaveEnabled', enabled: false });
  assert.equal(h.posts.at(-1).error, '保存失敗');
  assert.equal(h.posts.at(-1).settings.webviewAutoSaveEnabled, true);
  delete h.hooks.setting;
  await h.receive({ type: 'updateWebviewSaveSetting', key: 'webviewAutoSaveEnabled', enabled: false });
  assert.equal(h.posts.at(-1).settings.webviewAutoSaveEnabled, false);
  assert.equal(h.posts.at(-1).error, undefined);
  h.changed('noteMemoAutoSyncEnabled');
  assert.equal(h.posts.at(-1).type, 'webviewSaveSettingsChanged');
  assert.equal(h.states.length, 1);
});

test('Markdown生成・ON/OFFの途中で作品が変わると成功・失敗とも前作品の応答を送らない', async () => {
  for (const action of ['enabled', 'regenerate']) for (const fail of [false, true]) {
    const h = createDashboardSettingsHarness(); await h.controller.open();
    h.values.set(h.current(), true);
    const pending = deferred(); h.hooks.markdown = () => pending.promise;
    const oldDir = h.current(), work = h.receive(h.message({ action }));
    h.switchWork(); await h.controller.refresh();
    if (fail) pending.reject(new Error('生成失敗')); else pending.resolve();
    await work;
    assert.equal(h.posts.length, 0);
    assert.equal(h.calls[0][0], oldDir);
    assert.equal(h.states.at(-1).webMarkdown.enabled, false);
    h.markdownChanged(oldDir, { error: '古い通知' });
    assert.equal(h.posts.length, 0);
  }
});

test('生成OFF時・不正な操作は実行せずエラー応答し、失敗後も操作できる', async () => {
  const h = createDashboardSettingsHarness(); await h.controller.open();
  for (const overrides of [{ action: 'regenerate' }, { action: 'unknown' }, { enabled: 'true' }]) {
    await h.receive(h.message(overrides));
    assert.equal(h.calls.length, 0); assert.match(h.posts.at(-1).status.error, /操作を確認/);
  }
  h.hooks.markdown = () => { throw new Error('書込失敗'); };
  await h.receive(h.message());
  assert.equal(h.posts.at(-1).status.error, '書込失敗');
  assert.equal(h.posts.at(-1).status.enabled, false);
  delete h.hooks.markdown;
  await h.receive(h.message()); assert.equal(h.posts.at(-1).status.enabled, true);
  assert.equal(h.posts.at(-1).status.error, undefined);
});

test('設定画面の入口は同じ検索条件で開き、失敗を呼出元へ伝える', async () => {
  const h = createDashboardSettingsHarness(); await h.controller.open();
  await h.receive({ type: 'openBackupSettings' }); await h.receive({ type: 'openMojigotoSettings' });
  assert.deepEqual(h.commands, [['workbench.action.openSettings', '@ext:hasakudo.mojigoto backup'], ['workbench.action.openSettings', '@ext:hasakudo.mojigoto']]);
  h.hooks.command = () => { throw new Error('設定画面失敗'); };
  await assert.rejects(h.receive({ type: 'openBackupSettings' }), /設定画面失敗/);
  assert.equal(h.posts.length, 0); assert.equal(h.states.length, 1);
});

test('作品未選択・表示作品不一致・古い描画では生成設定と応答を変更しない', async () => {
  for (const kind of ['noWork', 'workChanged', 'renderChanged', 'keyChanged']) {
    const h = createDashboardSettingsHarness(); await h.controller.open();
    const message = h.message();
    if (kind === 'noWork') h.switchWork('');
    if (kind === 'workChanged') h.switchWork();
    if (kind === 'renderChanged') message.renderId = 'old';
    if (kind === 'keyChanged') message.workKey = 'other';
    await h.receive(message); assert.equal(h.calls.length, 0); assert.equal(h.posts.length, 0);
  }
});
