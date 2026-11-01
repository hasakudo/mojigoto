import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const core = require("../web/lib/concept-note-order");
const { readConceptNoteIndex } = require("../src/data/concept-note-order");
const { getConceptMemoWebviewHtml } = require("../src/views/concept-memo/concept-memo-html");
const { getConceptMemoListScript } = require("../src/views/concept-memo/script-list");
const { getConceptMemoEventsScript } = require("../src/views/concept-memo/script-events");
const app = await fs.readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
function note(name, groups, overrides = {}) {
  return { item: { name: `${name}.json` }, data: { title: name, type: "plot", groups, ...overrides } };
}
const entry = (id, memoIds = []) => ({ id, kind: "entry", memo: { linkedConceptMemoIds: memoIds } });
const entries = [
  note("後", [{ id: "g3", items: [entry("z", ["multi"])] }], { order: 2 }),
  note("先", [
    { id: "g1", items: [entry("a", ["multi", "first"]), { id: "d", kind: "divider" }, entry("b", ["second"])] },
    { id: "g2", items: [entry("c", ["third"])] },
  ], { order: 1 }),
  note("資料", [{ id: "g4", items: [entry("r", ["reference"])] }], { type: "reference", order: 0 }),
];
const notes = core.buildConceptNoteIndex(entries);
const memos = [
  { id: "third", isPinned: true }, { id: "second" }, { id: "first" },
  { id: "multi" }, { id: "reference" }, { id: "free", isPinned: true },
  { id: "source", source: { kind: "noteItem", noteType: "plot", notePath: "C:\\work\\plots\\先.json", groupId: "g1", itemId: "b" } },
];
const ids = (values) => values.map((value) => value.id);

test("ノート順→大分類→区分内の項目順で表示し、ピン優先を項目順の場合だけ外す", () => {
  const before = JSON.stringify({ entries, memos });
  assert.deepEqual(notes.map((value) => value.title), ["先", "後", "資料"]);
  assert.deepEqual(ids(core.sortConceptMemosByNote(memos, notes)), ["first", "multi", "second", "source", "third", "reference", "free"]);
  assert.deepEqual(ids(core.sortConceptMemosByNote(memos, notes, "plot:先.json", "desc")), ["third", "second", "source", "first", "multi", "free", "reference"]);
  assert.equal(JSON.stringify({ entries, memos }), before);
});

test("複数リンクは選択ノート内の先頭を採用し、出典なし・リンク切れも区別して絞る", () => {
  assert.equal(core.matchesConceptNote(memos[3], notes, "plot:先.json"), true);
  assert.equal(core.matchesConceptNote(memos[3], notes, "plot:後.json"), true);
  assert.equal(core.matchesConceptNote(memos[6], notes, "plot:先.json"), true);
  assert.equal(core.matchesConceptNote(memos[5], notes, "__unlinked__"), true);
  assert.equal(core.matchesConceptNote({ id: "gone", source: { kind: "noteItem", itemId: "gone" } }, notes, "__unlinked__"), true);
  assert.equal(core.matchesConceptNote({ id: "writing", source: { kind: "writingMemo" } }, notes, "plot:先.json"), false);
  assert.equal(core.sortConceptMemosByNote(memos, notes).filter((memo) => memo.id === "multi").length, 1);
});

test("同じ項目IDのコピーはファイル名で解決し、曖昧な出典は推測しない", () => {
  const copies = core.buildConceptNoteIndex([note("原本", [{ id: "g", items: [entry("same")] }]), note("コピー", [{ id: "g", items: [entry("same")] }])]);
  const memo = { id: "m", source: { kind: "noteItem", itemId: "same", groupId: "g", notePath: "C:/x/原本.json" } };
  assert.equal(core.matchesConceptNote(memo, copies, "plot:原本.json"), true);
  assert.equal(core.matchesConceptNote(memo, copies, "plot:コピー.json"), false);
  assert.equal(core.conceptMemoNotePositions({ ...memo, source: { ...memo.source, notePath: "missing.json" } }, copies).length, 0);
  assert.equal(core.matchesConceptNote(memo, core.buildConceptNoteIndex([entries[1]]), "__unlinked__"), true);
});

