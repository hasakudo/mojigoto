import { createManuscriptSaveController } from "../web/lib/manuscript-save.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { normalizeRecentManuscripts, updateRecentManuscripts, manuscriptParentMatches } from "../web/lib/recent-manuscripts.mjs";
import { safeDriveItemSnapshot } from "../web/lib/work-discovery.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
const scope = { cloudKind: "googleDrive", rootId: "root", workId: "work", manuscriptId: "manuscripts" };
const rootFolder = { id: "manuscripts", name: "原稿", folder: {} };
const chapter1 = { id: "chapter1", name: "一巻", folder: {}, parentReference: { id: "manuscripts" } };
const chapter2 = { id: "chapter2", name: "第一章", folder: {}, parentReference: { id: "chapter1" } };
const manuscript = { id: "file", name: "本文.txt", file: {}, parentReference: { id: "chapter2" } };
const entry = (id = "file", day = 1) => ({ ...scope, item: { ...manuscript, id }, folder: chapter2,
  trail: [chapter1, chapter2], editedAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z` });

test("保存日時順に5件へ制限し、同じ原稿の再保存を先頭にして本文等を残さない", () => {
  let entries = [];
  for (let day = 1; day <= 7; day++) entries = updateRecentManuscripts(entries, entry(`file${day}`, day), scope);
  assert.deepEqual(entries.map((item) => item.item.id), ["file7", "file6", "file5", "file4", "file3"]);
  entries = updateRecentManuscripts(entries, { ...entry("file5", 9), body: "本文", token: "secret", item: { ...manuscript, id: "file5", body: "本文", token: "secret" } }, scope);
  assert.equal(entries.length, 5);
  assert.equal(entries[0].item.id, "file5");
  assert.doesNotMatch(JSON.stringify(entries), /"body"|secret|token/);
});

test("接続先・作品・ルート違いと壊れた日時・階層を除外する", () => {
  const valid = entry();
  const invalid = [null, { ...valid, cloudKind: "dropbox" }, { ...valid, rootId: "other" }, { ...valid, workId: "other" },
    { ...valid, editedAt: "broken" }, { ...valid, trail: [] }, { ...valid, trail: [chapter1] }];
  const { manuscriptId: _root, ...expected } = valid;
  assert.deepEqual(normalizeRecentManuscripts([...invalid, valid], scope), [expected]);
  assert.deepEqual(normalizeRecentManuscripts("broken json", scope), []);
});

test("Drive・OneDriveの親IDとDropboxの親パスを照合する", () => {
  assert.equal(manuscriptParentMatches(manuscript, chapter2), true);
  assert.equal(manuscriptParentMatches(manuscript, chapter1), false);
  assert.equal(manuscriptParentMatches({ parentReference: { id: "/work/原稿" } }, { id: "id:folder", path_lower: "/work/原稿" }), true);
});

class Element {
  constructor(tag = "div", className = "", textContent = "") { Object.assign(this, { tag, className, textContent, children: [], events: {}, attrs: {}, value: "新しい本文" }); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(key, callback) { this.events[key] = callback; }
}
function harness() {
  const storage = new Map(), calls = { writes: [], reads: [], metadata: [], opens: [], folders: [] };
  const state = { cloudKind: "googleDrive", workRoot: { id: "root" }, userSession: { user: { id: "owner-a" } },
    selectedWork: { id: "work", manuscript: rootFolder }, currentFile: manuscript, manuscriptFolder: chapter2,
    manuscriptTrail: [chapter1, chapter2], fileLoadRequest: 0, originalContent: "元の本文", dirty: true };
  state.provider = { async writeText(_file, content) { calls.writes.push(content); return { eTag: "v2" }; },
    async getItemMetadata(item) { calls.metadata.push(item.id); return item; },
    async readText(item) { calls.reads.push(item.id); return "クラウドの本文"; } };
  const elements = Object.fromEntries(["recentManuscriptsPanel", "recentManuscriptsCount", "recentManuscriptsList", "recentManuscriptsNotice", "readerContent", "saveFileButton", "readerSection", "filesSection"]
    .map((key) => [key, new Element()]));
  elements.conflictDialog = { showModal() {} };
  const context = { state, elements, normalizeRecentManuscripts, updateRecentManuscripts, manuscriptParentMatches, safeDriveItemSnapshot,
    RECENT_MANUSCRIPTS_KEY: "recent", workCatalogOwner: () => state.userSession.user.id,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    readJson: (value) => { try { return JSON.parse(value); } catch { return null; } },
    makeElement: (...args) => new Element(...args), formatDate: (date) => date,
    showEmpty: (node, message) => { node.replaceChildren(new Element("p", "", message)); },
    canDiscardDraft: () => !state.saving && !state.syncing && !state.openingRecentManuscript,
    cancelAutoSave() {}, stopExternalMonitor() {}, scheduleAutoSave() {}, updateReaderMeta() {}, setEditorStatus() {}, resetPageScroll() {},
    notify() {}, countCharacters: (value) => value.length, makeWritingEvent: (event) => event,
    appendWritingEvent: async () => {}, updateSharedWorkMetrics() {}, maybeCreateWebAutomaticBackup() {}, cloudLabel: () => "Drive",
    OneDriveConflictError: class extends Error {}, isManuscriptFile: (item) => Boolean(item.file && /\.(txt|md)$/i.test(item.name)),
    openFile: async (file, options) => { calls.opens.push({ file, options }); state.currentFile = file; state.dirty = false; return true; },
    openManuscriptFolder: async (...args) => calls.folders.push(args),
  };
  vm.createContext(context);
  for (const name of ["captureRecentManuscriptContext", "readRecentManuscripts", "recordRecentManuscript", "removeRecentManuscript", "renderRecentManuscripts", "openRecentManuscript"]) vm.runInContext(appFunction(name), context);
  Object.assign(context, createManuscriptSaveController(context));
  return { state, elements, storage, calls, context };
}

test("手動・自動の原稿保存成功だけを記録し、保存失敗や変更なしでは増やさない", async () => {
  for (const mode of ["manual", "auto", "failed", "unchanged"]) {
    const h = harness();
    if (mode === "failed") h.state.provider.writeText = async () => { throw new Error("offline"); };
    if (mode === "unchanged") h.elements.readerContent.value = h.state.originalContent;
    await h.context.saveCurrentFile({ automatic: mode === "auto" });
    const entries = h.context.readRecentManuscripts();
    assert.equal(entries.length, ["manual", "auto"].includes(mode) ? 1 : 0);
    assert.doesNotMatch([...h.storage.values()].join(""), /新しい本文|元の本文/);
  }
});

test("ユーザーと作品が変わっても元の履歴を分離して保持し、再読み込みできる", () => {
  const h = harness();
  h.context.recordRecentManuscript(manuscript, h.context.captureRecentManuscriptContext());
  h.state.userSession.user.id = "owner-b";
  assert.equal(h.context.readRecentManuscripts().length, 0);
  h.state.userSession.user.id = "owner-a";
  h.state.selectedWork = { ...h.state.selectedWork, id: "other" };
  assert.equal(h.context.readRecentManuscripts().length, 0);
  h.state.selectedWork.id = "work";
  assert.equal(h.context.readRecentManuscripts().length, 1);
});

test("履歴保存先が使用できなくても原稿の保存成功を取り消さない", async () => {
  const h = harness();
  h.context.localStorage.setItem = () => { throw new Error("quota"); };
  await h.context.saveCurrentFile();
  assert.equal(h.state.originalContent, "新しい本文");
  assert.equal(h.state.dirty, false);
  assert.equal(h.state.saving, false);
});

test("深い階層を直接開き、章の改名を反映して戻る一覧も同じ階層にする", async () => {
  const h = harness();
  h.state.dirty = false;
  h.state.manuscriptFolder = rootFolder;
  h.state.manuscriptTrail = [];
  h.state.provider.getItemMetadata = async (item) => ({ ...item, name: item.id === "chapter2" ? "第一章・改名後" : item.name });
  assert.equal(await h.context.openRecentManuscript(entry()), true);
  assert.equal(h.calls.opens[0].options.content, "クラウドの本文");
  assert.equal(h.state.manuscriptFolder.id, "chapter2");
  assert.equal(h.state.manuscriptTrail[1].name, "第一章・改名後");
  let back;
  h.elements.backToFilesButton = { addEventListener: (_key, callback) => { back = callback; } };
  const start = app.indexOf('elements.backToFilesButton.addEventListener');
  vm.runInContext(app.slice(start, app.indexOf('\n});', start) + 4), h.context);
  await back();
  assert.equal(h.calls.folders[0][0].id, "chapter2");
  assert.equal(h.calls.folders[0][1][1].name, "第一章・改名後");
});

test("開くだけでは保存日時・順序を変えず、取得した新しいファイル名だけ更新する", async () => {
  const h = harness();
  const captured = h.context.captureRecentManuscriptContext();
  h.storage.set(captured.storageKey, JSON.stringify([entry()]));
  h.state.dirty = false;
  h.state.provider.getItemMetadata = async (item) => ({ ...item, name: item.id === "file" ? "改名後.txt" : item.name });
  await h.context.openRecentManuscript(entry());
  const saved = h.context.readRecentManuscripts();
  assert.equal(saved[0].item.name, "改名後.txt");
  assert.equal(saved[0].editedAt, entry().editedAt);
});

test("削除・移動・未許可では入力と現在の階層を変えず、理由を一覧内へ残す", async () => {
  for (const mode of ["deleted", "moved", "permission"]) {
    const h = harness();
    const folder = h.state.manuscriptFolder;
    h.state.provider.getItemMetadata = async (item) => {
      if (mode !== "moved") throw new Error(mode);
      return item.id === "file" ? { ...item, parentReference: { id: "other" } } : item;
    };
    assert.equal(await h.context.openRecentManuscript(entry()), false);
    assert.equal(h.calls.opens.length, 0);
    assert.equal(h.state.manuscriptFolder, folder);
    assert.equal(h.elements.readerContent.value, "新しい本文");
    assert.match(h.elements.recentManuscriptsNotice.textContent, /移動・削除や追加許可/);
  }
});

test("読み込み中の追加入力や作品変更、保存中の操作では原稿へ切り替えない", async () => {
  for (const mode of ["typing", "work", "saving"]) {
    const h = harness();
    if (mode === "saving") h.state.saving = true;
    h.state.provider.readText = async () => {
      if (mode === "typing") h.elements.readerContent.value = "追加入力";
      if (mode === "work") h.state.selectedWork = { id: "other", manuscript: rootFolder };
      return "クラウドの本文";
    };
    assert.equal(await h.context.openRecentManuscript(entry()), false);
    assert.equal(h.calls.opens.length, 0);
  }
});

test("履歴から外す操作は原稿に対するクラウド操作を行わない", () => {
  const h = harness();
  h.context.recordRecentManuscript(manuscript, h.context.captureRecentManuscriptContext());
  assert.equal(h.context.removeRecentManuscript("file"), true);
  assert.equal(h.context.readRecentManuscripts().length, 0);
  assert.deepEqual(h.calls.writes, []);
  assert.deepEqual(h.calls.reads, []);
});
