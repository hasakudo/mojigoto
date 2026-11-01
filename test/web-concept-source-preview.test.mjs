import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { locateConceptSource } from "../web/lib/concept-source.mjs";

const source = { kind: "noteItem", noteType: "reference", notePath: "C:\\work\\.mojigoto\\references\\note.json", groupId: "group", itemId: "linked" };
const entry = (name = "note.json", groupId = "group", itemId = "linked") => ({
  item: { name },
  data: { title: "人物資料", groups: [{ id: "first", title: "前の分類", items: [] }, {
    id: groupId, title: "登場人物", items: [{ id: "other", heading: "別の項目" }, {
      id: itemId, kind: "entry", heading: "主人公", body: "本文", memo: { body: "連携メモ" },
    }],
  }] },
});

test("出典のファイルと項目IDから連携先の正確な位置を取得する", () => {
  const target = entry();
  const found = locateConceptSource([entry("other.json"), target], source);
  assert.equal(found.entry, target);
  assert.equal(found.groupIndex, 1);
  assert.equal(found.itemIndex, 1);
  assert.equal(found.item.memo.body, "連携メモ");
});

test("ノートの名前変更や項目移動後もIDから連携先を探す", () => {
  const target = entry("renamed.json", "moved-group");
  assert.equal(locateConceptSource([target], source).entry, target);
  assert.equal(locateConceptSource([entry("note.json", "group", "deleted")], source), null);
  assert.equal(locateConceptSource([target], { ...source, itemId: "" }), null);
  target.data.groups[1].items[1].kind = "divider";
  assert.equal(locateConceptSource([target], source), null);
});

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app);
  assert.ok(match, name);
  const end = /\r?\n}\r?\n/.exec(app.slice(match.index));
  return app.slice(match.index, match.index + end.index + end[0].length);
}
function harness() {
  const calls = [];
  const frames = [];
  const element = () => ({ hidden: true, disabled: false, textContent: "", scrollTop: 0,
    classList: { add() {}, remove() {} }, setAttribute() {}, querySelector() { return null; } });
  const elements = Object.fromEntries([
    "conceptNoteReferencePanel", "conceptEditorListPanel", "conceptMemoEditorSection", "previewConceptSourceButton",
    "conceptNoteReferenceTitle", "conceptNoteReferencePath", "openConceptSourceNoteButton", "conceptNoteReferenceContent",
  ].map((key) => [key, element()]));
  const state = { currentConceptMemo: { id: "memo", source }, selectedWork: { id: "work" },
    conceptNoteReferenceLoadToken: 0, conceptNoteReferenceContext: null, noteDisclosure: {}, dirty: true };
  const context = { state, elements, requestAnimationFrame: (callback) => frames.push(callback),
    locateConceptSource, updateInputAssistViewport() {}, positionConceptEditorList() {},
    findConceptSourceEntry: async () => locateConceptSource([entry()], source),
    renderReaderNoteReference: (...args) => calls.push(["preview", ...args]),
    showLoading() {}, showEmpty: (_, message) => calls.push(["error", message]),
    canDiscardDraft: () => true, setBusy() {}, notify: (message) => calls.push(["notice", message]),
    openNote: async (value) => { state.currentNote = value; },
    renderNoteEditor: () => calls.push(["editor"]),
    document: { getElementById: (id) => ({
      scrollIntoView: () => calls.push(["scroll", id]),
      querySelector: () => ({ scrollIntoView: () => calls.push(["scroll", id]), focus: () => calls.push(["focus", id]) }),
    }) },
  };
  vm.createContext(context);
  vm.runInContext(["closeConceptNoteReference", "previewConceptSourceNote", "openConceptSourceNote"].map(appFunction).join("\n"), context);
  return { context, state, elements, calls, flushFrames: () => { while (frames.length) frames.shift()(); } };
}

