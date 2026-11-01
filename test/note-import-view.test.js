const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { loadViewModule, createImportHarness } = require("./fixtures/note-import-harness.cjs");
const { escapeHtml } = require("../src/core/path-utils");

test("読込の表示部品はVS Code・保存処理なしで生成でき、CSSとスクリプトを一度ずつ含む", () => {
  for (const base of ["note-import", "note-partial-import"]) {
    const view = loadViewModule(`${base}-html`, {
      vscode: new Proxy({}, { get() { throw Error("Display must not access VS Code"); } }),
      "../data/note-store": new Proxy({}, { get() { throw Error("Display must not access storage"); } }),
      "../core/path-utils": { getNonce: () => "test-nonce", escapeHtml },
    });
    const html = (view.getImportHtml || view.getHtml)({ noteType: "reference" });
    assert.equal((html.match(/<style>/g) || []).length, 1);
    assert.equal((html.match(/<script /g) || []).length, 1);
    assert.ok(html.includes("script-src 'nonce-test-nonce'"));
    const script = /<script nonce="test-nonce">([\s\S]*?)<\/script>/.exec(html)[1];
    assert.doesNotThrow(() => new vm.Script(script));
    assert.ok(html.includes("項目メモ"));
  }
});

test("分離した画面へ渡す初期データはタグ・改行・ルビを安全に埋め込み、元の値を保つ", () => {
  const data = { sourceFileName: '</script><script>alert("x")</script>&', noteTitle: "題\u2028続き\u2029末尾",
    noteType: "plot", parsedNote: { groups: [{ title: "<分類>", items: [{ kind: "entry", body: "|人《ひと》\n本文" }] }] } };
  for (const base of ["note-import", "note-partial-import"]) {
    const view = loadViewModule(`${base}-html`);
    const html = (view.getImportHtml || view.getHtml)(data);
    assert.equal((html.match(/<\/script>/g) || []).length, 1);
    const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
    new vm.Script(script);
    const initial = /const initialData = ([\s\S]*?);\n/.exec(script)[1];
    assert.deepEqual(JSON.parse(initial), data);
  }
});

test("読込元の読取失敗は両画面で通知し、前のプレビューと保存内容を変えない", async () => {
  for (const kind of ["full", "partial"]) {
    const h = createImportHarness(kind, { readError: true });
    const panel = await h.open({ sourceFilePath: "/source.md" });
    const before = panel.html;
    await panel.receive({ type: "reloadImportSource", payload: {} });
    assert.equal(panel.html, before);
    assert.equal(panel.disposed, false);
    assert.ok(h.events.some(([type, message]) => type === "error" && message.includes("read failed")));
    assert.equal(h.events.some(([type]) => ["save", "create", "apply"].includes(type)), false);
  }
});

test("受付分離後も通常読込は同一タブを再利用し、選択読込は旧画面を閉じて再作成する", async () => {
  for (const kind of ["full", "partial"]) {
    const h = createImportHarness(kind);
    const options = { sourceFilePath: "/source.md", notePath: "/target.json", noteType: "plot" };
    const first = await h.open(options);
    const count = h.events.length;
    await first.receive({ type: "unknown" });
    assert.equal(h.events.length, count);
    const second = await h.open(options);
    if (kind === "full") assert.equal(second, first);
    else { assert.notEqual(second, first); assert.equal(first.disposed, true); }
    await second.receive({ type: kind === "full" ? "cancelImport" : "cancelPartialImport" });
    assert.equal(second.disposed, true);
    const third = await h.open(options);
    assert.notEqual(third, second);
    assert.equal(third.disposed, false);
  }
});
