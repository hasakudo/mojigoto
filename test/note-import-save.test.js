const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { loadPanelForContext, loadViewModule } = require("./fixtures/note-import-harness.cjs");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "vscode") return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (key, fallback) => key === "mode" ? "multi" : fallback }) } };
  return originalLoad.call(this, request, ...args);
};
const notes = require("../src/data/note-store");
Module._load = originalLoad;
const memoOptions = require("../src/import/note-memo-options");
const importPreview = require("../src/import/note-import-preview");
const importContent = require("../src/import/note-import-content");
const parser = require("../src/import/note-markdown-import");
const root = path.resolve(__dirname, "../.review-baseline/test-temp");
async function fixture(t) {
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "note-import-"));
  t.after(async () => { assert.ok(dir.startsWith(`${root}${path.sep}`)); await fs.rm(dir, { recursive: true, force: true }); });
  const file = path.join(dir, ".mojigoto", "plots", "note.json");
  const note = await notes.saveNoteFile(file, { id: "original-note", title: "以前", type: "plot", order: 3,
    groups: [{ id: "old-group", title: "以前の大分類", items: [{ id: "old-item", kind: "entry", heading: "以前の項目", body: "以前の内容" }] }],
  });
  return { dir, file, note };
}
async function importPanel(h, confirm = async () => "置換する", importedNote) {
  const errors = [];
  const opened = [];
  const htmlStates = [];
  const saveCalls = [];
  let receive;
  const panel = { disposed: false, dispose() { this.disposed = true; }, onDidDispose() {},
    webview: { onDidReceiveMessage: (callback) => { receive = callback; } } };
  const context = vm.createContext({
    ...memoOptions, ...importPreview, ...importContent,
    openImportPanels: new Map(), getImportPanelKey: () => h.file, getImportPanelTitle: () => "インポート",
    setWebviewPanelThemeIcon() {}, getImportHtml: (data) => { htmlStates.push(data); return ""; }, fs, parseMarkdownImport: parser.parseMarkdownImport,
    vscode: { ViewColumn: { Active: 1 }, window: { createWebviewPanel: () => panel,
      showWarningMessage: confirm, showInformationMessage() {}, showErrorMessage: (message) => errors.push(message),
    } }, readNoteFile: notes.readNoteFile, saveNoteFile: async (...args) => { saveCalls.push(args[0]); return notes.saveNoteFile(...args); }, createNewNote: notes.createNewNote,
    require: () => ({ notifyNoteUpdated: async () => {}, openNoteWebview: async (_, __, options) => opened.push(options.filePath) }),
  });
  const { openNoteImportWebview } = loadPanelForContext("full", context);
  await openNoteImportWebview({ subscriptions: [] }, { refresh() {} }, {
    existingNotePath: h.file, sourceFilePath: h.sourceFilePath || "", workDir: h.dir, noteType: "plot", parsedNote: importedNote || { groups: [
      { id: "new-group", title: "取り込んだ大分類", items: [{ id: "new-item", kind: "entry", heading: "新項目", body: "取り込んだ本文" }] },
    ] },
  });
  return { errors, opened, panel, receive, htmlStates, saveCalls };
}

test("内容が異なるノートでも、確認した全体置換は成功する", async (t) => {
  const h = await fixture(t);
  const p = await importPanel(h);
  await p.receive({ type: "confirmImportReplace", payload: { title: "置換後" } });
  assert.deepEqual(p.errors, []);
  const saved = await notes.readNoteFile(h.file);
  assert.equal(saved.groups[0].items[0].body, "取り込んだ本文");
  assert.equal(saved.id, "original-note");
  assert.equal(saved.order, 3);
  assert.equal(p.panel.disposed, true);
});

