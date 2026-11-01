import { confirmedBackupTime, rememberBackupTime } from "../web/lib/automatic-backup-window.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as backup from "../web/lib/backup-format.mjs";
import { OneDriveConflictError } from "../web/storage/onedrive-provider.mjs";
import { normalizeNote } from "../web/lib/notes.mjs";
import { normalizeConceptDocument } from "../web/lib/concept-memos.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const storageModule = await readFile(new URL("../web/lib/backup-storage.mjs", import.meta.url), "utf8");
const creationModule = await readFile(new URL("../web/lib/backup-creation.mjs", import.meta.url), "utf8");
const restoreModule = await readFile(new URL("../web/lib/backup-restore.mjs", import.meta.url), "utf8");
const functionSource = app + "\n" + (storageModule + "\n" + creationModule + "\n" + restoreModule).split("\n").map(line => line.startsWith("  ") ? line.slice(2) : line).join("\n");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(functionSource).index;
  const end = /\r?\n}\r?\n/.exec(functionSource.slice(start));
  return functionSource.slice(start, start + end.index + end[0].length);
}
function harness() {
  const calls = [];
  const notices = [];
  const measurements = [];
  const provider = {
    async listChildren() { return []; }, async readText(item) { return item.raw; },
    async createFolder() { calls.push("folder"); }, async createTextFile() { calls.push("create"); },
    async writeText(item, content) { calls.push(["write", item.id, content]); return { ...item, eTag: "2" }; },
  };
  const state = { provider, selectedWork: { id: "work", mojigoto: { id: "metadata" } }, originalContent: "保存済み", dirty: true };
  const elements = { readerContent: { value: "未保存の本文" }, saveFileButton: {}, saveNoteButton: {},
    restoreComparedBackupButton: {}, manuscriptBackupStatus: { textContent: "1件" },
    manuscriptBackupDialog: { open: true, close() {} }, conflictDialog: { showModal() {} },
    conceptMemoEditorSection: {}, conceptMemosSection: {} };
  const context = vm.createContext({ confirmedBackupTime, rememberBackupTime, ...backup, state, elements, structuredClone, OneDriveConflictError,
    beginPerformanceMeasurement: (label, details = {}) => extra => { measurements.push({ label, ...details, ...extra }); },
    normalizeNote, normalizeConceptDocument, requestAnimationFrame: (cb) => cb(),
    window: { confirm: () => true }, setBusy() {}, formatDate: (value) => value,
    cancelAutoSave() {}, onManuscriptRestored() {}, notify: (message) => notices.push(message), setEditorStatus() {},
    updateReaderMeta() {}, makeWritingEvent: (value) => value, countCharacters: (value) => value.length,
    appendWritingEvent: async () => {}, updateSharedWorkMetrics() {}, renderManuscriptBackupHistory: async () => {},
    setNoteStatus() {}, renderNoteEditor() {}, updateNoteIndex() {}, setConceptStatus() {},
    openConceptMemo() {}, refreshConceptFilterOptions() {}, renderConceptMemosList() {}, commitRoute() {}, routeForWork() {},
  });
  for (const name of ["backupSessionStorage", "automaticBackupWindowKey", "measureBackupStep", "loadManuscriptBackupStorage", "readWebBackupIndex", "rebuildWebBackupIndexFromSnapshots", "saveWebBackupIndex", "readWebBackupSnapshot", "refreshBackupHistoryAfterSave", "restoreWebManuscriptBackup", "setWebBackupProtection", "noteBackupTarget"]) {
    vm.runInContext(appFunction(name), context);
  }
  return { state, context, provider, elements, calls, notices, measurements };
}

test("Google Driveの未許可バックアップフォルダ・子フォルダを作成しない", async () => {
  const h = harness();
  h.provider.requiresExplicitFileAccess = true;
  await assert.rejects(h.context.loadManuscriptBackupStorage({ create: true }), /追加許可/);
  h.provider.listChildren = async (id) => id === "metadata" ? [{ id: "backups", name: "backups", folder: {} }] : [];
  await assert.rejects(h.context.loadManuscriptBackupStorage({ create: true }), /snapshots/);
  assert.equal(h.calls.length, 0);
});

