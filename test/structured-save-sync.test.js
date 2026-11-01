const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const Module = require("node:module");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../.review-baseline/test-temp");
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === "vscode") return { workspace: { getConfiguration: () => ({ get: (_, fallback) => fallback }), workspaceFolders: [] } };
  return originalLoad.call(this, request, ...args);
};
const notes = require("../src/data/note-store");
Module._load = originalLoad;
const concepts = require("../src/data/concept-memo-store");
const { createConceptMemoMessageHandler } = require("../src/views/concept-memo/host-actions");
const { buildConceptMemoDataFromMessage } = require("../src/views/concept-memo/edit-message");
const { syncFingerprint, noteMemoPayload, notePayloadFromConcept } = require("../src/data/concept-sync");

async function nestedFunctions(file, names, values) {
  const source = await fs.readFile(path.join(__dirname, "../src/views", file), "utf8");
  const context = vm.createContext({ buildConceptMemoDataFromMessage, postMessage: (message) => values.panel?.webview.postMessage(message), ...values });
  for (const name of names) {
    const start = new RegExp(`  (?:async )?function ${name}\\(`).exec(source).index;
    const end = /\r?\n  }\r?\n/.exec(source.slice(start));
    vm.runInContext(source.slice(start, start + end.index + end[0].length), context);
  }
  return context;
}

function conceptSyncValues(h) {
  return { filePath: h.conceptPath, workDir: h.dir, ownConceptRevisions: new Set(),
    isConceptMemoAutoSyncEnabled: (source) => source.autoSyncToNoteItem,
    getWebviewUiSettings: () => ({ conceptMemoAutoSyncDefault: false }),
    resolveActualNotePath: (file) => file, applyConceptMemoToNoteItem: notes.applyConceptMemoToNoteItem,
    notePayloadFromConcept, syncFingerprint, writeConceptMemos: concepts.writeConceptMemos,
    require: () => ({ notifyNoteUpdated: async () => {} }),
  };
}

async function fixture(t) {
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "structured-sync-"));
  t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(`${root}${path.sep}`));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const notePath = path.join(dir, "plots", "note.json");
  const conceptPath = path.join(dir, "concept-memos.json");
  const fingerprint = syncFingerprint(noteMemoPayload({ body: "基準", tags: [] }));
  await notes.saveNoteFile(notePath, { id: "note", type: "plot", title: "ノート", groups: [{ id: "group", items: [
    { id: "item", kind: "entry", heading: "項目", memo: { body: "基準", linkedConceptMemoIds: ["memo"], conceptMemoSyncFingerprint: fingerprint } },
  ] }] });
  await concepts.writeConceptMemos(conceptPath, { memos: [{ id: "memo", type: "text", body: "基準", tags: [], source: {
    kind: "noteItem", notePath, noteType: "plot", groupId: "group", itemId: "item", autoSyncToNoteItem: true, syncFingerprint: fingerprint,
  } }] });
  return { dir, notePath, conceptPath, fingerprint };
}

