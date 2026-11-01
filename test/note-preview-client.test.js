const test = require("node:test");
const assert = require("node:assert/strict");
const { createPreviewClientHarness, PreviewElement } = require("./fixtures/note-preview-harness.cjs");
const note = () => ({ title: "ノート", groups: [
  { id: "g", title: "大分類", items: [
    { id: "lead", kind: "entry", heading: "区分なし", body: "本文" },
    { id: "d1", kind: "divider", label: "区分1", value: "補足" },
    { id: "a", kind: "entry", heading: "名前", headingRuby: "なまえ", body: "｜本文《ほんぶん》", memo: { body: "項目メモ", tags: ["資料"] }, relatedReferences: [{}] },
    { id: "d2", kind: "divider", label: "空の区分" },
    { id: "d3", kind: "divider", label: "区分3" },
    { id: "b", kind: "entry", heading: "最後", body: "終わり" },
  ] }, { id: "other", title: "移動先", items: [] },
] });
const ids = (h, group = 0) => Array.from(h.context.state.groups[group].items, item => item.id);

test("通常とボードの描画はルビ・メモ・関連リンク・区分を維持し、表示モードを切り替える", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  c.renderPreview(); h.flush();
  assert.match(h.nodes.previewRoot.innerHTML, /<rt>なまえ/);
  assert.match(h.nodes.previewRoot.innerHTML, /<rt>ほんぶん/);
  assert.match(h.nodes.previewRoot.innerHTML, /項目メモを編集/);
  assert.match(h.nodes.previewRoot.innerHTML, /関連ノート 1件/);
  assert.match(h.nodes.previewCountsEl.textContent, /大分類 2 \/ 区分 3 \/ 項目 3/);
  c.previewMode = "board"; c.renderPreview(); h.flush();
  assert.equal(h.nodes.previewRoot.hidden, true);
  assert.equal(h.nodes.previewBoardRoot.hidden, false);
  assert.match(h.nodes.previewBoardRoot.innerHTML, /区分なし/);
  assert.match(h.nodes.previewBoardRoot.innerHTML, /この区分に項目はありません/);
  c.previewMode = "list"; c.renderPreview();
  assert.equal(h.nodes.previewBoardRoot.hidden, true);
  assert.equal(h.nodes.previewRoot.hidden, false);
});

test("通常プレビューの並べ替え・別大分類への移動は保存対象と表示を更新する", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  h.nodes.previewRoot.onclick(h.event({ action: "previewMoveItemUp", groupId: "g", itemId: "a" }));
  assert.deepEqual(ids(h).slice(0, 3), ["lead", "a", "d1"]);
  assert.equal(h.calls.filter(([type]) => type === "dirty").length, 1);
  c.moveItemToPositionFromPreview("g", "a", "other", "0");
  assert.deepEqual(ids(h, 1), ["a"]);
  assert.equal(ids(h).includes("a"), false);
  assert.match(h.nodes.previewRoot.innerHTML, /名前/);
  assert.ok(h.calls.some(([type]) => type === "renderEditor"));
  const before = JSON.stringify(c.state);
  c.moveItemToPositionFromPreview("other", "a", "g", "invalid");
  assert.equal(JSON.stringify(c.state), before);
});

test("通常プレビューは移動選択の変更を保持し、項目メモ操作とナビゲーションを区別する", () => {
  const h = createPreviewClientHarness(note()), root = h.nodes.previewRoot;
  root.onclick(h.event({ action: "previewToggleMovePicker", groupId: "g", itemId: "a" }));
  assert.equal(h.context.movePickerState.itemId, "a");
  const change = h.event({ role: "previewMoveTargetGroup", groupId: "g", itemId: "a" }); change.target.value = "other";
  root.onchange(change);
  assert.equal(h.context.movePickerState.targetGroupId, "other");
  root.onclick(h.event({ action: "openPreviewItemMemo", itemId: "a" }));
  root.onclick(h.event({ navId: "item:a" }));
  assert.deepEqual(h.calls.filter(([type]) => type === "memo" || type === "navigate"), [["memo", "a"], ["navigate", "item:a"]]);
  const blocked = h.event({ navId: "item:b" }); blocked.target.interactive = true; root.onclick(blocked);
  assert.equal(h.calls.filter(([type]) => type === "navigate").length, 1);
});

