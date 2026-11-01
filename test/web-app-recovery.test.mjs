import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { clearAppCache } from "../web/lib/app-recovery.mjs";

test("キャッシュ削除はアプリのシェルと自身のサービスワーカーだけを対象にする", async () => {
  const removed = [];
  const unregistered = [];
  const cacheStorage = {
    keys: async () => ["mojigoto-shell-v167", "mojigoto-shell-v168", "other-app", "user-data"],
    delete: async (key) => { removed.push(key); return true; },
  };
  const registration = (name, scriptURL) => ({
    active: { scriptURL }, unregister: async () => { unregistered.push(name); return true; },
  });
  await clearAppCache(cacheStorage, {
    getRegistrations: async () => [
      registration("app", "https://example.com/writing/sw.js"),
      registration("other", "https://example.com/sw.js"),
    ],
  }, "https://example.com/writing/index.html");
  assert.deepEqual(removed, ["mojigoto-shell-v167", "mojigoto-shell-v168"]);
  assert.deepEqual(unregistered, ["app"]);
});

test("サービスワーカー非対応でもキャッシュ削除でき、削除失敗は呼出元に返す", async () => {
  await clearAppCache({ keys: async () => [], delete: async () => true }, undefined, "https://example.com/");
  await assert.rejects(clearAppCache(undefined), /通常の再読み込み/);
  await assert.rejects(clearAppCache({
    keys: async () => ["mojigoto-shell-v168"], delete: async () => { throw new Error("blocked"); },
  }), /blocked/);
});

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const start = app.indexOf("async function reloadApp(");
const end = /\r?\n}\r?\n/.exec(app.slice(start));
const reloadSource = app.slice(start, start + end.index + end[0].length);
function harness(options = {}) {
  const calls = { reload: 0, clear: 0, confirm: 0, cancel: 0, notices: [] };
  const context = {
    appReloadPending: false,
    state: { dirty: false, saving: false, ...options.state },
    navigator: { onLine: options.online ?? true },
    document: { baseURI: "https://example.com/" },
    elements: { reloadAppButton: {}, clearAppCacheButton: {} },
    window: {
      confirm: () => { calls.confirm++; return options.confirm ?? true; },
      location: { reload: () => { calls.reload++; } },
    },
    clearAppCache: async () => { calls.clear++; if (options.error) throw options.error; },
    setBusy: (button, busy) => { button.disabled = busy; },
    cancelAutoSave: () => { calls.cancel++; },
    notify: (message) => calls.notices.push(message),
  };
  vm.createContext(context);
  vm.runInContext(reloadSource, context);
  return { context, calls };
}

test("通常の再読み込みはキャッシュ削除せず、未保存の破棄確認は一度だけ", async () => {
  const { context, calls } = harness({ state: { dirty: true } });
  await context.reloadApp();
  assert.equal(calls.confirm, 1);
  assert.equal(calls.reload, 1);
  assert.equal(calls.clear, 0);
  assert.equal(calls.cancel, 1);
  assert.equal(context.state.dirty, false);
});

test("未保存の確認をキャンセルした場合と保存中は再読み込みも削除も行わない", async () => {
  for (const options of [{ state: { dirty: true }, confirm: false }, { state: { saving: true } }]) {
    const { context, calls } = harness(options);
    await context.reloadApp(true);
    assert.equal(calls.reload, 0);
    assert.equal(calls.clear, 0);
    assert.equal(calls.cancel, 0);
  }
});

test("オフラインではキャッシュを残し、削除失敗時も編集を保持して再試行できる", async () => {
  const offline = harness({ online: false });
  await offline.context.reloadApp(true);
  assert.equal(offline.calls.clear, 0);
  assert.equal(offline.calls.reload, 0);
  const failed = harness({ state: { dirty: true }, error: new Error("cache failure") });
  await failed.context.reloadApp(true);
  assert.equal(failed.calls.reload, 0);
  assert.equal(failed.context.state.dirty, true);
  assert.equal(failed.context.appReloadPending, false);
  assert.equal(failed.context.elements.reloadAppButton.disabled, false);
  assert.equal(failed.context.elements.clearAppCacheButton.disabled, false);
});

test("キャッシュ削除完了後に一度だけ再読み込みする", async () => {
  const { context, calls } = harness();
  await context.reloadApp(true);
  await context.reloadApp(true);
  assert.equal(calls.clear, 1);
  assert.equal(calls.reload, 1);
});

test("設定・復旧ガイドとサービスワーカーに必要な画面とモジュールを含める", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const sw = await readFile(new URL("../web/sw.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  assert.match(html, /id="reloadAppButton"[^>]*type="button"/);
  assert.match(html, /id="clearAppCacheButton"[^>]*type="button"/);
  assert.match(html, /読み込みが終わらない・更新が見えない/);
  assert.match(html, /本文をコピーして控え/);
  assert.match(html, /作品データ・ログイン情報・履歴・設定は残ります/);
  assert.match(sw, /"\.\/lib\/app-recovery\.mjs"/);
  assert.match(css, /\.app-recovery-panel button \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
});
