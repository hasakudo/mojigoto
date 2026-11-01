const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { getEventsScript } = require("../src/views/note-webview/script-events");
const { getConceptMemoEventsScript } = require("../src/views/concept-memo/script-events");

function harness(kind, dirty = true) {
  const script = kind === "note" ? getEventsScript() : getConceptMemoEventsScript();
  const start = script.indexOf('window.addEventListener("message"');
  const end = /\n    }\);/.exec(script.slice(start));
  const notices = [];
  let listener;
  const context = vm.createContext({
    window: { addEventListener: (_, callback) => { listener = callback; } },
    state: { title: "未保存ノート", groups: [], storageRevision: "old" },
    currentState: { data: { memos: [{ id: "memo", body: "未保存構想" }], storageRevision: "old" } },
    dirty, isDirty: dirty, changeRevision: 3, selectedMemoId: "memo",
    setStatus: (message) => notices.push(message), showToast: (message) => notices.push(message),
    normalizeState: (state) => state, normalizeGroup: (group) => group,
    titleInput: {}, noteWorkTitleEl: null, isAddressBookOpen: false, isBoardOpen: false,
    clearDirty() {}, createGroup: () => ({}), setDirty() {},
    renderAll() {}, renderGroups() {}, renderPreview() {}, updateDirtyUi() {}, applyPreviewOnly() {}, stabilizePreviewRender() {},
    getFilteredMemos: () => [], selectPreferredMemo() {}, saveCurrentMemos() {},
    requestConceptNoteIndex() {},
  });
  vm.runInContext(script.slice(start, start + end.index + end[0].length), context);
  return { context, notices, send: (message) => listener({ data: message }) };
}

test("構想の手動反映結果は同期基準だけ更新し、追加入力を保持する", () => {
  const h = harness("concept");
  h.context.currentState.data.memos[0].source = { itemId: "item", syncFingerprint: "old" };
  h.send({ type: "conceptMemoAppliedToNoteItem", payload: { memoId: "memo", syncFingerprint: "applied", syncedAt: "now" } });
  assert.equal(h.context.currentState.data.memos[0].body, "未保存構想");
  assert.equal(h.context.currentState.data.memos[0].source.syncFingerprint, "applied");
});
for (const kind of ["note", "concept"]) {
  const reload = kind === "note" ? "noteReloaded" : "conceptMemosReloaded";
  const payload = kind === "note" ? { title: "同期されたノート", groups: [], storageRevision: "new" }
    : { data: { memos: [{ id: "memo", body: "同期された構想" }], storageRevision: "new" } };
  const body = (context) => kind === "note" ? context.state.title : context.currentState.data.memos[0].body;
  test(`${kind}: 同期通知で未保存入力と保存基準を置き換えない`, () => {
    const h = harness(kind);
    const before = body(h.context);
    h.send({ type: reload, payload });
    assert.equal(body(h.context), before);
    assert.equal(h.notices.length, 1);
  });
  test(`${kind}: 明示更新の読み込み中に増えた入力も保持する`, () => {
    const h = harness(kind);
    const before = body(h.context);
    h.send({ type: reload, payload, resetDirty: true, revision: 2 });
    assert.equal(body(h.context), before);
    assert.equal(h.notices.length, 1);
  });
  test(`${kind}: 未保存内容がなければ同期された内容と保存基準を読む`, () => {
    const h = harness(kind, false);
    h.send({ type: reload, payload });
    assert.equal(body(h.context), kind === "note" ? "同期されたノート" : "同期された構想");
    assert.equal(kind === "note" ? h.context.state.storageRevision : h.context.currentState.data.storageRevision, "new");
  });
}
