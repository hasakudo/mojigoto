import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { normalizeNote } from "../web/lib/notes.mjs";
import { parseNoteInline } from "../web/lib/note-inline.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
class Element {
  constructor(tag = "div", className = "", textContent = "") { Object.assign(this, { tag, className, textContent, children: [], open: false }); this.classList = { contains: () => false }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const file = { id: "target-file", name: "target.json", file: {} };
const makeTarget = () => normalizeNote({ id: "target", type: "reference", title: "登場人物", groups: [{ id: "g", title: "人物", items: [
  { id: "item", kind: "entry", heading: "主人公", body: "対象の詳細", memo: { body: "対象のメモ" } },
  { id: "last", kind: "divider", label: "末尾の区分", value: "補足" },
] }] });
const link = { noteType: "reference", noteId: "target", noteFileName: "target.json", itemId: "item" };
function harness() {
  const calls = { reads: [], lists: [], saves: 0, opens: [], focuses: [], confirmations: 0 };
  const target = makeTarget();
  const source = normalizeNote({ id: "source", type: "plot", title: "編集中", groups: [] });
  const work = { id: "work", mojigoto: { id: "mojigoto" }, mojigotoChildren: [{ id: "refs", name: "references", folder: {} }] };
  const state = { selectedWork: work, currentNote: { item: { id: "source-file" }, data: source, raw: JSON.stringify(source) },
    notes: [], noteType: "plot", noteFolders: {}, noteEntriesCache: new Map(), relatedNoteEntries: new Map(), folderListings: new Map(), relatedPreviewRequest: 0 };
  state.provider = { async readText(item) { calls.reads.push(item.id); return JSON.stringify(target); },
    async listChildren(id) { calls.lists.push(id); return [file]; } };
  const elements = Object.fromEntries(["relatedPreviewDialog", "relatedPreviewTitle", "relatedPreviewType", "relatedPreviewPath", "relatedPreviewNotice", "relatedPreviewContent", "openRelatedPreviewNoteButton", "noteStatus"]
    .map((name) => [name, new Element()]));
  const context = { state, elements, normalizeNote, parseNoteInline, document: { createTextNode: (value) => new Element("text", "", value) }, NOTE_TYPES: { plot: { folder: "plots" }, reference: { folder: "references" } },
    VIEW_CACHE_DURATION: 60000, folderListingKey: (item) => item.id, makeElement: (...args) => new Element(...args),
    beginPerformanceMeasurement: () => () => {}, showLoading: (node, message) => { node.textContent = message; },
    showEmpty: (node, message) => { node.textContent = message; }, cancelAutoSave() {}, scheduleAutoSave() {},
    window: { confirm: () => { calls.confirmations++; return true; } },
    saveCurrentNote: async () => { calls.saves++; state.dirty = false; return true; },
    openNote: async (_entry, options) => { calls.opens.push(options.loadedEntry); state.currentNote = options.loadedEntry; },
    focusRelatedNoteItem: (value) => calls.focuses.push(value.itemId),
  };
  vm.createContext(context);
  vm.runInContext(["appendNoteInline", "relatedNoteMatches", "resolveRelatedNote", "openRelatedTarget", "renderRelatedTarget", "openRelatedPreviewNote"].map(appFunction).join("\n"), context);
  return { state, context, elements, calls, target };
}

test("関連先1ファイルを読み、同じリンクの再表示では取得済み文書を再利用する", async () => {
  const h = harness();
  await h.context.openRelatedTarget(link);
  assert.deepEqual(h.calls.lists, ["refs"]);
  assert.deepEqual(h.calls.reads, ["target-file"]);
  assert.equal(h.elements.relatedPreviewTitle.textContent, "登場人物");
  await h.context.openRelatedTarget(link);
  assert.deepEqual(h.calls.reads, ["target-file"]);
  assert.deepEqual(h.calls.lists, ["refs"]);
  assert.equal(h.elements.openRelatedPreviewNoteButton.disabled, false);
});

test("索引のある一覧からは対象ファイルだけ読み、全ノートを読み込まない", async () => {
  const h = harness();
  h.state.notes = [{ item: file, indexed: true, data: { id: "target", type: "reference" } }];
  await h.context.openRelatedTarget(link);
  assert.deepEqual(h.calls.lists, []);
  assert.deepEqual(h.calls.reads, ["target-file"]);
});

test("同じノートの関連項目は未保存の内容を表示し、保存せずその位置へ移動できる", async () => {
  const h = harness();
  h.state.currentNote = { item: file, data: h.target };
  h.target.groups[0].items[0].body = "まだ保存していない詳細";
  h.state.dirty = true;
  await h.context.openRelatedTarget(link);
  await h.context.openRelatedPreviewNote();
  assert.deepEqual(h.calls.reads, []);
  assert.equal(h.calls.saves, 0);
  assert.equal(h.state.dirty, true);
  assert.deepEqual(h.calls.focuses, ["item"]);
});

test("改名後はIDで見つけ、旧ファイル名を再利用した別ノートへ移動しない", async () => {
  const h = harness();
  const renamed = { id: "renamed", name: "renamed.json", file: {} };
  h.state.provider.listChildren = async () => [file, renamed];
  h.state.provider.readText = async (item) => JSON.stringify(item.id === "renamed" ? h.target : { ...h.target, id: "different" });
  await h.context.openRelatedTarget(link);
  assert.equal(h.state.relatedPreviewContext.entry.item.id, "renamed");
});

test("末尾の区分は次の項目がなくても正常表示する", async () => {
  const h = harness();
  await h.context.openRelatedTarget({ ...link, itemId: "last" });
  assert.equal(h.state.relatedPreviewContext.itemId, "last");
  assert.equal(h.elements.openRelatedPreviewNoteButton.disabled, false);
});

test("読み込み前にパネルを表示し、閉じた後や作品変更後に遅い結果を適用しない", async () => {
  for (const mode of ["close", "work"]) {
    const h = harness();
    let finish;
    h.context.resolveRelatedNote = () => new Promise((resolve) => { finish = resolve; });
    const loading = h.context.openRelatedTarget(link);
    assert.equal(h.elements.relatedPreviewDialog.open, true);
    assert.match(h.elements.relatedPreviewNotice.textContent, /読み込んで/);
    if (mode === "close") h.elements.relatedPreviewDialog.close();
    else h.state.selectedWork = { id: "other" };
    finish({ item: file, data: h.target });
    await loading;
    assert.equal(h.state.relatedPreviewContext, null);
  }
});

test("未許可のフォルダでは作成せず、パネル内に理由を残す", async () => {
  const h = harness();
  h.state.selectedWork.mojigotoChildren = [];
  h.state.provider.listChildren = async () => [];
  await h.context.openRelatedTarget(link);
  assert.match(h.elements.relatedPreviewNotice.textContent, /追加許可/);
  assert.equal(h.elements.openRelatedPreviewNoteButton.disabled, true);
});

test("対象ノートを開く際は未保存内容を先に保存し、最新の読込済み基準を渡す", async () => {
  const h = harness();
  await h.context.openRelatedTarget(link);
  h.state.dirty = true;
  await h.context.openRelatedPreviewNote();
  assert.equal(h.calls.saves, 1);
  assert.equal(h.calls.confirmations, 1);
  assert.equal(h.calls.opens.length, 1);
  assert.equal(h.calls.opens[0].raw, JSON.stringify(h.target));
  assert.equal(h.state.noteType, "reference");
  assert.deepEqual(h.calls.focuses, ["item"]);
});

test("保存の取消・保存失敗・保存中の追加入力・同期エラーでは元の編集画面を維持する", async () => {
  for (const mode of ["cancel", "save-error", "typing", "sync-error"]) {
    const h = harness();
    await h.context.openRelatedTarget(link);
    h.state.dirty = true;
    if (mode === "cancel") h.context.window.confirm = () => false;
    h.context.saveCurrentNote = async () => {
      h.state.dirty = mode !== "sync-error";
      if (mode === "typing") h.state.currentNote.data.title = "追加入力";
      if (mode === "sync-error") h.elements.noteStatus.classList.contains = () => true;
      return mode !== "save-error" && mode !== "typing";
    };
    await h.context.openRelatedPreviewNote();
    assert.equal(h.calls.opens.length, 0);
    assert.equal(h.state.currentNote.data.id, "source");
    assert.equal(h.elements.relatedPreviewDialog.open, true);
  }
});

test("対象の再読込中に入力した場合・項目が消えた場合は移動しない", async () => {
  for (const mode of ["typing", "deleted"]) {
    const h = harness();
    await h.context.openRelatedTarget(link);
    h.state.provider.readText = async () => {
      if (mode === "typing") h.state.currentNote.data.title = "途中の入力";
      else h.target.groups[0].items = [];
      return JSON.stringify(h.target);
    };
    await h.context.openRelatedPreviewNote();
    assert.equal(h.calls.opens.length, 0);
    assert.equal(h.state.currentNote.data.id, "source");
  }
});

test("保存・反映中と連打では移動を重ねない", async () => {
  for (const flag of ["saving", "syncing", "relatedOpening", "deleting"]) {
    const h = harness();
    await h.context.openRelatedTarget(link);
    h.state[flag] = true;
    await h.context.openRelatedPreviewNote();
    assert.equal(h.calls.opens.length, 0);
    assert.match(h.elements.relatedPreviewNotice.textContent, /処理中/);
  }
});

test("編集画面は確認済みの最新基準を再読込せず使用し、通常の入口では従来通り読む", async () => {
  const h = harness();
  let reads = 0;
  const loaded = { item: file, data: h.target, raw: JSON.stringify(h.target) };
  h.context.readNoteEntry = async () => { reads++; return loaded; };
  for (const name of ["renderMemoAutoReflectDefaults", "showNoteEditorLoading", "stopExternalMonitor", "renderInputAssistVisibility", "renderNoteEditor", "setNoteStatus", "startExternalMonitor", "commitRoute", "routeForWork"]) h.context[name] = () => {};
  h.elements.noteEditorSection = { classList: { remove() {} } };
  h.elements.noteEditorLoading = {};
  h.elements.saveNoteButton = {};
  h.elements.noteAutoSaveToggle = {};
  h.elements.noteGroups = { querySelector: () => null };
  vm.runInContext(appFunction("openNote"), h.context);
  await h.context.openNote(loaded, { loadedEntry: loaded });
  assert.equal(reads, 0);
  assert.equal(h.state.currentNote.raw, loaded.raw);
  await h.context.openNote(loaded);
  assert.equal(reads, 1);
});

test("取込リンクは対応先の実IDでプレビューし、同じ参照先の確認結果を再利用する", async () => {
  const h = harness(); let resolutions = 0;
  const entry = { item: file, data: h.target, raw: JSON.stringify(h.target) };
  h.context.resolveImportedNoteLink = async () => { resolutions++; return { entry, link, localWorkId: "origin" }; };
  const imported = { noteType: "reference", noteId: "old-id", itemId: "old-item", importTarget: { workId: "origin", noteId: "old-id" } };
  await h.context.openRelatedTarget(imported);
  assert.equal(h.state.relatedPreviewContext.link.itemId, "item");
  assert.match(JSON.stringify(h.elements.relatedPreviewContent.children), /対象の詳細/);
  await h.context.openRelatedTarget(imported);
  assert.equal(resolutions, 1);
  assert.equal(h.calls.reads.length, 0);
});

test("取込リンクの照合中に作品が変わったら結果を表示・キャッシュしない", async () => {
  const h = harness(); let complete;
  h.context.resolveImportedNoteLink = () => new Promise((resolve) => { complete = resolve; });
  const pending = h.context.openRelatedTarget({ importTarget: { workId: "origin", noteId: "old-id" } });
  h.state.selectedWork = { id: "another" };
  complete({ entry: { item: file, data: h.target, raw: JSON.stringify(h.target) }, link, localWorkId: "origin" });
  await pending;
  assert.equal(h.state.relatedPreviewContext, null);
  assert.equal(h.state.relatedNoteEntries.size, 0);
  assert.equal(h.calls.reads.length, 0);
});
