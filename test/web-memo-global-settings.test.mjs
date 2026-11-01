import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { normalizeNote } from "../web/lib/notes.mjs";
import { createNoteSaveController } from "../web/lib/note-save.mjs";
import { isNoteMemoAutoSyncEnabled, isConceptMemoAutoSyncEnabled, noteAutoReflectEnabled, conceptAutoReflectEnabled } from "../web/lib/memo-auto-reflect.mjs";
import { keepExistingMemoDefaultsOff } from "../web/lib/memo-auto-reflect-settings.mjs";
const desktop = createRequire(import.meta.url)("../src/data/memo-auto-sync.js");
const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; }

test("全体の既定と個別例外の優先順位はVS Codeと一致する", () => {
  for (const fallback of [true, false]) for (const legacy of [undefined, false, true]) for (const override of [null, false, true]) {
    const note = { autoSyncToConceptMemo: legacy, autoSyncToConceptMemoOverride: override };
    const source = { autoSyncToNoteItem: legacy, autoSyncToNoteItemOverride: override };
    assert.equal(isNoteMemoAutoSyncEnabled(note, fallback), desktop.isNoteMemoAutoSyncEnabled(note, fallback));
    assert.equal(isConceptMemoAutoSyncEnabled(source, fallback), desktop.isConceptMemoAutoSyncEnabled(source, fallback));
  }
});
test("未設定の方向は従来の端末許可を保持し、設定済みの方向だけ全体の既定を使う", () => {
  const state = { noteToConceptAutoReflect: false, conceptToNoteAutoReflect: false,
    memoAutoReflectDefaults: { note: true, concept: true, confirmed_note: true, confirmed_concept: false } };
  assert.equal(noteAutoReflectEnabled(state, {}), true);
  assert.equal(conceptAutoReflectEnabled(state, { autoSyncToNoteItem: true }), false);
});