for (const kind of ["note", "concept"]) {
  test(`${kind}: 同じ読み込み基準からの同時保存は一方を止め、JSONを保持する`, async (t) => {
    const h = await fixture(t);
    const file = kind === "note" ? h.notePath : h.conceptPath;
    const read = kind === "note" ? notes.readNoteFile : concepts.readConceptMemos;
    const save = kind === "note" ? notes.saveNoteFile : concepts.writeConceptMemos;
    const [first, second] = await Promise.all([read(file), read(file)]);
    if (kind === "note") { first.title = "先の保存"; second.title = "後の保存"; }
    else { first.memos[0].body = "先の保存"; second.memos[0].body = "後の保存"; }
    const results = await Promise.allSettled([save(file, first), save(file, second)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.code, "conflict");
    const raw = await fs.readFile(file, "utf8");
    assert.ok(!Object.hasOwn(JSON.parse(raw), "storageRevision"));
    const winner = results.findIndex((result) => result.status === "fulfilled");
    assert.match(raw, new RegExp(winner === 0 ? "先の保存" : "後の保存"));
    assert.doesNotMatch(raw, new RegExp(winner === 0 ? "後の保存" : "先の保存"));
  });
}

test("Webからの外部変更を、古いVS Codeのノート保存で上書きしない", async (t) => {
  const h = await fixture(t);
  const draft = await notes.readNoteFile(h.notePath);
  const remote = JSON.parse(await fs.readFile(h.notePath, "utf8"));
  remote.title = "Webで保存";
  const raw = JSON.stringify(remote);
  await fs.writeFile(h.notePath, raw);
  draft.title = "VS Code未保存";
  await assert.rejects(notes.saveNoteFile(h.notePath, draft), { code: "conflict" });
  assert.equal(await fs.readFile(h.notePath, "utf8"), raw);
  assert.equal(draft.title, "VS Code未保存");
});

test("置き換え失敗では既存ファイルを保持し、仮ファイルを除去する", async (t) => {
  const h = await fixture(t);
  const data = await concepts.readConceptMemos(h.conceptPath);
  const before = await fs.readFile(h.conceptPath, "utf8");
  const rename = fs.rename;
  fs.rename = async (from, to) => { if (to === h.conceptPath) throw Object.assign(new Error("write failed"), { code: "EIO" }); return rename(from, to); };
  try { await assert.rejects(concepts.writeConceptMemos(h.conceptPath, data), { code: "EIO" }); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(h.conceptPath, "utf8"), before);
  assert.ok(!(await fs.readdir(h.dir)).some((name) => name.includes(".new-")));
});

test("読み込み後に削除されたノートを古い保存で復活させない", async (t) => {
  const h = await fixture(t);
  const draft = await notes.readNoteFile(h.notePath);
  await fs.unlink(h.notePath);
  await assert.rejects(notes.saveNoteFile(h.notePath, draft), { code: "conflict" });
  await assert.rejects(fs.access(h.notePath), { code: "ENOENT" });
});

test("構想から連続して二度反映したあと、ノートから構想へ戻す", async (t) => {
  const h = await fixture(t);
  const source = await fs.readFile(path.join(__dirname, "../src/views/concept-memo-webview.js"), "utf8");
  const start = source.indexOf("  async function syncEnabledConceptMemosToNoteItems(");
  const end = /\r?\n  }\r?\n/.exec(source.slice(start));
  const context = vm.createContext({
    filePath: h.conceptPath, workDir: h.dir, ownConceptRevisions: new Set(),
    isConceptMemoAutoSyncEnabled: (source) => source.autoSyncToNoteItem,
    getWebviewUiSettings: () => ({ conceptMemoAutoSyncDefault: false }),
    resolveActualNotePath: (file) => file, applyConceptMemoToNoteItem: notes.applyConceptMemoToNoteItem,
    notePayloadFromConcept, syncFingerprint, writeConceptMemos: concepts.writeConceptMemos,
    require: () => ({ notifyNoteUpdated: async () => {} }),
  });
  vm.runInContext(source.slice(start, start + end.index + end[0].length), context);
  for (const body of ["構想の一度目", "構想の二度目"]) {
    const draft = await concepts.readConceptMemos(h.conceptPath);
    draft.memos[0].body = body;
    const saved = await concepts.writeConceptMemos(h.conceptPath, draft);
    const result = await context.syncEnabledConceptMemosToNoteItems(saved);
    assert.equal(result.errors.length, 0);
    assert.equal(result.reflectedCount, 1);
    assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.body, body);
    assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].source.syncFingerprint, syncFingerprint(notePayloadFromConcept(saved.memos[0])));
  }
  const note = await notes.readNoteFile(h.notePath);
  const item = note.groups[0].items[0];
  item.memo.body = "ノートから戻した変更";
  await notes.saveNoteFile(h.notePath, note);
  const result = await concepts.createConceptMemoFromNoteItem(h.conceptPath, {
    notePath: h.notePath, noteType: "plot", groupId: "group", itemId: "item", memoBody: item.memo.body,
    linkedConceptMemoIds: ["memo"], baseSyncFingerprint: item.memo.conceptMemoSyncFingerprint, requireSyncBaseline: true,
  });
  assert.equal(result.memo.id, "memo");
  assert.equal(result.memo.body, item.memo.body);
  assert.equal(result.data.memos.length, 1);
});