test("メモ付きMarkdownの新規・全体置換を実ファイルへ保存して読み戻せる", async (t) => {
  const parser = require("../src/import/note-markdown-import");
  for (const type of ["confirmImportCreate", "confirmImportReplace"]) {
    const h = await fixture(t);
    const markdown = "# 分類\n### 項目\n詳細\n\n" + parser.formatItemMemoMarkdown({type:"list",body:"残したい項目メモ",tags:["資料"]});
    const parsed = parser.parseMarkdownImport(markdown).parsedNote;
    const p = await importPanel(h, async () => "置換する", parsed);
    await p.receive({type,payload:{title:"メモ付きのノート"}});
    assert.deepEqual(p.errors,[]);
    const saved = await notes.readNoteFile(type === "confirmImportCreate" ? p.opened[0] : h.file);
    const item = saved.groups[0].items[0];
    assert.equal(item.memo.body,"残したい項目メモ");
    assert.equal(item.memo.type,"list");
    assert.deepEqual(item.memo.tags,["資料"]);
    assert.equal(item.memo.autoSyncToConceptMemoOverride,false);
    assert.deepEqual(item.memo.linkedConceptMemoIds,[]);
  }
});

test("項目メモを取り込まない新規・全体置換は本文を読み込み、元メモも残さない", async (t) => {
  for (const type of ["confirmImportCreate", "confirmImportReplace"]) {
    const h = await fixture(t);
    const original = await notes.readNoteFile(h.file);
    original.groups[0].items[0].memo = { body: "置換前のメモ", tags: ["旧"] };
    await notes.saveNoteFile(h.file, original);
    const parsed = parser.parseMarkdownImport("# 分類\n### 項目\n本文\n\n" + parser.formatItemMemoMarkdown({ body: "読み込み元のメモ", tags: ["新"] })).parsedNote;
    const before = JSON.stringify(parsed);
    const p = await importPanel(h, async () => "置換する", parsed);
    await p.receive({ type, payload: { title: "メモなし", includeItemMemos: false } });
    assert.deepEqual(p.errors, []);
    const item = (await notes.readNoteFile(type === "confirmImportCreate" ? p.opened[0] : h.file)).groups[0].items[0];
    assert.equal(item.body.trim(), "本文");
    assert.equal(item.memo.body, "");
    assert.deepEqual(item.memo.tags, []);
    assert.equal(JSON.stringify(parsed), before);
  }
});

test("項目メモを含める全体置換の確認を取り消しても元メモを維持する", async (t) => {
  const h = await fixture(t);
  const original = await notes.readNoteFile(h.file);
  original.groups[0].items[0].memo = { body: "元のメモ", tags: ["維持"] };
  await notes.saveNoteFile(h.file, original);
  const before = await fs.readFile(h.file, "utf8");
  const p = await importPanel(h, async () => undefined);
  await p.receive({ type: "confirmImportReplace", payload: { includeItemMemos: true } });
  assert.equal(await fs.readFile(h.file, "utf8"), before);
});

test("読み込み元の再読込後も全体・選択インポートのメモ選択を維持する", async (t) => {
  const h = await fixture(t);
  h.sourceFilePath = path.join(h.dir, "source.md");
  await fs.writeFile(h.sourceFilePath, "# 分類\n### 項目\n本文\n" + parser.formatItemMemoMarkdown({ body: "読み込み元のメモ", tags: ["資料"] }));
  const p = await importPanel(h);
  await p.receive({ type: "reloadImportSource", payload: { includeItemMemos: false } });
  assert.deepEqual(p.errors, []);
  assert.equal(p.htmlStates.at(-1).includeItemMemos, false);
  assert.equal(p.htmlStates.at(-1).parsedNote.groups[0].items[0].memo.body, "読み込み元のメモ");
  const states = [];
  let receive;
  const context = vm.createContext({ ...memoOptions, ...importPreview, ...importContent, ...parser, fs, openPartialImportPanels: new Map(), getPanelKey: () => "reload-options", getPanelTitle: () => "選択",
    getHtml: (data) => { states.push(data); return ""; }, setWebviewPanelThemeIcon() {}, readNoteFile: notes.readNoteFile,
    vscode: { ViewColumn: {}, window: { createWebviewPanel: () => ({ dispose() {}, onDidDispose() {}, webview: { onDidReceiveMessage: (fn) => { receive = fn; } } }), showErrorMessage: (message) => { throw new Error(message); } } } });
  const { openNotePartialImportWebview } = loadPanelForContext("partial", context);
  await openNotePartialImportWebview({}, {}, { sourceFilePath: h.sourceFilePath, notePath: h.file, noteData: h.note });
  await receive({ type: "reloadImportSource", payload: { currentMode: "replace_entry_body", includeItemMemos: false, replaceItemMemo: true } });
  assert.equal(states.at(-1).includeItemMemos, false);
  assert.equal(states.at(-1).replaceItemMemo, true);
  assert.equal(states.at(-1).initialMode, "replace_entry_body");
  assert.equal(states.at(-1).replaceSourceEntries[0].memo.body, "読み込み元のメモ");
});

