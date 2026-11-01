import { createConnectionInitializer } from "../web/lib/cloud-connection.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { isRecentViewEntry } from "../web/lib/recent-views.mjs";

const app = fs.readFileSync(new URL("../web/app.mjs", import.meta.url), "utf8");

function context({ token = "token", redirect = false, root = null, pending = null, microsoftToken = "", cloudKind = "dropbox", googleToken = "" } = {}) {
  const calls = [];
  const auth = { clientId: "key", getAccessToken: async () => token, completeRedirect: async () => {
    calls.push("dropboxRedirect"); return redirect;
  } };
  const state = { cloudKind: redirect ? "oneDrive" : cloudKind, dropboxAuth: auth,
    googleDriveAuth: { getAccessToken: async () => googleToken }, microsoftAuth: {
      completeRedirect: async () => { calls.push("microsoftRedirect"); return false; }, getAccessToken: async () => microsoftToken,
    }, provider: { getRoot: async () => { calls.push("root"); return { id: "dropbox:root", name: "Dropbox", folder: {} }; } }, workRoot: root };
  const elements = { connectionDescription: {}, connectButton: {}, autoConnectCheckbox: {} };
  const sandbox = vm.createContext({ state, elements, isRecentViewEntry,
    readAutoConnectPreference: () => ({ enabled: false }), reconnectPreviousCloud: async () => false,
    loadRuntimeConfig: async () => ({}), initializeUserAccess: async () => true,
    measureConnectionStep: (_label, operation) => operation(), finishAuthBoot() {},
    startUserAccessMonitor: () => {}, configureAuth: () => ({ microsoftClientId: "microsoft", googleClientId: "google" }),
    renderRecentViews: () => {}, readJson: (value) => value ? JSON.parse(value) : null,
    PENDING_RECENT_VIEW_KEY: "pending", sessionStorage: { getItem: () => pending ? JSON.stringify(pending) : null, removeItem: () => {} },
    workCatalogOwner: () => "owner", restoreRecentView: async (entry) => calls.push(`restore:${entry.cloudKind}`),
    activateCloud: (kind) => { state.cloudKind = kind; calls.push(`activate:${kind}`); },
    renderConnectedCloud: () => calls.push("connected"), showFolder: async (folder) => calls.push(`browse:${folder.id}`),
    loadWorks: async (folder) => calls.push(`works:${folder.id}`), finishViewRestoreLoading: () => calls.push("finished"),
    notify: (message) => { throw new Error(message); },
  });
  const authStart = app.indexOf("function cloudAuth(");
  vm.runInContext(app.slice(authStart, app.indexOf("function beginPerformanceMeasurement(", authStart)), sandbox);
  Object.assign(sandbox, createConnectionInitializer(Object.fromEntries(Object.entries(sandbox).map(([key, value]) => [key, typeof value === "function" ? (...args) => sandbox[key](...args) : value]))));
  return { sandbox, calls, elements, state };
}

test("Dropbox認可から戻った時はMicrosoft応答処理を経由せずフォルダ一覧を開く", async () => {
  const ctx = context({ redirect: true });
  await ctx.sandbox.initializeConnection();
  assert.deepEqual(ctx.calls, ["dropboxRedirect", "activate:dropbox", "connected", "root", "browse:dropbox:root", "finished"]);
});

test("Dropbox再読み込みは保存済み作品ルートを使う", async () => {
  const ctx = context({ root: { id: "id:work" } });
  await ctx.sandbox.initializeConnection();
  assert.ok(ctx.calls.includes("works:id:work"));
  assert.equal(ctx.calls.includes("root"), false);
  assert.equal(ctx.calls.some((call) => call.startsWith("browse:")), false);
});

test("Dropbox期限切れ時に別のクラウドへ自動切替しない", async () => {
  const ctx = context({ token: "", microsoftToken: "microsoft-token" });
  await ctx.sandbox.initializeConnection();
  assert.equal(ctx.state.cloudKind, "dropbox");
  assert.match(ctx.elements.connectionDescription.textContent, /Dropboxへ接続/);
  assert.equal(ctx.calls.includes("activate:oneDrive"), false);
});

test("Dropbox再認可の後は同じ利用者の保留中の履歴へ戻る", async () => {
  const entry = { cloudKind: "dropbox", root: { id: "id:root" }, route: { kind: "manuscript-file",
    workId: "work", work: { id: "work" }, item: { id: "id:file" } } };
  const ctx = context({ redirect: true, pending: { owner: "owner", entry } });
  await ctx.sandbox.initializeConnection();
  assert.ok(ctx.calls.includes("restore:dropbox"));
  assert.equal(ctx.calls.some((call) => call.startsWith("browse:")), false);
  const other = context({ redirect: true, pending: { owner: "other", entry } });
  await other.sandbox.initializeConnection();
  assert.equal(other.calls.includes("restore:dropbox"), false);
});

