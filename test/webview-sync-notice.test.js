const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { getEventsScript } = require("../src/views/note-webview/script-events");
const { getConceptMemoEventsScript } = require("../src/views/concept-memo/script-events");
const source = fs.readFileSync(path.join(__dirname, "../src/views/note-webview/editor-view.js"), "utf8");

function messageListener(script) {
  const start = script.indexOf('window.addEventListener("message"');
  const end = /\n    }\);/.exec(script.slice(start));
  return script.slice(start, start + end.index + end[0].length);
}
function noteFunction(name) {
  const start = source.indexOf(`    function ${name}(`);
  const end = /\r?\n    }\r?\n/.exec(source.slice(start));
  return source.slice(start, start + end.index + end[0].length);
}
function element() {
  const classes = new Set();
  return { textContent: "", hidden: true, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    classList: {
      add: (...values) => values.forEach((value) => classes.add(value)),
      remove: (...values) => values.forEach((value) => classes.delete(value)),
      contains: (value) => classes.has(value),
      toggle: (value, on) => on ? classes.add(value) : classes.delete(value),
    },
  };
}
function noteHarness() {
  let listener;
  const timers = new Map();
  let nextTimer = 0;
  const saves = [];
  const item = { id: "item", kind: "entry", memo: { body: "本文", linkedConceptMemoIds: [] } };
  const context = vm.createContext({
    toastStatusEl: element(), toastStatusTextEl: element(), dismissStatusBtn: element(), toastTimer: null,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    window: { addEventListener: (_, callback) => { listener = callback; } },
    state: { groups: [{ id: "group", items: [item] }] }, suppressNextNoteSavedMessage: false,
    markDirty() {}, renderGroups() {}, refreshViewsAfterItemMemoChange() {}, clearDirty() {},
    saveCurrentNote: (options) => saves.push(options),
  });
  vm.runInContext([noteFunction("setStatus"), noteFunction("clearStatus"), messageListener(getEventsScript())].join("\n"), context);
  return { context, timers, saves, item, send: (message) => listener({ data: message }) };
}
function conceptHarness() {
  let listener;
  const notices = [];
  const saves = [];
  const context = vm.createContext({
    window: { addEventListener: (_, callback) => { listener = callback; } },
    currentState: { data: { memos: [{ id: "memo", body: "追加入力", source: { itemId: "item" } }] } },
    changeRevision: 2, isDirty: true,
    setDirty: (dirty) => { context.isDirty = dirty; },
    showToast: (message, options) => notices.push({ message, options }),
    saveCurrentMemos: (options) => saves.push(options),
  });
  vm.runInContext(messageListener(getConceptMemoEventsScript()), context);
  return { context, notices, saves, send: (message) => listener({ data: message }) };
}

test("ノートの手動反映は同期情報を受け取り、後続保存で反映通知を消さない", () => {
  const h = noteHarness();
  h.send({ type: "conceptMemoCreatedFromNoteItem", payload: {
    mode: "updated", conceptMemoId: "memo", groupId: "group", itemId: "item", syncFingerprint: "applied",
  } });
  assert.equal(h.item.memo.conceptMemoSyncFingerprint, "applied");
  assert.deepEqual(h.item.memo.linkedConceptMemoIds, ["memo"]);
  assert.equal(h.saves.length, 1);
  assert.equal(h.context.toastStatusTextEl.textContent, "構想メモへ反映しました。");
  h.send({ type: "noteSaved", revision: 2 });
  assert.equal(h.context.toastStatusTextEl.textContent, "構想メモへ反映しました。");
});

test("ノートの構想新規作成は作成完了を区別する", () => {
  const h = noteHarness();
  h.send({ type: "conceptMemoCreatedFromNoteItem", payload: { mode: "created", conceptMemoId: "memo", groupId: "group", itemId: "item", syncFingerprint: "created" } });
  assert.equal(h.context.toastStatusTextEl.textContent, "構想メモを作成しました。");
});

test("ノート保存エラーは自動で消えず、通常の保存通知でも上書きされない", () => {
  const h = noteHarness();
  h.context.setStatus("保存中…", true);
  assert.equal(h.timers.size, 1);
  h.send({ type: "error", message: "競合のため保存できませんでした。下書きを退避してください。" });
  assert.equal(h.timers.size, 0);
  assert.equal(h.context.dismissStatusBtn.hidden, false);
  assert.equal(h.context.toastStatusEl.attributes.role, "alert");
  h.send({ type: "noteSaved", revision: 2 });
  h.send({ type: "info", message: "別の成功通知" });
  assert.equal(h.context.toastStatusTextEl.textContent, "競合のため保存できませんでした。下書きを退避してください。");
  assert.equal(h.context.toastStatusEl.classList.contains("isVisible"), true);
  h.context.clearStatus({ force: true });
  assert.equal(h.context.toastStatusTextEl.textContent, "");
  assert.equal(h.context.dismissStatusBtn.hidden, true);
  h.context.setStatus("次の保存成功", true);
  assert.equal(h.context.toastStatusTextEl.textContent, "次の保存成功");
});

test("構想の手動反映は直後と後続保存の両方で反映先を表示する", () => {
  const h = conceptHarness();
  h.send({ type: "conceptMemoAppliedToNoteItem", payload: { memoId: "memo", syncFingerprint: "applied" } });
  assert.equal(h.notices[0].message, "項目メモへ反映しました。");
  assert.equal(h.saves[0].successMessage, "項目メモへ反映し、構想メモを保存しました。");
  h.send({ type: "conceptMemosSaved", payload: { revision: 2, successMessage: h.saves[0].successMessage } });
  assert.equal(h.notices.at(-1).message, "項目メモへ反映し、構想メモを保存しました。");
  assert.equal(h.context.currentState.data.memos[0].body, "追加入力");
});

test("構想の自動保存で項目メモへ反映した場合は反映成功も通知する", () => {
  const h = conceptHarness();
  h.send({ type: "conceptMemosSaved", payload: { revision: 2, autoSave: true, reflectedCount: 1, syncErrorCount: 0 } });
  assert.equal(h.notices[0].message, "項目メモへ反映し、自動保存しました。");
});

test("構想を保存できても同期の一部が失敗した場合は完了通知にしない", () => {
  const h = conceptHarness();
  h.send({ type: "conceptMemosSaved", payload: { revision: 2, reflectedCount: 1, syncErrorCount: 1, successMessage: "反映完了" } });
  assert.equal(h.notices[0].options.isError, true);
  assert.match(h.notices[0].message, /一部完了していません/);
  assert.equal(h.context.isDirty, false, "構想本体の保存成功は維持する");
});

test("反映がない構想の通常保存は保存だけを通知する", () => {
  const h = conceptHarness();
  h.send({ type: "conceptMemosSaved", payload: { revision: 2, reflectedCount: 0, syncErrorCount: 0 } });
  assert.equal(h.notices[0].message, "保存しました。");
});
