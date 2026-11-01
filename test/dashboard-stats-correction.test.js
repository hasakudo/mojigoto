const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardCorrectionHarness: fixture } = require('./fixtures/dashboard-correction-harness.cjs');
const operations = h => h.trace.filter(row => row[0] === 'operation');
const names = h => h.trace.map(row => row[0]);
async function ready(options) { const h = fixture(options); await h.controller.open(); return h; }

test('再集計は現在値・古い履歴の件数を確認後に実行し、再描画後に結果を案内する', async () => {
  const h = await ready(); await h.receive();
  assert.deepEqual(operations(h)[0], ['operation', 'rebase', true]); assert.equal(h.memory.total, 12345);
  const warning = h.trace.find(row => row[0] === 'warning')[1]; assert.match(warning, /12,345/); assert.match(warning, /3ファイル/); assert.match(warning, /2件/);
  assert.deepEqual(names(h).slice(-4), ['operation', 'committed', 'render', 'info']);
  assert.match(h.notices.at(-1)[1], /古いファイル履歴を2件整理/);
});

test('差分補正は整数の入力を検証し、正・負・0を数値で渡す', async () => {
  for (const value of ['1250', '-25', ' 0 ']) {
    const h = await ready(); h.pick('delta'); h.input(value); await h.receive();
    assert.deepEqual(operations(h)[0], ['operation', 'delta', true, Number(value)]);
    const validate = h.inputs[0].validateInput;
    for (const invalid of ['', '1.5', 'abc', '+1']) assert.equal(validate(invalid), '整数で入力してください。');
    for (const valid of ['1', '-1', ' 0 ']) assert.equal(validate(valid), null);
  }
});

test('リセットは今日／全期間を選び、原稿に触れない案内の確認後に指定範囲を渡す', async () => {
  for (const scope of ['today', 'all']) {
    const h = await ready(); h.pick('reset'); h.scope(scope); await h.receive();
    assert.deepEqual(operations(h)[0], ['operation', 'reset', true, scope]);
    assert.match(h.trace.filter(row => row[0] === 'pick')[1][2].placeHolder, /原稿ファイルと作品設定は削除されません/);
    assert.match(h.trace.find(row => row[0] === 'warning')[1], /原稿ファイルは変更せず/);
  }
});

test('取り消し候補はバックアップがあるときだけ表示し、確認後に復元する', async () => {
  const h = await ready(); h.pick('undo'); await h.receive(); assert.equal(h.memory.operation, 'undo');
  const absent = await ready(); absent.status.hasBackup = false; absent.pick('undo'); await absent.receive();
  assert.equal(absent.trace.find(row => row[0] === 'pick')[1].some(item => item.action === 'undo'), false);
  assert.equal(operations(absent).length, 0);
});

test('補正方式・入力・リセット範囲・各確認の取消では補正と再描画をしない', async () => {
  for (const mode of ['pick', 'input', 'scope', 'rebase', 'delta', 'reset', 'undo']) {
    const h = await ready();
    if (mode === 'pick') h.pick(undefined);
    else if (mode === 'input') { h.pick('delta'); h.input(undefined); }
    else if (mode === 'scope') { h.pick('reset'); h.scope(undefined); }
    else { h.pick(mode); h.confirm(undefined); }
    await h.receive(); assert.equal(operations(h).length, 0); assert.equal(h.states.length, 1);
    assert.equal(h.trace.some(row => row[0] === 'send'), false);
  }
});

test('状態取得・補正処理の失敗は通知し、成功とSheets送信を行わない', async () => {
  for (const mode of ['status', 'operation']) {
    const h = await ready(); h.hooks[mode] = () => { throw new Error('補正境界失敗'); }; await h.receive();
    assert.equal(h.notices.at(-1)[0], 'error'); assert.match(h.notices.at(-1)[1], /補正境界失敗/);
    assert.equal(h.states.length, 1); assert.equal(h.memory.operation, undefined);
    assert.equal(h.trace.some(row => row[0] === 'send'), false);
  }
});

test('補正後の再描画失敗でも補正済みの結果を巻き戻さず、成功案内は出さない', async () => {
  const h = await ready(); h.hooks.build = () => { throw new Error('表示失敗'); }; await h.receive();
  assert.equal(h.memory.operation, 'rebase'); assert.equal(h.notices.at(-1)[0], 'error');
  assert.equal(h.trace.some(row => row[0] === 'info'), false);
});

test('Sheets送信は有効かつ送信関数がある場合だけ提案し、選ばない限り送らない', async () => {
  for (const sheetsEnabled of [false, true]) for (const withSender of [false, true]) {
    const h = await ready({ withSender }); h.config.sheetsEnabled = sheetsEnabled; await h.receive();
    const info = h.trace.find(row => row[0] === 'info');
    assert.equal(info.includes('Sheetsへ補正値を送信'), sheetsEnabled && withSender);
    assert.equal(h.trace.some(row => row[0] === 'send'), false);
  }
});

test('送信を選んだ場合だけ補正・再描画・案内の後に送信し、送信失敗も補正を保持する', async () => {
  for (const fail of [false, true]) {
    const h = await ready(); h.config.sheetsEnabled = true; h.sendOption(true);
    if (fail) h.hooks.send = () => { throw new Error('送信失敗'); };
    await h.receive();
    assert.equal(h.memory.operation, 'rebase'); assert.ok(names(h).indexOf('send') > names(h).lastIndexOf('render'));
    assert.equal(h.notices.at(-1)[0], fail ? 'warning' : 'info');
    if (!fail) assert.match(h.notices.at(-1)[1], /9,999文字・今日 125文字/);
  }
});

test('補正中にDashboardを閉じても処理完了後に破棄済み画面へ書き込まない', async () => {
  const h = await ready(); h.hooks.operation = () => h.panels[0].dispose(); await h.receive();
  assert.equal(h.memory.operation, 'rebase'); assert.equal(h.states.length, 1);
  assert.equal(h.trace.some(row => row[0] === 'post'), false);
});
