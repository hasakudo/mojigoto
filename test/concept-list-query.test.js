const test = require("node:test");
const assert = require("node:assert/strict");
const { createListContext, queryFor, queryOptions, conceptNoteOrder } = require("./fixtures/concept-list-harness.cjs");

const ids = (memos) => Array.from(memos, (memo) => memo.id);
function setup(memos) {
  const context = createListContext({ currentState: { data: { memos, folders: [{ id: "a", name: "前", order: 0 }, { id: "b", name: "後", order: 1 }] } } });
  return { context, query: queryFor(context), result() { return queryFor(context).getFilteredMemos(queryOptions(context)); } };
}

test("通常の並べ替えは昇降順ともピンを先頭に保ち、日時不正と同値の順序も維持する", () => {
  const memos = [{ id: "old", updatedAt: "2026-01-01", title: "あ" }, { id: "pin", isPinned: true, updatedAt: "2025-01-01", title: "ん" },
    { id: "bad1", updatedAt: "bad" }, { id: "bad2", updatedAt: "bad" }, { id: "new", updatedAt: "2026-02-01", title: "か" }];
  const h = setup(memos), before = JSON.stringify(memos);
  h.context.sortDirection = "asc";
  assert.deepEqual(ids(h.result()), ["pin", "bad1", "bad2", "old", "new"]);
  h.context.sortDirection = "desc";
  assert.deepEqual(ids(h.result()), ["pin", "new", "old", "bad1", "bad2"]);
  h.context.sortField = "title";
  assert.equal(h.result()[0].id, "pin");
  assert.equal(JSON.stringify(memos), before);
});

test("保管メモは通常表示から除外し、状態条件はANDで組み合わせる", () => {
  const h = setup([{ id: "normal", type: "text" }, { id: "archived", type: "list", isArchived: true, isPinned: true },
    { id: "dashboard", type: "list", isPinned: true, showInDashboard: true }, { id: "pin", isPinned: true }]);
  assert.ok(!ids(h.result()).includes("archived"));
  h.context.activeQuickFilters = { type: "list", state: ["pinned", "dashboard"], source: "" };
  assert.deepEqual(ids(h.result()), ["dashboard"]);
  h.context.activeQuickFilters = { state: ["archived", "pinned"] };
  assert.deepEqual(ids(h.result()), ["archived"]);
});

test("タグとフォルダは各選択内でOR、条件間でANDとなり、未分類と消えたフォルダを区別する", () => {
  const h = setup([{ id: "a", folderIds: ["a"], tags: ["赤"] }, { id: "b", folderId: "b", tags: ["青"] },
    { id: "free", tags: ["赤"] }, { id: "other", folderIds: ["b"], tags: ["緑"] }]);
  h.context.activeFolderIds = ["a", ""]; h.context.activeTagFilters = ["赤", "青"];
  assert.deepEqual(ids(h.result()), ["a", "free"]);
  h.context.activeFolderIds = ["removed"];
  assert.deepEqual(ids(h.result()), ["a", "b", "free"]);
  assert.deepEqual(h.context.activeFolderIds, ["removed"]);
});

test("検索は本文・タグ・リスト・TODO・形式名を対象とし、前後空白と大文字を正規化する", () => {
  const h = setup([{ id: "body", body: "Alpha" }, { id: "tag", tags: ["Alpha"] }, { id: "list", type: "list", listItems: [{ text: "ALPHA" }] },
    { id: "todo", type: "todo", todoItems: [{ text: "Alpha", done: true }] }, { id: "none", title: "別のメモ" }]);
  h.context.searchQuery = " ALPHA ";
  assert.deepEqual(ids(h.result()), ["body", "tag", "list", "todo"]);
  h.context.searchQuery = "TODO";
  assert.deepEqual(ids(h.result()), ["todo"]);
});

test("ノートの項目順はピンより優先し、関連なしと出典の状態条件を保つ", () => {
  const h = setup([{ id: "second", isPinned: true }, { id: "first" }, { id: "free", source: { kind: "writingMemo", status: "missing" } }]);
  h.context.conceptNoteIndex = conceptNoteOrder.buildConceptNoteIndex([{ item: { name: "note.json" }, data: { type: "plot", groups: [{ id: "g", items: [
    { id: "i1", kind: "entry", memo: { linkedConceptMemoIds: ["first"] } }, { id: "i2", kind: "entry", memo: { linkedConceptMemoIds: ["second"] } },
  ] }] } }]);
  h.context.sortField = "noteOrder"; h.context.sortDirection = "asc";
  assert.deepEqual(ids(h.result()), ["first", "second", "free"]);
  h.context.activeNoteFilter = "__unlinked__";
  h.context.activeQuickFilters.source = "missing";
  assert.deepEqual(ids(h.result()), ["free"]);
});

test("ブラウザー用の橋渡しも実モジュールと一致し、条件変更やメモ更新を次の呼び出しで参照する", () => {
  const h = setup([{ id: "initial", body: "最初" }]);
  assert.deepEqual(ids(h.context.getFilteredMemos()), ids(h.result()));
  h.context.currentState.data.memos.push({ id: "added", body: "追加", isPinned: true });
  h.context.searchQuery = "追加";
  assert.deepEqual(ids(h.context.getFilteredMemos()), ["added"]);
  h.context.searchQuery = "";
  h.context.activeQuickFilters.state = ["pinned"];
  assert.deepEqual(ids(h.context.getFilteredMemos()), ids(h.result()));
  const before = JSON.stringify(queryOptions(h.context));
  h.query.getFilteredMemos(queryOptions(h.context));
  assert.equal(JSON.stringify(queryOptions(h.context)), before);
});