test("Google Drive索引が未許可・破損・読込失敗でも、一部だけで再構築しない", async () => {
  for (const raw of [null, "{broken", '{"snapshots":[]}']) {
    const h = harness();
    h.provider.requiresExplicitFileAccess = true;
    const storage = { provider: h.provider, indexFile: raw ? { raw } : null, snapshotsFolder: { id: "snapshots" } };
    if (raw?.includes("snapshots")) h.provider.readText = async () => { throw new Error("offline"); };
    await assert.rejects(h.context.readWebBackupIndex(storage), /Webでは.*再構築しません/);
    assert.equal(h.calls.length, 0);
  }
});

test("他クラウドでも索引の通信失敗・スナップショットの取得失敗では索引を更新しない", async () => {
  const h = harness();
  h.provider.readText = async () => { throw new Error("offline"); };
  await assert.rejects(h.context.readWebBackupIndex({ provider: h.provider, indexFile: {} }), /offline/);
  h.provider.listChildren = async () => [{ name: "one.json", file: {} }];
  await assert.rejects(h.context.rebuildWebBackupIndexFromSnapshots({ provider: h.provider, snapshotsFolder: { id: "snapshots" } }), /offline/);
  assert.equal(h.calls.length, 0);
});

test("破損した本文・ID不一致・不正JSONは復元前の検証で止まる", async () => {
  const h = harness();
  h.context.currentBackupTarget = () => ({ targetType: "note", relativePath: "plots/note.json" });
  const content = '{"groups":[]}';
  const valid = { id: "one", targetType: "note", relativePath: "plots/note.json", content, contentHash: await backup.hashBackupContent(content) };
  const entry = { id: "one", snapshotFile: "one.json", contentHash: valid.contentHash };
  h.provider.listChildren = async () => [{ name: "one.json", file: {} }];
  for (const snapshot of [{ ...valid, content: "違う" }, { ...valid, id: "other" }, { ...valid, content: "{broken", contentHash: await backup.hashBackupContent("{broken") }]) {
    h.provider.readText = async () => JSON.stringify(snapshot);
    await assert.rejects(h.context.readWebBackupSnapshot({ provider: h.provider, snapshotsFolder: {} }, { ...entry, contentHash: snapshot.contentHash }));
  }
  assert.equal(h.calls.length, 0);
});

function restoreHarness(type = "manuscript") {
  const h = harness();
  const item = { id: "target", eTag: "1" };
  let draft = type === "manuscript" ? "未保存の本文" : type === "note" ? '{"title":"未保存ノート","groups":[]}' : '{"memos":[]}';
  const target = () => ({ targetType: type, item, relativePath: "target", content: draft, label: type });
  h.context.currentBackupTarget = h.context.manuscriptBackupTarget = h.context.noteBackupTarget = h.context.conceptMemoBackupTarget = target;
  h.context.readWebBackupSnapshot = async () => ({ content: type === "manuscript" ? "復元本文" : type === "note" ? '{"title":"復元ノート","groups":[]}' : '{"memos":[]}' });
  h.context.createWebManuscriptBackup = async (...args) => { h.calls.push(["backup", ...args]); };
  h.state.currentFile = item;
  h.state.currentNote = { item, data: JSON.parse(type === "note" ? draft : '{}'), raw: "保存済み" };
  h.state.noteType = "plot";
  h.state.conceptFile = item;
  return { ...h, setDraft: (value) => { draft = value; } };
}

test("復元前の退避が失敗すると本文へ書き込まず、入力と保存状態を保持する", async () => {
  const h = restoreHarness();
  h.context.createWebManuscriptBackup = async () => { throw new Error("backup failed"); };
  await h.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.elements.readerContent.value, "未保存の本文");
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.syncing, false);
});

