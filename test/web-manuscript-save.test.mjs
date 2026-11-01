import { createManuscriptLoadController } from "../web/lib/manuscript-load.mjs";
import { createEditorExternalUpdateController } from "../web/lib/editor-external-update.mjs";
import { createManuscriptSaveController } from "../web/lib/manuscript-save.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { hasExternalVersion, hasSameExternalContent } from "../web/lib/editor-sync.mjs";
import { OneDriveConflictError } from "../web/storage/onedrive-provider.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app);
  assert.ok(match, name);
  const end = /\r?\n}\r?\n/.exec(app.slice(match.index));
  return app.slice(match.index, match.index + end.index + end[0].length);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const calls = { statuses: [], notices: [], autoSave: 0, opened: [], events: [], confirms: 0 };
  const element = () => ({ hidden: false, disabled: false, value: "", classList: { remove() {} }, focus() {}, setSelectionRange() {} });
  const elements = Object.fromEntries([
    "browserSection", "worksSection", "filesSection", "notesSection", "noteEditorSection", "readerSection",
    "readerTitle", "readerMeta", "readerContent", "saveFileButton", "readerJumpControls", "autoSaveToggle", "readerCountMode",
  ].map((key) => [key, element()]));
  elements.readerContent.value = "下書き";
  elements.conflictDialog = { open: false, showModal() { this.open = true; } };
  const state = {
    currentFile: { id: "file", name: "原稿.txt", eTag: "v1" }, originalContent: "保存済み本文",
    dirty: true, saving: false, checkingExternalUpdate: false, externalConflict: false,
    fileLoadRequest: 0, manuscriptTrail: [], selectedWork: { id: "work", mojigoto: {} },
    provider: { writeText: async () => ({ id: "file", eTag: "v2" }), readText: async () => "外部の本文" },
  };
  const context = {
    state, elements, document: { hidden: false },
    window: { confirm: () => { calls.confirms++; return true; } },
    OneDriveConflictError, hasExternalVersion, hasSameExternalContent,
    cancelAutoSave() {}, stopExternalMonitor() {}, startExternalMonitor() {}, hideConceptViews() {},
    scheduleAutoSave: () => { calls.autoSave++; },
    setEditorStatus: (...args) => calls.statuses.push(args),
    updateReaderMeta() {}, renderInputAssistVisibility() {}, commitRoute() {}, routeForWork() {},
    beginPerformanceMeasurement: () => () => {}, formatSize: () => "", formatDate: () => "",
    requestAnimationFrame: (callback) => callback(),
    notify: (message) => calls.notices.push(message), cloudLabel: () => "テストDrive",
    countCharacters: (value) => value.length, makeWritingEvent: (event) => event,
    appendWritingEvent: async (_provider, _folder, event) => calls.events.push(event),
    updateSharedWorkMetrics() {}, maybeCreateWebAutomaticBackup() {}, captureRecentManuscriptContext: () => null, recordRecentManuscript() {},
    openFile: async (...args) => calls.opened.push(args),
  };
  vm.createContext(context);
  for (const name of ["canDiscardDraft"]) vm.runInContext(appFunction(name), context);
  Object.assign(context, createManuscriptSaveController(context), createEditorExternalUpdateController(context));
  return { context, state, elements, calls };
}

test("原稿保存中の追加入力は下書きに残し、次の自動保存を予約する", async () => {
  const h = harness();
  const pending = deferred();
  let written;
  h.state.provider.writeText = async (_item, content, version) => { written = { content, version }; return pending.promise; };
  const saving = h.context.saveCurrentFile();
  h.elements.readerContent.value = "下書きへの追加入力";
  pending.resolve({ eTag: "v2" });
  await saving;
  assert.deepEqual(written, { content: "下書き", version: "v1" });
  assert.equal(h.state.originalContent, "下書き");
  assert.equal(h.elements.readerContent.value, "下書きへの追加入力");
  assert.equal(h.state.dirty, true);
  assert.equal(h.calls.autoSave, 1);
});

for (const [name, error] of [["通信失敗", new Error("offline")], ["競合", new OneDriveConflictError()]]) {
  test(`原稿保存の${name}では下書きと保存済み基準を保持する`, async () => {
    const h = harness();
    h.state.provider.writeText = async () => { throw error; };
    await h.context.saveCurrentFile();
    assert.equal(h.state.originalContent, "保存済み本文");
    assert.equal(h.elements.readerContent.value, "下書き");
    assert.equal(h.state.dirty, true);
    assert.equal(h.state.saving, false);
    assert.equal(h.calls.events.length, 0);
    assert.equal(h.calls.autoSave, 0);
    assert.equal(h.state.externalConflict, error.code === "conflict");
  });
}