test("ローカルの項目順取得は読取専用で、壊れたJSONを隔離する", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-concept-order-"));
  try {
    assert.deepEqual(await readConceptNoteIndex(path.join(dir, "missing")), { notes: [], failedCount: 0 });
    assert.deepEqual(await fs.readdir(dir), []);
    await fs.mkdir(path.join(dir, "plots"));
    await fs.writeFile(path.join(dir, "plots", "先.json"), JSON.stringify(entries[1].data));
    await fs.writeFile(path.join(dir, "plots", "broken.json"), "broken");
    const index = await readConceptNoteIndex(dir);
    assert.equal(index.failedCount, 1);
    assert.equal(index.notes[0].items.length, 3);
    assert.deepEqual((await fs.readdir(dir)).sort(), ["plots"]);
    assert.equal(await fs.readFile(path.join(dir, "plots", "先.json"), "utf8"), JSON.stringify(entries[1].data));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("VS Code生成スクリプトがコンパイルでき、既存条件とノート絞り込みを組み合わせる", () => {
  const html = getConceptMemoWebviewHtml({}, { data: { memos }, filePath: "work/concept-memos.json" });
  new vm.Script(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]);
  const context = { conceptNoteOrder: core, conceptNoteIndex: notes, activeNoteFilter: "plot:先.json", sortField: "noteOrder", sortDirection: "asc",
    currentState: { data: { memos } }, activeFolderIds: [], activeTagFilters: [], activeQuickFilters: { type: "", state: [], source: "" }, searchQuery: "",
    getMemoFolders: () => [], normalizeMemoFolderIds: () => [], compareText: (a, b) => String(a).localeCompare(String(b)), getTimeValue: () => 0 };
  vm.createContext(context);
  vm.runInContext(getConceptMemoListScript(), context);
  assert.deepEqual(Array.from(context.getFilteredMemos(), (memo) => memo.id), ["first", "multi", "second", "source", "third"]);
  context.activeQuickFilters.state = ["pinned"];
  assert.deepEqual(Array.from(context.getFilteredMemos(), (memo) => memo.id), ["third"]);
  context.activeQuickFilters.state = [];
  context.activeNoteFilter = "";
  context.sortField = "updated";
  assert.equal(context.getFilteredMemos()[0].isPinned, true);
});

test("VS Codeの非同期ノート応答はメモデータと編集欄を変更しない", () => {
  const calls = [];
  let listener;
  const state = { data: { memos: [{ id: "dirty", body: "未保存の本文" }] } };
  const context = { currentState: state, conceptNoteIndex: [], conceptNoteIndexLoading: true,
    window: { addEventListener: (_name, fn) => { listener = fn; } }, document: { getElementById: () => ({}) },
    renderNoteFilter: () => calls.push("filter"), renderMemoList: () => calls.push("list"), renderMemoCounts: () => calls.push("count") };
  vm.createContext(context);
  vm.runInContext(getConceptMemoEventsScript(), context);
  listener({ data: { type: "conceptNoteIndexLoaded", payload: { notes } } });
  assert.equal(context.currentState, state);
  assert.equal(state.data.memos[0].body, "未保存の本文");
  assert.deepEqual(calls, ["filter", "list", "count"]);
});

test("Webのノート取得は作成せず、作品切替後の古い応答を無視する", async () => {
  let resolve;
  const loading = new Promise((done) => { resolve = done; });
  const work = { id: "a" }, provider = {};
  const elements = { conceptNoteFilter: {}, conceptNoteFilterStatus: {}, conceptMemosSection: { hidden: false } };
  const calls = [];
  const context = { state: { selectedWork: work, provider, noteEntriesCache: new Map() }, elements, buildConceptNoteIndex: core.buildConceptNoteIndex,
    renderConceptNoteFilter() {}, renderConceptMemosList: () => calls.push("render"),
    loadNoteEntriesForType: (type, options) => { calls.push([type, options]); return loading; } };
  vm.createContext(context);
  vm.runInContext(appFunction("loadConceptNoteIndex"), context);
  const pending = context.loadConceptNoteIndex();
  context.state.selectedWork = { id: "b" };
  resolve(entries);
  await pending;
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].createFolder, false);
  assert.equal(context.state.conceptNoteContext.notes.length, 0);
  context.loadNoteEntriesForType = async (type) => { if (type === "reference") throw new Error("未許可"); return [entries[1]]; };
  await context.loadConceptNoteIndex();
  assert.equal(context.state.conceptNoteContext.notes[0].title, "先");
  assert.match(elements.conceptNoteFilterStatus.textContent, /一部/);
  assert.equal(elements.conceptNoteFilter.disabled, false);
});

test("Webのノート絞り込み選択はクラウド・作品ごとに復元し、未取得でも黙って解除しない", () => {
  const selections = [];
  const context = { state: { cloudKind: "googleDrive", selectedWork: { id: "w" }, viewPreferences: { conceptNotes: { "googleDrive:w": "plot:先.json" } } },
    elements: { conceptNoteFilter: {} }, currentConceptNoteIndex: () => [], fillSelect: (_select, _label, options, selected) => selections.push({ options, selected }) };
  vm.createContext(context);
  vm.runInContext(["conceptNotePreferenceKey", "renderConceptNoteFilter"].map(appFunction).join("\n"), context);
  context.renderConceptNoteFilter();
  assert.equal(selections[0].selected, "plot:先.json");
  assert.equal(selections[0].options.at(-1).id, "plot:先.json");
  context.state.selectedWork = { id: "other" };
  context.renderConceptNoteFilter();
  assert.equal(selections[1].selected, "");
});