function noteHarness({ documentExists = true, defaults = { note: true, concept: true } } = {}) {
  const note = normalizeNote({ id: "note", type: "plot", title: "作品ノート", groups: [{ id: "group", items: [
    { id: "item", kind: "entry", heading: "項目", memo: { body: "初回の項目メモ" } },
  ] }] });
  const files = new Map(), writes = [], attempts = [], notices = [], statuses = [];
  function put(id, name, data, parent = "meta") {
    const entry = { id, name, file: {}, eTag: "1", parentReference: { id: parent } };
    files.set(id, { entry, content: JSON.stringify(data) }); return entry;
  }
  const item = put("note-file", "note.json", note, "plots");
  if (documentExists) put("concept-file", "concept-memos.json", { memos: [] });
  let creates = 0;
  const provider = {
    listChildren: async (id) => [...files.values()].filter(value => value.entry.parentReference.id === id).map(value => ({ ...value.entry })),
    readText: async (entry) => files.get(entry.id).content,
    getItemMetadata: async (entry) => ({ ...files.get(entry.id).entry }),
    async writeText(entry, content, expected) {
      attempts.push({ id: entry.id, content, expected });
      await provider.beforeWrite?.(entry, content);
      const current = files.get(entry.id);
      if (expected !== current.entry.eTag) throw Object.assign(new Error("conflict"), { code: "conflict" });
      current.content = content; current.entry = { ...current.entry, eTag: String(Number(current.entry.eTag) + 1) };
      writes.push({ id: entry.id, content, expected }); return { ...current.entry };
    },
    async createTextFile(_folder, name, content) { creates++; return put("concept-file", name, JSON.parse(content)); },
  };
  const state = { currentNote: { item, data: note, raw: files.get(item.id).content }, provider,
    selectedWork: { id: "work", mojigoto: { id: "meta" } }, memoAutoReflectDefaults: defaults,
    dirty: true, noteType: "plot", noteEntriesCache: new Map(), cloudKind: "oneDrive" };
  const noteStatus = {};
  const statusStart = app.indexOf('function setNoteStatus(');
  const statusEnd = app.indexOf('\n}', statusStart) + 2;
  const realSetNoteStatus = vm.runInNewContext('(' + app.slice(statusStart, statusEnd) + ')', { state, elements: { noteStatus } });
  let schedules = 0;
  const controller = createNoteSaveController({ state, elements: { saveNoteButton: {}, conflictDialog: { showModal() {} } },
    cancelAutoSave() {}, scheduleAutoSave: () => schedules++, setNoteStatus: (...args) => { statuses.push(args); realSetNoteStatus(...args); },
    refreshNoteDerivedViews() {}, recordRecentView() {}, routeForWork() {}, rememberTags() {}, updateSharedWorkMetrics() {}, updateNoteIndex() {},
    maybeCreateWebAutomaticBackup: async () => {}, noteBackupTarget() {}, notify: (...args) => notices.push(args), cloudLabel: () => "Drive", renderNoteEditor() {},
  });
  return { state, controller, provider, files, writes, attempts, notices, statuses, note, noteStatus,
    creates: () => creates, schedules: () => schedules,
    concepts: () => JSON.parse(files.get("concept-file").content),
  };
}
test("全体ONなら初回保存で構想メモを作成・連携し、次の保存で重複作成しない", async () => {
  const h = noteHarness({ documentExists: false });
  assert.equal(await h.controller.saveCurrentNote(), true);
  assert.equal(h.creates(), 1); assert.equal(h.concepts().memos.length, 1);
  const id = h.concepts().memos[0].id;
  assert.deepEqual(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds, [id]);
  assert.deepEqual(JSON.parse(h.state.currentNote.raw).groups[0].items[0].memo.linkedConceptMemoIds, [id]);
  h.state.currentNote.data.groups[0].items[0].memo.body = "次の変更"; h.state.dirty = true;
  assert.equal(await h.controller.saveCurrentNote({ automatic: true }), true);
  assert.equal(h.concepts().memos.length, 1); assert.equal(h.concepts().memos[0].body, "次の変更");
});
test("空の項目メモと個別OFFでは自動作成せず、全体OFFでも個別ONは有効", async () => {
  for (const mode of ["empty", "off", "on"]) {
    const h = noteHarness({ defaults: { note: mode !== "on" } });
    const memo = h.state.currentNote.data.groups[0].items[0].memo;
    if (mode === "empty") memo.body = "";
    if (mode === "off") memo.autoSyncToConceptMemoOverride = false;
    if (mode === "on") memo.autoSyncToConceptMemoOverride = true;
    await h.controller.saveCurrentNote();
    assert.equal(h.concepts().memos.length, mode === "on" ? 1 : 0);
  }
});
test("全体未設定では未連携のメモを自動作成しない", async () => {
  const h = noteHarness({ defaults: null });
  h.state.currentNote.data.groups[0].items[0].memo.autoSyncToConceptMemo = true;
  await h.controller.saveCurrentNote(); assert.equal(h.concepts().memos.length, 0);
});
test("構想保存に失敗した場合は存在しないリンクを付けない", async () => {
  const h = noteHarness();
  h.provider.beforeWrite = async entry => { if (entry.id === "concept-file") throw new Error("offline"); };
  await h.controller.saveCurrentNote();
  assert.equal(h.concepts().memos.length, 0);
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds.length, 0);
  assert.equal(h.state.syncing, false);
  assert.ok(h.statuses.some(([label]) => label.includes("反映失敗")));
});
test("二つ目のノート保存失敗はリンクを下書きに残し、再保存で構想メモを重複作成しない", async () => {
  const h = noteHarness(); let notes = 0;
  h.provider.beforeWrite = async entry => { if (entry.id === "note-file" && ++notes === 2) throw new Error("offline"); };
  assert.equal(await h.controller.saveCurrentNote(), false);
  assert.equal(h.concepts().memos.length, 1); assert.equal(h.state.dirty, true);
  assert.equal(JSON.parse(h.state.currentNote.raw).groups[0].items[0].memo.linkedConceptMemoIds.length, 0);
  assert.equal(h.schedules(), 0, "同期情報の保存失敗で無限再試行しない");
  h.provider.beforeWrite = null;
  assert.equal(await h.controller.saveCurrentNote(), true);
  assert.equal(h.concepts().memos.length, 1);
});
test("構想への自動作成待ち中の追記はリンク保存の本文へ混ぜない", async () => {
  const h = noteHarness(), entered = deferred(), release = deferred();
  h.provider.beforeWrite = async entry => { if (entry.id === "concept-file") { entered.resolve(); await release.promise; } };
  const saving = h.controller.saveCurrentNote(); await entered.promise;
  h.state.currentNote.data.groups[0].items[0].memo.body = "通信中の追記"; h.state.dirty = true;
  release.resolve(); await saving;
  assert.equal(h.concepts().memos[0].body, "初回の項目メモ");
  assert.equal(JSON.parse(h.state.currentNote.raw).groups[0].items[0].memo.body, "初回の項目メモ");
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.body, "通信中の追記");
  assert.equal(h.state.dirty, true); assert.equal(h.schedules(), 1);
});
test("Google Driveで構想ファイルを確認できない場合は重複防止のため作成せず通知する", async () => {
  const h = noteHarness({ documentExists: false }); h.state.cloudKind = "googleDrive";
  await h.controller.saveCurrentNote(); assert.equal(h.creates(), 0);
  assert.ok(h.notices.some(([message]) => /追加許可/.test(message)));
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds.length, 0);
});