test("保存中は下書き破棄を承認しても画面移動できない", () => {
  const h = harness();
  h.state.saving = true;
  assert.equal(h.context.canDiscardDraft(), false);
  h.state.dirty = false;
  assert.equal(h.context.canDiscardDraft(), false);
  assert.equal(h.calls.confirms, 0);
});

for (const phase of ["metadata", "content"]) {
  test(`外部更新の${phase}取得中に保存が完了したら古い結果を反映しない`, async () => {
    const h = harness();
    const pending = deferred();
    const reading = deferred();
    h.state.provider.getItemMetadata = async () => phase === "metadata" ? pending.promise : { eTag: "old-remote" };
    h.state.provider.readText = async () => { reading.resolve(); return phase === "content" ? pending.promise : "古い外部本文"; };
    const checking = h.context.checkExternalUpdate();
    if (phase === "content") await reading.promise;
    await h.context.saveCurrentFile();
    pending.resolve(phase === "metadata" ? { eTag: "old-remote" } : "古い外部本文");
    await checking;
    assert.equal(h.state.currentFile.eTag, "v2");
    assert.equal(h.state.originalContent, "下書き");
    assert.equal(h.calls.opened.length, 0);
    assert.equal(h.state.externalConflict, false);
  });
}

test("外部更新の本文を待つ間の入力は上書きせず競合で停止する", async () => {
  const h = harness();
  h.state.dirty = false;
  h.elements.readerContent.value = h.state.originalContent;
  const pending = deferred();
  h.state.provider.getItemMetadata = async () => ({ eTag: "v2" });
  h.state.provider.readText = async () => pending.promise;
  const checking = h.context.checkExternalUpdate();
  await Promise.resolve();
  h.elements.readerContent.value = "取得中に入力";
  h.state.dirty = true;
  pending.resolve("外部変更");
  await checking;
  assert.equal(h.elements.readerContent.value, "取得中に入力");
  assert.equal(h.state.externalConflict, true);
  assert.equal(h.calls.opened.length, 0);
});

test("未編集の外部更新は取得済み本文を使い二度読みしない", async () => {
  const h = harness();
  h.state.dirty = false;
  h.state.provider.getItemMetadata = async () => ({ eTag: "v2" });
  await h.context.checkExternalUpdate();
  assert.equal(h.calls.opened[0][1]?.content, "外部の本文");
});

test("原稿の読み込み失敗でも現在の本文と編集可能な状態を保持する", async () => {
  const h = harness();
  Object.assign(h.context, createManuscriptLoadController(h.context));
  h.state.provider.readText = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.openFile({ id: "next", name: "次の原稿.txt" }), /offline/);
  assert.equal(h.elements.readerContent.value, "下書き");
  assert.equal(h.elements.readerContent.disabled, false);
  assert.equal(h.state.currentFile.id, "file");
  assert.equal(h.state.dirty, true);
});

test("原稿を読み込む間に入力が変わったら遅い取得結果で置き換えない", async () => {
  const h = harness();
  Object.assign(h.context, createManuscriptLoadController(h.context));
  const pending = deferred();
  h.state.provider.readText = async () => pending.promise;
  const opening = h.context.openFile({ id: "next", name: "次の原稿.txt" });
  h.elements.readerContent.value = "読み込み待ち中の入力";
  pending.resolve("次の原稿の本文");
  await opening;
  assert.equal(h.elements.readerContent.value, "読み込み待ち中の入力");
  assert.equal(h.state.currentFile.id, "file");
});

test("原稿の二重読み込みは後から選んだファイルを優先する", async () => {
  const h = harness();
  Object.assign(h.context, createManuscriptLoadController(h.context));
  const first = deferred();
  h.state.provider.readText = async (file) => file.id === "first" ? first.promise : "後から選んだ本文";
  const opening = h.context.openFile({ id: "first", name: "先に選んだ原稿.txt" });
  await h.context.openFile({ id: "second", name: "後から選んだ原稿.txt" });
  first.resolve("遅れて取得した本文");
  await opening;
  assert.equal(h.state.currentFile.id, "second");
  assert.equal(h.elements.readerContent.value, "後から選んだ本文");
});

test("外部確認中にクラウドが変わったら同じIDでも確認結果を破棄する", async () => {
  const h = harness();
  const pending = deferred();
  h.state.provider.getItemMetadata = async () => pending.promise;
  const checking = h.context.checkExternalUpdate();
  h.state.provider = { ...h.state.provider };
  pending.resolve({ eTag: "v2" });
  await checking;
  assert.equal(h.state.externalConflict, false);
  assert.equal(h.calls.opened.length, 0);
  assert.equal(h.state.currentFile.eTag, "v1");
});