test("ノート保存キューは同じ画面の追加入力を順番に保存し、外部更新は止める", async (t) => {
  const h = await fixture(t);
  const note = await notes.readNoteFile(h.notePath);
  const source = await fs.readFile(path.join(__dirname, "../src/views/note-webview.js"), "utf8");
  const start = source.indexOf("  async function persistNoteMessage(");
  const end = /\r?\n  }\r?\n/.exec(source.slice(start));
  const messages = [];
  const context = vm.createContext({
    filePath: h.notePath, note, noteSaveQueue: Promise.resolve(), ownNoteRevisions: new Set(),
    saveNoteFile: notes.saveNoteFile, syncAutoConceptMemosAfterNoteSave: async (note) => ({ note, updates: [], errors: [] }),
    vscode: { workspace: { getConfiguration: () => ({ get: () => 30 }) } }, createStructuredBackup: async () => {},
    buildNoteBootState: (note) => note, type: "plot", workDir: h.dir, workName: "作品", workTitle: "作品",
    panel: { webview: { postMessage: (message) => messages.push(message) } }, treeProvider: { refresh() {} }, console,
  });
  vm.runInContext(source.slice(start, start + end.index + end[0].length), context);
  await Promise.all([
    context.persistNoteMessage({ payload: { ...note, title: "最初の入力" }, revision: 1 }),
    context.persistNoteMessage({ payload: { ...note, title: "次の入力" }, revision: 2 }),
  ]);
  assert.equal((await notes.readNoteFile(h.notePath)).title, "次の入力");
  assert.equal(messages.filter((message) => message.type === "noteSaved").length, 2);
  const raw = JSON.stringify({ ...JSON.parse(await fs.readFile(h.notePath, "utf8")), title: "Webから変更" });
  await fs.writeFile(h.notePath, raw);
  await assert.rejects(context.persistNoteMessage({ payload: { ...note, title: "古い画面の入力" }, revision: 3 }), { code: "conflict" });
  assert.equal(await fs.readFile(h.notePath, "utf8"), raw);
});

test("構想保存キューは追加入力を保存し、競合時は共通TODOを書き込まない", async (t) => {
  const h = await fixture(t);
  const initial = await concepts.readConceptMemos(h.conceptPath);
  const source = await fs.readFile(path.join(__dirname, "../src/views/concept-memo-webview.js"), "utf8");
  const functions = ["buildDataFromMessage", "persistConceptMemos"].map((name) => {
    const start = new RegExp(`  (?:async )?function ${name}\\(`).exec(source).index;
    const end = /\r?\n  }\r?\n/.exec(source.slice(start));
    return source.slice(start, start + end.index + end[0].length);
  });
  let todoWrites = 0;
  const context = vm.createContext({
    postMessage() {}, buildConceptMemoDataFromMessage, currentData: initial, ownConceptRevisions: new Set(), saveQueue: Promise.resolve(), filePath: h.conceptPath,
    writeConceptMemos: concepts.writeConceptMemos, writeCommonTodoItems: async (items) => { todoWrites++; return items; },
    syncEnabledConceptMemosToNoteItems: async () => ({ errors: [], reflectedCount: 0 }), createStructuredBackup: async () => {}, notifyCommonTodoUpdated: async () => {},
    vscode: { workspace: { getConfiguration: () => ({ get: () => 30 }) } },
    panel: { webview: { postMessage() {} } }, workDir: h.dir, workTitle: "作品", console,
  });
  vm.runInContext(functions.join("\n"), context);
  const message = (body, revision) => ({ payload: { ...initial, memos: [{ ...initial.memos[0], body }] }, revision });
  await Promise.all([context.persistConceptMemos(message("一度目", 1)), context.persistConceptMemos(message("追加入力", 2))]);
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "追加入力");
  assert.equal(todoWrites, 2);
  const external = await concepts.readConceptMemos(h.conceptPath);
  external.memos[0].body = "ノートから反映";
  await concepts.writeConceptMemos(h.conceptPath, external);
  await assert.rejects(context.persistConceptMemos(message("古い画面の入力", 3)), { code: "conflict" });
  assert.equal(todoWrites, 2);
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "ノートから反映");
});