test("選択インポートは画面のモード切替に従い、本文のみ・メモ込み・メモなし挿入を保存する", async (t) => {
  const h = await fixture(t);
  const existing = await notes.readNoteFile(h.file);
  existing.groups[0].items[0].memo = { type: "text", body: "既存のメモ", tags: ["旧"], linkedConceptMemoIds: ["target-link"], autoSyncToConceptMemoOverride: true, conceptMemoSyncFingerprint: "target-base" };
  await notes.saveNoteFile(h.file, existing);
  const messages = [];
  const editor = require("./fixtures/note-editor-harness.cjs").createNoteEditorHarness({
    noteStore: notes, onPost: (message) => messages.push(message), importResult: { ok: true, parsedNote: { groups: [] } },
  });
  const panel = await editor.open({ filePath: h.file, workDir: h.dir });
  await panel.receive({ type: "openPartialImport", payload: { initialMode: "insert_entry" } });
  assert.ok(editor.partial, JSON.stringify(messages));
  const context = { apply: (payload) => editor.partial.onApply(payload) };
  const target = { groupId: "old-group", itemId: "old-item" };
  const importedMemo = { type: "list", body: "新しいメモ", tags: ["新"], linkedConceptMemoIds: ["foreign"], autoSyncToConceptMemoOverride: false };
  await context.apply({ operation: "replace_entry_body", source: { body: "本文だけ", memo: importedMemo }, target });
  let item = (await notes.readNoteFile(h.file)).groups[0].items[0];
  assert.equal(item.body, "本文だけ");
  assert.equal(item.memo.body, "既存のメモ");
  await context.apply({ operation: "replace_entry_body", replaceItemMemo: true, source: { body: "本文もメモも", memo: importedMemo }, target });
  item = (await notes.readNoteFile(h.file)).groups[0].items[0];
  assert.equal(item.memo.body, "新しいメモ");
  assert.equal(item.memo.type, "list");
  assert.deepEqual(item.memo.tags, ["新"]);
  assert.deepEqual(item.memo.linkedConceptMemoIds, ["target-link"]);
  assert.equal(item.memo.autoSyncToConceptMemoOverride, true);
  assert.equal(item.memo.conceptMemoSyncFingerprint, "target-base");
  assert.equal(item.id, "old-item");
  assert.equal(item.heading, "以前の項目");
  await context.apply({ operation: "replace_entry_body", replaceItemMemo: true, source: { body: "メモなしの原文" }, target });
  assert.equal((await notes.readNoteFile(h.file)).groups[0].items[0].memo.body, "新しいメモ");
  await panel.receive({ type: "openPartialImport", payload: { initialMode: "replace_entry_body" } });
  const source = memoOptions.prepareImportedSource({ sourceType: "group", title: "挿入", items: [{ kind: "entry", heading: "追加", body: "追加本文", memo: importedMemo }] }, false);
  await context.apply({ operation: "insert_entry", source, target: { groupInsertIndex: 1 } });
  const saved = await notes.readNoteFile(h.file);
  assert.equal(saved.groups.length, 2);
  assert.equal(saved.groups[1].items[0].memo.body, "");
  assert.equal(saved.groups[0].items[0].memo.body, "新しいメモ");
  assert.equal(messages.filter((message) => message.type === "noteReloaded").length, 4);
  const beforeConflict = await fs.readFile(h.file, "utf8");
  await assert.rejects(context.apply({ operation: "replace_entry_body", replaceItemMemo: true,
    source: { body: "上書きしてはいけない", memo: importedMemo }, target: { ...target, body: "古いプレビューの内容" } }), /再読み込み/);
  assert.equal(await fs.readFile(h.file, "utf8"), beforeConflict);
});

