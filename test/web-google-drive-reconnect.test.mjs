import { createEditorSaveScheduler } from "../web/lib/editor-save-scheduler.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { GoogleDriveAuth, GOOGLE_DRIVE_SCOPE } from "../web/auth/google-drive.mjs";
import { GoogleDriveProvider } from "../web/storage/google-drive-provider.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}

test("30分・1時間の有効期間をGoogleの応答どおり保持し、不正な期限を延長しない", async () => {
  const original = Date.now;
  let now = 1000000000;
  Date.now = () => now;
  try {
    const auth = new GoogleDriveAuth({ storage: storage() });
    for (const seconds of [1800, 3600]) {
      auth.storeToken({ access_token: "secret", scope: GOOGLE_DRIVE_SCOPE, expires_in: seconds });
      const status = auth.connectionStatus();
      assert.equal(status.lifetimeSeconds, seconds);
      assert.equal(status.remainingMs, (seconds - 60) * 1000);
      assert.equal(JSON.stringify(status).includes("secret"), false);
      now += (seconds - 60) * 1000;
      assert.equal(await auth.getAccessToken(), "");
    }
    for (const bad of [0, -1, "invalid", Infinity]) assert.throws(() => auth.storeToken({ access_token: "bad", scope: GOOGLE_DRIVE_SCOPE, expires_in: bad }), /接続期限/);
  } finally { Date.now = original; }
});

test("Google Driveの401で再接続状態にし、古い応答で新しいトークンを失効させない", async () => {
  const auth = new GoogleDriveAuth({ storage: storage() });
  auth.storeToken({ access_token: "old", scope: GOOGLE_DRIVE_SCOPE, expires_in: 3600 });
  const provider = new GoogleDriveProvider(auth, async () => ({ ok: false, status: 401, json: async () => ({}) }));
  await assert.rejects(provider.request("https://www.googleapis.com/drive/v3/files"), /再接続ボタン/);
  assert.equal(auth.connectionStatus().connected, false);
  auth.storeToken({ access_token: "new", scope: GOOGLE_DRIVE_SCOPE, expires_in: 3600 });
  auth.invalidateAccessToken("old");
  assert.equal(await auth.getAccessToken(), "new");
});

function harness() {
  let status = { connected: false, remainingMs: 0 };
  const calls = [];
  const state = { cloudKind: "googleDrive", dirty: true, selectedWork: { id: "work" },
    provider: {}, currentFile: { id: "file", eTag: "old" }, originalContent: "保存済み本文", currentNote: { data: { title: "未保存のメモ" } },
    googleDriveAuth: { connectionStatus: () => status, async signIn(options) { calls.push(options); status = { connected: true, remainingMs: 1000000 }; } } };
  const elements = { googleDriveReconnectNotice: {}, googleDriveReconnectMessage: {}, reconnectGoogleDriveButton: {}, connectionBadgeLabel: {}, readerContent: { value: "未保存の本文" },
    connectGoogleDriveButton: {}, connectionDescription: {}, connectionPanel: { classes: new Set(), classList: { toggle(key, enabled) { enabled ? elements.connectionPanel.classes.add(key) : elements.connectionPanel.classes.delete(key); }, remove(key) { elements.connectionPanel.classes.delete(key); } } },
    readerSection: { hidden: false }, noteEditorSection: { hidden: true }, conceptMemoEditorSection: { hidden: true }, workSettingsSection: { hidden: true } };
  const context = vm.createContext({ state, elements, cancelAutoSave() {}, stopExternalMonitor() {}, setBusy(_button, value) { calls.push(["busy", value]); },
    notify: (message) => calls.push(message), startExternalMonitor() {}, scheduleAutoSave: () => calls.push("auto-save"), loadWorks: async (root) => calls.push(["loadWorks", root.id]) });
  for (const name of ["isGoogleDriveEditingScreen", "updateGoogleDriveConnectionNotice", "reconnectGoogleDriveForEditing"]) vm.runInContext(appFunction(name), context);
  return { state, elements, context, calls, setStatus: (next) => { status = next; } };
}

test("編集中の本文・メモ・保存基準・作品を変更せず再接続できる", async () => {
  const h = harness();
  const work = h.state.selectedWork;
  const note = h.state.currentNote;
  await h.context.reconnectGoogleDriveForEditing();
  assert.equal(h.elements.readerContent.value, "未保存の本文");
  assert.equal(h.state.originalContent, "保存済み本文");
  assert.equal(h.state.selectedWork, work);
  assert.equal(h.state.currentNote, note);
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.currentFile.eTag, "old");
  assert.equal(h.state.syncing, false);
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, true);
  assert.equal(h.calls.some((call) => call?.prompt === ""), true);
});