test("ノート本体保存後の同期情報保存失敗は、保存成功と未反映情報を分ける", async (t) => {
  const h = await fixture(t);
  const note = await notes.readNoteFile(h.notePath);
  note.groups[0].items[0].memo.body = "本体は保存済み";
  note.groups[0].items[0].memo.updatedAt = "2026-10-13T00:00:00Z";
  const saved = await notes.saveNoteFile(h.notePath, note);
  const source = await fs.readFile(path.join(__dirname, "../src/views/note-webview.js"), "utf8");
  const start = source.indexOf("  async function syncAutoConceptMemosAfterNoteSave(");
  const end = /\r?\n  }\r?\n/.exec(source.slice(start));
  const context = vm.createContext({
    filePath: h.notePath, type: "plot", resolveWorkDirForCurrentNote: () => h.dir,
    resolveConceptMemoFilePath: () => h.conceptPath, isNoteMemoAutoSyncEnabled: () => true,
    vscode: { workspace: { getConfiguration: () => ({ get: () => true }) } },
    noteMemoPayload, syncFingerprint, createConceptMemoFromNoteItem: concepts.createConceptMemoFromNoteItem,
    saveNoteFile: async () => { throw new Error("metadata offline"); }, notifyConceptMemoUpdated: async () => {},
  });
  vm.runInContext(source.slice(start, start + end.index + end[0].length), context);
  const result = await context.syncAutoConceptMemosAfterNoteSave(saved);
  assert.equal(result.note.storageRevision, saved.storageRevision);
  assert.equal(result.updates.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /本体と構想メモは保存/);
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "本体は保存済み");
  assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.conceptMemoSyncFingerprint, h.fingerprint);
});

test("実際のノートパネルで初回・連続手動保存・自動保存が成功し、外部変更は止まる", { timeout: 5000 }, async (t) => {
  const h = await fixture(t);
  const note = await notes.readNoteFile(h.notePath);
  const messages = [];
  let scheduledDone;
  const scheduledCompletion = new Promise((resolve) => { scheduledDone = resolve; });
  const editor = require("./fixtures/note-editor-harness.cjs").createNoteEditorHarness({
    note, noteStore: notes, conceptStore: concepts, assetsRoot: h.dir,
    onPost(message) {
      messages.push(message);
      if ((message.type === "noteSaved" && message.revision === 3) || message.type === "error") scheduledDone(message);
    },
  });
  const panel = await editor.open({ filePath: h.notePath, workDir: h.dir });
  const receive = (message) => panel.receive(message);
  for (const [revision, title] of [[1, "初回保存"], [2, "連続保存"]]) {
    await receive({ type: "save", payload: { ...note, title }, revision });
    assert.ok(!messages.some((message) => message.type === "error"), JSON.stringify(messages));
    assert.equal(messages.at(-1).type, "noteSaved");
    assert.equal((await notes.readNoteFile(h.notePath)).title, title);
  }
  await receive({ type: "scheduleAutoSave", payload: { ...note, title: "自動保存" }, revision: 3 });
  await editor.tick();
  assert.equal((await scheduledCompletion).type, "noteSaved", JSON.stringify(messages));
  assert.equal((await notes.readNoteFile(h.notePath)).title, "自動保存");
  const external = await notes.readNoteFile(h.notePath);
  external.title = "外部の変更";
  await notes.saveNoteFile(h.notePath, external);
  await receive({ type: "save", payload: { ...note, title: "古い画面の変更" }, revision: 4 });
  assert.equal(messages.at(-1).type, "error");
  assert.equal((await notes.readNoteFile(h.notePath)).title, "外部の変更");
  const differentConcept = await concepts.readConceptMemos(h.conceptPath);
  differentConcept.memos[0].body = "構想側で別に変更";
  await concepts.writeConceptMemos(h.conceptPath, differentConcept);
  await receive({ type: "createConceptMemoFromNoteItem", payload: {
    notePath: h.notePath, noteType: "plot", groupId: "group", itemId: "item", linkedConceptMemoIds: ["memo"],
    memoBody: "手動ボタンから採用", baseSyncFingerprint: h.fingerprint,
  } });
  assert.equal(messages.at(-1).type, "conceptMemoCreatedFromNoteItem");
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "手動ボタンから採用");
  assert.equal(panel.__mojigotoNoteData.groups[0].items[0].memo.conceptMemoSyncFingerprint,
    syncFingerprint(noteMemoPayload({ body: "手動ボタンから採用" })));
});