test("置換確認中に外部更新された場合は停止して新しい内容を保持する", async (t) => {
  const h = await fixture(t);
  const p = await importPanel(h, async () => {
    const latest = await notes.readNoteFile(h.file);
    latest.title = "確認中の外部更新";
    await notes.saveNoteFile(h.file, latest);
    return "置換する";
  });
  await p.receive({ type: "confirmImportReplace", payload: { title: "置換後" } });
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0], /読み込み後に更新/);
  assert.equal((await notes.readNoteFile(h.file)).title, "確認中の外部更新");
  assert.equal(p.panel.disposed, false);
});

test("置換確認を取り消した場合は元の内容を保持する", async (t) => {
  const h = await fixture(t);
  const before = await fs.readFile(h.file, "utf8");
  const p = await importPanel(h, async () => undefined);
  await p.receive({ type: "confirmImportReplace", payload: { title: "置換後" } });
  assert.equal(await fs.readFile(h.file, "utf8"), before);
  assert.equal(p.panel.disposed, false);
});

test("新規インポートも作成直後のノートを基準付きで保存できる", async (t) => {
  const h = await fixture(t);
  const p = await importPanel(h);
  await p.receive({ type: "confirmImportCreate", payload: { title: "新規取り込み" } });
  assert.deepEqual(p.errors, []);
  assert.equal(p.opened.length, 1);
  const saved = await notes.readNoteFile(p.opened[0]);
  assert.equal(saved.groups[0].items[0].body, "取り込んだ本文");
  assert.ok(!Object.hasOwn(JSON.parse(await fs.readFile(p.opened[0], "utf8")), "storageRevision"));
});

test("新規インポートは空ノートを経由せず、一度の保存からWeb読込用Markdownを生成する", async (t) => {
  const service = require("../src/export/web-note-markdown");
  const format = require("../web/lib/generated-note-markdown");
  const h = await fixture(t);
  const dir = path.join(h.dir, ".mojigoto");
  await service.setEnabled(dir, true);
  const events = [];
  const listener = service.onDidChange((workDir, status) => { if (workDir === dir) events.push(status); });
  t.after(() => listener.dispose());
  const parsed = parser.parseMarkdownImport("# 分類\n### 項目\n本文\n#### 項目メモ\nメモ本文").parsedNote;
  const p = await importPanel(h, async () => "置換する", parsed);
  await p.receive({ type: "confirmImportCreate", payload: { title: "新規のエピソード" } });
  assert.deepEqual(p.errors, []);
  assert.equal(p.saveCalls.length, 0);
  await service.afterNoteSaved(p.opened[0]);
  assert.equal(events.some((status) => status.error), false);
  const saved = await notes.readNoteFile(p.opened[0]);
  const output = path.join(dir, "web-import", service.outputFileName(saved.id, saved.title, "plot"));
  const generated = format.decode(await fs.readFile(output, "utf8"));
  assert.match(generated.body, /本文/);
  assert.equal(saved.groups[0].items[0].memo.body, "メモ本文");
  assert.equal(service.getStatus(dir).error, "");
});

