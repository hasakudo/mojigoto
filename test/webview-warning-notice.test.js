const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { getWebviewNoticeScript, getWebviewNoticeCss } = require("../src/views/shared/webview-notice");
const { getConceptMemoStateScript } = require("../src/views/concept-memo/script-state");
const { getCopyPanelScript } = require("../src/views/note-webview/script-copy-panel");

function element() {
  const classes = new Set();
  const listeners = new Map();
  return { children: [], textContent: "", hidden: false, attributes: {},
    ownerDocument: { createElement: () => element() },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { listeners.set(name, callback); },
    click() { listeners.get("click")?.(); },
    classList: {
      add: (...values) => values.forEach((value) => classes.add(value)),
      remove: (...values) => values.forEach((value) => classes.delete(value)),
      contains: (value) => classes.has(value),
      toggle: (value, on) => on ? classes.add(value) : classes.delete(value),
    },
  };
}
function harness() {
  const root = element();
  const timers = new Map();
  let next = 0;
  const context = vm.createContext({
    root, document: { getElementById: () => root },
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(getWebviewNoticeScript(), context);
  const notice = context.createWebviewNotice(root);
  return { root, context, timers, notice, text: root.children[0], close: root.children[1] };
}

test("警告は指定時間を超えても自動消去の対象にならず、閉じる操作で消える", () => {
  const h = harness();
  h.notice.show("保存競合：下書きを退避してください", { isError: true, duration: 12000 });
  assert.equal(h.timers.size, 0);
  assert.equal(h.close.hidden, false);
  assert.equal(h.root.attributes.role, "alert");
  assert.equal(h.root.attributes["aria-live"], "assertive");
  h.close.click();
  assert.equal(h.root.classList.contains("isVisible"), false);
  assert.equal(h.text.textContent, "");
  assert.equal(h.close.hidden, true);
});

test("後続の成功・進行状況・消去要求で警告を上書きしない", () => {
  const h = harness();
  h.notice.show("通信エラー", { isError: true });
  h.notice.show("保存しました");
  h.notice.show("実行中…", { persist: true });
  h.notice.show("");
  h.notice.clear();
  assert.equal(h.text.textContent, "通信エラー");
  assert.equal(h.close.hidden, false);
});

test("先の成功通知のタイマーが警告を消さない", () => {
  const h = harness();
  h.notice.show("成功");
  const old = [...h.timers.values()][0].callback;
  h.notice.show("警告", { isWarning: true });
  assert.equal(h.timers.size, 0);
  old();
  assert.equal(h.text.textContent, "警告");
  assert.equal(h.root.classList.contains("isVisible"), true);
});

test("新しい警告は表示を更新し、閉じた後の成功通知は通常の時間で消える", () => {
  const h = harness();
  h.notice.show("最初のエラー", { isError: true });
  h.notice.show("次のエラー", { isError: true });
  assert.equal(h.text.textContent, "次のエラー");
  h.close.click();
  h.notice.show("保存しました");
  assert.equal(h.close.hidden, true);
  assert.equal(h.root.attributes.role, "status");
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 1800);
  timer.callback();
  assert.equal(h.root.classList.contains("isVisible"), false);
});

test("通知内のファイル名やエラー文字列をHTMLとして解釈しない", () => {
  const h = harness();
  const message = '<img src=x onerror="alert(1)">';
  h.notice.show(message, { isError: true });
  assert.equal(h.text.textContent, message);
  assert.equal(h.root.children.length, 2);
  assert.equal(h.close.type, "button");
});

test("通常の進行状況は指定した継続表示を維持し、警告の閉じるボタンは出さない", () => {
  const h = harness();
  h.notice.show("セットアップを実行中…", { persist: true });
  assert.equal(h.timers.size, 0);
  assert.equal(h.close.hidden, true);
  h.notice.clear();
  assert.equal(h.text.textContent, "");
});

const cases = [
  ["構想メモ", null, "conceptNotice", "showToast", (ctx) => ctx.showToast("警告", { isError: true }), (ctx) => ctx.showToast("成功")],
  ["作品設定", "settings-webview.js", "settingsNotice", "setStatus", (ctx) => ctx.setStatus("警告", false, true), (ctx) => ctx.setStatus("成功")],
  ["ノートコピー", "note-copy-webview.js", "copyNotice", "setStatus", (ctx) => ctx.setStatus("警告", true, true), (ctx) => ctx.setStatus("成功", true)],
  ["セットアップ", "setup-webview.js", "setupNotice", "setStatus", (ctx) => ctx.setStatus("警告", true), (ctx) => ctx.setStatus("成功")],
];
for (const [label, file, controller, name, warn, success] of cases) {
  test(`${label}の実際の通知関数も警告を保持し、閉じる操作で消せる`, () => {
    const h = harness();
    const source = file ? fs.readFileSync(path.join(__dirname, "../src/views", file), "utf8") : getConceptMemoStateScript();
    const start = source.indexOf(`    function ${name}(`);
    const end = /\r?\n    }\r?\n/.exec(source.slice(start));
    h.context[controller] = h.notice;
    vm.runInContext(source.slice(start, start + end.index + end[0].length), h.context);
    warn(h.context);
    success(h.context);
    assert.equal(h.text.textContent, "警告");
    assert.equal(h.timers.size, 0);
    h.close.click();
    assert.equal(h.text.textContent, "");
    success(h.context);
    assert.equal(h.text.textContent, "成功");
  });
}

for (const [file, name, args] of [
  ["note-copy-webview.js", "getNoteCopyWebviewHtml", [{ title: "確認", type: "plot", groups: [] }]],
  ["setup-webview.js", "getSetupWebviewHtml", [{}, {}]],
]) {
  test(`${file}で共通通知を含む生成スクリプトを構文解析できる`, () => {
    const source = fs.readFileSync(path.join(__dirname, "../src/views", file), "utf8");
    const start = source.indexOf(`function ${name}(`);
    const end = /\r?\n}\r?\n/.exec(source.slice(start));
    const context = vm.createContext({
      getWebviewNoticeScript, getWebviewNoticeCss, getCopyPanelScript,
      getNonce: () => "test-nonce", escapeHtml: (value) => String(value || ""),
      escapeScriptJson: (value) => JSON.stringify(value), getCopyPanelTitle: (note) => note.title,
      css: fs.readFileSync(path.join(__dirname, "../src/views/note-webview/note-copy-webview.css"), "utf8"),
    });
    vm.runInContext(source.slice(start, start + end.index + end[0].length), context);
    const html = context[name](...args);
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0);
    for (const [, script] of scripts) assert.doesNotThrow(() => new vm.Script(script));
  });
}
