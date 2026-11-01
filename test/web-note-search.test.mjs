import assert from "node:assert/strict";
import test from "node:test";
import core from "../web/lib/note-search-replace.js";
import { createNoteSearchController } from "../web/lib/note-search-controller.mjs";

class Node {
  constructor(tag = "div") { Object.assign(this, { tagName: tag.toUpperCase(), textContent: "", children: [], listeners: {}, checked: false, value: "", disabled: false, hidden: false, open: false, isConnected: true }); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() { this.focused = true; }
  setSelectionRange(start, end) { this.selection = [start, end]; }
  scrollIntoView() { this.scrolled = true; }
  closest() { return null; }
}
const note = body => ({ id: "n", title: "検索用ノート", groups: [{ id: "g", title: "猫の大分類", items: [{ id: "d", kind: "divider", label: "猫の区分", value: "猫の補足" }, { id: "i", kind: "entry", heading: "猫の名前", headingRuby: "猫", body, memo: { body: "閉じた猫メモ", tags: ["猫"], linkedConceptMemoIds: ["cm"], conceptMemoSyncFingerprint: "keep" } }] }] });
const all = root => [root, ...root.children.flatMap(all)];
function fixture(body = "猫 |猫《ねこ》 《《猫》》") {
  const keys = ["noteEditorSection", "noteSearchDialog", "openNoteSearchButton", "closeNoteSearchButton", "noteSearchTitle", "noteSearchQuery", "noteSearchNames", "noteSearchDetails", "noteSearchMemos", "noteSearchCase", "noteSearchResults", "noteSearchStatus", "noteSearchPrev", "noteSearchNext", "noteSearchPage", "noteGroups", "notePreviewDialog"];
  const e = Object.fromEntries(keys.map(key => [key, new Node()]));
  const state = { provider: {}, selectedWork: {}, currentNote: { item: { id: "file" }, data: note(body) }, dirty: true, saving: false };
  let scope = "owner/cloud/root"; const timers = new Map(), frames = []; let serial = 0;
  const c = createNoteSearchController({ state, elements: e, document: { createElement: tag => new Node(tag) }, scopeKey: () => scope,
    frame: callback => frames.push(callback), schedule: callback => { timers.set(++serial, callback); return serial; }, unschedule: id => timers.delete(id) });
  const flush = () => { for (const callback of timers.values()) callback(); timers.clear(); };
  const input = value => { e.noteSearchQuery.value = value; e.noteSearchQuery.listeners.input(); flush(); };
  const buttons = () => all(e.noteSearchResults).filter(node => node.tagName === "BUTTON");
  return { c, e, state, timers, frames, flush, input, buttons, setScope: value => { scope = value; } };
}
test('検索は保護箇所を含む全一致を返し、置換語が検索語と同じでも省略しない', () => {
  const data = note("猫 |猫《ねこ》 《《猫》》"), before = JSON.stringify(data);
  const result = core.buildSearchPlan(data, { query: "猫", replacement: "猫", fields: { names: false, details: true } });
  assert.equal(result.matches.length, 3); assert.equal(result.matches.filter(row => row.reason).length, 2); assert.equal(JSON.stringify(data), before);
  assert.equal(core.buildSearchPlan(data, { query: "" }).matches.length, 0);
});
test('検索の対象選択とUnicode位置を保持し、タグ・ふりがな・リンクを含めない', () => {
  const data = note("😀İ猫\r\n猫"), result = core.buildSearchPlan(data, { query: "猫", fields: { names: false, memos: true } });
  assert.deepEqual(result.matches.map(row => [row.fieldIndex, row.start, row.line, row.column]), [[0, 3, 1, 3], [0, 6, 2, 1], [1, 3, 1, 4]]);
  assert.deepEqual(result.fields.map(field => field.field), ["body", "memo.body"]);
  assert.equal(core.buildSearchPlan(note("Aa aA"), { query: "aa", fields: { names: false }, caseSensitive: true }).matches.length, 0);
  assert.equal(core.buildSearchPlan(note("猫 《未完"), { query: "猫", fields: { names: false } }).matches[0].reason, "malformed_notation");
});
test('検索だけでは編集中データ・dirty・保存状態を変えずモーダルを開く', () => {
  const h = fixture(), before = JSON.stringify(h.state); h.c.open(); h.input("猫");
  assert.equal(h.buttons().length, 7); assert.equal(JSON.stringify(h.state), before); assert.equal(h.e.noteSearchDialog.open, true);
  assert.match(h.e.noteSearchStatus.textContent, /7箇所/); assert.equal(h.e.noteSearchQuery.focused, true);
});
test('結果から閉じた項目メモを開き元文字列の位置へ移動する', () => {
  const h = fixture(), control = new Node("textarea"), details = new Node("details");
  control.value = h.state.currentNote.data.groups[0].items[1].memo.body; control.closest = () => details;
  let selector; h.e.noteGroups.querySelector = value => { selector = value; return control; };
  h.c.open(); h.e.noteSearchNames.checked = false; h.e.noteSearchDetails.checked = false; h.e.noteSearchMemos.checked = true; h.input("猫");
  h.buttons()[0].listeners.click(); assert.equal(h.e.noteSearchDialog.open, false); h.frames[0]();
  assert.match(selector, /entry-memo/); assert.match(selector, /data-item-index="1"/); assert.equal(details.open, true); assert.deepEqual(control.selection, [3, 4]); assert.equal(control.scrolled, true); assert.equal(h.state.dirty, true);
});
test('候補表示後の外部更新・ID変更で古い位置へ移動しない', () => {
  const h = fixture(); h.c.open(); h.input("猫"); const old = h.buttons()[0];
  h.state.currentNote.data.groups[0].title = "別の名前"; old.listeners.click(); assert.equal(h.frames.length, 0); assert.match(h.e.noteSearchStatus.textContent, /結果を更新/);
  h.setScope("another/root"); h.buttons()[0].listeners.click(); assert.equal(h.e.noteSearchDialog.open, false); assert.equal(h.e.noteSearchQuery.value, "");
});
test('ノート切替と画面移動で検索条件・結果を破棄する', () => {
  for (const change of [h => { h.state.currentNote = { item: { id: "other" }, data: note("猫") }; }, h => { h.e.noteEditorSection.hidden = true; }, h => { h.state.provider = {}; }]) {
    const h = fixture(); h.c.open(); h.input("猫"); change(h); h.c.changed(); assert.equal(h.e.noteSearchDialog.open, false); assert.equal(h.e.noteSearchQuery.value, ""); assert.equal(h.e.noteSearchResults.children.length, 0);
  }
});
test('同じノートで開き直すと条件を保持し、新しい入力から再検索する', () => {
  const h = fixture(); h.c.open(); h.input("猫"); h.c.close(); h.state.currentNote.data.groups[0].title = "猫 猫"; h.c.open();
  assert.equal(h.e.noteSearchQuery.value, "猫"); assert.equal(h.buttons().length, 8); h.c.changed(); assert.equal(h.buttons().length, 8);
});
test('大量候補は30件ずつ表示しページ移動できる', () => {
  const h = fixture("猫".repeat(65)); h.c.open(); h.e.noteSearchNames.checked = false; h.input("猫");
  assert.equal(h.buttons().length, 30); assert.equal(h.e.noteSearchPage.textContent, "1 / 3"); h.e.noteSearchNext.listeners.click(); assert.equal(h.buttons().length, 30); h.e.noteSearchNext.listeners.click(); assert.equal(h.buttons().length, 5); assert.equal(h.e.noteSearchNext.disabled, true);
});
test('IME変換中は再計算せず、入力変更時は旧結果とタイマーを破棄する', () => {
  const h = fixture(); h.c.open(); h.input("猫"); h.e.noteSearchQuery.listeners.compositionstart(); assert.equal(h.buttons().length, 0); h.e.noteSearchQuery.value = "ねこ"; h.e.noteSearchQuery.listeners.input(); assert.equal(h.timers.size, 0);
  h.e.noteSearchQuery.listeners.compositionend(); assert.equal(h.buttons().length, 1); h.e.noteSearchQuery.value = "別"; h.e.noteSearchQuery.listeners.input(); assert.equal(h.buttons().length, 0); assert.equal(h.timers.size, 1); h.c.close(); assert.equal(h.timers.size, 0);
});
test('元データが変わったら検索結果を無効にし、ジャンプ前に再計算する', () => {
  const h = fixture(); h.c.open(); h.input("猫"); h.state.currentNote.data.groups[0].items.pop(); h.c.changed(); assert.equal(h.buttons().length, 0); h.flush(); assert.equal(h.buttons().length, 3);
});

function replaceFixture(body = '猫 猫 |猫《ねこ》') {
  const h = fixture(body);
  for (const key of ['noteReplaceMode','noteReplaceFields','noteReplaceText','noteReplaceSyncHint','noteReplaceActions','noteReplaceSelectAll','noteReplaceClear','noteReplaceApply','noteReplaceUndo']) h.e[key] = new Node();
  let changes = 0;
  h.c = createNoteSearchController({ state: h.state, elements: h.e, document: { createElement: tag => new Node(tag) }, scopeKey: () => 'owner/cloud/root', frame: callback => h.frames.push(callback),
    schedule: callback => { h.timers.set(1, callback); return 1; }, unschedule: id => h.timers.delete(id),
    onChange: () => { changes++; h.state.dirty = true; h.c.changed(); } });
  h.state.dirty = false; h.c.open(); h.e.noteSearchNames.checked = false; h.e.noteReplaceMode.checked = true; h.e.noteReplaceText.value = '犬'; h.input('猫');
  return { ...h, changes: () => changes, one: () => all(h.e.noteSearchResults).filter(node => node.tagName === 'BUTTON' && node.textContent === 'この箇所を置換'), applyAll: () => { h.e.noteReplaceSelectAll.listeners.click(); h.e.noteReplaceApply.listeners.click(); } };
}
test('Webの1箇所置換は通常の変更通知を一度だけ送り、保護ルビと同期情報を保持する', () => {
  const h = replaceFixture(), item = h.state.currentNote.data.groups[0].items[1];
  assert.equal(h.one().length, 2); assert.equal(h.e.noteReplaceApply.disabled, true); h.one()[0].listeners.click();
  assert.equal(item.body, '犬 猫 |猫《ねこ》'); assert.equal(h.changes(), 1); assert.equal(h.state.dirty, true); assert.equal(item.memo.conceptMemoSyncFingerprint, 'keep'); assert.equal(h.e.noteReplaceUndo.hidden, false);
  assert.match(h.e.noteSearchStatus.textContent, /1箇所を置換しました/);
});
test('ページ外も含む選択候補を1操作で置換し、戻すと別フィールドの追加入力を保持する', () => {
  const h = replaceFixture('猫'.repeat(65)), item = h.state.currentNote.data.groups[0].items[1];
  assert.equal(h.one().length, 30); h.applyAll(); assert.equal(item.body, '犬'.repeat(65)); assert.equal(h.changes(), 1);
  item.heading = '無関係の追加入力'; h.c.changed(); h.flush(); h.e.noteReplaceUndo.listeners.click();
  assert.equal(item.body, '猫'.repeat(65)); assert.equal(item.heading, '無関係の追加入力'); assert.equal(h.changes(), 2); assert.equal(h.e.noteReplaceUndo.hidden, true);
});
test('対象フィールドを後から変更した場合は一部も戻さない', () => {
  const h = replaceFixture(), item = h.state.currentNote.data.groups[0].items[1]; h.applyAll(); item.body = '後から編集';
  h.e.noteReplaceUndo.listeners.click(); assert.equal(item.body, '後から編集'); assert.equal(h.changes(), 1); assert.match(h.e.noteSearchStatus.textContent, /戻せません/);
});
test('置換語の変更・古い元文字列・新しい記法の成立時は適用しない', () => {
  const h = replaceFixture(), item = h.state.currentNote.data.groups[0].items[1], old = h.one()[0];
  h.e.noteReplaceText.value = '《'; h.e.noteReplaceText.listeners.input(); assert.equal(h.e.noteReplaceApply.disabled, true); h.flush(); h.one()[0].listeners.click();
  assert.equal(item.body, '猫 猫 |猫《ねこ》'); assert.equal(h.changes(), 0); assert.match(h.e.noteSearchStatus.textContent, /記法が変わる/);
  item.body = '外部更新'; old.listeners.click(); assert.equal(item.body, '外部更新'); assert.equal(h.changes(), 0);
});
test('保存・反映・競合・文字変換中は置換と戻す操作を抑止する', () => {
  for (const key of ['saving','syncing','externalConflict','noteConceptSyncPending','noteManualSyncPending']) {
    const h = replaceFixture(), item = h.state.currentNote.data.groups[0].items[1]; const button = h.one()[0]; h.state[key] = true; h.c.updateAvailability(); assert.equal(button.disabled, true); button.listeners.click(); assert.equal(item.body, '猫 猫 |猫《ねこ》'); assert.equal(h.changes(), 0);
    h.state[key] = false; h.c.updateAvailability(); assert.equal(button.disabled, false); button.listeners.click(); h.state[key] = true; h.e.noteReplaceUndo.listeners.click(); assert.equal(h.changes(), 1);
  }
  const h = replaceFixture(); h.e.noteReplaceText.listeners.compositionstart(); h.e.noteReplaceSelectAll.listeners.click(); assert.equal(h.changes(), 0); assert.equal(h.e.noteReplaceApply.disabled, true);
});
test('空の置換語は削除、同文は候補なし、メモを対象にした場合だけ本文と更新時刻を変える', () => {
  const h = replaceFixture('猫'), item = h.state.currentNote.data.groups[0].items[1];
  h.e.noteReplaceText.value = '猫'; h.e.noteReplaceText.listeners.input(); h.flush(); assert.equal(h.one().length, 0);
  h.e.noteReplaceText.value = ''; h.e.noteReplaceText.listeners.input(); h.flush(); h.applyAll(); assert.equal(item.body, ''); assert.equal(item.memo.updatedAt, undefined);
  h.e.noteSearchDetails.checked = false; h.e.noteSearchMemos.checked = true; h.e.noteSearchMemos.listeners.change(); h.applyAll();
  assert.equal(item.memo.body, '閉じたメモ'); assert.ok(item.memo.updatedAt); assert.deepEqual(item.memo.linkedConceptMemoIds, ['cm']); assert.equal(item.memo.conceptMemoSyncFingerprint, 'keep');
});
test('自動保存後も同じ編集セッションなら戻せ、ノート再読込時には履歴を破棄できる', () => {
  const h = replaceFixture('猫'); h.applyAll(); h.c.close();
  h.state.currentNote = { ...h.state.currentNote, data: structuredClone(h.state.currentNote.data), raw: 'saved' }; h.state.dirty = false; h.c.open(); h.e.noteReplaceUndo.listeners.click();
  assert.equal(h.state.currentNote.data.groups[0].items[1].body, '猫'); assert.equal(h.changes(), 2); assert.equal(h.state.dirty, true);
  h.applyAll(); h.c.clearUndo(); assert.equal(h.e.noteReplaceUndo.hidden, true); h.e.noteReplaceUndo.listeners.click(); assert.equal(h.changes(), 3);
});
test('選択解除と条件の変更で選択件数をゼロに戻す', () => {
  const h = replaceFixture(); h.e.noteReplaceSelectAll.listeners.click(); assert.match(h.e.noteReplaceApply.textContent, /2箇所/); h.e.noteReplaceClear.listeners.click(); assert.match(h.e.noteReplaceApply.textContent, /0箇所/);
  h.e.noteReplaceSelectAll.listeners.click(); h.e.noteSearchCase.checked = true; h.e.noteSearchCase.listeners.change(); assert.equal(h.e.noteReplaceApply.disabled, true);
});