test("選択挿入の成功返答へ新しい大分類・項目の候補を含める", async (t) => {
  const h = await fixture(t);
  let receive;
  const messages = [];
  const panel = { dispose() {}, onDidDispose() {}, webview: { onDidReceiveMessage: (callback) => { receive = callback; }, postMessage: (message) => messages.push(message) } };
  const context = vm.createContext({
    ...memoOptions, ...importPreview, ...importContent,
    openPartialImportPanels: new Map(), getPanelKey: () => "panel", getPanelTitle: () => "選択インポート", getHtml: () => "",
    setWebviewPanelThemeIcon() {}, flattenSourceInsertables: () => [], flattenSourceEntries: () => [],
    readNoteFile: notes.readNoteFile, vscode: { ViewColumn: { Active: 1 }, window: {
      createWebviewPanel: () => panel, showInformationMessage: async () => "挿入する", showWarningMessage: async () => "上書きする",
      showErrorMessage: (message) => { throw new Error(message); },
    } },
  });
  const { openNotePartialImportWebview } = loadPanelForContext("partial", context);
  await openNotePartialImportWebview({ subscriptions: [] }, {}, { notePath: h.file, noteData: h.note,
    onApply: async () => {
      const note = await notes.readNoteFile(h.file);
      note.groups.push({ id: "inserted-group", title: "挿入した大分類", items: [{ id: "inserted-item", kind: "entry", heading: "挿入項目", body: "挿入本文" }] });
      return { noteData: await notes.saveNoteFile(h.file, note), sourceItemId: "source", message: "挿入しました" };
    },
  });
  await receive({ type: "applyPartialInsertItem", payload: { keepOpen: true, source: { sourceType: "group" } } });
  const result = messages.at(-1);
  assert.equal(result.type, "partialImportApplied");
  assert.equal(result.payload.insertTargetGroups.length, 2);
  assert.equal(result.payload.insertTargetGroups[1].groupTitle, "挿入した大分類");
  assert.equal(result.payload.replaceTargetEntries[1].itemId, "inserted-item");
});

test("選択インポート画面は再読み込みなしで挿入先の大分類と位置を描画し直す", async () => {
  const html = loadViewModule("note-partial-import-html").getHtml({});
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new vm.Script(script));
  let listener;
  const groupSelect = { innerHTML: "", value: "" };
  const positionSelect = { innerHTML: "", value: "" };
  const context = vm.createContext({
    initialData: { insertTargetGroups: [{ groupId: "old", groupTitle: "以前", items: [] }], replaceTargetEntries: [] },
    selectedTargetGroupId: "old", selectedInsertIndex: "0", isInsertMode: () => true,
    targetGroupSelect: groupSelect, targetPositionSelect: positionSelect, esc: (value) => String(value),
    markSourceApplied() {}, showResultNotice() {}, moveToNextSource() {},
    window: { addEventListener: (_, callback) => { listener = callback; } },
  });
  const targetStateStart = /    (?:let|const) insertTargetGroups =/.exec(script).index;
  vm.runInContext(script.slice(targetStateStart, script.indexOf("    const modeInsertBtn", targetStateStart)), context);
  for (const name of ["getCurrentTargetGroups", "getInsertPositionLabel", "renderTargetGroupOptions", "renderTargetPositionOptions"]) {
    const start = script.indexOf(`    function ${name}(`);
    const end = /\n    }\n/.exec(script.slice(start));
    vm.runInContext(script.slice(start, start + end.index + end[0].length), context);
  }
  context.renderAll = () => { context.renderTargetGroupOptions(); context.renderTargetPositionOptions(); };
  const start = script.indexOf('window.addEventListener("message"');
  const end = /\n    }\);/.exec(script.slice(start));
  vm.runInContext(script.slice(start, start + end.index + end[0].length), context);
  listener({ data: { type: "partialImportApplied", payload: { keepOpen: true, insertTargetGroups: [
    { groupId: "old", groupTitle: "以前", items: [{ id: "inserted-item", kind: "entry", heading: "挿入した項目" }] },
    { groupId: "new", groupTitle: "挿入した大分類", items: [] },
  ], replaceTargetEntries: [{ itemId: "inserted-item" }] } } });
  assert.match(groupSelect.innerHTML, /挿入した大分類/);
  assert.match(positionSelect.innerHTML, /挿入した項目/);
  assert.equal(vm.runInContext("replaceTargetEntries[0].itemId", context), "inserted-item");
});
