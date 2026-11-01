import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { GOOGLE_DRIVE_SCOPE, GoogleDriveAuth } from "../web/auth/google-drive.mjs";
import { GoogleDriveConflictError, GoogleDriveProvider } from "../web/storage/google-drive-provider.mjs";
import { GoogleDrivePicker } from "../web/storage/google-drive-picker.mjs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("Google Drive接続時にはdrive.fileだけを要求し許可を自動合算しない", async () => {
  let config;
  const googleApi = { accounts: { oauth2: {
    initTokenClient(value) {
      config = value;
      return { requestAccessToken() { value.callback({ access_token: "token", expires_in: 3600, scope: GOOGLE_DRIVE_SCOPE }); } };
    },
    revoke(_token, callback) { callback(); },
  } } };
  const auth = new GoogleDriveAuth({ clientId: "google-client", googleApi, storage: memoryStorage() });
  assert.equal(await auth.signIn(), "token");
  assert.equal(config.scope, GOOGLE_DRIVE_SCOPE);
  assert.equal(config.scope, "https://www.googleapis.com/auth/drive.file");
  assert.equal(config.include_granted_scopes, false);
  assert.equal(await auth.getAccessToken(), "token");
});

test("旧driveトークンは再利用せず再接続を求める", async () => {
  const storage = memoryStorage();
  storage.setItem("mojigoto.googleDrive.accessToken", "old-token");
  storage.setItem("mojigoto.googleDrive.expiresAt", String(Date.now() + 60000));
  storage.setItem("mojigoto.googleDrive.scope", "https://www.googleapis.com/auth/drive");
  const auth = new GoogleDriveAuth({ clientId: "google-client", googleApi: {}, storage });
  assert.equal(await auth.getAccessToken(), "");
});

test("Google Drive認可でスコープが欠落・不足・過剰ならトークンを保存しない", async () => {
  for (const scope of [undefined, "openid email", "https://www.googleapis.com/auth/drive", `${GOOGLE_DRIVE_SCOPE} https://www.googleapis.com/auth/drive.readonly`]) {
    const storage = memoryStorage();
    const googleApi = { accounts: { oauth2: {
      initTokenClient(config) {
        return { requestAccessToken() { config.callback({ access_token: "rejected-token", expires_in: 3600, scope }); } };
      },
    } } };
    const auth = new GoogleDriveAuth({ clientId: "google-client", googleApi, storage });
    await assert.rejects(auth.signIn(), /権限を確認できません/);
    assert.equal(storage.getItem("mojigoto.googleDrive.accessToken"), null);
    assert.equal(await auth.getAccessToken(), "");
  }
});

test("Google Drive項目を既存の作品検出形式へ正規化する", async () => {
  const calls = [];
  const provider = new GoogleDriveProvider(
    { getAccessToken: async () => "token" },
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { files: [
        { id: "folder-1", name: "novel", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-09-17T00:00:00Z", version: "3" },
        { id: "file-1", name: "draft.txt", mimeType: "text/plain", size: "12", modifiedTime: "2026-09-17T01:00:00Z", version: "4" },
      ] }; } };
    },
  );
  const items = await provider.listChildren("root-id");
  assert.ok(items[0].folder);
  assert.ok(items[1].file);
  assert.equal(items[1].size, 12);
  assert.equal(items[1].eTag, "4");
  assert.match(calls[0].url, /drive\/v3\/files\?/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
});

test("Google Drive保存前にversionの不一致を競合として停止する", async () => {
  const provider = new GoogleDriveProvider(
    { getAccessToken: async () => "token" },
    async () => ({ ok: true, async json() { return { id: "file-1", name: "draft.txt", mimeType: "text/plain", version: "8" }; } }),
  );
  await assert.rejects(() => provider.writeText({ id: "file-1" }, "本文", "7"), GoogleDriveConflictError);
});

