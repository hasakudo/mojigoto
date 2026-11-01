import assert from "node:assert/strict";
import test from "node:test";
import {
  isManagedDeployment,
  loadRuntimeConfig,
  normalizeRuntimeConfig,
  resolveGoogleClientId,
  resolveMicrosoftClientId,
} from "../web/lib/runtime-config.mjs";

test("審査用メールログインは明示設定時だけ有効なプロバイダーとして保持する", () => {
  assert.deepEqual(normalizeRuntimeConfig({}).loginProviders, ["microsoft", "google"]);
  assert.deepEqual(normalizeRuntimeConfig({ loginProviders: ["email", "email", "unknown"] }).loginProviders, ["email"]);
});

test("管理者設定のMicrosoftアプリIDを端末設定より優先する", () => {
  const storage = { getItem: () => "local-client-id" };
  const config = normalizeRuntimeConfig({ deploymentMode: "managed", microsoftClientId: "admin-client-id" });
  assert.equal(resolveMicrosoftClientId(config, storage), "admin-client-id");
  assert.equal(isManagedDeployment(config), true);
});

test("Google Drive用クライアントIDは公開設定からだけ取得する", () => {
  assert.equal(resolveGoogleClientId({ googleClientId: "google-client-id" }), "google-client-id");
  assert.equal(resolveGoogleClientId({}), "");
});

test("Google Picker用の公開設定を正規化する", () => {
  const config = normalizeRuntimeConfig({ googleApiKey: " key ", googleAppId: " 123456 " });
  assert.equal(config.googleApiKey, "key");
  assert.equal(config.googleAppId, "123456");
});

test("管理モードでは端末保存のアプリIDへフォールバックしない", () => {
  const storage = { getItem: () => "local-client-id" };
  assert.equal(resolveMicrosoftClientId({ deploymentMode: "managed", microsoftClientId: "" }, storage), "");
});

test("個人モードは従来の端末保存アプリIDを利用できる", () => {
  const storage = { getItem: () => "local-client-id" };
  assert.equal(resolveMicrosoftClientId({ deploymentMode: "personal", microsoftClientId: "" }, storage), "local-client-id");
});

test("公開設定をキャッシュせず読み込む", async () => {
  let receivedOptions;
  const config = await loadRuntimeConfig(async (_url, options) => {
    receivedOptions = options;
    return { ok: true, async json() { return { deploymentMode: "managed", loginRequired: true }; } };
  });
  assert.equal(config.loginRequired, true);
  assert.equal(receivedOptions.cache, "no-store");
});