function migrationHarness({ broken = false } = {}) {
  const note = { groups: [{ items: [
    { kind: "entry", memo: { body: "既存", unknown: 7 } },
    { kind: "entry", memo: { body: "ON", autoSyncToConceptMemo: true } },
    { kind: "entry", memo: { body: "OFF", autoSyncToConceptMemoOverride: false } },
  ] }], unknown: "keep" };
  const docs = new Map([["note", JSON.stringify(note)], ["concept", JSON.stringify({ memos: [
    { source: { kind: "noteItem", unknown: true } }, { source: { kind: "noteItem", autoSyncToNoteItem: true } },
  ] })]]);
  const entries = { root: [{ id: "meta", name: ".mojigoto", folder: {} }], meta: [
    { id: "plots", name: "plots", folder: {} }, { id: "concept", name: "concept-memos.json", file: {}, eTag: "c1" },
  ], plots: [{ id: "note", name: "note.json", file: {}, eTag: "n1" }, ...(broken ? [{ id: "broken", name: "broken.json", file: {}, eTag: "b1" }] : [])] };
  const writes = [];
  const provider = { listChildren: async id => entries[id] || [], readText: async item => item.id === "broken" ? "{broken" : docs.get(item.id),
    writeText: async (item, content, expected) => { writes.push({ id: item.id, expected }); docs.set(item.id, content); return { eTag: "saved" }; } };
  return { provider, docs, writes };
}
test("既存OFFの選択は未指定だけを変更し、明示ON/OFF・本文・未知項目を維持する", async () => {
  const h = migrationHarness();
  await keepExistingMemoDefaultsOff(h.provider, { id: "root" }, "note");
  const data = JSON.parse(h.docs.get("note"));
  assert.equal(data.groups[0].items[0].memo.autoSyncToConceptMemoOverride, false);
  assert.equal(data.groups[0].items[0].memo.body, "既存"); assert.equal(data.groups[0].items[0].memo.unknown, 7);
  assert.equal(data.groups[0].items[1].memo.autoSyncToConceptMemoOverride, undefined);
  assert.equal(data.unknown, "keep"); assert.equal(h.writes[0].expected, "n1");
  await keepExistingMemoDefaultsOff(h.provider, { id: "root" }, "concept");
  assert.equal(JSON.parse(h.docs.get("concept")).memos[0].source.autoSyncToNoteItemOverride, false);
  assert.equal(JSON.parse(h.docs.get("concept")).memos[1].source.autoSyncToNoteItemOverride, undefined);
});
test("既存メモの破損や列挙失敗は設定変更前に停止し書き込まない", async () => {
  const h = migrationHarness({ broken: true });
  await assert.rejects(keepExistingMemoDefaultsOff(h.provider, { id: "root" }, "note")); assert.equal(h.writes.length, 0);
  h.provider.listChildren = async () => { throw new Error("offline"); };
  await assert.rejects(keepExistingMemoDefaultsOff(h.provider, { id: "root" }, "note"), /offline/);
  assert.equal(h.writes.length, 0);
});

