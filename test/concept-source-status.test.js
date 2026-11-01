const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const store = require("../src/data/concept-memo-store");
const { refreshConceptSourceStatuses } = require("../src/data/concept-source-status");
const { getGroupsScript } = require("../src/views/note-webview/script-groups");
const { getConceptMemoEventsScript } = require("../src/views/concept-memo/script-events");
const source = { kind: "noteItem", notePath: "/note.json", noteType: "plot", groupId: "g", itemId: "i", status: "active" };
const memo = (id, status = "active") => ({ id, body: id, source: { ...source, status } });
const note = (ids, body = "新しい本文") => ({ groups: [{ id: "g", items: [{ id: "i", kind: "entry", memo: { body, linkedConceptMemoIds: ids } }] }] });

test("既存ノートの逆リンクから古い参照と有効な参照を判定し、本文とデータを変更しない", async () => {
  const data = { storageRevision: "base", memos: [memo("old"), memo("new", "missing")] };
  const before = JSON.stringify(data); let reads = 0;
  const result = await refreshConceptSourceStatuses(data, { resolveNotePath: (value) => value, readNoteFile: async () => { reads++; return note(["new"]); } });
  assert.deepEqual(result.memos.map((memo) => memo.source.status), ["missing", "active"]);
  assert.deepEqual(result.memos.map((memo) => memo.body), ["old", "new"]);
  assert.equal(result.storageRevision, "base"); assert.equal(reads, 1);
  assert.equal(JSON.stringify(data), before);
});

test("明示的な複数リンクは保ち、クリア済みは自動復活せず、空の元メモはclearedになる", async () => {
  const data = { memos: [memo("a"), memo("b"), memo("cleared", "cleared")] };
  const env = { resolveNotePath: (value) => value, readNoteFile: async () => note(["a", "b", "cleared"]) };
  assert.deepEqual((await refreshConceptSourceStatuses(data, env)).memos.map((memo) => memo.source.status), ["active", "active", "cleared"]);
  env.readNoteFile = async () => note(["a"], "");
  assert.equal((await refreshConceptSourceStatuses(data, env)).memos[0].source.status, "active");
  env.readNoteFile = async () => note([], "");
  assert.equal((await refreshConceptSourceStatuses(data, env)).memos[0].source.status, "cleared");
});

test("消えた項目・ファイルはmissing、読取権限やJSON不正は状態を推測して変えない", async () => {
  const data = { memos: [memo("a")] };
  const env = { resolveNotePath: (value) => value, readNoteFile: async () => ({ groups: [] }) };
  assert.equal((await refreshConceptSourceStatuses(data, env)).memos[0].source.status, "missing");
  for (const code of ["ENOENT", "EACCES", "SYNTAX"]) {
    env.readNoteFile = async () => { throw Object.assign(Error("read"), { code }); };
    assert.equal((await refreshConceptSourceStatuses(data, env)).memos[0].source.status, code === "ENOENT" ? "missing" : "active");
  }
  env.readNoteFile = async () => note([]);
  assert.equal((await refreshConceptSourceStatuses(data, env)).memos[0].source.status, "active");
});

async function fixture(t, memos) {
  const root = path.resolve(__dirname, "../.review-baseline/test-temp"); await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "source-status-"));
  t.after(async () => { assert.ok(dir.startsWith(root + path.sep)); await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, "concept-memos.json");
  await store.writeConceptMemos(file, { ...store.createEmptyConceptMemos(), memos });
  return file;
}

test("同じ項目を指す古いメモより、明示的な逆リンクのメモを反映先に優先する", async (t) => {
  const file = await fixture(t, [memo("old"), memo("current")]);
  const result = await store.createConceptMemoFromNoteItem(file, { ...source, linkedConceptMemoIds: ["current"], memoBody: "新しい内容", forceOverwrite: true });
  assert.equal(result.memo.id, "current");
  const saved = await store.readConceptMemos(file);
  assert.equal(saved.memos[0].body, "old"); assert.equal(saved.memos[1].body, "新しい内容");
});

test("クリア・リンク切れ・別IDのメモを復活や上書きせず、新しい構想メモを作成する", async (t) => {
  for (const status of ["cleared", "missing", "active"]) {
    const file = await fixture(t, [memo("old", status)]);
    const result = await store.createConceptMemoFromNoteItem(file, { ...source, linkedConceptMemoIds: status === "active" ? ["different"] : [], memoBody: "作り直した内容" });
    assert.equal(result.mode, "created"); assert.notEqual(result.memo.id, "old");
    const saved = await store.readConceptMemos(file);
    assert.equal(saved.memos[0].body, "old"); assert.equal(saved.memos[0].source.status, status);
  }
});

test("項目メモのクリアは旧リンクの通知後にリンクと自動反映を外して保存し、構想本文を消さない", () => {
  const script = getGroupsScript();
  const start = script.indexOf('      groupsRoot\n        .querySelectorAll("[data-action=\'clearItemMemo\']")');
  const end = script.indexOf('      groupsRoot.querySelectorAll("[data-action=\'toggleMovePicker\']")', start);
  assert.ok(start >= 0 && end > start);
  let click; const messages = []; let saved;
  const item = note(["old"]).groups[0].items[0]; item.memo.autoSyncToConceptMemoOverride = true;
  const state = { filePath: "/note.json", groups: [{ id: "g", items: [item] }] };
  const context = vm.createContext({ state, groupsRoot: { querySelectorAll: () => [{ dataset: { groupId: "g", itemId: "i" }, addEventListener: (_name, fn) => { click = fn; } }] },
    vscode: { postMessage: (message) => messages.push(message) }, markDirty() {}, updateItemMemoMeta() {}, renderGroups() {}, renderPreview() {},
    saveCurrentNote() { saved = JSON.parse(JSON.stringify(item.memo)); }, setStatus() {} });
  vm.runInContext(script.slice(start, end), context); click();
  assert.deepEqual(saved.linkedConceptMemoIds, []); assert.equal(saved.autoSyncToConceptMemoOverride, false);
  assert.equal(saved.body, ""); assert.deepEqual(Array.from(messages[0].payload.conceptMemoIds), ["old"]);
  assert.equal(messages[0].type, "markConceptMemoClearedFromNoteItem");
});

test("構想から手動で再反映した場合だけ、画面でもactiveへ戻して保存する", () => {
  let receive; let savedStatus;
  const currentState = { data: { memos: [memo("restore", "cleared")] } };
  const context = vm.createContext({ currentState, window: { addEventListener: (_name, callback) => { receive = callback; } },
    document: { getElementById: () => ({}) }, showToast() {}, saveCurrentMemos() { savedStatus = currentState.data.memos[0].source.status; } });
  vm.runInContext(getConceptMemoEventsScript(), context);
  receive({ data: { type: "conceptMemoAppliedToNoteItem", payload: { memoId: "restore", syncFingerprint: "new", syncedAt: "now" } } });
  assert.equal(savedStatus, "active");
});