test("原稿・ノート・構想メモは現在の入力を退避してから復元し、空の構想も表示できる", async () => {
  for (const type of ["manuscript", "note", "conceptMemo"]) {
    const h = restoreHarness(type);
    let searchCleared = false; h.context.onManuscriptRestored = () => { searchCleared = true; };
    await h.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
    assert.equal(searchCleared, type === "manuscript");
    assert.equal(h.calls[0][0], "backup");
    assert.equal(h.calls[0][1], "before-restore");
    assert.match(h.calls[0][2], type === "manuscript" ? /未保存の本文/ : type === "note" ? /未保存ノート/ : /memos/);
    assert.equal(h.calls[1][0], "write");
    assert.equal(h.state.dirty, false);
    assert.equal(h.state.syncing, false);
    assert.equal(h.notices.some((message) => message.includes("復元しました")), true);
  }
});

test("退避中の追加入力は復元を止め、保存中の追加入力は未保存として保持する", async () => {
  const before = restoreHarness();
  before.context.createWebManuscriptBackup = async () => { before.setDraft("追加入力"); };
  await before.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(before.calls.length, 0);
  const during = restoreHarness();
  during.provider.writeText = async () => { during.setDraft("追加入力"); during.elements.readerContent.value = "追加入力"; return { eTag: "2" }; };
  await during.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(during.elements.readerContent.value, "追加入力");
  assert.equal(during.state.originalContent, "復元本文");
  assert.equal(during.state.dirty, true);
});

test("復元の競合・キャンセル・対象変更では元の本文を上書きしない", async () => {
  const conflict = restoreHarness();
  conflict.provider.writeText = async () => { throw new OneDriveConflictError(); };
  await conflict.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(conflict.state.externalConflict, true);
  assert.equal(conflict.elements.readerContent.value, "未保存の本文");
  const cancel = restoreHarness();
  cancel.context.window.confirm = () => false;
  await cancel.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(cancel.calls.length, 0);
  const changed = restoreHarness();
  changed.context.createWebManuscriptBackup = async () => { changed.state.selectedWork = { id: "other" }; };
  await changed.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(changed.calls.length, 0);
});

test("スナップショットが見えない保護変更では、索引や画面状態を変更しない", async () => {
  const h = harness();
  const index = { snapshots: [{ id: "one", snapshotFile: "one.json", protected: false }] };
  await assert.rejects(h.context.setWebBackupProtection({ provider: h.provider, snapshotsFolder: {} }, index, { id: "one" }, true));
  assert.equal(index.snapshots[0].protected, false);
  assert.equal(h.calls.length, 0);
});

test("復元後の履歴取得が終わらなくても復元完了を表示してロックを解除する", async () => {
  const h = restoreHarness();
  h.context.renderManuscriptBackupHistory = () => new Promise(() => {});
  await h.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(h.state.syncing, false);
  assert.equal(h.elements.readerContent.value, "復元本文");
  assert.match(h.elements.manuscriptBackupStatus.textContent, /復元しました/);
  assert.doesNotMatch(h.elements.manuscriptBackupStatus.textContent, /復元しています/);
});

test("復元後の履歴更新失敗は、復元済みと履歴の失敗を区別して通知する", async () => {
  const h = restoreHarness();
  h.context.renderManuscriptBackupHistory = async () => { throw new Error("offline"); };
  await h.context.restoreWebManuscriptBackup({}, { createdAt: "today" });
  assert.equal(h.state.dirty, false);
  assert.match(h.elements.manuscriptBackupStatus.textContent, /復元しました.*履歴の更新に失敗/);
  assert.ok(h.notices.some((message) => /復元しました.*\n履歴を更新できません/.test(message)));
});