test("構想メモを編集したまま共通プレビューに連携先を表示する", async () => {
  const h = harness();
  await h.context.previewConceptSourceNote();
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.currentConceptMemo.id, "memo");
  assert.equal(h.elements.conceptNoteReferencePanel.hidden, false);
  assert.equal(h.elements.conceptNoteReferenceTitle.textContent, "人物資料");
  assert.equal(h.elements.conceptNoteReferencePath.textContent, "登場人物 / 主人公");
  assert.equal(h.calls[0][0], "preview");
  assert.equal(h.calls[0][3], "linked");
  assert.equal(h.elements.openConceptSourceNoteButton.disabled, false);
});

test("読込中に閉じる・メモ切替・作品切替をすると古いプレビューを表示しない", async () => {
  for (const change of [
    (h) => h.context.closeConceptNoteReference(),
    (h) => { h.state.currentConceptMemo = { id: "other" }; },
    (h) => { h.state.selectedWork = { id: "other" }; },
  ]) {
    const h = harness();
    let resolve;
    h.context.findConceptSourceEntry = () => new Promise((done) => { resolve = done; });
    const loading = h.context.previewConceptSourceNote();
    change(h);
    resolve(locateConceptSource([entry()], source));
    await loading;
    assert.equal(h.calls.length, 0);
    assert.equal(h.state.conceptNoteReferenceContext, null);
  }
});

test("ノート参照を開くときだけ一覧を畳み、読込中と読込後の手動開閉を維持する", async () => {
  const h = harness();
  const list = h.elements.conceptEditorListPanel;
  list.open = true;
  h.state.conceptEditorListVisible = true;
  let resolve;
  h.context.findConceptSourceEntry = () => new Promise((done) => { resolve = done; });
  const loading = h.context.previewConceptSourceNote();
  assert.equal(list.open, false);
  assert.equal(h.state.conceptEditorListVisible, true);
  list.open = true;
  resolve(locateConceptSource([entry()], source));
  await loading;
  h.flushFrames();
  assert.equal(list.open, true);
  h.context.findConceptSourceEntry = async () => locateConceptSource([entry()], source);
  await h.context.previewConceptSourceNote();
  assert.equal(list.open, true);
  list.open = false;
  h.context.closeConceptNoteReference();
  assert.equal(list.open, false);
  list.open = true;
  await h.context.previewConceptSourceNote();
  assert.equal(list.open, false);
  assert.equal(h.state.dirty, true);
});

test("ノートを開く際は未保存変更を保護し、再読込した項目メモを展開して移動する", async () => {
  const h = harness();
  await h.context.previewConceptSourceNote();
  h.context.canDiscardDraft = () => false;
  await h.context.openConceptSourceNote();
  assert.equal(h.state.currentNote, undefined);
  h.context.canDiscardDraft = () => true;
  await h.context.openConceptSourceNote();
  h.flushFrames();
  assert.equal(h.state.noteType, "reference");
  assert.equal(h.state.noteDisclosure["linked:memo"], true);
  assert.equal(h.state.noteDisclosure["linked:body"], true);
  assert.ok(h.calls.some(([action, id]) => action === "scroll" && id === "note-item-1-1"));
  assert.ok(h.calls.some(([action]) => action === "focus"));
});

test("出典プレビューは右側の既存表示と入力補助の回避を共用する", async () => {
  const [html, css, worker] = await Promise.all(["index.html", "styles.css", "sw.js"].map((name) => readFile(new URL(`../web/${name}`, import.meta.url), "utf8")));
  assert.match(html, /id="conceptNoteReferencePanel" class="reader-note-reference concept-note-reference"/);
  assert.match(css, /#conceptMemoEditorSection\.note-reference-open \.concept-editor/);
  assert.match(css, /\.input-assist-visible \.reader-note-reference \{ bottom: var\(--preview-assist-bottom/);
  assert.match(worker, /lib\/concept-source\.mjs/);
});
