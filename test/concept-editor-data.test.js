const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConceptMemoDataFromMessage: build } = require("../src/views/concept-memo/edit-message");
const { createEditorContext } = require("./fixtures/concept-editor-harness.cjs");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("自分の保存基準からの追加入力だけに最新同期情報を引き継ぎ、本文やリンク状態は入力を保つ", () => {
  const old = { id: "m", body: "追加入力", source: { kind: "noteItem", itemId: "i", notePath: "/note", status: "cleared", syncFingerprint: "old" } };
  const current = { storageRevision: "latest", memos: [{ ...old, body: "保存済み", source: { ...old.source, syncFingerprint: "new", syncedAt: "now" } }] };
  const message = { payload: { storageRevision: "own", memos: [old] } };
  const before = JSON.stringify({ current, message });
  const result = build(message, current, new Set(["own"]));
  assert.equal(result.storageRevision, "latest");
  assert.equal(result.memos[0].body, "追加入力");
  assert.equal(result.memos[0].source.syncFingerprint, "new");
  assert.equal(result.memos[0].source.status, "cleared");
  assert.equal(JSON.stringify({ current, message }), before);
});

test("外部の保存基準と出典変更を上書きせず、共通TODOは別保存のままにする", () => {
  const current = { storageRevision: "latest", memos: [{ id: "m", source: { kind: "noteItem", itemId: "new", notePath: "/note", syncFingerprint: "new" } }] };
  const message = { payload: { storageRevision: "external", memos: [{ id: "m", source: { kind: "noteItem", itemId: "old", notePath: "/note", syncFingerprint: "old" } }],
    folders: [{ id: "folder" }], commonTodoItems: [{ text: "別保存" }], autoSyncToNoteItemDefault: true } };
  const result = build(message, current, new Set(["own"]));
  assert.equal(result.storageRevision, "external");
  assert.equal(result.memos[0].source.syncFingerprint, "old");
  assert.deepEqual(result.commonTodoItems, []);
  assert.deepEqual(result.folders, message.payload.folders);
  assert.equal(result.autoSyncToNoteItemDefault, true);
  message.payload.storageRevision = "own";
  assert.equal(build(message, current, new Set(["own"])).memos[0].source.syncFingerprint, "old");
});

test("受信データの欠落時は従来の初期値と現在の保存基準を使う", () => {
  const result = build({}, { storageRevision: "current", memos: [] }, new Set());
  assert.equal(result.storageRevision, "current"); assert.equal(result.version, 1);
  assert.deepEqual(result.memos, []); assert.deepEqual(result.folders, []);
  assert.equal(result.autoSyncToNoteItemDefault, false);
  assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
});

function editor() { return createEditorContext({ memos: [{ id: "m", type: "text", body: "本文", tags: [], todoItems: [{ id: "a", text: "先", done: false }, { id: "b", text: "後", done: false }],
  source: { kind: "noteItem", notePath: "/note", noteType: "plot", groupId: "g", itemId: "i", status: "active" } }], commonTodoItems: [] }); }

test("分離した入力受付はタイトル・本文・リスト・タグを編集状態へ渡す", () => {
  const h = editor(), c = h.context;
  c.handleTitleInput(); c.handleBodyInput(); c.handleListInput(); c.handleTagsInput();
  h.input("memoTitle", "input", "新しい題"); h.input("memoBody", "input", "変更本文");
  h.input("memoListItems", "input", " 一行目 \n\n 二行目 "); h.input("memoTags", "input", "資料, 人物");
  assert.equal(h.data.memos[0].title, "新しい題"); assert.equal(h.data.memos[0].body, "変更本文");
  assert.deepEqual(Array.from(h.data.memos[0].listItems, (item) => item.text), ["一行目", "二行目"]);
  assert.deepEqual(Array.from(h.data.memos[0].tags), ["資料", "人物"]);
  assert.equal(h.data.memos[0].source.status, "active");
});

test("TODOの完了・移動・本文編集は対象だけに反映し、範囲外の移動を無視する", () => {
  const h = editor(), c = h.context;
  c.toggleTodoItemDone("a"); c.moveTodoItem("a", "down"); c.updateTodoItemText("a", " 変更 ");
  assert.deepEqual(plain(h.data.memos[0].todoItems), [{ id: "b", text: "後", done: false }, { id: "a", text: "変更", done: true }]);
  const before = JSON.stringify(h.data); c.moveTodoItem("b", "up");
  assert.equal(JSON.stringify(h.data), before);
  c.deleteTodoItem("b"); assert.equal(h.data.memos[0].todoItems.length, 1);
});

test("手動反映・ノートを開く受付は対象IDを維持し、ピン等の操作は既存の保存要求を送る", () => {
  const h = editor(), c = h.context;
  c.requestApplySelectedMemoToNoteItem(); c.requestOpenSourceNote();
  const messages = h.calls.filter(([type]) => type === "post").map(([, message]) => message);
  assert.equal(messages[0].type, "applyConceptMemoToNoteItem");
  assert.equal(messages[0].payload.itemId, "i"); assert.equal(messages[0].payload.memoBody, "本文");
  assert.equal(messages[1].type, "openSourceNoteFromConceptMemo");
  c.toggleSelectedMemoPinned(); c.toggleSelectedMemoDashboard();
  assert.equal(h.data.memos[0].isPinned, true); assert.equal(h.data.memos[0].showInDashboard, true);
  assert.equal(h.calls.filter(([type]) => type === "save").length, 2);
});
