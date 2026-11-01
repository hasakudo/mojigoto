import { createConceptSaveController } from "../web/lib/concept-save.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { normalizeConceptDocument, memoEditableText } from "../web/lib/concept-memos.mjs";
import { hasSameExternalContent } from "../web/lib/editor-sync.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app);
  assert.ok(match, name);
  const end = /\r?\n}\r?\n/.exec(app.slice(match.index));
  return app.slice(match.index, match.index + end.index + end[0].length);
}
class Element {
  constructor(tag = "div", className = "", textContent = "") {
    Object.assign(this, { tag, className, textContent, children: [], events: {}, attrs: {}, scrollTop: 0 });
    this.classList = { toggle: (name, on) => { this.attrs[name] = on; } };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  close() { this.open = false; }
}
function harness({ dirty = true, choice = "cancel", realSave = false } = {}) {
  const doc = normalizeConceptDocument({ memos: [
    { id: "a", title: "最初", type: "text", body: "保存済み" },
    { id: "b", title: "次", type: "list", listItems: [{ text: "一行目" }, { text: "二行目" }] },
    { id: "c", title: "TODO", type: "todo", todoItems: [{ text: "確認", done: true }] },
  ] });
  const state = { conceptDocument: doc, conceptOriginalContent: JSON.stringify(doc), currentConceptMemo: doc.memos[0],
    dirty, selectedWork: { id: "work" }, conceptEditorListVisible: true, conceptFile: { id: "file" }, provider: {} };
  if (dirty) state.currentConceptMemo.body = "未保存の入力";
  const elements = Object.fromEntries(["conceptMemoEditorSection", "conceptEditorListPanel", "conceptEditorListContent", "editorListDialog", "saveConceptMemoButton", "conflictDialog"]
    .map((name) => [name, new Element()]));
  elements.conceptEditorListPanel.parentElement = new Element();
  elements.conflictDialog.showModal = () => { elements.conflictDialog.open = true; };
  const calls = { opened: [], notices: [], saves: 0, writes: [], schedules: 0 };
  const context = { state, elements, structuredClone, normalizeConceptDocument, memoEditableText, hasSameExternalContent,
    makeElement: (...args) => new Element(...args), requestAnimationFrame() {}, positionConceptEditorList() {},
    notify: (...args) => calls.notices.push(args), cancelAutoSave() {},
    scheduleAutoSave: () => calls.schedules++, chooseConceptMemoSwitch: async () => choice,
    saveCurrentConceptMemo: async () => { calls.saves++; state.dirty = false; return true; },
    openConceptMemo: (id) => { state.currentConceptMemo = state.conceptDocument.memos.find((memo) => memo.id === id); state.dirty = false; calls.opened.push(id); },
    writeTextWithBaseline: async (_provider, _file, content) => { calls.writes.push(content); return { eTag: "saved" }; },
    setConceptStatus() {}, rememberTags() {}, cloudLabel: () => "Drive", conceptMemoBackupTarget() {},
    maybeCreateWebAutomaticBackup: async () => {},
    syncCurrentConceptMemo: async () => {},
    setConceptSyncStatus: (_message, tone) => { state.conceptSyncBlocked = tone === "error"; },
    OneDriveConflictError: class extends Error {},
  };
  vm.createContext(context);
  vm.runInContext(["restoreSavedConceptDraft", "makeConceptEditorListItem", "renderConceptEditorList", "requestConceptMemoSwitch"].map(appFunction).join("\n"), context);
  if (realSave) Object.assign(context, createConceptSaveController({ ...context,
    writeTextWithBaseline: (...args) => context.writeTextWithBaseline(...args),
    maybeCreateWebAutomaticBackup: (...args) => context.maybeCreateWebAutomaticBackup(...args),
    syncCurrentConceptMemo: (...args) => context.syncCurrentConceptMemo(...args),
  }));
  return { context, state, elements, calls };
}

test("共有データの順序・3種別・選択と未保存を一覧へ描画し、スクロールを保持する", () => {
  const h = harness();
  h.elements.conceptEditorListContent.scrollTop = 35;
  h.state.conceptDocument.memos[0].title = "<img src=x onerror=alert(1)>";
  h.context.renderConceptEditorList();
  const rows = h.elements.conceptEditorListContent.children;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].children[0].textContent, "<img src=x onerror=alert(1)>");
  assert.equal(rows[0].attrs["aria-current"], "true");
  assert.match(rows[0].children[1].textContent, /TEXT.*未保存/);
  assert.equal(rows[0].children[2].textContent, "未保存の入力");
  assert.match(rows[1].children[1].textContent, /LIST/);
  assert.equal(rows[1].children[2].textContent, "一行目\n二行目");
  assert.equal(rows[2].children[2].textContent, "[x] 確認");
  assert.equal(h.elements.conceptEditorListContent.scrollTop, 35);
  h.state.conceptEditorListVisible = false;
  h.context.renderConceptEditorList();
  assert.equal(h.elements.conceptEditorListPanel.hidden, true);
});

test("同じメモの再選択と未保存のキャンセルは入力を変更しない", async () => {
  const h = harness();
  assert.equal(await h.context.requestConceptMemoSwitch("a"), false);
  assert.equal(await h.context.requestConceptMemoSwitch("b"), false);
  assert.equal(h.state.currentConceptMemo.body, "未保存の入力");
  assert.equal(h.state.dirty, true);
  assert.equal(h.calls.saves, 0);
  assert.equal(h.state.conceptSwitchPending, false);
});