test("バックアップパネル内に通知を表示し、警告は後続の成功通知で消さない", () => {
  const notice = { hidden: true, dataset: {}, setAttribute(name, value) { this[name] = value; } };
  const elements = { manuscriptBackupDialog: { open: true }, manuscriptBackupNotice: notice,
    manuscriptBackupNoticeText: {}, statusMessage: { classList: { toggle() {}, add() {}, remove() {} } } };
  const context = vm.createContext({ elements, clearTimeout() {}, setTimeout() {} });
  vm.runInContext(`let statusTimer;\n${appFunction("notify")}`, context);
  context.notify("保存済みです");
  assert.equal(elements.manuscriptBackupNoticeText.textContent, "保存済みです");
  context.notify("記録を保存できません\n追加許可してください", true);
  context.notify("復元しました");
  assert.equal(notice.hidden, false);
  assert.equal(notice.role, "alert");
  assert.match(elements.manuscriptBackupNoticeText.textContent, /追加許可/);
});

test("既存バックアップの保存先確認は管理・バックアップの一覧各1回だけ取得する", async () => {
  const h = harness(), lists = [];
  h.provider.listChildren = async id => { lists.push(id); return id === "metadata"
    ? [{ id: "backups", name: "backups", folder: {} }]
    : [{ id: "snapshots", name: "snapshots", folder: {} }, { id: "index", name: "index.json", file: {}, eTag: "v1" }]; };
  const storage = await h.context.loadManuscriptBackupStorage({ create: true });
  assert.deepEqual(lists, ["metadata", "backups"]);
  assert.equal(storage.indexFile.eTag, "v1");
});
test("バックアップ開始後の作品・設定・入力変更で保存先と保存本文を変えない", async () => {
  const h = harness(); vm.runInContext(appFunction("createWebManuscriptBackup"), h.context);
  let release, entered; const hashEntered = new Promise(resolve => { entered = resolve; });
  h.context.hashBackupContent = () => new Promise(resolve => { release = resolve; entered(); });
  h.state.manuscriptBackupIntervalMinutes = 5;
  const oldProvider = h.state.provider, oldFolder = h.state.selectedWork.mojigoto;
  const target = { item: { id: "note" }, relativePath: "plots/note.json", fileName: "note.json", targetType: "note", content: "保存時本文" };
  let storageRequest, snapshot;
  const storage = { provider: { createTextFile: async (_folder, _name, content) => { snapshot = JSON.parse(content); } }, snapshotsFolder: { id: "snapshots" } };
  h.context.loadManuscriptBackupStorage = async options => { storageRequest = options; return storage; };
  h.context.readWebBackupIndex = async () => ({ snapshots: [] });
  h.context.planWebBackupPruning = index => ({ index, removed: [] });
  h.context.saveWebBackupIndex = async () => {};
  h.context.deletePrunedWebBackups = async () => {};
  const saving = h.context.createWebManuscriptBackup("automatic", null, target);
  await hashEntered;
  target.relativePath = "changed"; target.fileName = "changed"; target.content = "追記";
  h.state.provider = {}; h.state.selectedWork = { mojigoto: { id: "other" } }; h.state.manuscriptBackupIntervalMinutes = 0;
  release("hash"); await saving;
  assert.equal(storageRequest.provider, oldProvider); assert.equal(storageRequest.mojigoto, oldFolder);
  assert.equal(snapshot.relativePath, "plots/note.json"); assert.equal(snapshot.fileName, "note.json"); assert.equal(snapshot.content, "保存時本文");
  assert.equal(h.state.manuscriptBackupStorage, undefined, "別作品の画面キャッシュへ結果を混ぜない");
});