test("Webのノート候補は実在する構想メモとの関連だけを残し、他の表示条件で消えない", () => {
  const indexed = core.buildConceptNoteIndex([...entries,
    note("空", [{ id: "empty", items: [entry("empty", ["deleted-memo"])] }]),
  ]);
  const selections = [];
  let persisted = 0;
  const context = { state: { cloudKind: "googleDrive", selectedWork: { id: "w" },
    conceptDocument: { memos: [memos[3], memos[6], { id: "reference", isArchived: true }] },
    viewPreferences: { conceptNotes: { "googleDrive:w": "plot:空.json" } } },
    elements: { conceptNoteFilter: {} }, currentConceptNoteIndex: () => indexed,
    conceptMemoNotePositions: core.conceptMemoNotePositions, persistViewPreferences: () => persisted++,
    fillSelect: (_select, _label, options, selected) => selections.push({ options, selected }) };
  vm.createContext(context);
  vm.runInContext(["conceptNotePreferenceKey", "renderConceptNoteFilter"].map(appFunction).join("\n"), context);
  context.renderConceptNoteFilter();
  assert.deepEqual(Array.from(selections[0].options, (value) => value.id), ["__unlinked__", "plot:先.json", "plot:後.json", "reference:資料.json"]);
  assert.equal(selections[0].selected, "");
  assert.equal(context.state.viewPreferences.conceptNotes["googleDrive:w"], "");
  assert.equal(persisted, 1);
  context.renderConceptNoteFilter();
  assert.equal(persisted, 1);
  context.state.conceptDocument.memos = [];
  context.renderConceptNoteFilter();
  assert.deepEqual(Array.from(selections.at(-1).options, (value) => value.id), ["__unlinked__"]);
});

function conceptLoadingHarness({ fresh = false, initial = false, fail = false } = {}) {
  let complete;
  const pending = new Promise((resolve, reject) => { complete = () => fail ? reject(new Error("offline")) : resolve(); });
  const calls = [];
  const state = { selectedWork: { id: "work", title: "作品" }, conceptWorkId: initial ? "" : "work",
    conceptFile: initial ? null : { id: "concept" }, conceptDocument: initial ? null : { memos: [{ id: "m" }] },
    conceptLoadedAt: fresh ? Date.now() : 0 };
  const names = ["worksSection", "filesSection", "readerSection", "notesSection", "noteEditorSection", "workSettingsSection", "conceptMemoEditorSection",
    "conceptMemosSection", "conceptMemosTitle", "conceptMemosCount", "conceptMemosList", "conceptPagination"];
  const elements = Object.fromEntries(names.map((name) => [name, { hidden: true, attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; } }]));
  const context = { state, elements, VIEW_CACHE_DURATION: 10000, Date,
    beginPerformanceMeasurement: () => () => calls.push("measured"), canDiscardDraft: () => true,
    restoreSavedConceptDraft() {}, cancelAutoSave() {}, stopExternalMonitor() {}, resetPageScroll() {}, renderInputAssistVisibility() {},
    showLoading: (_element, message) => calls.push(message), showEmpty: (_element, message) => calls.push(message),
    ensureConceptDocument: () => pending,
    refreshConceptFilterOptions() {}, renderConceptMemosList: () => calls.push("render"),
    loadConceptNoteIndex: () => calls.push("notes"), commitRoute: () => calls.push("route"), routeForWork: () => ({}) };
  vm.createContext(context);
  vm.runInContext(appFunction("openConceptMemos"), context);
  return { context, state, elements, calls, complete };
}

test("Webの構想メモは初回・期限切れの再取得・編集画面復元でLoadingを表示する", async () => {
  for (const options of [{ initial: true }, {}, { reveal: false }]) {
    const h = conceptLoadingHarness(options);
    const pending = h.context.openConceptMemos({ reveal: options.reveal !== false });
    assert.equal(h.elements.conceptMemosSection.hidden, false);
    assert.equal(h.elements.conceptMemosList.attrs["aria-busy"], "true");
    assert.equal(h.elements.conceptPagination.hidden, true);
    assert.match(h.calls[0], /構想メモを読み込んでいます/);
    h.complete();
    await pending;
    assert.ok(h.calls.includes("render"));
    assert.equal(h.elements.conceptMemosList.attrs["aria-busy"], undefined);
    assert.equal(h.calls.includes("notes"), options.reveal !== false);
  }
});

test("新鮮な構想メモはLoadingで点滅させず、取得失敗時はLoadingを残さない", async () => {
  const cached = conceptLoadingHarness({ fresh: true });
  const ready = cached.context.openConceptMemos({ reveal: false });
  assert.equal(cached.elements.conceptMemosSection.hidden, true);
  assert.equal(cached.calls.length, 0);
  cached.complete();
  await ready;
  const failed = conceptLoadingHarness({ fail: true });
  const pending = failed.context.openConceptMemos({ reveal: false });
  failed.complete();
  await assert.rejects(pending, /offline/);
  assert.equal(failed.elements.conceptMemosSection.hidden, false);
  assert.equal(failed.elements.conceptMemosList.attrs["aria-busy"], undefined);
  assert.match(failed.calls.at(-1), /読み込めませんでした/);
  assert.ok(!failed.calls.includes("render"));
});
