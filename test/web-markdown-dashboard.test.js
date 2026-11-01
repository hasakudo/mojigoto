const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createDashboardSettingsHarness: fixture } = require("./fixtures/dashboard-settings-harness.cjs");

test("Dashboardは現在表示した作品だけにON/OFFを保存し、今すぐ更新も同じ作品を使う", async () => {
  const h = fixture(); await h.controller.open();
  const dir = h.current();
  await h.panels[0].receive(h.message());
  assert.deepEqual(h.calls, [[dir, true]]);
  assert.equal(h.posts.at(-1).status.enabled, true);
  await h.panels[0].receive(h.message({ action: "regenerate" }));
  await h.panels[0].receive(h.message({ enabled: false }));
  assert.deepEqual(h.calls, [[dir, true], [dir, "retry"], [dir, false]]);
});
test("作品切替前の画面・古い描画・不正な値から別作品の設定を変更しない", async () => {
  const h = fixture(); await h.controller.open(); const old = h.message();
  h.switchWork();
  await h.panels[0].receive(old);
  assert.equal(h.calls.length, 0);
  await h.controller.refresh();
  for (const msg of [old, h.message({ renderId: "stale" }), h.message({ workKey: "other" }), h.message({ enabled: "true" })]) await h.panels[0].receive(msg);
  assert.equal(h.calls.length, 0);
  assert.equal(h.states.at(-1).webMarkdown.enabled, false);
  await h.panels[0].receive(h.message());
  assert.deepEqual(h.calls, [[h.current(), true]]);
});
test("破棄済みパネルから遅れて届いた生成設定の変更を採用しない", async () => {
  const h = fixture(); await h.controller.open(); const previous = h.panels[0];
  previous.dispose(); await h.controller.open();
  await previous.receive(h.message());
  assert.equal(h.calls.length, 0);
  await h.panels[1].receive(h.message());
  assert.equal(h.calls.length, 1);
});
test("Web用設定は折りたたんで表示し、OFFなら更新ボタンを隠す", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/stats/stats-html/stats-html-dashboard.js"), "utf8");
  const context = vm.createContext({ module: { exports: {} } }); vm.runInContext(source, context);
  const html = vm.runInContext('renderRetentionCard({ webMarkdown: { available: true, enabled: false } }, String)', context);
  assert.match(html, /<details id="webMarkdownDetails"[^>]*>/);
  assert.doesNotMatch(html, /<details id="webMarkdownDetails"[^>]*\bopen\b/);
  assert.match(html, /id="webMarkdownRegenerate"[^>]*hidden/);
});
test("ON/OFF通知で更新ボタンの表示を切り替え、失敗時には設定を開いて案内する", () => {
  const { makeStatsScript } = require("../src/stats/stats-html/stats-html-script");
  const fn = makeStatsScript().match(/    function renderWebMarkdown\([^]*?\n    }/)[0];
  const nodes = { webMarkdownEnabled: { checked: false, dataset: { workKey: "work" } }, webMarkdownRegenerate: {}, webMarkdownDetails: {}, webMarkdownNotice: { setAttribute() {} }, webMarkdownStatus: {} };
  const context = vm.createContext({ markdownPending: false, document: { getElementById: (id) => nodes[id] } });
  vm.runInContext(fn, context);
  context.renderWebMarkdown({ enabled: false }); assert.equal(nodes.webMarkdownRegenerate.hidden, true);
  context.renderWebMarkdown({ enabled: true }); assert.equal(nodes.webMarkdownRegenerate.hidden, false);
  context.renderWebMarkdown({ enabled: false, error: "確認する案内" }); assert.equal(nodes.webMarkdownDetails.open, true); assert.equal(nodes.webMarkdownStatus.textContent, "確認する案内");
});