test("外部更新が改行だけなら下書きを残して最新の版で次回保存できる", async () => {
  const h = harness();
  h.state.originalContent = "保存済み\r\n本文";
  h.state.provider.getItemMetadata = async () => ({ eTag: "v2" });
  h.state.provider.readText = async () => "保存済み\n本文";
  await h.context.checkExternalUpdate();
  assert.equal(h.state.currentFile.eTag, "v2");
  assert.equal(h.elements.readerContent.value, "下書き");
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.externalConflict, false);
  assert.equal(h.calls.autoSave, 1);
});

function appListener(target, event) {
  const start = app.indexOf(`${target}.addEventListener("${event}",`);
  assert.ok(start >= 0, target);
  const end = /\r?\n\}\);/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
for (const action of ["disconnectButton", "logoutButton", "connectButton"]) {
  test(`${action}は保存中・未保存の破棄キャンセル時に接続や認証を変更しない`, async () => {
    for (const saving of [true, false]) {
      const h = harness();
      h.state.saving = saving;
      h.context.window.confirm = () => false;
      let handler;
      let mutations = 0;
      h.elements[action] = { addEventListener: (_event, callback) => { handler = callback; } };
      h.context.saveAutoConnectPreference = () => { mutations++; };
      h.context.setBusy = () => { mutations++; };
      h.state.auth = { signOut: async () => { mutations++; } };
      h.state.userAuth = { logout: async () => { mutations++; return {}; } };
      vm.runInContext(appListener(`elements.${action}`, "click"), h.context);
      await handler();
      assert.equal(mutations, 0, "設定・接続・認証に変更を加えない");
      assert.equal(h.elements.readerContent.value, "下書き");
      assert.equal(h.state.dirty, true);
    }
  });
}

test("保存中は入力を元へ戻してもタブを閉じる前に警告する", () => {
  const h = harness();
  h.state.dirty = false;
  h.state.saving = true;
  let handler, prevented = false;
  h.context.window.addEventListener = (_event, callback) => { handler = callback; };
  h.context.rememberCurrentRoutePosition = () => {};
  vm.runInContext(appListener("window", "beforeunload"), h.context);
  const event = { preventDefault: () => { prevented = true; } };
  handler(event);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, "");
});


for (const kind of ["text", "note", "concept", "settings"]) {
  function externalHarness() {
    const h = harness();
    const target = h.state.currentFile;
    const raw = kind === "note" || kind === "concept" ? JSON.stringify({ version: 1, id: "note", groups: [{ id: "group", items: [] }], memos: [] }) : "保存済み本文";
    h.state.currentFile = kind === "text" ? target : null;
    if (kind === "note") h.state.currentNote = { item: target, raw };
    if (kind === "concept") {
      h.state.currentConceptMemo = { id: "memo" };
      h.state.conceptFile = target;
      h.state.conceptOriginalContent = raw;
    }
    if (kind === "settings") h.state.currentSettings = { item: target, raw };
    for (const key of ["saveNoteButton", "saveConceptMemoButton", "saveWorkSettingsButton"]) h.elements[key] = { disabled: true };
    const status = (...args) => h.calls.statuses.push(args);
    Object.assign(h.context, {
      setWorkSettingsStatus: status, setConceptStatus: status, setNoteStatus: status,
      checkConceptSourceUpdate: async () => { h.calls.sourceChecks = (h.calls.sourceChecks || 0) + 1; },
      reloadWorkSettings: async (...args) => h.calls.opened.push(["settings", ...args]),
      reloadConceptDocument: async (...args) => h.calls.opened.push(["concept", ...args]),
      openNote: async (...args) => h.calls.opened.push(["note", ...args]),
    });
    h.state.provider.getItemMetadata = async () => ({ eTag: "v2" });
    Object.assign(h.context, createEditorExternalUpdateController(h.context));
    h.target = () => kind === "text" ? h.state.currentFile : kind === "note" ? h.state.currentNote.item : kind === "concept" ? h.state.conceptFile : h.state.currentSettings.item;
    h.baseline = () => kind === "text" ? h.state.originalContent : kind === "note" ? h.state.currentNote.raw : kind === "concept" ? h.state.conceptOriginalContent : h.state.currentSettings.raw;
    return h;
  }
  test(kind + "の版のみ更新は下書きを保持して保存予約を戻す", async () => {
    const h = externalHarness();
    const baseline = h.baseline();
    h.state.provider.readText = async () => baseline;
    await h.context.checkExternalUpdate();
    assert.equal(h.target().eTag, "v2");
    assert.equal(h.baseline(), baseline);
    assert.equal(h.elements.readerContent.value, "下書き");
    assert.equal(h.state.dirty, true);
    assert.equal(h.state.externalConflict, false);
    assert.equal(h.calls.autoSave, 1);
    assert.equal(h.calls.opened.length, 0);
    assert.equal(h.calls.sourceChecks || 0, kind === "concept" ? 1 : 0);
  });
  test(kind + "の未保存入力と外部変更は競合で停止する", async () => {
    const h = externalHarness();
    await h.context.checkExternalUpdate();
    assert.equal(h.state.externalConflict, true);
    assert.equal(h.elements.conflictDialog.open, true);
    assert.equal(h.elements.readerContent.value, "下書き");
    assert.equal(h.target().eTag, "v1");
    assert.equal(h.calls.opened.length, 0);
    assert.equal(h.calls.autoSave, 0);
    assert.equal(h.state.checkingExternalUpdate, false);
  });
  test(kind + "の未編集外部更新は対応する再読込へ渡す", async () => {
    const h = externalHarness();
    h.state.dirty = false;
    await h.context.checkExternalUpdate();
    assert.equal(h.calls.opened.length, 1);
    const call = h.calls.opened[0];
    if (kind === "text") assert.equal(call[1].content, "外部の本文");
    else {
      assert.equal(call[0], kind);
      assert.equal((kind === "note" ? call[1].item : call[1]).eTag, "v2");
      if (kind === "concept") assert.equal(call[2], "memo");
    }
    assert.equal(h.state.externalConflict, false);
  });
}

