import { createNoteSaveController } from "../web/lib/note-save.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { normalizeConceptDocument } from "../web/lib/concept-memos.mjs";
import { makeNoteIndexEntry } from "../web/lib/note-index.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
function harness(cloudKind = "googleDrive") {
  const calls = [];
  const work = { id: "work", mojigoto: { id: "metadata" }, mojigotoChildren: [], metrics: { totalChars: 10, noteCount: 1 } };
  const state = { cloudKind, selectedWork: work, conceptLoadedAt: 0, noteFolders: {},
    provider: {
      async listChildren() { return []; },
      async createTextFile(_folder, name, content) { calls.push(["create", name]); return { id: name, name, file: {}, content }; },
      async createFolder(_folder, name) { calls.push(["folder", name]); return { id: name, name, folder: {} }; },
      async readText(file) { return file.content || '{"memos":[]}'; },
      async writeText(file, content) { calls.push(["write", file.id]); return { ...file, content }; },
    },
  };
  const context = vm.createContext({ state, structuredClone, normalizeConceptDocument, makeNoteIndexEntry,
    VIEW_CACHE_DURATION: 30000, hasExternalVersion: () => false,
    NOTE_TYPES: { plot: { folder: "plots" } }, countTextByMode: (text) => text.length,
    persistWorkCatalog() {}, loadSelectedNoteIndex: async () => null });
  for (const name of ["ensureConceptDocument", "ensureNoteFolder", "updateNoteIndex", "updateSharedWorkMetrics"]) {
    vm.runInContext(appFunction(name), context);
  }
  Object.assign(context, createNoteSaveController({ ...context,
    cancelAutoSave: (...args) => context.cancelAutoSave(...args),
    scheduleAutoSave: (...args) => context.scheduleAutoSave(...args),
    maybeCreateWebAutomaticBackup: (...args) => context.maybeCreateWebAutomaticBackup(...args),
    writeTextWithBaseline: context.writeTextWithBaseline ? (...args) => context.writeTextWithBaseline(...args) : undefined,
  }));
  return { state, context, calls, work };
}

test("未許可の構想メモは空ドキュメントを作らず、追加許可後は最新一覧を読む", async () => {
  const h = harness();
  await assert.rejects(h.context.ensureConceptDocument(), /追加許可/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.conceptDocument, undefined);
  h.state.provider.listChildren = async () => [{ id: "pc-concepts", name: "concept-memos.json", file: {}, content: '{"memos":[{"id":"memo","title":"VS Codeのメモ"}]}' }];
  await h.context.ensureConceptDocument();
  assert.equal(h.state.conceptFile.id, "pc-concepts");
  assert.equal(h.state.conceptDocument.memos[0].title, "VS Codeのメモ");
  assert.equal(h.calls.length, 0);
});

test("項目メモからの作成も未許可なら止まり、ノートのリンクと保存状態を変えない", async () => {
  const h = harness();
  const item = { id: "item", memo: { body: "残す本文", linkedConceptMemoIds: [] } };
  h.state.currentNote = { data: { type: "plot", groups: [{ items: [item] }] }, item: { name: "note.json" } };
  const before = JSON.stringify(h.state.currentNote);
  h.context.cancelAutoSave = () => {};
  h.context.scheduleAutoSave = () => { throw new Error("Unexpected auto save"); };
  await assert.rejects(h.context.createConceptFromNoteItem(0, 0), /追加許可/);
  assert.equal(JSON.stringify(h.state.currentNote), before);
  assert.equal(h.state.saving, false);
  assert.equal(h.calls.length, 0);
});

test("未許可のノート保存先フォルダを重複作成しない", async () => {
  const h = harness();
  await assert.rejects(h.context.ensureNoteFolder("plot"), /追加許可/);
  assert.equal(h.state.noteFolders.plot, undefined);
  assert.equal(h.calls.length, 0);
});

test("未許可の索引と集計は作成・書き込みを見送り、既存状態を保持する", async () => {
  const h = harness();
  const metrics = h.work.metrics;
  await h.context.updateNoteIndex({ id: "note" }, { type: "plot" });
  await h.context.updateSharedWorkMetrics({ beforeContent: "旧", afterContent: "新しい本文" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.work.metrics, metrics);
  assert.equal(h.state.noteIndex, undefined);
});

test("許可済みの索引と集計は既存ファイルへ保存する", async () => {
  const h = harness();
  h.state.noteIndexFile = { id: "pc-index", name: "notes-index.json" };
  h.work.metricsFile = { id: "pc-metrics", name: "work-metrics.json" };
  await h.context.updateNoteIndex({ id: "note", name: "note.json" }, { id: "note", title: "ノート", type: "plot", groups: [] });
  await h.context.updateSharedWorkMetrics({ beforeContent: "旧", afterContent: "新しい本文" });
  assert.deepEqual(h.calls, [["write", "pc-index"], ["write", "pc-metrics"]]);
  assert.equal(h.work.metrics.totalChars, 14);
  assert.equal(h.state.noteIndex.plots.length, 1);
});

test("OneDriveとDropboxでは構想メモ・ノートフォルダ・索引・集計の初回作成を維持する", async () => {
  for (const kind of ["oneDrive", "dropbox"]) {
    const h = harness(kind);
    await h.context.ensureConceptDocument();
    await h.context.ensureNoteFolder("plot");
    await h.context.updateNoteIndex({ id: "note", name: "note.json" }, { id: "note", title: "ノート", type: "plot", groups: [] });
    await h.context.updateSharedWorkMetrics({ beforeContent: "旧", afterContent: "新しい本文" });
    assert.deepEqual(h.calls, [["create", "concept-memos.json"], ["folder", "plots"], ["create", "notes-index.json"], ["create", "work-metrics.json"]]);
  }
});