for (const direction of ["note-to-concept", "concept-to-note"]) {
  test(`${direction}: 自動の両側変更は停止するが、手動で選んだ側は採用できる`, async (t) => {
    const h = await fixture(t);
    const note = await notes.readNoteFile(h.notePath);
    note.groups[0].items[0].memo.body = "ノートで採用したい内容";
    await notes.saveNoteFile(h.notePath, note);
    const document = await concepts.readConceptMemos(h.conceptPath);
    document.memos[0].body = "構想で採用したい内容";
    await concepts.writeConceptMemos(h.conceptPath, document);
    const fromNote = direction === "note-to-concept";
    const input = { notePath: h.notePath, noteType: "plot", groupId: "group", itemId: "item", memoId: "memo",
      memoBody: fromNote ? note.groups[0].items[0].memo.body : document.memos[0].body,
      linkedConceptMemoIds: ["memo"], baseSyncFingerprint: h.fingerprint, requireSyncBaseline: true,
    };
    const reflect = fromNote ? (value) => concepts.createConceptMemoFromNoteItem(h.conceptPath, value) : notes.applyConceptMemoToNoteItem;
    await assert.rejects(reflect(input), { code: "MOJIGOTO_MEMO_SYNC_CONFLICT" });
    assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.body, "ノートで採用したい内容");
    assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "構想で採用したい内容");
    await reflect({ ...input, forceOverwrite: true });
    const target = fromNote ? (await concepts.readConceptMemos(h.conceptPath)).memos[0]
      : (await notes.readNoteFile(h.notePath)).groups[0].items[0].memo;
    assert.equal(target.body, input.memoBody);
    assert.equal(fromNote ? target.source.syncFingerprint : target.conceptMemoSyncFingerprint,
      syncFingerprint(noteMemoPayload({ body: input.memoBody })));
  });
}

test("内容を変えていない構想の自動保存は、変更されたノートを元に戻さない", async (t) => {
  const h = await fixture(t);
  const note = await notes.readNoteFile(h.notePath);
  note.groups[0].items[0].memo.body = "ノートだけに入った変更";
  await notes.saveNoteFile(h.notePath, note);
  const context = await nestedFunctions("concept-memo-webview.js", ["syncEnabledConceptMemosToNoteItems"], conceptSyncValues(h));
  const result = await context.syncEnabledConceptMemosToNoteItems(await concepts.readConceptMemos(h.conceptPath));
  assert.equal(result.reflectedCount, 0);
  assert.equal(result.errors.length, 0);
  assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.body, "ノートだけに入った変更");
});