function settingsHarness() {
  const storage = new Map(), notices = [];
  const context = { state: { provider: {}, workRoot: { id: "root" }, cloudKind: "oneDrive", noteEntriesCache: new Map() },
    elements: { noteAutoReflectToggle: {}, conceptAutoReflectToggle: {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    workCatalogOwner: () => context.owner || "alice", readJson: value => JSON.parse(value || "null"),
    cancelAutoSave() {}, scheduleAutoSave() {}, renderConceptAutoReflectSetting() {},
    notify: (...args) => notices.push(args), chooseMemoAutoReflectScope: async () => "all",
    keepExistingMemoDefaultsOff: async () => { throw new Error("migration failed"); },
  };
  vm.createContext(context);
  for (const name of ["memoAutoReflectStorageKey", "renderMemoAutoReflectDefaults", "changeMemoAutoReflectDefault"]) {
    const start = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(app).index;
    const end = /\r?\n}\r?\n/.exec(app.slice(start)); vm.runInContext(app.slice(start, start + end.index + end[0].length), context);
  }
  context.renderMemoAutoReflectDefaults(); return { context, storage, notices };
}
test("初回確認中はOFFを保ち、キャンセルは全体設定を書き換えない", async () => {
  const h = settingsHarness(), wait = deferred(); h.context.chooseMemoAutoReflectScope = () => wait.promise;
  const changing = h.context.changeMemoAutoReflectDefault("note", true);
  assert.equal(h.context.state.syncing, true); assert.equal(h.storage.size, 0);
  wait.resolve("cancel"); await changing;
  assert.equal(h.storage.size, 0); assert.equal(h.context.state.memoAutoReflectDefaults, null);
  assert.equal(h.context.state.syncing, false);
});
test("全体設定は再読込後も保持し、利用者・クラウド・作品ルートを分離する", async () => {
  const h = settingsHarness(); await h.context.changeMemoAutoReflectDefault("note", true);
  h.context.renderMemoAutoReflectDefaults(); assert.equal(h.context.state.memoAutoReflectDefaults.note, true);
  for (const field of ["root", "cloud", "owner"]) {
    if (field === "root") h.context.state.workRoot = { id: "other" };
    if (field === "cloud") h.context.state.cloudKind = "googleDrive";
    if (field === "owner") h.context.owner = "bob";
    h.context.renderMemoAutoReflectDefaults(); assert.equal(h.context.state.memoAutoReflectDefaults, null);
    h.context.state.workRoot = { id: "root" }; h.context.state.cloudKind = "oneDrive"; h.context.owner = "alice";
  }
  h.context.renderMemoAutoReflectDefaults(); assert.equal(h.context.state.memoAutoReflectDefaults.note, true);
  let prompts = 0; h.context.chooseMemoAutoReflectScope = async () => { prompts++; return "cancel"; };
  await h.context.changeMemoAutoReflectDefault("note", false); await h.context.changeMemoAutoReflectDefault("note", true);
  assert.equal(prompts, 0);
});
test("既存OFFへの移行失敗では全体をONにせず、未保存中の既存書換えも行わない", async () => {
  const h = settingsHarness(); h.context.chooseMemoAutoReflectScope = async () => "future";
  await h.context.changeMemoAutoReflectDefault("note", true);
  assert.equal(h.storage.size, 0); assert.equal(h.context.state.syncing, false);
  assert.ok(h.notices.some(([message]) => message === "migration failed"));
  h.context.state.dirty = true; await h.context.changeMemoAutoReflectDefault("concept", true);
  assert.equal(h.storage.size, 0); assert.ok(h.notices.some(([message]) => /先に編集中/.test(message)));
});


test("過去のリンク保存失敗でIDがない場合も出典から既存の構想メモを再利用する", async () => {
  const h = noteHarness();
  await h.controller.saveCurrentNote();
  const existingId = h.concepts().memos[0].id;
  const note = h.state.currentNote.data; note.groups[0].items[0].memo.linkedConceptMemoIds = [];
  h.state.dirty = true; await h.controller.saveCurrentNote();
  assert.equal(h.concepts().memos.length, 1);
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds[0], existingId);
});
test("反映先とノートの両側変更は初回リンク再発見でも上書きしない", async () => {
  const h = noteHarness(); await h.controller.saveCurrentNote();
  const remote = h.concepts(); remote.memos[0].body = "構想側の変更";
  h.files.get("concept-file").content = JSON.stringify(remote);
  h.state.currentNote.data.groups[0].items[0].memo.body = "項目側の変更";
  h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds = [];
  h.state.dirty = true; await h.controller.saveCurrentNote();
  assert.equal(h.concepts().memos[0].body, "構想側の変更");
  assert.ok(h.statuses.some(([label]) => label === "同期競合あり"));
});
test("反映先の取得中に作品が変わった場合は初回作成もリンク保存もしない", async () => {
  const h = noteHarness();
  const read = h.provider.readText;
  h.provider.readText = async entry => { const content = await read(entry); h.state.selectedWork = { id: "other" }; return content; };
  await h.controller.saveCurrentNote();
  assert.deepEqual(h.writes.map(entry => entry.id), ["note-file"]);
  assert.equal(h.concepts().memos.length, 0);
});
test("既存OFFへの移行は版の競合で停止し、部分書込の有無を通知できる", async () => {
  const h = migrationHarness();
  const list = h.provider.listChildren;
  h.provider.listChildren = async id => id === "plots" ? [
    { id: "note", name: "one.json", file: {}, eTag: "n1" },
    { id: "second", name: "two.json", file: {}, eTag: "n2" },
  ] : list(id);
  h.docs.set("second", h.docs.get("note"));
  const write = h.provider.writeText;
  h.provider.writeText = async (...args) => { if (args[0].id === "second") throw new Error("conflict"); return write(...args); };
  await assert.rejects(keepExistingMemoDefaultsOff(h.provider, { id: "root" }, "note"), /1ファイル.*全体設定はONにしていません/);
  assert.equal(h.writes.length, 1);
  assert.equal(JSON.parse(h.docs.get("second")).groups[0].items[0].memo.autoSyncToConceptMemoOverride, undefined);
});
test("全体設定の保存失敗では表示をONにせず、方向別の値を混ぜない", async () => {
  const h = settingsHarness();
  h.context.localStorage.setItem = () => { throw new Error("storage full"); };
  await h.context.changeMemoAutoReflectDefault("note", true);
  assert.equal(h.context.state.memoAutoReflectDefaults, null);
  assert.equal(h.context.elements.noteAutoReflectToggle.checked, false);
  assert.equal(h.context.state.syncing, false);
  assert.ok(h.notices.some(([message]) => message === "storage full"));
});