function backupCreationHarness(entries = []) {
  const h = harness(), requests = [];
  h.state.manuscriptBackupIntervalMinutes = 5;
  for (const name of ["createWebManuscriptBackup", "planWebBackupPruning", "deletePrunedWebBackups"]) vm.runInContext(appFunction(name), h.context);
  const index = { id: "index", name: "index.json", file: {}, eTag: "index-v1", size: 4096 };
  h.provider.listChildren = async id => { requests.push(["list", id]); return id === "metadata"
    ? [{ id: "backups", name: "backups", folder: {} }]
    : id === "backups" ? [{ id: "snapshots", name: "snapshots", folder: {} }, index]
    : entries.map(entry => ({ id: entry.id, name: entry.snapshotFile, file: {} })); };
  h.provider.readText = async item => { requests.push(["read", item.id]); assert.equal(item.id, "index"); return JSON.stringify({ snapshots: entries }); };
  h.provider.createTextFile = async (_parent, name) => { requests.push(["create", name]); return { id: "new", eTag: "new-v1" }; };
  h.provider.writeText = async (_item, _content, eTag) => { requests.push(["write", eTag]); return { id: "index", eTag: "index-v2" }; };
  h.provider.deleteItem = async item => { requests.push(["delete", item.id]); };
  h.target = { item: { id: "private-target" }, targetType: "note", relativePath: "plots/private.json", fileName: "private.json", content: "private body" };
  return { ...h, requests };
}
function backupEntry(id, overrides = {}) {
  return { id, targetType: "note", relativePath: "plots/private.json", fileName: "private.json", createdAt: new Date().toISOString(), reason: "manual", snapshotFile: id + ".json", contentHash: "other-hash", ...overrides };
}
test("通常バックアップは索引だけ読み段階・件数を記録し過去の本文は取得しない", async () => {
  const h = backupCreationHarness([backupEntry("old")]);
  const result = await h.context.createWebManuscriptBackup("automatic", null, h.target);
  assert.equal(result.duplicate, false);
  assert.deepEqual(h.requests.filter(([kind]) => kind === "read"), [["read", "index"]]);
  assert.deepEqual(h.requests.filter(([kind]) => kind === "list"), [["list", "metadata"], ["list", "backups"]]);
  assert.deepEqual(h.requests.filter(([kind]) => kind === "write"), [["write", "index-v1"]]);
  assert.deepEqual(h.measurements.map(sample => sample.label), ["バックアップ・管理フォルダ一覧", "バックアップ・保存フォルダ一覧", "バックアップ・索引読込", "バックアップ・内容ハッシュ", "バックアップ・本文保存", "バックアップ・索引保存", "バックアップ・処理全体"]);
  assert.equal(h.measurements.at(-1).result, "created");
  assert.equal(h.measurements.at(-1).indexEntries, 1);
  assert.equal(h.measurements.at(-1).removedEntries, 0);
  assert.doesNotMatch(JSON.stringify(h.measurements), /private|other-hash/);
});
test("自動間隔内は内容ハッシュ・本文保存・索引更新を行わず理由を記録する", async () => {
  const h = backupCreationHarness([backupEntry("recent", { reason: "automatic" })]);
  h.context.hashBackupContent = () => { throw new Error("内容照合は不要"); };
  const result = await h.context.createWebManuscriptBackup("automatic", null, h.target);
  assert.equal(result.interval, true);
  assert.equal(h.measurements.at(-1).result, "interval");
  assert.equal(h.requests.length, 3);
});
test("自動無効時は索引やフォルダにも通信せず理由を記録する", async () => {
  const h = backupCreationHarness(); h.state.manuscriptBackupIntervalMinutes = 0;
  const result = await h.context.createWebManuscriptBackup("automatic", null, h.target);
  assert.equal(result.disabled, true); assert.equal(h.requests.length, 0);
  assert.equal(h.measurements.at(-1).result, "disabled");
});
test("同じ内容の履歴は重複省略を記録し書き込まない", async () => {
  const h = backupCreationHarness([backupEntry("same", { contentHash: await backup.hashBackupContent("private body") })]);
  const result = await h.context.createWebManuscriptBackup("manual", null, h.target);
  assert.equal(result.duplicate, true); assert.equal(h.requests.length, 3);
  assert.equal(h.measurements.at(-1).result, "duplicate");
});
test("期限切れの整理では一覧・削除の計測を分け、索引保存後に削除する", async () => {
  const h = backupCreationHarness([backupEntry("expired", { reason: "automatic", createdAt: "2020-01-01" })]);
  await h.context.createWebManuscriptBackup("automatic", null, h.target);
  assert.deepEqual(h.requests.slice(-3), [["write", "index-v1"], ["list", "snapshots"], ["delete", "expired"]]);
  assert.equal(h.measurements.find(sample => sample.label === "バックアップ・古い履歴削除").removed, 1);
  assert.equal(h.measurements.at(-1).removedEntries, 1);
});
test("索引更新失敗は段階と全体の失敗を記録し古い履歴を削除しない", async () => {
  const h = backupCreationHarness([backupEntry("expired", { reason: "automatic", createdAt: "2020-01-01" })]);
  h.provider.writeText = async () => { throw Object.assign(new Error("conflict"), { code: "conflict" }); };
  await assert.rejects(h.context.createWebManuscriptBackup("automatic", null, h.target), /conflict/);
  assert.equal(h.measurements.find(sample => sample.label === "バックアップ・索引保存").failed, true);
  assert.equal(h.measurements.at(-1).result, "failed");
  assert.ok(!h.requests.some(([kind]) => kind === "delete"));
});

