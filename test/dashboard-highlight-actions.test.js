const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardHighlightHarness: fixture } = require('./fixtures/dashboard-highlight-harness.cjs');
async function open(options) { const h = fixture(options); await h.controller.open(); h.trace.length = 0; return h; }

test('Dashboard: ハイライト切替は状態更新・原稿装飾・再描画の順に実行する', async () => {
  const h = await open(); await h.receive({ type: 'toggleHighlights' }); await h.drain();
  assert.deepEqual(h.trace.map(x => x[0]), ['highlight.toggle', 'highlight.refresh', 'build', 'html']);
  const unavailable = await open({ toggleAvailable: false, managerAvailable: false });
  await unavailable.receive({ type: 'toggleHighlights' }); await unavailable.drain();
  assert.deepEqual(unavailable.trace.map(x => x[0]), ['build', 'html']);
});

test('Dashboard: 装飾切替はWorkspaceへ保存し原稿なしなら装飾を消去する', async () => {
  for (const available of [true, false]) {
    const h = await open({ editorAvailable: available });
    await h.receive({ type: 'toggleHighlightDecorations' });
    assert.equal(h.config.highlightDecorationsEnabled, false);
    assert.deepEqual(h.trace.find(x => x[0] === 'config.update'), ['config.update', 'mojigoto', 'highlightDecorationsEnabled', false, 2]);
    assert.ok(h.trace.some(x => x[0] === (available ? 'highlight.refresh' : 'highlight.clear')));
    await h.receive({ type: 'toggleHighlightDecorations' }); assert.equal(h.config.highlightDecorationsEnabled, true);
  }
});

test('Dashboard: 装飾設定・装飾更新・再描画の失敗は既存のエラー表示へ渡す', async () => {
  for (const stage of ['config', 'highlight', 'build']) {
    const h = await open(); h.hooks[stage] = () => { throw new Error('境界エラー'); };
    await h.receive({ type: 'toggleHighlightDecorations' });
    assert.match(h.trace.find(x => x[0] === 'error')[1], /ハイライト装飾の切り替えに失敗.*境界エラー/);
  }
});

test('Dashboard: 再分析は原稿の装飾を更新し、対象がなければコマンドを実行する', async () => {
  for (const options of [{}, { editorAvailable: false }, { managerAvailable: false }]) {
    const h = await open(options); await h.receive({ type: 'refreshHighlights' }); await h.drain();
    assert.equal(h.trace[0][0], options.editorAvailable === false || options.managerAvailable === false ? 'command' : 'highlight.refresh');
    assert.equal(h.trace.at(-1)[0], 'html');
  }
});

test('Dashboard: グループ切替は名前と有効状態を渡し設定画面はコマンドで開く', async () => {
  const h = await open(); await h.receive({ type: 'toggleHighlightGroup', name: '人物', enabled: false }); await h.drain();
  assert.deepEqual(h.trace[0], ['highlight.group', '人物', false]);
  h.trace.length = 0; await h.receive({ type: 'openHighlightSettings' });
  assert.deepEqual(h.trace, [['command', 'mojigoto.openHighlightSettings']]);
  const unavailable = await open({ groupAvailable: false }); await unavailable.receive({ type: 'toggleHighlightGroup' }); await unavailable.drain();
  assert.deepEqual(unavailable.trace.map(x => x[0]), ['build', 'html']);
});

test('Dashboard: ハイライト箇所へ原稿を開き選択範囲と中央表示を設定する', async () => {
  const h = await open(); await h.receive({ type: 'highlightJump', startLine: 2, startCharacter: 3, endLine: 4, endCharacter: 5 });
  const trace = JSON.parse(JSON.stringify(h.trace));
  assert.deepEqual(trace[0], ['document.show', true, { preview: false, viewColumn: 3, preserveFocus: false }]);
  assert.deepEqual(trace[1], ['selection', { start: { line: 2, character: 3 }, end: { line: 4, character: 5 } }]);
  assert.equal(trace[2][0], 'reveal'); assert.equal(trace[2][2], 1); assert.equal(trace.length, 3);
});

test('Dashboard: ジャンプの対象なし・表示失敗・選択先なしを扱う', async () => {
  const absent = await open({ editorAvailable: false }); await absent.receive({ type: 'highlightJump' }); assert.equal(absent.trace.length, 0);
  const failure = await open(); failure.hooks.show = () => { throw new Error('表示失敗'); };
  await failure.receive({ type: 'highlightJump' }); assert.match(failure.trace.at(-1)[1], /ハイライト箇所へ移動できません/);
  const inactive = await open(); inactive.hooks.show = () => { inactive.vscode.window.activeTextEditor = null; };
  await inactive.receive({ type: 'highlightJump' }); assert.deepEqual(inactive.trace.map(x => x[0]), ['document.show']);
});

test('Dashboard: タブ終了後に完了した操作は破棄済みの画面を再描画しない', async () => {
  const h = await open(); h.hooks.toggle = () => h.panels[0].dispose();
  await h.receive({ type: 'toggleHighlights' }); await h.drain();
  assert.ok(!h.trace.some(x => x[0] === 'html')); assert.equal(h.controller.getPanel(), null);
});
