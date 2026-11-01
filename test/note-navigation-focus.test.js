const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createPreviewClientHarness } = require("./fixtures/note-preview-harness.cjs");
const { getPreviewLayoutScript } = require("../src/views/note-webview/script-preview-layout");
const { getEventsScript } = require("../src/views/note-webview/script-events");
const { getViewStateScript } = require("../src/views/note-webview/script-view-state");
const { getNavigationScript } = require("../src/views/note-webview/script-navigation");
const { getDisplaySyncScript } = require("../src/views/note-webview/script-display-sync");

test("非アクティブなプレビューの最初のクリックを、focus時の再描画で失わない", () => {
  for (const mode of ["list", "board"]) {
    const h = createPreviewClientHarness({ groups: [{ id: "g", items: [{ id: "i", kind: "entry", heading: "項目", memo: { body: "メモ" } }] }] });
    const windows = {}, documents = {}; let restores = 0;
    h.context.window = { addEventListener: (type, fn) => { windows[type] = fn; } };
    h.context.document = { ...h.context.document, hidden: true, addEventListener: (type, fn) => { documents[type] = fn; } };
    h.context.positionMoreMenu = () => {};
    h.context.loadScrollPositions = () => { restores++; };
    vm.runInContext(getPreviewLayoutScript() + getEventsScript(), h.context);
    h.context.registerMessageEvents = () => {};
    h.context.registerWindowEvents();
    h.context.previewMode = mode; h.context.renderPreview(); h.flush();
    const root = mode === "list" ? h.nodes.previewRoot : h.nodes.previewBoardRoot;
    const memoBeforeClick = root.details[0]; memoBeforeClick.open = true;
    h.context.stabilizePreviewRender(); h.flush(); assert.equal(restores, 0);
    // Activation occurs between pointer-down and click in the retained Webview.
    h.context.document.hidden = false; windows.focus(); documents.visibilitychange(); h.flush();
    assert.equal(root.details[0], memoBeforeClick);
    assert.equal(memoBeforeClick.open, true);
    const click = h.event(mode === "list" ? { navId: "item:i" } : { action: "jumpBoardItem", itemId: "i" });
    if (mode === "list") h.nodes.previewRoot.onclick(click); else h.context.handleBoardClick(click);
    assert.deepEqual(h.calls.filter(([type]) => type === "navigate"), [["navigate", "item:i"]]);
    root.scrollTop = 600; windows.focus(); windows.pageshow(); windows.resize(); h.flush();
    assert.equal(root.details[0], memoBeforeClick);
    assert.equal(root.scrollTop, 600); assert.equal(restores, 1);
  }
});

test("表示待ち中に再び非表示になった場合は、次の表示まで初期位置の復元を保留する", () => {
  const frames = []; let restores = 0, layoutChecks = 0;
  const context = vm.createContext({ document: { hidden: false }, requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    ensurePreviewScrollInRange: () => layoutChecks++, loadScrollPositions: () => restores++ });
  vm.runInContext(getPreviewLayoutScript(), context);
  context.stabilizePreviewRender(); context.stabilizePreviewRender(); assert.equal(frames.length, 1);
  context.document.hidden = true; frames.shift()(); assert.equal(restores, 0);
  context.document.hidden = false; context.stabilizePreviewRender(); frames.shift()();
  assert.equal(restores, 1); assert.equal(layoutChecks, 1);
});

function navigationContext() {
  const frames = [], editor = { scrollTop: 0, scrollHeight: 3000, clientHeight: 300 }, preview = { scrollTop: 0, scrollHeight: 3000, clientHeight: 300 };
  const context = vm.createContext({ localStorage: { getItem: () => JSON.stringify({ editor: 400, preview: 80 }) }, scrollStorageKey: "note",
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, setTimeout() {} });
  vm.runInContext(getViewStateScript() + getNavigationScript(), context);
  context.getEditorScrollEl = () => editor; context.getPreviewScrollEl = () => preview;
  return { context, editor, preview, flush() { while (frames.length) frames.shift()(); } };
}

test("編集欄からプレビューへの最初のジャンプを、遅れて届く初期スクロール復元で戻さない", () => {
  for (const mode of ["list", "board"]) {
    const h = navigationContext(), c = h.context;
    c.loadScrollPositions(); c.previewMode = mode;
    c.previewRoot = { querySelector: () => ({ classList: { add() {}, remove() {} } }) };
    c.scrollPreviewElementIntoView = () => { h.preview.scrollTop = 1200; };
    c.scrollPreviewBoardElementIntoView = () => { h.preview.scrollTop = 1200; return true; };
    c.scrollToPreviewNavId("item:i"); h.flush();
    assert.equal(h.preview.scrollTop, 1200); assert.equal(h.editor.scrollTop, 400);
  }
});

test("項目・項目メモ・区分への初回移動も、待機中の編集位置復元より優先する", () => {
  for (const kind of ["item", "memo", "divider"]) {
    const h = navigationContext(), c = h.context;
    const target = { closest: () => ({ dataset: { groupId: "g" } }), classList: { add() {}, remove() {} },
      querySelector: () => ({ focus() {} }) };
    c.groupsRoot = { querySelector: () => target };
    c.revealEditorPaneBeforeJump = fn => fn(); c.openGroup = () => false; c.ensureGroupExpanded = () => false;
    c.renderGroups = () => {}; c.renderPreview = () => {};
    c.setNoteItemMemoOpen = () => {};
    c.scrollEditorElementIntoView = () => { h.editor.scrollTop = 1500; };
    c.loadScrollPositions();
    if (kind === "item") c.scrollToEditorItem("i");
    else if (kind === "memo") c.openItemMemoById("g", "i");
    else c.scrollToEditorDivider("g", "i");
    h.flush();
    assert.equal(h.editor.scrollTop, 1500); assert.equal(h.preview.scrollTop, 80);
  }
});

test("表示用プレビューの目次からの1回の受信で、表示待ち後も編集位置へ移動する", () => {
  const h = navigationContext(), c = h.context; let receive, focusCount = 0;
  const target = { classList: { add() {}, remove() {} }, querySelector: () => ({ focus: () => focusCount++ }) };
  c.window = { addEventListener: (_type, fn) => { receive = fn; } }; c.document = { getElementById: () => null };
  c.state = { groups: [{ id: "g", items: [{ id: "i" }] }] }; c.closeBoard = () => {};
  c.groupsRoot = { querySelector: () => target }; c.revealEditorPaneBeforeJump = fn => fn(); c.openGroup = () => false;
  c.scrollEditorElementIntoView = () => { h.editor.scrollTop = 1600; }; c.setStatus = () => {};
  vm.runInContext(getDisplaySyncScript(), c);
  c.loadScrollPositions(); receive({ data: { type: "noteDisplay.focus", target: { groupId: "g", itemId: "i" } } });
  // Animation frames run after the target Webview becomes visible.
  assert.equal(h.editor.scrollTop, 0); h.flush();
  assert.equal(h.editor.scrollTop, 1600); assert.equal(focusCount, 1);
});