test("クリア・リンク切れの構想は自動反映ONでも項目メモを上書きしない", async (t) => {
  const h = await fixture(t);
  const document = await concepts.readConceptMemos(h.conceptPath);
  document.memos[0].body = "古い内容で戻してはいけない";
  const context = await nestedFunctions("concept-memo-webview.js", ["syncEnabledConceptMemosToNoteItems"], conceptSyncValues(h));
  const before = await fs.readFile(h.notePath, "utf8");
  for (const status of ["cleared", "missing"]) {
    document.memos[0].source.status = status;
    document.memos[0].source.autoSyncToNoteItemOverride = true;
    const result = await context.syncEnabledConceptMemosToNoteItems(document);
    assert.equal(result.reflectedCount, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(await fs.readFile(h.notePath, "utf8"), before);
  }
});

test("ノートの片側変更は時刻情報が同じでも自動反映する", async (t) => {
  const h = await fixture(t);
  const note = await notes.readNoteFile(h.notePath);
  note.groups[0].items[0].memo.body = "ノートだけの変更";
  const saved = await notes.saveNoteFile(h.notePath, note);
  const context = await nestedFunctions("note-webview.js", ["syncAutoConceptMemosAfterNoteSave"], {
    filePath: h.notePath, type: "plot", resolveWorkDirForCurrentNote: () => h.dir,
    resolveConceptMemoFilePath: () => h.conceptPath, isNoteMemoAutoSyncEnabled: () => true,
    vscode: { workspace: { getConfiguration: () => ({ get: () => true }) } },
    noteMemoPayload, syncFingerprint, createConceptMemoFromNoteItem: concepts.createConceptMemoFromNoteItem,
    saveNoteFile: notes.saveNoteFile, notifyConceptMemoUpdated: async () => {},
  });
  const result = await context.syncAutoConceptMemosAfterNoteSave(saved);
  assert.equal(result.errors.length, 0);
  assert.equal(result.updates.length, 1);
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "ノートだけの変更");
});

test("構想保存中の追加入力は前の自動反映の基準を使って続けて反映する", async (t) => {
  const h = await fixture(t);
  const initial = await concepts.readConceptMemos(h.conceptPath);
  const context = await nestedFunctions("concept-memo-webview.js", ["buildDataFromMessage", "syncEnabledConceptMemosToNoteItems", "persistConceptMemos"], {
    ...conceptSyncValues(h), currentData: initial, saveQueue: Promise.resolve(),
    writeCommonTodoItems: async (items) => items, createStructuredBackup: async () => {}, notifyCommonTodoUpdated: async () => {},
    vscode: { workspace: { getConfiguration: () => ({ get: () => 30 }) } },
    panel: { webview: { postMessage() {} } }, workTitle: "作品", console,
  });
  const message = (body, revision) => ({ payload: { ...initial, memos: [{ ...initial.memos[0], body }] }, revision });
  await Promise.all([context.persistConceptMemos(message("先の変更", 1)), context.persistConceptMemos(message("続けて追加入力", 2))]);
  assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.body, "続けて追加入力");
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "続けて追加入力");
});