for (const kind of ["oneDrive", "googleDrive"]) {
  test(`${kind}は登録済み作品へ直接戻り、別クラウドのトークンとルートを取得しない`, async () => {
    const ctx = context({ cloudKind: kind, root: { id: "work-root" }, microsoftToken: "ms", googleToken: "google" });
    ctx.state.provider.getRoot = async () => { throw new Error("不要なルート取得"); };
    const inactive = kind === "oneDrive" ? ctx.state.googleDriveAuth : ctx.state.microsoftAuth;
    inactive.getAccessToken = async () => { throw new Error("未選択クラウドのトークン取得"); };
    await ctx.sandbox.initializeConnection();
    assert.ok(ctx.calls.includes("works:work-root"));
  });
}

for (const phase of ["token", "root"]) {
  test(`接続の${phase}待ち中にクラウドを変えたら古い接続先を表示しない`, async () => {
    let resolve, entered;
    const started = new Promise(yes => { entered = yes; });
    const gate = new Promise(yes => { resolve = yes; });
    const ctx = context({ cloudKind: "dropbox" });
    if (phase === "token") ctx.state.dropboxAuth.getAccessToken = () => { entered(); return gate; };
    else ctx.state.provider.getRoot = () => { entered(); return gate; };
    const loading = ctx.sandbox.initializeConnection();
    await started;
    ctx.state.cloudKind = "googleDrive";
    ctx.state.provider = {};
    resolve(phase === "token" ? "old-token" : { id: "old-root" });
    await loading;
    assert.equal(ctx.calls.some(call => call.startsWith("browse:") || call.startsWith("works:")), false);
    assert.equal(ctx.calls.includes("finished"), false);
  });
}

test("履歴復元による正当なプロバイダー変更後の失敗では起動表示を解除して案内する",async()=>{
  const entry={cloudKind:"dropbox",root:{id:"root"},route:{kind:"manuscript-file",workId:"work",work:{id:"work"},item:{id:"file"}}};
  const ctx=context({pending:{owner:"owner",entry}});
  ctx.sandbox.restoreRecentView=async()=>{ctx.state.provider={};throw new Error("復元失敗");};
  ctx.sandbox.notify=message=>ctx.calls.push(message);
  await ctx.sandbox.initializeConnection();
  assert.ok(ctx.calls.includes("finished"));assert.ok(ctx.calls.includes("復元失敗"));
});

test("利用者認証が未完了ならクラウド認証や作品取得へ進まない", async () => {
  const ctx = context(); ctx.sandbox.initializeUserAccess = async () => false;
  await ctx.sandbox.initializeConnection(); assert.deepEqual(ctx.calls, []);
});
test("トークン待ち中に利用者が変わった場合も古い作品を開かない", async () => {
  const ctx = context(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  ctx.state.dropboxAuth.getAccessToken = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const loading = ctx.sandbox.initializeConnection(); await started;
  ctx.sandbox.workCatalogOwner = () => "other-owner"; release("old-token"); await loading;
  assert.equal(ctx.calls.some(call => call.startsWith("works:") || call.startsWith("browse:")), false);
  assert.equal(ctx.calls.includes("finished"), false);
});
test("未接続Google Driveから別クラウドへ勝手に切り替えない", async () => {
  const ctx = context({ cloudKind: "googleDrive", googleToken: "", microsoftToken: "available" });
  await ctx.sandbox.initializeConnection(); assert.equal(ctx.state.cloudKind, "googleDrive");
  assert.match(ctx.elements.connectionDescription.textContent, /Google Driveへの接続が必要/);
  assert.equal(ctx.calls.includes("activate:oneDrive"), false);
});

test("再ログイン相当でGoogle接続情報がない場合は前回クラウドと再接続ボタンを明示する", async () => {
  const ctx = context({ cloudKind: "googleDrive", googleToken: "" });
  ctx.sandbox.readAutoConnectPreference = () => ({ enabled: true, cloudKind: "googleDrive" });
  ctx.elements.connectGoogleDriveButton = {};
  await ctx.sandbox.initializeConnection();
  assert.equal(ctx.elements.autoConnectCheckbox.checked, true);
  assert.equal(ctx.elements.connectGoogleDriveButton.textContent, "Google Driveに再接続");
  assert.equal(ctx.elements.connectGoogleDriveButton.disabled, false);
  assert.match(ctx.elements.connectionDescription.textContent, /前回の接続先はGoogle Drive/);
  assert.equal(ctx.calls.some(call => call.startsWith("works:") || call.startsWith("browse:")), false);
});
test("再ログイン後でも有効なGoogle接続情報があれば保存済みルートを自動で開く", async () => {
  const ctx = context({ cloudKind: "googleDrive", googleToken: "valid", root: { id: "saved-root" } });
  ctx.sandbox.readAutoConnectPreference = () => ({ enabled: true, cloudKind: "googleDrive" });
  await ctx.sandbox.initializeConnection(); assert.ok(ctx.calls.includes("works:saved-root"));
});