function enableBackupSession(h, stored = new Map()) {
  h.state.workRoot = { id: "root", parentReference: { driveId: "drive" } }; h.state.cloudKind = "oneDrive";
  h.context.workCatalogOwner = () => h.state.owner || "owner";
  h.context.sessionStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  return stored;
}
test("確認済みの自動作成時刻は再読み込み相当の新しいstateでも間隔内の通信を省く", async () => {
  const first = backupCreationHarness([backupEntry("recent", { reason: "automatic" })]);
  const stored = enableBackupSession(first);
  await first.context.createWebManuscriptBackup("automatic", null, first.target);
  assert.equal(first.requests.length, 3);
  const reloaded = backupCreationHarness(); enableBackupSession(reloaded, stored);
  const result = await reloaded.context.createWebManuscriptBackup("automatic", null, reloaded.target);
  assert.equal(result.interval, true); assert.equal(reloaded.requests.length, 0);
  assert.equal(reloaded.measurements.at(-1).result, "confirmed-interval");
});
test("新規バックアップは索引保存成功後だけ確認済みにする", async () => {
  for (const fails of [false, true]) {
    const h = backupCreationHarness(); const stored = enableBackupSession(h);
    if (fails) h.provider.writeText = async () => { throw new Error("index offline"); };
    if (fails) await assert.rejects(h.context.createWebManuscriptBackup("automatic", null, h.target));
    else await h.context.createWebManuscriptBackup("automatic", null, h.target);
    assert.equal(stored.size, fails ? 0 : 1);
  }
});
test("確認済み時刻は利用者・クラウド・ルート・作品・対象ごとに分離する", async () => {
  const first = backupCreationHarness([backupEntry("recent", { reason: "automatic" })]); const stored = enableBackupSession(first);
  await first.context.createWebManuscriptBackup("automatic", null, first.target);
  for (const change of [h => { h.state.owner = "other"; }, h => { h.state.cloudKind = "dropbox"; }, h => { h.state.workRoot.id = "other"; }, h => { h.state.selectedWork.mojigoto.id = "other"; }, h => { h.target.relativePath = "other.json"; }, h => { h.target.targetType = "conceptMemo"; }]) {
    const h = backupCreationHarness(); enableBackupSession(h, stored); change(h);
    // Use a separate mocked destination after confirming scope separation.
    h.context.loadManuscriptBackupStorage = async () => { throw new Error("fresh check required"); };
    await assert.rejects(h.context.createWebManuscriptBackup("automatic", null, h.target), /fresh check required/);
  }
});
test("手動バックアップは確認済みの自動間隔で省略しない", async () => {
  const h = backupCreationHarness([backupEntry("recent", { reason: "automatic" })]); enableBackupSession(h);
  await h.context.createWebManuscriptBackup("automatic", null, h.target);
  const before = h.requests.length;
  await h.context.createWebManuscriptBackup("manual", null, h.target);
  assert.ok(h.requests.length > before); assert.equal(h.measurements.at(-1).result, "created");
});
test("タブ保存領域が使えなくても従来どおりバックアップを作成する", async () => {
  const h = backupCreationHarness(); enableBackupSession(h);
  h.context.sessionStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  await h.context.createWebManuscriptBackup("automatic", null, h.target);
  assert.equal(h.measurements.at(-1).result, "created");
});

