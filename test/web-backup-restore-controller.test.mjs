import assert from "node:assert/strict";
import test from "node:test";
import { createBackupRestoreController } from "../web/lib/backup-restore.mjs";
import { createBackupComparisonController } from "../web/lib/backup-comparison-controller.mjs";

function harness(type = "manuscript") {
  const calls = [], notices = [], file = { id: "file", eTag: "1" };
  let draft = type === "manuscript" ? "現在本文" : '{"memos":[{"id":"current","body":"現在"}]}';
  const state = { selectedWork: { id: "work", mojigoto: {} }, currentFile: file, originalContent: "現在本文", dirty: true };
  const elements = { readerContent: { value: draft }, saveFileButton: {}, saveNoteButton: {}, restoreComparedBackupButton: {}, manuscriptBackupStatus: { textContent: "1件" },
    manuscriptBackupDialog: { open: true, close() { calls.push("close"); } }, conflictDialog: { showModal() { calls.push("conflict"); } }, conceptMemosSection: { hidden: false }, conceptMemoEditorSection: { hidden: true } };
  const options = { state, elements, window: { confirm: () => { calls.push("confirm"); return true; } }, requestAnimationFrame: cb => cb(),
    currentBackupTarget: () => ({ targetType: type }), manuscriptBackupTarget: () => ({ item: state.currentFile, targetType: type, content: draft, relativePath: "file" }),
    conceptMemoBackupTarget: () => ({ item: state.conceptFile || file, targetType: type, content: draft, relativePath: "file" }), noteBackupTarget() {},
    cancelAutoSave() {}, setBusy() {}, formatDate: v => v,
    readWebBackupSnapshot: async () => { calls.push("read"); return { content: type === "manuscript" ? "復元本文" : '{"memos":[{"id":"restored","body":"復元"}]}' }; },
    createWebManuscriptBackup: async reason => calls.push(reason), notify: (...args) => notices.push(args), setEditorStatus() {},
    renderNoteEditor() {}, setNoteStatus() {}, updateNoteIndex() {}, openConceptMemo() { calls.push("editor"); }, refreshConceptFilterOptions() {}, renderConceptMemosList() { calls.push("list"); },
    commitRoute() {}, routeForWork() {}, setConceptStatus() {}, updateReaderMeta() {}, makeWritingEvent: value => value, countCharacters: value => value.length,
    appendWritingEvent: async () => {}, updateSharedWorkMetrics() {}, renderManuscriptBackupHistory: async () => calls.push("history"),
  };
  state.provider = { writeText: async (_item, _content, eTag) => { calls.push(["write", eTag]); return { eTag: "2" }; } };
  return { state, elements, options, calls, notices, setDraft(value) { draft = value; } };
}

test("分離した復元は確認と直前退避の後に条件付き書込し保存済みへ更新する", async () => {
  const h = harness(); await createBackupRestoreController(h.options).restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.deepEqual(h.calls.slice(0,4), ["read", "confirm", "before-restore", ["write", "1"]]);
  assert.equal(h.elements.readerContent.value, "復元本文");
  assert.equal(h.state.dirty, false); assert.equal(h.state.syncing, false); assert.equal(h.state.currentFile.eTag, "2");
  assert.match(h.notices[0][0], /復元しました/);
});

test("退避失敗時は本文を書かず入力を保持し、復元中状態を解除する", async () => {
  const h = harness(); h.options.createWebManuscriptBackup = async () => { throw Error("退避失敗"); };
  await createBackupRestoreController(h.options).restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(h.calls.some(Array.isArray), false); assert.equal(h.elements.readerContent.value, "現在本文");
  assert.equal(h.state.dirty, true); assert.equal(h.state.syncing, false); assert.match(h.notices[0][0], /退避失敗/);
});

test("復元書込中の追加入力を保持し、競合応答では競合画面へ進む", async () => {
  const h = harness(); h.state.provider.writeText = async () => { h.setDraft("追加入力"); return { eTag: "2" }; };
  await createBackupRestoreController(h.options).restoreWebManuscriptBackup({}, {createdAt:"today"});
  assert.equal(h.state.dirty, true); assert.equal(h.state.originalContent, "復元本文"); assert.match(h.notices[0][0], /追加入力/);
  const c = harness(); c.state.provider.writeText = async () => { throw Object.assign(Error("conflict"), { code: "conflict" }); };
  await createBackupRestoreController(c.options).restoreWebManuscriptBackup({}, {createdAt:"today"});
  assert.equal(c.state.externalConflict, true); assert.ok(c.calls.includes("conflict")); assert.equal(c.state.syncing, false);
});

test("一覧からの構想全体復元は一覧を維持し、履歴更新失敗を復元失敗と区別する", async () => {
  const h = harness("conceptMemo"); h.options.renderManuscriptBackupHistory = async () => { throw Error("offline"); };
  await createBackupRestoreController(h.options).restoreWebManuscriptBackup({}, {createdAt:"today"});
  assert.ok(h.calls.includes("list")); assert.ok(!h.calls.includes("editor")); assert.equal(h.state.conceptDocument.memos[0].id,"restored");
  assert.match(h.elements.manuscriptBackupStatus.textContent,/復元しました.*履歴の更新に失敗/);
  assert.match(h.notices.at(-1)[0],/履歴を更新できません/); assert.equal(h.state.syncing,false);
});

function comparisonHarness() {
  const node = (tag = "div", className = "", textContent = "") => ({ tag, className, textContent, children: [], dataset: {}, classList: { add() {}, remove() {} },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, setAttribute() {}, addEventListener() {}, scrollIntoView() {} });
  const elements = Object.fromEntries(["backupComparisonSummary","backupDiffPreviousButton","backupDiffNextButton","backupDiffViewToggle","backupComparisonDiff","backupComparisonOldTitle","backupComparisonCurrentTitle","manuscriptBackupComparison","manuscriptBackupList"].map(id=>[id,node()]));
  const state = {}, target={ targetType:"manuscript", label:"原稿", content:"同じ行\n新しい行" };
  const controller = createBackupComparisonController({state,elements,document:{createTextNode:text=>node("text","",text)},makeElement:node,currentBackupTarget:()=>target,formatDate:v=>v,backupReasonLabel:()=>"手動",backupSourceLabel:()=>"Web"});
  return {state,elements,controller};
}

test("分離した比較は実際の差分行と見出しを表示し閉じると一覧へ戻す", () => {
  const h=comparisonHarness(), storage={},entry={createdAt:"today",targetType:"manuscript"};
  h.controller.showManuscriptBackupComparison(storage,entry,{content:"同じ行\n以前の行"});
  assert.match(h.elements.backupComparisonSummary.textContent,/変更 1行/); assert.equal(h.elements.manuscriptBackupList.hidden,true);
  assert.ok(h.elements.backupComparisonDiff.children.length>0); assert.equal(h.state.manuscriptBackupComparisonStorage,storage);
  h.controller.closeManuscriptBackupComparison(); assert.equal(h.elements.manuscriptBackupList.hidden,false); assert.equal(h.state.manuscriptBackupComparisonEntry,null);
});

test("差分なしの比較は差分移動と全文切替を無効にする", () => {
  const h=comparisonHarness();h.controller.showManuscriptBackupComparison({}, {targetType:"manuscript"}, {content:"同じ行\n新しい行"});
  assert.equal(h.elements.backupComparisonSummary.textContent,"差分はありません");
  assert.equal(h.elements.backupDiffNextButton.disabled,true);assert.equal(h.elements.backupDiffViewToggle.disabled,true);
});
