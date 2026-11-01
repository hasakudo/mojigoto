const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("VS Codeの編集WebViewで自動保存状態を表示する", () => {
  const note = read("src/views/note-webview/editor-view.js");
  const concept = read("src/views/concept-memo/concept-memo-html.js");
  const settings = read("src/views/settings-webview.js");

  assert.match(note, /id="autoSaveBadge"[^>]*>自動保存 ON/);
  assert.match(concept, /id="conceptAutoSaveBadge"[^>]*>自動保存 ON/);
  assert.match(settings, /id="settingsAutoSaveBadge"[^>]*>自動保存 ON/);
});

test("ノートと構想メモを未保存確認付きで更新する", () => {
  const noteHost = read("src/views/note-webview.js") + read("src/views/note-webview/host-actions.js");
  const noteClient = read("src/views/note-webview/script-events.js");
  const conceptHost = read("src/views/concept-memo-webview.js") + read("src/views/concept-memo/host-actions.js");
  const conceptClient = require("../src/views/concept-memo/script-editor").getConceptMemoEditorScript();

  assert.match(noteClient, /type: "requestRefreshNote"/);
  assert.match(noteHost, /message\?\.type === "requestRefreshNote"/);
  assert.match(noteHost, /"保存して更新"/);
  assert.match(noteHost, /"変更を破棄して更新"/);
  assert.match(conceptClient, /type: "requestRefreshConceptMemos"/);
  assert.match(conceptHost, /case "requestRefreshConceptMemos"/);
  assert.match(conceptHost, /getWorkSettingsForDirectory/);
});

test("Webの字下げアイコンはspace.svgの最新版を埋め込む", () => {
  const css = read("web/styles.css");
  const svg = read("web/icons/space.svg");
  const match = css.match(
    /\.icon-space \{ --icon: url\("data:image\/svg\+xml;base64,([^\"]+)"\); \}/,
  );

  assert.ok(match, "字下げアイコンの埋め込みが必要です");
  assert.equal(Buffer.from(match[1], "base64").toString("utf8"), svg);
});