test("再接続をキャンセル・失敗しても入力を保持し、自動保存を再開しない", async () => {
  const h = harness();
  h.state.googleDriveAuth.signIn = async () => { throw new Error("キャンセル"); };
  await h.context.reconnectGoogleDriveForEditing();
  assert.equal(h.elements.readerContent.value, "未保存の本文");
  assert.equal(h.state.dirty, true);
  assert.equal(h.state.syncing, false);
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, false);
  assert.equal(h.calls.includes("auto-save"), false);
});

test("期限が近いときだけ案内し、保存中・他クラウドでは再接続を開始しない", async () => {
  const h = harness();
  h.setStatus({ connected: true, remainingMs: 299000 });
  h.context.updateGoogleDriveConnectionNotice();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, false);
  assert.match(h.elements.googleDriveReconnectMessage.textContent, /期限が近づいて/);
  h.state.saving = true;
  await h.context.reconnectGoogleDriveForEditing();
  assert.equal(h.calls.length, 0);
  h.state.cloudKind = "dropbox";
  h.context.updateGoogleDriveConnectionNotice();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, true);
});

test("期限切れ中は自動保存のタイマーを作らず、再接続の案内を表示する", () => {
  const h = harness();
  h.state.autoSaveEnabled = true;
  h.context.clearTimeout = () => {};
  h.context.setTimeout = () => { throw new Error("Unexpected retry"); };
  Object.assign(h.context, createEditorSaveScheduler({ ...h.context,
    autoSaveDelay: 2000, externalCheckInterval: 3000,
    timers: { setTimeout: h.context.setTimeout, clearTimeout: h.context.clearTimeout },
  }));
  h.context.scheduleAutoSave();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, false);
});

test("HOMEに作品・登録情報が残っていても編集向けの再接続案内は表示しない", async () => {
  const h = harness();
  h.state.workRoot = { id: "registered-root" };
  h.elements.readerSection.hidden = true;
  h.context.updateGoogleDriveConnectionNotice();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, true);
  await h.context.reconnectGoogleDriveForEditing();
  assert.equal(h.calls.some((call) => call?.prompt === ""), true);
  assert.equal(h.calls.some((call) => call?.[0] === "loadWorks"), true);
  h.setStatus({ connected: false, remainingMs: 0 });
  for (const key of ["readerSection", "noteEditorSection", "conceptMemoEditorSection", "workSettingsSection"]) {
    h.elements[key].hidden = false;
    h.context.updateGoogleDriveConnectionNotice();
    assert.equal(h.elements.googleDriveReconnectNotice.hidden, false, key);
    h.elements[key].hidden = true;
  }
});

test("編集からHOMEに戻る画面更新で、次のタイマーを待たず再接続案内が消える", () => {
  const h = harness();
  h.context.updateGoogleDriveConnectionNotice();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, false);
  Object.assign(h.elements, { globalWorkNav: { querySelectorAll: () => [] }, recentViewsPanel: {}, browserSection: { hidden: true },
    notePreviewDialog: { open: false }, conceptNoteReferencePanel: { hidden: true }, editorFooterMenu: {} });
  h.context.document = { body: { classList: { toggle() {} } } };
  h.context.currentWorkDestination = () => null;
  h.elements.readerSection.hidden = true;
  vm.runInContext(appFunction("updateShellContext"), h.context);
  h.context.updateShellContext();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, true);
  assert.equal(h.state.selectedWork.id, "work");
});

test("HOMEでは期限切れを接続済み表示にせず、追加許可と別の再接続ボタンを使える", async () => {
  const h = harness(); h.state.workRoot = { id: "root" }; h.elements.readerSection.hidden = true;
  h.context.updateGoogleDriveConnectionNotice();
  assert.equal(h.elements.googleDriveReconnectNotice.hidden, true);
  assert.equal(h.elements.connectGoogleDriveButton.disabled, false);
  assert.equal(h.elements.connectionPanel.classes.has("needs-reconnect"), true);
  assert.match(h.elements.connectionDescription.textContent, /追加許可とは別/);
  await h.context.reconnectGoogleDriveForEditing();
  assert.equal(h.elements.connectGoogleDriveButton.textContent, "接続済み");
  assert.equal(h.elements.connectGoogleDriveButton.disabled, true);
  assert.equal(h.elements.connectionPanel.classes.has("needs-reconnect"), false);
});
