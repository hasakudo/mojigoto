import { createNoteSaveController } from "../web/lib/note-save.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createNote, createNoteEntry } from "../web/lib/notes.mjs";
import { normalizeNote } from "../web/lib/notes.mjs";
import { hasSameExternalContent, writeTextWithBaseline } from "../web/lib/editor-sync.mjs";
import { OneDriveConflictError } from "../web/storage/onedrive-provider.mjs";
import { ensureNoteItemConcept } from "../web/lib/note-concept-link.mjs";
import { normalizeConceptDocument } from "../web/lib/concept-memos.mjs";
import { parseNoteInline } from "../web/lib/note-inline.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
class Node {
  constructor(tag = "div", className = "", text = "") { this.tag = tag; this.className = className; this.textContent = text; this.children = []; this.open = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener() {}
  setAttribute() {}
  show() { this.open = true; }
  showModal() { this.open = true; }
  get childElementCount() { return this.children.length; }
  querySelectorAll() { return this.children.flatMap((child) => [...(child.tag === "details" ? [child] : []), ...child.querySelectorAll()]); }
  classList = { toggle() {} };
}
const text = (node) => [node.textContent, ...node.children.map(text)].join(" ");
function harness() {
  const note = createNote("plot", "元タイトル");
  note.groups[0].title = "元大分類";
  note.groups[0].items = [createNoteEntry()];
  note.groups[0].items[0].heading = "元項目";
  note.groups[0].items[0].memo.body = "項目メモ本文";
  const elements = Object.fromEntries(["saveNoteButton", "noteToc", "noteTocToggle", "notePreviewTitle", "notePreviewContent", "notePreviewDialog", "notePreviewTypeSelect", "notePreviewSelect", "notePreviewHelp"]
    .map((id) => [id, new Node()]));
  const calls = { autoSave: 0, notices: [], statuses: [], renders: 0 };
  const state = {
    currentNote: { item: { id: "note", name: "plot.json", eTag: "1" }, data: note, raw: JSON.stringify(note) },
    dirty: true, saving: false, noteTocOpen: true, noteType: "plot", noteEntriesCache: new Map(), notePreviewLoadToken:0,
    selectedWork: { id: "work", mojigoto: { id: "mojigoto" } }, provider: { writeText: async () => ({ eTag: "2" }) },
  };
  const context = {
    state, elements, hasSameExternalContent, writeTextWithBaseline, OneDriveConflictError, structuredClone, parseNoteInline,
    Option: function(text, value) { const option = new Node("option", "", text); option.value = value; return option; },
    document: { getElementById: () => null, createTextNode: (value) => new Node("text", "", value) }, makeElement: (...args) => new Node(...args),
    createNoteEntry, ensureNoteItemConcept, normalizeConceptDocument, NOTE_TYPES: { plot: { folder: "plots" } },
    moveToNotePreviewTarget() {}, showEmpty() {}, cancelAutoSave() {},
    scheduleAutoSave: () => { calls.autoSave++; }, setNoteStatus: (...args) => calls.statuses.push(args),
    recordRecentView() {}, routeForWork() {}, rememberTags() {}, updateSharedWorkMetrics() {}, updateNoteIndex() {},
    maybeCreateWebAutomaticBackup: async () => {}, noteBackupTarget() {}, cloudLabel: () => "テストDrive",
    syncSavedNoteToConceptMemos: async () => ({}), notify: (message) => calls.notices.push(message),
    renderNoteEditor: () => { calls.renders++; },
  };
  vm.createContext(context);
  for (const name of ["readerNoteReferenceKey", "isNotePreviewOwnerCurrent", "appendNoteInline", "notePreviewHeading", "renderNoteToc", "openNotePreview", "refreshNoteDerivedViews"]) vm.runInContext(appFunction(name), context);
  Object.assign(context, createNoteSaveController({ ...context,
    cancelAutoSave: (...args) => context.cancelAutoSave(...args),
    scheduleAutoSave: (...args) => context.scheduleAutoSave(...args),
    maybeCreateWebAutomaticBackup: (...args) => context.maybeCreateWebAutomaticBackup(...args),
    writeTextWithBaseline: context.writeTextWithBaseline ? (...args) => context.writeTextWithBaseline(...args) : undefined,
  }));
  return { state, elements, context, calls, note };
}

test("保存後の目次と開いたプレビューが最新の大分類・項目・本文になる", async () => {
  const h = harness();
  h.context.openNotePreview();
  h.state.noteTocOpen = true;
  h.elements.notePreviewContent.children[0].open = false;
  h.note.title = "新タイトル";
  h.note.groups[0].title = "新大分類";
  h.note.groups[0].items[0].heading = "新項目";
  h.note.groups[0].items[0].body = "新本文";
  await h.context.saveCurrentNote();
  assert.match(text(h.elements.noteToc), /新大分類.*新項目/);
  assert.match(text(h.elements.notePreviewContent), /新大分類.*新項目.*新本文/);
  assert.equal(h.elements.notePreviewTitle.textContent, "新タイトル");
  assert.equal(h.elements.notePreviewContent.children[0].open, false);
  assert.equal(h.state.noteTocOpen, true);
  assert.equal(h.calls.renders, 0, "編集欄を再生成してカーソルを動かさない");
});
test("保存中の追加入力も目次へ反映し、保存済み基準とは分けて保持する", async () => {
  const h = harness();
  let resolve;
  h.state.provider.writeText = () => new Promise((yes) => { resolve = yes; });
  const saving = h.context.saveCurrentNote();
  h.note.groups[0].items[0].heading = "追加入力";
  resolve({ eTag: "2" });
  await saving;
  assert.match(text(h.elements.noteToc), /追加入力/);
  assert.equal(h.state.dirty, true);
  assert.equal(JSON.parse(h.state.currentNote.raw).groups[0].items[0].heading, "元項目");
  assert.equal(h.calls.autoSave, 1);
});

test("ふりがなを保存・再読込でき、空欄への変更も保存する", async () => {
  const h = harness();
  for (const reading of ["しゅじんこう", ""]) {
    h.state.currentNote.data.groups[0].items[0].headingRuby = reading;
    h.state.dirty = true;
    let written;
    h.state.provider.writeText = async (_item, content) => { written = content; return { eTag: "2" }; };
    await h.context.saveCurrentNote();
    const restored = normalizeNote(JSON.parse(written));
    assert.equal(restored.groups[0].items[0].headingRuby, reading);
    assert.equal(restored.groups[0].items[0].memo.body, "項目メモ本文");
    assert.equal(h.state.dirty, false);
  }
});

test("保存中のふりがなの追加入力は保存済み基準を進めず下書きに残る", async () => {
  const h = harness();
  h.note.groups[0].items[0].headingRuby = "まえのよみ";
  let resolve;
  h.state.provider.writeText = () => new Promise((yes) => { resolve = yes; });
  const saving = h.context.saveCurrentNote();
  h.note.groups[0].items[0].headingRuby = "あとのよみ";
  resolve({ eTag: "2" });
  await saving;
  assert.equal(JSON.parse(h.state.currentNote.raw).groups[0].items[0].headingRuby, "まえのよみ");
  assert.equal(h.state.currentNote.data.groups[0].items[0].headingRuby, "あとのよみ");
  assert.equal(h.state.dirty, true);
});
test("ノート保存の通信失敗は下書きを保持し無限に自動再試行しない", async () => {
  const h = harness();
  h.state.provider.writeText = async () => { throw new Error("offline"); };
  await h.context.saveCurrentNote();
  assert.equal(h.state.dirty, true);
  assert.equal(h.calls.autoSave, 0);
  assert.equal(h.state.currentNote.item.eTag, "1");
});
test("バックアップ失敗でもノート本文の保存を失敗扱いしない", async () => {
  const h = harness();
  h.context.maybeCreateWebAutomaticBackup = async () => { throw new Error("backup offline"); };
  await h.context.saveCurrentNote();
  assert.equal(h.state.dirty, false);
  assert.equal(h.calls.statuses.at(-1)[0], "保存済み");
  assert.ok(h.calls.notices.some((message) => message.includes("ノートは保存しましたが")));
});
test("Web項目メモは自動設定OFFでも構想メモを作成してノートへリンクする", async () => {
  const h = harness();
  h.state.dirty = false;
  h.state.provider.listChildren = async () => [];
  let created;
  h.state.provider.createTextFile = async (_parent, name, content) => { created = { name, data: JSON.parse(content) }; return { id: "concepts", eTag: "1" }; };
  await h.context.createConceptFromNoteItem(0, 0);
  const memo = created.data.memos[0];
  assert.equal(memo.body, "項目メモ本文");
  assert.equal(memo.source.notePath, ".mojigoto/plots/plot.json");
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds[0], memo.id);
  assert.equal(memo.source.autoSyncToConceptMemo, false);
  assert.equal(h.state.dirty, false);
});
test("構想保存が失敗した場合はノートへ存在しないリンクを保存しない", async () => {
  const h = harness();
  h.state.dirty = false;
  h.state.provider.listChildren = async () => [];
  h.state.provider.createTextFile = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.createConceptFromNoteItem(0, 0), /offline/);
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds.length, 0);
  assert.equal(h.state.saving, false);
});
test("構想保存後にノート保存が失敗してもリンクと下書きは未保存として残す", async () => {
  const h = harness();
  h.state.dirty = false;
  h.state.provider.listChildren = async () => [];
  h.state.provider.createTextFile = async () => ({ id: "concepts", eTag: "1" });
  h.state.provider.writeText = async () => { throw new Error("offline"); };
  await h.context.createConceptFromNoteItem(0, 0);
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds.length, 1);
  assert.ok(h.calls.notices.some((message) => message.includes("リンク情報は未保存")));
});
test("作成中に項目位置が変わっても別項目へ構想リンクを付けない", async () => {
  const h = harness();
  h.state.dirty = false;
  h.state.provider.listChildren = async () => [];
  let resume, entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  h.state.provider.createTextFile = async () => {
    entered();
    return new Promise((resolve) => { resume = resolve; });
  };
  const creating = h.context.createConceptFromNoteItem(0, 0);
  await ready;
  h.note.groups[0].items.unshift(createNoteEntry());
  resume({ id: "concepts", eTag: "1" });
  await creating;
  const items = h.state.currentNote.data.groups[0].items;
  assert.equal(items[0].memo.linkedConceptMemoIds.length, 0);
  assert.equal(items[1].memo.linkedConceptMemoIds.length, 1);
});