test("Google Driveの原稿ファイルを別の原稿フォルダへ移動する", async () => {
  let requestCall;
  const provider = new GoogleDriveProvider(
    { getAccessToken: async () => "token" },
    async (url, options = {}) => {
      requestCall = { url: String(url), options };
      return { ok: true, async json() { return { id: "file-1", name: "01.txt", mimeType: "text/plain", parents: ["to-id"], version: "9" }; } };
    },
  );

  const moved = await provider.moveItem(
    { id: "file-1", parentReference: { id: "from-id" } },
    { id: "to-id" },
  );

  assert.equal(moved.parentReference.id, "to-id");
  assert.match(requestCall.url, /addParents=to-id/);
  assert.match(requestCall.url, /removeParents=from-id/);
  assert.equal(requestCall.options.method, "PATCH");
});

test("Google Driveの整理対象バックアップを削除する", async () => {
  let requestCall;
  const provider = new GoogleDriveProvider(
    { getAccessToken: async () => "token" },
    async (url, options = {}) => {
      requestCall = { url: String(url), options };
      return { ok: true };
    },
  );
  await provider.deleteItem({ id: "backup-id" });
  assert.match(requestCall.url, /drive\/v3\/files\/backup-id$/);
  assert.equal(requestCall.options.method, "DELETE");
});

test("HOMEでOneDriveとGoogle Driveの接続を分けて表示する", () => {
  const html = read("../web/index.html");
  const app = read("../web/app.mjs");
  assert.match(html, /id="connectGoogleDriveButton"/);
  assert.match(html, />OneDriveに接続</);
  assert.match(html, />Google Driveに接続</);
  assert.match(html, /script-src 'self' https:\/\/accounts\.google\.com https:\/\/apis\.google\.com/);
  assert.match(html, /id="selectGoogleDriveFolderButton"/);
  assert.match(app, /new GoogleDriveAuth/);
  assert.match(app, /activateCloud\("googleDrive"\)/);
});

test("Google Pickerでフォルダだけを選択する", async () => {
  let callback;
  let initialParent;
  class DocsView {
    setParent(value) { initialParent = value; return this; }
    setIncludeFolders() { return this; }
    setSelectFolderEnabled() { return this; }
    setMimeTypes() { return this; }
  }
  class PickerBuilder {
    addView() { return this; }
    setOAuthToken() { return this; }
    setDeveloperKey() { return this; }
    setAppId() { return this; }
    setLocale() { return this; }
    setTitle() { return this; }
    setSize() { return this; }
    setOrigin() { return this; }
    setCallback(value) { callback = value; return this; }
    build() { return { setVisible() { callback({ action: "picked", docs: [{ id: "folder-1", name: "novels", mimeType: "application/vnd.google-apps.folder" }] }); } }; }
  }
  const pickerApi = {
    DocsView,
    PickerBuilder,
    ViewId: { FOLDERS: "folders" },
    Action: { PICKED: "picked", CANCEL: "cancel" },
  };
  const picker = new GoogleDrivePicker({
    apiKey: "api-key",
    appId: "123456",
    pickerApi,
    origin: "https://example.com",
    documentRef: { querySelector: () => null },
    viewport: {},
  });
  assert.deepEqual(await picker.pickFolder("token"), {
    id: "folder-1",
    name: "novels",
    mimeType: "application/vnd.google-apps.folder",
  });
  assert.equal(initialParent, "root");
});

test("Google Pickerを狭い画面では文字を縮小せず画面幅へ合わせる", () => {
  const style = {};
  const contentStyle = {};
  const frameHostStyle = {};
  const frameStyle = {};
  const dialog = {
    style,
    querySelector(selector) {
      if (selector === ".picker-dialog-title") return { offsetHeight: 24 };
      if (selector === "iframe") return { style: frameStyle };
      return null;
    },
    querySelectorAll: () => [{ style: contentStyle }, { style: frameHostStyle }],
  };
  const picker = new GoogleDrivePicker({
    apiKey: "api-key",
    appId: "123456",
    documentRef: { querySelectorAll: () => [{ style: { display: "none" } }, dialog] },
    viewport: { innerWidth: 360, innerHeight: 640 },
  });
  picker.fitToViewport();
  assert.equal(style.left, "180px");
  assert.equal(style.top, "320px");
  assert.equal(style.width, "344px");
  assert.equal(style.height, "640px");
  assert.match(style.transform, /scale\(0\.[0-9]+\)/);
  assert.equal(contentStyle.height, "616px");
  assert.equal(frameHostStyle.height, "616px");
  assert.equal(frameStyle.height, "616px");
});