test("保存せず切り替えた編集を次のメモ保存へ混ぜない", async () => {
  const h = harness({ choice: "discard", realSave: true });
  assert.equal(await h.context.requestConceptMemoSwitch("b"), true);
  assert.equal(h.state.conceptDocument.memos[0].body, "保存済み");
  h.state.currentConceptMemo.listItems[0].text = "次の編集";
  h.state.dirty = true;
  assert.equal(await h.context.saveCurrentConceptMemo(), true);
  assert.equal(JSON.parse(h.calls.writes[0]).memos[0].body, "保存済み");
});

test("未保存の新規メモを破棄すると共有文書からも取り除き、一覧へ戻る破棄も復元する", async () => {
  const h = harness({ choice: "discard" });
  const memo = { id: "new", body: "未保存の新規メモ" };
  h.state.conceptDocument.memos.push(memo);
  h.state.currentConceptMemo = memo;
  assert.equal(await h.context.requestConceptMemoSwitch("b"), true);
  assert.equal(h.state.conceptDocument.memos.some((item) => item.id === "new"), false);
  const back = harness();
  back.context.restoreSavedConceptDraft();
  assert.equal(back.state.conceptDocument.memos[0].body, "保存済み");
  assert.match(appFunction("openConceptMemos"), /canDiscardDraft\(\)[\s\S]*restoreSavedConceptDraft\(\)/);
  assert.match(appFunction("renderConceptMemosList"), /requestConceptMemoSwitch\(memo.id\)/);
});

test("保存して切り替える場合だけ保存し、保存完了後に開く", async () => {
  const h = harness({ choice: "save", realSave: true });
  assert.equal(await h.context.requestConceptMemoSwitch("b"), true);
  assert.equal(JSON.parse(h.calls.writes[0]).memos[0].body, "未保存の入力");
  assert.deepEqual(h.calls.opened, ["b"]);
});

test("保存・同期・削除中と連打では二つ目の切替を実行しない", async () => {
  for (const flag of ["saving", "syncing", "deleting", "conceptSwitchPending"]) {
    const h = harness({ dirty: false });
    h.state[flag] = true;
    assert.equal(await h.context.requestConceptMemoSwitch("b"), false);
    assert.deepEqual(h.calls.opened, []);
  }
  const h = harness({ choice: "save" });
  let resolve;
  h.context.chooseConceptMemoSwitch = () => new Promise((done) => { resolve = done; });
  const pending = h.context.requestConceptMemoSwitch("b");
  assert.equal(await h.context.requestConceptMemoSwitch("c"), false);
  resolve("cancel");
  await pending;
  assert.equal(h.calls.saves, 0);
});

test("通信失敗・競合・保存中の追加入力では元のメモと入力を保持する", async () => {
  for (const mode of ["offline", "conflict", "typing"]) {
    const h = harness({ choice: "save", realSave: true });
    h.context.writeTextWithBaseline = async () => {
      if (mode === "typing") { h.state.currentConceptMemo.body += "追加入力"; return {}; }
      throw Object.assign(new Error(mode), mode === "conflict" ? { code: "conflict" } : {});
    };
    assert.equal(await h.context.requestConceptMemoSwitch("b"), false);
    assert.equal(h.state.currentConceptMemo.id, "a");
    assert.equal(h.state.dirty, true);
    assert.match(h.state.currentConceptMemo.body, /未保存の入力/);
  }
});

test("原本保存後の反映エラーは画面を維持し、バックアップ失敗だけなら切替できる", async () => {
  const h = harness({ choice: "save", realSave: true });
  h.state.currentConceptMemo.source = { autoSyncToNoteItem: true };
  h.context.syncCurrentConceptMemo = async () => { throw new Error("反映先の保存失敗"); };
  assert.equal(await h.context.requestConceptMemoSwitch("b"), false);
  assert.equal(h.state.dirty, false);
  assert.equal(h.state.currentConceptMemo.id, "a");
  assert.equal(h.state.conceptSyncBlocked, true);
  const backup = harness({ choice: "save", realSave: true });
  backup.context.maybeCreateWebAutomaticBackup = async () => { throw new Error("backup"); };
  assert.equal(await backup.context.requestConceptMemoSwitch("b"), true);
});

test("選択中に作品や切替対象が変わった場合は誤ったメモを開かない", async () => {
  const h = harness();
  h.context.chooseConceptMemoSwitch = async () => { h.state.selectedWork = { id: "other" }; return "discard"; };
  assert.equal(await h.context.requestConceptMemoSwitch("b"), false);
  const deleted = harness({ choice: "discard" });
  deleted.state.conceptOriginalContent = JSON.stringify({ memos: [{ id: "a" }] });
  assert.equal(await deleted.context.requestConceptMemoSwitch("b"), false);
  assert.equal(deleted.state.dirty, true);
});

test("既存一覧も同じ切替入口を使い、設定は端末に保存し、モバイルは開閉式にする", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  assert.match(appFunction("openEditorList"), /map\(makeConceptEditorListItem\)/);
  assert.match(app, /conceptEditorListVisible: localStorage.getItem\(CONCEPT_EDITOR_LIST_KEY\) === "true"/);
  assert.match(app, /localStorage.setItem\(CONCEPT_EDITOR_LIST_KEY, String\(state.conceptEditorListVisible\)\)/);
  assert.match(html, /<details id="conceptEditorListPanel"[^>]+hidden>/);
  assert.match(css, /@media \(min-width: 840px\)/);
  const scheduler = await readFile(new URL("../web/lib/editor-save-scheduler.mjs", import.meta.url), "utf8");
  assert.match(scheduler, /state.conceptSwitchPending/);
});
