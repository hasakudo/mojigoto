const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

test("VS CodeはSheets連携v2を一括送信し旧版へフォールバックする", () => {
  const service = read("src/stats/stats-service.js");
  assert.match(service, /createEventsBatchPayload/);
  assert.match(service, /chunkSheetsEvents\(pending\)/);
  assert.match(service, /v1 Apps Script は一括形式を知らないため/);
  assert.match(service, /createEventPayload\(secret/);
  assert.match(service, /createPingPayload\(secret\)/);
});

test("Apps Script v2は同時書き込みと日時ログの重複を防ぐ", () => {
  const script = read("integrations/google-sheets/m_progress_v2.gs");
  assert.match(script, /MOJIGOTO_PROTOCOL_VERSION = 2/);
  assert.match(script, /@OnlyCurrentDoc/);
  assert.match(script, /LockService\.getScriptLock\(\)/);
  assert.match(script, /type === "mojigoto_events_batch"/);
  assert.match(script, /findEventRowById_/);
  assert.match(script, /"イベントID"/);
  assert.match(script, /getRange\(sh\.getLastRow\(\) \+ 1, 1, rows\.length, 11\)\.setValues\(rows\)/);
});

test("Sheetsのガイドは配布ZIP内の名前で導入・更新を案内する", () => {
  const vscodeIgnore = read(".vscodeignore");
  const guide = read("src/guide/guide-sections.js");
  assert.doesNotMatch(vscodeIgnore, /^integrations\//m);
  assert.match(guide, /https:\/\/mojigoto\.com\/download\//);
  assert.match(guide, /m_progress\.gs/);
  assert.doesNotMatch(guide, /m_progress_v2\.gs/);
  const packager = read("scripts/package-google-sheets.ps1");
  assert.match(packager, /Copy-Item[^\n]+m_progress_v2\.gs[^\n]+m_progress\.gs/);
  assert.match(guide, /Google Sheets連携を確認/);
});

test("配布READMEは利用者向け情報だけを案内する", () => {
  const readme = read("integrations/google-sheets/README.md");
  const adminGuide = read("docs/google-sheets-v2-howto.md");
  assert.match(readme, /^# Google Sheets 連携$/m);
  assert.match(readme, /## 新規導入/);
  assert.match(readme, /## セキュリティ/);
  assert.doesNotMatch(readme, /公開時期と位置付け|リポジトリでは|旧版の1件送信/);
  assert.match(adminGuide, /## 管理者向け配布方針/);
  assert.match(adminGuide, /Googleの未確認アプリ警告: 表示されず/);
});