test("間隔内の再確認で端末内の待ち時間を確認時刻から延長しない", async () => {
  const h = harness(); vm.runInContext(appFunction("maybeCreateWebAutomaticBackup"), h.context);
  h.state.manuscriptBackupIntervalMinutes = 5; h.state.manuscriptAutomaticBackups = new Map();
  const createdAt = Date.now() - 120000;
  h.context.createWebManuscriptBackup = async () => ({ interval: true, confirmedAt: createdAt });
  await h.context.maybeCreateWebAutomaticBackup("本文", { item: {}, targetType: "note", relativePath: "plots/note.json" });
  assert.equal(h.state.manuscriptAutomaticBackups.get("metadata:note:plots/note.json"), createdAt);
});

test("バックアップ内の通知は共通トーストを消しタイマーを作らず、閉じた後は通常通知へ戻る", () => {
  const visible = new Set(["visible"]), timers = [], cleared = [];
  const notice = { hidden: true, dataset: {}, setAttribute() {} };
  const elements = { manuscriptBackupDialog: { open: true }, manuscriptBackupNotice: notice, manuscriptBackupNoticeText: {},
    statusMessage: { textContent: "以前の通知", classList: { add: name => visible.add(name), remove: name => visible.delete(name), toggle() {} } } };
  const context = vm.createContext({ elements, clearTimeout: id => cleared.push(id), setTimeout: callback => { timers.push(callback); return timers.length; } });
  vm.runInContext('let statusTimer = 99;\n' + appFunction("notify"), context);
  context.notify("履歴を保護しました");
  assert.equal(visible.has("visible"), false);
  assert.equal(timers.length, 0);
  assert.equal(cleared[0], 99);
  assert.equal(elements.manuscriptBackupNoticeText.textContent, "履歴を保護しました");
  context.notify("索引保存に失敗しました", true);
  context.notify("本文保存は完了しました");
  assert.equal(elements.manuscriptBackupNoticeText.textContent, "索引保存に失敗しました");
  assert.equal(visible.has("visible"), false);
  elements.manuscriptBackupDialog.open = false;
  context.notify("通常の保存通知");
  assert.equal(elements.statusMessage.textContent, "通常の保存通知");
  assert.equal(visible.has("visible"), true);
  assert.equal(timers.length, 1);
});

test("構想メモ一覧から全体を復元した後も個別メモを開かず一覧を更新する", async () => {
  const h = restoreHarness("conceptMemo");
  h.elements.conceptMemosSection.hidden = false;
  let editorOpened = false, listUpdated = false;
  h.context.openConceptMemo = () => { editorOpened = true; };
  h.context.renderConceptMemosList = () => { listUpdated = true; };
  h.context.readWebBackupSnapshot = async () => ({content: JSON.stringify({memos:[{id:"restored",title:"復元メモ",body:"本文"}]})});
  await h.context.restoreWebManuscriptBackup({}, {createdAt:"today"});
  assert.equal(editorOpened, false);
  assert.equal(listUpdated, true);
  assert.equal(h.elements.conceptMemosSection.hidden, false);
  assert.equal(h.elements.conceptMemoEditorSection.hidden, true);
  assert.equal(h.state.conceptDocument.memos[0].id, "restored");
});

test("Webの構想バックアップ入口は一覧だけに置き全メモ対象と表示する", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const list = html.slice(html.indexOf('<section id="conceptMemosSection"'), html.indexOf('<section id="conceptMemoEditorSection"'));
  const editor = html.slice(html.indexOf('<section id="conceptMemoEditorSection"'), html.indexOf('</section>', html.indexOf('<section id="conceptMemoEditorSection"')));
  assert.match(list, /id="conceptMemoBackupButton"[^>]*aria-label="バックアップ（全メモ）"/);
  assert.doesNotMatch(editor, /conceptMemoBackupButton/);
  assert.equal((html.match(/id="conceptMemoBackupButton"/g) || []).length, 1);
});