test("保存された全体設定が破損している場合は全体ONとして扱わない", () => {
  const h = settingsHarness();
  h.storage.set(h.context.memoAutoReflectStorageKey(), JSON.stringify({ version: 1, note: "false", concept: true }));
  h.context.renderMemoAutoReflectDefaults();
  assert.equal(h.context.state.memoAutoReflectDefaults, null);
  assert.equal(h.context.elements.noteAutoReflectToggle.checked, false);
});
test("初回確認中に接続先が変わった場合は別のルートへ全体設定を適用しない", async () => {
  const h = settingsHarness(), wait = deferred(); h.context.chooseMemoAutoReflectScope = () => wait.promise;
  const changing = h.context.changeMemoAutoReflectDefault("note", true);
  h.context.state.workRoot = { id: "other" }; wait.resolve("all"); await changing;
  assert.equal(h.storage.size, 0);
  assert.ok(h.notices.some(([message]) => /接続先が変わった/.test(message)));
  assert.equal(h.context.state.syncing, false);
});


test("同じ項目IDが複数あるノートは誤った連携を作らず停止する", async () => {
  const h = noteHarness();
  h.state.currentNote.data.groups[0].items.push(structuredClone(h.state.currentNote.data.groups[0].items[0]));
  await h.controller.saveCurrentNote();
  assert.equal(h.concepts().memos.length, 0);
  assert.ok(h.notices.some(([message]) => /項目IDが重複/.test(message)));
});
test("構想ファイルの版が取得できない場合は条件なしの書込を行わない", async () => {
  const h = noteHarness(); delete h.files.get("concept-file").entry.eTag;
  await h.controller.saveCurrentNote();
  assert.deepEqual(h.writes.map(entry => entry.id), ["note-file"]);
  assert.ok(h.notices.some(([message]) => /版を確認できない/.test(message)));
});
test("構想ファイルの競合で保存できない場合はノートへ存在しないリンクを保存しない", async () => {
  const h = noteHarness();
  h.provider.beforeWrite = async entry => { if (entry.id === "concept-file") h.files.get("concept-file").entry.eTag = "remote-version"; };
  await h.controller.saveCurrentNote();
  assert.equal(h.concepts().memos.length, 0);
  assert.equal(h.state.currentNote.data.groups[0].items[0].memo.linkedConceptMemoIds.length, 0);
  assert.equal(h.state.syncing, false);
});