test("外部更新判定と実際の原稿読込を接続し取得済み本文を一度で反映する", async () => {
  const h = harness();
  h.state.dirty = false;
  let reads = 0;
  h.state.provider.getItemMetadata = async () => ({ eTag: "v2" });
  h.state.provider.readText = async () => { reads++; return "最新の本文"; };
  Object.assign(h.context, createManuscriptLoadController(h.context));
  Object.assign(h.context, createEditorExternalUpdateController(h.context));
  await h.context.checkExternalUpdate();
  assert.equal(reads, 1);
  assert.equal(h.elements.readerContent.value, "最新の本文");
  assert.equal(h.state.originalContent, "最新の本文");
  assert.equal(h.state.currentFile.eTag, "v2");
  assert.equal(h.state.dirty, false);
  assert.equal(h.state.checkingExternalUpdate, false);
});

for (const phase of ["metadata", "content"]) {
  test("外部更新の" + phase + "取得失敗は編集を保って次回保存を予約できる", async () => {
    const h = harness();
    h.state.provider.getItemMetadata = async () => {
      if (phase === "metadata") throw new Error("offline");
      return { eTag: "v2" };
    };
    h.state.provider.readText = async () => { throw new Error("offline"); };
    await h.context.checkExternalUpdate();
    assert.equal(h.state.checkingExternalUpdate, false);
    assert.equal(h.state.currentFile.eTag, "v1");
    assert.equal(h.elements.readerContent.value, "下書き");
    assert.equal(h.calls.autoSave, 1);
    assert.equal(h.state.externalConflict, false);
  });
}

for (const phase of ['metadata','content']) {
  for (const change of ['work','root','view','preview-navigation']) {
    test('外部更新の'+phase+'待ちで'+change+'が変わっても古い応答を反映しない', async()=>{
      const h=harness(),waiting=deferred();h.state.dirty=false;h.state.workRoot={id:'root'};
      h.state.provider.getItemMetadata=async()=>phase==='metadata'?waiting.promise:{eTag:'v2'};
      h.state.provider.readText=async()=>phase==='content'?waiting.promise:'別端末の本文';
      const checking=h.context.checkExternalUpdate();await new Promise(r=>setImmediate(r));
      if(change==='work')h.state.selectedWork={id:'other'};
      if(change==='root')h.state.workRoot={id:'other-root'};
      if(change==='view')h.elements.readerSection.hidden=true;
      if(change==='preview-navigation')h.state.openingPreviewManuscript=true;
      waiting.resolve(phase==='metadata'?{eTag:'v2'}:'別端末の本文');await checking;
      assert.equal(h.calls.opened.length,0);assert.equal(h.state.currentFile.eTag,'v1');assert.equal(h.calls.autoSave,0);assert.equal(h.state.checkingExternalUpdate,false);
    });
  }
}
