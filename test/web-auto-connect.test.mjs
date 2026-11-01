import { createAutoConnectionController } from "../web/lib/cloud-connection.mjs";
import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
function context(kind = "oneDrive", token = "", enabled = true) {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const calls = [];
  const auth = { clientId: "client", getAccessToken: async () => token, signIn: async (options) => calls.push(options) };
  const state = { cloudKind: kind };
  const elements = { autoConnectCheckbox: { checked: enabled }, authBootMessage: {} };
  const sandbox = vm.createContext({ state, elements, AUTO_CONNECT_KEY: "auto", localStorage: storage, sessionStorage: storage,
    workCatalogOwner: () => "owner", cloudAuth: () => auth, cloudLabel: () => kind,
    readJson: (value) => value ? JSON.parse(value) : null, notify: (message) => calls.push(message) });
  Object.assign(sandbox, createAutoConnectionController(Object.fromEntries(Object.entries(sandbox).map(([key, value]) => [key, typeof value === "function" ? (...args) => sandbox[key](...args) : value]))));
  sandbox.saveAutoConnectPreference(enabled, kind);
  return { sandbox, auth, state, elements, values, calls };
}
test("切断中のOneDriveとDropboxはHOMEから自動で認証を開始する", async () => {
  for (const kind of ["oneDrive", "dropbox"]) {
    const ctx = context(kind);
    assert.equal(await ctx.sandbox.reconnectPreviousCloud(), true);
    assert.equal(ctx.calls.length, 1);
    assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false);
    assert.equal(ctx.calls.length, 1);
  }
});
test("チェックOFF・設定なし・接続済みの場合は認証を開始しない", async () => {
  for (const ctx of [context("oneDrive", "", false), context("dropbox", "valid")]) {
    assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false);
    assert.equal(ctx.calls.length, 0);
  }
  const ctx = context();
  ctx.auth.clientId = "";
  assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false);
});
test("Googleの接続情報がない場合は起動時に認証画面を開かず操作を待つ", async () => {
  const ctx = context("googleDrive");
  assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false);
  assert.equal(ctx.calls.length, 0);
  assert.equal(ctx.values.has("auto.owner.attempt"), false);
});
test("自動認証の失敗でも再試行ループにならず手動で続けられる", async () => {
  const ctx = context("oneDrive");
  ctx.auth.signIn = async () => { throw new Error("popup_failed_to_open"); };
  assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false);
  assert.match(ctx.calls[0], /接続ボタンから再接続/);
  assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false);
  assert.equal(ctx.calls.length, 1);
});
test("接続成功時に次回のクラウドを記憶し、利用者別に設定を保存する", () => {
  const ctx = context("oneDrive");
  ctx.state.cloudKind = "dropbox";
  ctx.sandbox.rememberConnectedCloud();
  assert.equal(ctx.sandbox.readAutoConnectPreference().cloudKind, "dropbox");
  ctx.sandbox.workCatalogOwner = () => "other";
  assert.equal(ctx.sandbox.readAutoConnectPreference().enabled, false);
  ctx.values.set("auto.other", "broken json");
  assert.equal(ctx.sandbox.readAutoConnectPreference().enabled, false);
});

test("自動接続の保存領域が使えない場合は通知しチェック状態を保つ", () => {
  const ctx = context(); ctx.sandbox.localStorage.setItem = () => { throw new Error("storage blocked"); };
  ctx.sandbox.saveAutoConnectPreference(false);
  assert.equal(ctx.elements.autoConnectCheckbox.checked, false);
  assert.match(ctx.calls[0], /設定をこのブラウザに保存できません/);
});
test("自動接続の失敗抑止期間が過ぎたら改めて認証できる", async () => {
  const ctx = context(); await ctx.sandbox.reconnectPreviousCloud();
  ctx.values.set("auto.owner.attempt", JSON.stringify({ cloudKind: "oneDrive", startedAt: Date.now() - 11 * 60 * 1000 }));
  assert.equal(await ctx.sandbox.reconnectPreviousCloud(), true); assert.equal(ctx.calls.length, 2);
});

test("Googleの有効な接続は新しい認証を始めず通常の復帰へ進む", async () => {
  const ctx = context("googleDrive", "valid-token");
  assert.equal(await ctx.sandbox.reconnectPreviousCloud(), false); assert.equal(ctx.calls.length, 0);
});
test("Google再接続の起動判定は既存の失敗マーカーにも認証操作を追加しない", async () => {
  const ctx = context("googleDrive"); ctx.values.set("auto.owner.attempt", JSON.stringify({ cloudKind: "googleDrive", startedAt: Date.now() }));
  await ctx.sandbox.reconnectPreviousCloud(); await ctx.sandbox.reconnectPreviousCloud();
  assert.equal(ctx.calls.length, 0); assert.equal(ctx.sandbox.readAutoConnectPreference().enabled, true);
});