test("実際のバッヂは初回連携・更新反映の完了後に保存済みへ戻る", async () => {
  const h = noteHarness();
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.noteStatus.textContent, "保存済み");
  h.state.currentNote.data.groups[0].items[0].memo.body = "更新本文"; h.state.dirty = true;
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.noteStatus.textContent, "保存済み");
  assert.equal(h.state.noteConceptSyncPending, false);
  assert.equal(h.concepts().memos[0].body, "更新本文");
});
test("メモのない項目詳細だけの保存は連携ファイルを読まず保存済みになる", async () => {
  const h = noteHarness();
  h.state.currentNote.data.groups[0].items[0].memo.body = "";
  h.state.currentNote.data.groups[0].items[0].body = "項目詳細のみ";
  h.provider.listChildren = async () => { throw new Error("反映の通信は不要"); };
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.noteStatus.textContent, "保存済み");
  assert.equal(h.notices.length, 0);
  assert.deepEqual(h.writes.map(entry => entry.id), ["note-file"]);
});
test("別項目の詳細更新で変更のない連携メモを再反映しない", async () => {
  const h = noteHarness(); await h.controller.saveCurrentNote({ automatic: true });
  h.state.currentNote.data.groups[0].items.push({ id: "empty", kind: "entry", body: "詳細", memo: { body: "", tags: [] } });
  h.state.dirty = true;
  h.provider.listChildren = async () => { throw new Error("無関係な連携を読まない"); };
  const before = h.writes.length;
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.noteStatus.textContent, "保存済み");
  assert.deepEqual(h.writes.slice(before).map(entry => entry.id), ["note-file"]);
  assert.equal(h.notices.length, 0);
});
test("反映失敗は保存済みで隠さず次の保存で同じメモを再試行する", async () => {
  const h = noteHarness(); await h.controller.saveCurrentNote({ automatic: true });
  h.state.currentNote.data.groups[0].items[0].memo.body = "再試行本文"; h.state.dirty = true;
  h.provider.listChildren = async () => { throw new Error("offline"); };
  await h.controller.saveCurrentNote({ automatic: true });
  assert.match(h.noteStatus.textContent, /反映失敗/);
  assert.deepEqual(h.state.currentNote.reflectionPendingIds, ["item"]);
  h.provider.listChildren = async () => [{ ...h.files.get("concept-file").entry }];
  h.state.dirty = true;
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.concepts().memos[0].body, "再試行本文");
  assert.equal(h.noteStatus.textContent, "保存済み");
});