test("再描画でメモの開閉とスクロール位置を維持し、検索の一致なしを表示する", () => {
  for (const mode of ["list", "board"]) {
    const h = createPreviewClientHarness(note()), c = h.context; c.previewMode = mode;
    c.renderPreview(); h.flush();
    const root = mode === "list" ? h.nodes.previewRoot : h.nodes.previewBoardRoot;
    root.details[0].open = true; root.scrollLeft = 120; root.scrollTop = 300;
    if (mode === "list") root.handlers.toggle({ target: root.details[0] });
    c.state.groups[0].items[2].body += "更新";
    c.renderPreview(); h.flush();
    assert.equal(root.details[0].open, true);
    assert.equal(root.scrollLeft, 120); assert.equal(root.scrollTop, 300);
    c.searchQuery = "存在しない文字列"; c.renderPreview(); h.flush();
    assert.match(root.innerHTML, /該当する項目はありません/);
  }
});

test("ボードは項目と区分配下を別大分類へ移動でき、検索中は移動しない", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  assert.equal(c.moveBoardItemToPosition("g", "lead", "other", "start"), true);
  assert.deepEqual(ids(h, 1), ["lead"]);
  assert.equal(c.moveBoardDividerBlockToPosition("g", "d1", "other", "end"), true);
  assert.deepEqual(ids(h, 1), ["lead", "d1", "a"]);
  c.searchQuery = "名前";
  const before = JSON.stringify(c.state);
  assert.equal(c.moveBoardItemToPosition("other", "a", "g", "end"), false);
  assert.equal(c.moveBoardDividerBlockToPosition("other", "d1", "g", "end"), false);
  assert.equal(JSON.stringify(c.state), before);
  assert.ok(h.calls.some(([type, message]) => type === "status" && message.includes("検索")));
});

test("ボード内のドラッグ移動は区分配下・空区分の所属を維持する", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  assert.equal(c.moveBoardDividerBlockWithinGroup("g", "d1", "d3", "after"), true);
  assert.deepEqual(ids(h), ["lead", "d2", "d3", "b", "d1", "a"]);
  assert.equal(c.moveBoardItemIntoEmptyDivider("g", "a", "d2"), true);
  assert.deepEqual(ids(h), ["lead", "d2", "a", "d3", "b", "d1"]);
  assert.equal(c.moveBoardItemWithinGroup("g", "a", "b", "after"), true);
  assert.deepEqual(ids(h), ["lead", "d2", "d3", "b", "a", "d1"]);
});

test("ボードの操作イベントは本文開閉・編集位置・メモ・保存・閉じるへ接続する", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  c.registerBoardEvents(); h.nodes.openBoardBtn.handlers.click(); h.flush();
  assert.equal(c.isBoardOpen, true);
  h.nodes.noteBoardPanel.handlers.click(h.event({ action: "toggleBoardCard", itemId: "a" }));
  assert.equal(c.expandedBoardItemIds.has("a"), true);
  h.nodes.noteBoardPanel.handlers.click(h.event({ action: "openBoardItemMemo", groupId: "g", itemId: "a" }));
  assert.equal(c.isBoardOpen, false);
  h.nodes.previewBoardRoot.handlers.click(h.event({ action: "jumpBoardItem", itemId: "b" }));
  h.nodes.boardSaveBtn.handlers.click();
  assert.deepEqual(h.calls.filter(([type]) => ["memoById", "navigate", "save"].includes(type)), [["memoById", "g", "a"], ["navigate", "item:b"], ["save"]]);
  assert.deepEqual(Object.keys(h.nodes.noteBoardPanel.handlers).sort(), ["change", "click", "dragend", "dragover", "dragstart", "drop"]);
});

test("ボードのドラッグ開始・終了は両画面の状態とマーカーを解除する", () => {
  const h = createPreviewClientHarness(note()), c = h.context;
  const card = new PreviewElement({ boardGroupId: "g", boardItemId: "a" });
  const otherMarker = new PreviewElement(); otherMarker.classList.add("isBoardDividerDragOverBefore");
  h.nodes.noteBoardRoot.markedElements = [card];
  h.nodes.previewBoardRoot.markedElements = [otherMarker];
  c.handleBoardDragStart(h.event({ action: "dragBoardItem" }, { ".noteBoardCard": card }));
  assert.equal(c.boardDragState.itemId, "a");
  assert.equal(card.classes.has("isBoardDragging"), true);
  assert.ok(h.calls.some(([type, format, id]) => type === "dragData" && format === "text/plain" && id === "a"));
  c.handleBoardDragEnd();
  assert.equal(c.boardDragState.itemId, "");
  assert.equal(c.boardDividerDragState.dividerId, "");
  assert.equal(card.classes.size, 0);
  assert.equal(otherMarker.classes.size, 0);
});