test("ノート保存中の追加入力も両側変更と誤判定せず反映する", async (t) => {
  const h = await fixture(t);
  const initial = await notes.readNoteFile(h.notePath);
  const errors = [];
  const context = await nestedFunctions("note-webview.js", ["syncAutoConceptMemosAfterNoteSave", "persistNoteMessage"], {
    filePath: h.notePath, type: "plot", note: initial, noteSaveQueue: Promise.resolve(), ownNoteRevisions: new Set(),
    resolveWorkDirForCurrentNote: () => h.dir, resolveConceptMemoFilePath: () => h.conceptPath,
    isNoteMemoAutoSyncEnabled: () => true, noteMemoPayload, syncFingerprint,
    createConceptMemoFromNoteItem: concepts.createConceptMemoFromNoteItem, saveNoteFile: notes.saveNoteFile,
    notifyConceptMemoUpdated: async () => {}, createStructuredBackup: async () => {},
    vscode: { workspace: { getConfiguration: () => ({ get: (_, fallback) => fallback }) } },
    buildNoteBootState: (note) => note, workDir: h.dir, workName: "作品", workTitle: "作品",
    panel: { webview: { postMessage: (message) => { if (message.type === "error") errors.push(message); } } }, treeProvider: { refresh() {} }, console,
  });
  const message = (body, revision) => {
    const payload = structuredClone(initial);
    payload.groups[0].items[0].memo.body = body;
    return { payload, revision };
  };
  await Promise.all([context.persistNoteMessage(message("先の変更", 1)), context.persistNoteMessage(message("続けて追加入力", 2))]);
  assert.equal(errors.length, 0);
  assert.equal((await concepts.readConceptMemos(h.conceptPath)).memos[0].body, "続けて追加入力");
  assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.body, "続けて追加入力");
});

test("構想の手動反映ボタンの受信処理も、選んだ内容をノートへ採用する", async (t) => {
  const h = await fixture(t);
  const note = await notes.readNoteFile(h.notePath);
  note.groups[0].items[0].memo.body = "ノート側の別編集";
  await notes.saveNoteFile(h.notePath, note);
  const messages = [];
  const session = { autoSaveTimer: null, saveQueue: Promise.resolve(), currentData: await concepts.readConceptMemos(h.conceptPath) };
  session.currentData.memos[0].source.status = "cleared";
  const reflect = createConceptMemoMessageHandler({
    workDir: h.dir, resolveActualNotePath: (file) => file, applyConceptMemoToNoteItem: notes.applyConceptMemoToNoteItem,
    session, lifecycle: { disposed: false }, getNoteWebview: () => ({ notifyNoteUpdated: async () => {} }),
    postMessage: (message) => messages.push(message),
  });
  await reflect({ type: "applyConceptMemoToNoteItem", payload: {
    notePath: h.notePath, noteType: "plot", groupId: "group", itemId: "item", memoId: "memo", memoBody: "構想側を手動で採用",
    baseSyncFingerprint: h.fingerprint, requireSyncBaseline: true,
  } });
  assert.equal(messages.at(-1).type, "conceptMemoAppliedToNoteItem");
  assert.equal(session.currentData.memos[0].source.status, "active");
  assert.equal((await notes.readNoteFile(h.notePath)).groups[0].items[0].memo.body, "構想側を手動で採用");
  assert.equal(session.currentData.memos[0].source.syncFingerprint,
    syncFingerprint(noteMemoPayload({ body: "構想側を手動で採用" })));
});

test("手動反映でも、書き込み中の別プロセス更新は上書きしない", async (t) => {
  const h = await fixture(t);
  const external = JSON.parse(await fs.readFile(h.conceptPath, "utf8"));
  external.memos[0].body = "書き込み中の外部変更";
  const remoteRaw = JSON.stringify(external);
  const write = fs.writeFile;
  const open = fs.open;
  fs.open = async (file, flags) => {
    const handle = await open(file, flags);
    if (String(file).startsWith(`${h.conceptPath}.new-`)) {
      const writeTemporary = handle.writeFile.bind(handle);
      handle.writeFile = async (...args) => {
        await writeTemporary(...args);
        await write(h.conceptPath, remoteRaw);
      };
    }
    return handle;
  };
  try {
    await assert.rejects(concepts.createConceptMemoFromNoteItem(h.conceptPath, {
      notePath: h.notePath, noteType: "plot", groupId: "group", itemId: "item", linkedConceptMemoIds: ["memo"],
      memoBody: "手動で採用", forceOverwrite: true,
    }), { code: "conflict" });
  } finally { fs.open = open; }
  assert.equal(await fs.readFile(h.conceptPath, "utf8"), remoteRaw);
});