test("連携済み項目メモを空にする変更は省略せず反映する", async () => {
  const h = noteHarness(); await h.controller.saveCurrentNote({ automatic: true });
  h.state.currentNote.data.groups[0].items[0].memo.body = ""; h.state.dirty = true;
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.concepts().memos[0].body, "");
  assert.equal(h.noteStatus.textContent, "保存済み");
});
test("本文保存待ちの別項目への追記でも反映予定を次の保存へ持ち越す", async () => {
  const h = noteHarness(); await h.controller.saveCurrentNote({ automatic: true });
  h.state.currentNote.data.groups[0].items[0].memo.body = "反映予定"; h.state.dirty = true;
  const entered = deferred(), release = deferred(); let first = true;
  h.provider.beforeWrite = async entry => { if (entry.id === "note-file" && first) { first = false; entered.resolve(); await release.promise; } };
  const saving = h.controller.saveCurrentNote({ automatic: true }); await entered.promise;
  h.state.currentNote.data.groups[0].items[0].body = "通信中に詳細追記"; h.state.dirty = true;
  release.resolve(); await saving;
  assert.equal(h.concepts().memos[0].body, "初回の項目メモ");
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.concepts().memos[0].body, "反映予定");
  assert.equal(h.noteStatus.textContent, "保存済み");
});

test("連続する項目メモ反映は最新の版が同じ構想本文と一覧を再取得しない", async () => {
  const h = noteHarness(); h.provider.supportsVersionedContentCache = true;
  let lists = 0, reads = 0, metadata = 0;
  const list = h.provider.listChildren, read = h.provider.readText, get = h.provider.getItemMetadata;
  h.provider.listChildren = async (...args) => { lists++; return list(...args); };
  h.provider.readText = async (...args) => { reads++; return read(...args); };
  h.provider.getItemMetadata = async (...args) => { metadata++; return get(...args); };
  await h.controller.saveCurrentNote({ automatic: true });
  h.state.currentNote.data.groups[0].items[0].memo.body = "次の反映"; h.state.dirty = true;
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(lists, 1); assert.equal(reads, 1); assert.equal(metadata, 1);
  assert.equal(h.concepts().memos[0].body, "次の反映"); assert.equal(h.noteStatus.textContent, "保存済み");
});
test("構想側の外部変更は再取得して両側変更の競合を維持する", async () => {
  const h = noteHarness(); h.provider.supportsVersionedContentCache = true; await h.controller.saveCurrentNote({ automatic: true });
  const file = h.files.get("concept-file"), data = JSON.parse(file.content); data.memos[0].body = "構想側の外部変更"; file.content = JSON.stringify(data); file.entry.eTag = "external";
  h.state.currentNote.data.groups[0].items[0].memo.body = "項目側の変更"; h.state.dirty = true;
  await h.controller.saveCurrentNote({ automatic: true });
  assert.equal(h.concepts().memos[0].body, "構想側の外部変更"); assert.equal(h.noteStatus.textContent, "同期競合あり");
});
