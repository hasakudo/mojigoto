import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const options = require("../src/import/note-memo-options");
const parser = require("../src/import/note-markdown-import");
const { loadViewModule } = require("./fixtures/note-import-harness.cjs");
function clientFunction(script, name) {
  const start = script.indexOf(`    function ${name}(`);
  const end = /\n    }\r?\n/.exec(script.slice(start));
  return script.slice(start, start + end.index + end[0].length);
}
function htmlScript(kind, data = {}) {
  const base = kind === "full" ? "note-import" : "note-partial-import";
  const view = loadViewModule(base + "-html", { "../core/path-utils": { getNonce: () => "test", escapeHtml: require("../src/core/path-utils").escapeHtml } });
  const html = view[kind === "full" ? "getImportHtml" : "getHtml"](data);
  const script = html.match(/<script nonce="test">([\s\S]*?)<\/script>/)[1];
  new vm.Script(script);
  return { script, html };
}
const memo = { type: "list", body: "メモ\n二行目", tags: ["資料"], linkedConceptMemoIds: ["source-link"], autoSyncToConceptMemoOverride: true };

test("新規・挿入用のメモON/OFFは入力を変えず、リンクと自動反映を取り込まない", () => {
  const groups = [{ items: [{ kind: "entry", body: "本文", memo }, { kind: "divider", memo }] }];
  const before = JSON.stringify(groups);
  for (const include of [true, false]) {
    const prepared = options.prepareImportedGroups(groups, include);
    assert.equal(prepared[0].items[0].body, "本文");
    assert.equal(Boolean(prepared[0].items[0].memo), include);
    if (include) {
      assert.deepEqual(prepared[0].items[0].memo.linkedConceptMemoIds, []);
      assert.equal(prepared[0].items[0].memo.autoSyncToConceptMemoOverride, false);
      assert.deepEqual(prepared[0].items[0].memo.tags, ["資料"]);
    }
    assert.equal(prepared[0].items[1].memo, undefined);
  }
  assert.equal(JSON.stringify(groups), before);
});

test("メモ上書きは既存のリンク・反映設定を保持し、元メモがない場合も安全な初期値を使う", () => {
  const target = { ...memo, linkedConceptMemoIds: ["target"], autoSyncToConceptMemoOverride: false, custom: "keep", conceptMemoSyncFingerprint: "baseline" };
  const before = JSON.stringify(target);
  const result = options.mergeImportedItemMemo(target, { ...memo, body: "変更", tags: ["変更タグ"] });
  assert.equal(result.body, "変更");
  assert.deepEqual(result.linkedConceptMemoIds, ["target"]);
  assert.equal(result.conceptMemoSyncFingerprint, "baseline");
  assert.equal(result.autoSyncToConceptMemoOverride, false);
  assert.equal(result.custom, "keep");
  assert.equal(JSON.stringify(target), before);
  assert.equal(options.mergeImportedItemMemo(target, undefined), target);
  assert.equal(options.mergeImportedItemMemo(undefined, memo).autoSyncToConceptMemoOverride, false);
});

test("比較後に外部変更された詳細・メモの上書きを止め、保持対象メモの変更は妨げない", () => {
  const expected = { body: "比較時の本文", memo: { body: "比較時のメモ", tags: ["元"] } };
  assert.throws(() => options.assertImportTargetUnchanged({ ...expected, body: "外部の変更" }, expected), /再読み込み/);
  const changedMemo = { body: expected.body, memo: { body: "外部のメモ" } };
  assert.throws(() => options.assertImportTargetUnchanged(changedMemo, expected, true), /再読み込み/);
  assert.doesNotThrow(() => options.assertImportTargetUnchanged(changedMemo, expected, false));
  assert.doesNotThrow(() => options.assertImportTargetUnchanged({ ...expected, memo: { ...expected.memo, updatedAt: "new", linkedConceptMemoIds: ["new-link"] } }, expected, true));
});

test("全体プレビューはメモON/OFFを表示し、作成・置換・再読込へ選択を渡す", () => {
  const parsed = parser.parseMarkdownImport("# 分類\n### 項目\n本文\n" + parser.formatItemMemoMarkdown(memo));
  const { script } = htmlScript("full", { parsedNote: parsed.parsedNote, previewData: parsed.previewData, mode: "note_import" });
  const elements = Object.fromEntries(["createBtn", "replaceBtn", "cancelBtn"].map((id) => [id, { addEventListener(_name, fn) { this.click = fn; } }]));
  const messages = [];
  const ctx = vm.createContext({ initialData: { mode: "note_import" }, document: { getElementById: (id) => elements[id] },
    btnActions: {}, titleInput: { value: "新ノート" }, includeItemMemos: { checked: false }, memoImportSummary: {}, previewRoot: {},
    previewGroups: parsed.previewData.preview.groups, expandedEntryIds: new Set(), renderInlineBadges: () => "", esc: String, syncPreviewHeight() {},
    vscode: { postMessage: (message) => messages.push(message) } });
  vm.runInContext(["renderFooterActions", "postReloadImportSource", "renderPreview"].map((name) => clientFunction(script, name)).join("\n"), ctx);
  ctx.renderPreview();
  assert.match(ctx.previewRoot.innerHTML, /対象外/);
  assert.match(ctx.memoImportSummary.textContent, /取り込みません/);
  ctx.renderFooterActions();
  elements.createBtn.click(); elements.replaceBtn.click(); ctx.postReloadImportSource();
  assert.deepEqual(messages.map((message) => message.payload.includeItemMemos), [false, false, false]);
  ctx.includeItemMemos.checked = true;
  ctx.renderPreview();
  assert.match(ctx.memoImportSummary.textContent, /取り込みます/);
});

test("選択インポートの実行メッセージに挿入メモOFFと明示したメモ上書きを渡す", () => {
  const { script } = htmlScript("partial");
  const messages = [];
  const ctx = vm.createContext({ isInsertMode: () => true, includeItemMemos: false, replaceItemMemo: true,
    clearResultNotice() {},
    getSelectedSource: () => ({ sourceType: "entry", sourceItemId: "s", memo, body: "本文" }),
    getSelectedTarget: () => ({ groupId: "g", itemId: "i" }), targetGroupSelect: { value: "g" }, targetPositionSelect: { value: "0" },
    vscode: { postMessage: (message) => messages.push(message) } });
  vm.runInContext(clientFunction(script, "postApplyMessage"), ctx);
  ctx.postApplyMessage(true);
  assert.equal(messages[0].payload.includeItemMemos, false);
  ctx.isInsertMode = () => false;
  ctx.postApplyMessage(false);
  assert.equal(messages[1].payload.replaceItemMemo, true);
  assert.equal(messages[1].payload.source.memo.body, memo.body);
  ctx.getSelectedSource = () => ({ body: "メモなし" });
  ctx.postApplyMessage(true);
  assert.equal(messages[2].payload.replaceItemMemo, false);
});

test("部分インポートは確認ダイアログなしで連続反映し、メモの選択を毎回適用する", async () => {
  const { createImportHarness } = require("./fixtures/note-import-harness.cjs");
  const h = createImportHarness("partial");
  const panel = await h.open({ onApply: h.apply });
  for (const include of [true, false, true]) {
    await panel.receive({ type: "applyPartialInsertItem", payload: { keepOpen: true, includeItemMemos: include, source: { sourceType: "group", items: [{ kind: "entry", memo }] } } });
    const inserted = h.events.filter(([type]) => type === "apply").at(-1)[1];
    assert.equal(inserted.operation, "insert_entry");
    assert.equal(Boolean(inserted.source.items[0].memo), include);
    await panel.receive({ type: "applyPartialReplaceImport", payload: { keepOpen: true, replaceItemMemo: include, source: { memo } } });
    const replaced = h.events.filter(([type]) => type === "apply").at(-1)[1];
    assert.equal(replaced.operation, "replace_entry_body");
    assert.equal(replaced.replaceItemMemo, include);
  }
  assert.equal(h.events.filter(([type]) => type === "apply").length, 6);
  assert.equal(h.events.some(([type]) => ["warning", "information", "error"].includes(type)), false);
  assert.equal(panel.disposed, false);
  await panel.receive({ type: "cancelPartialImport" });
  assert.equal(panel.disposed, true);
  assert.equal(h.events.filter(([type]) => type === "apply").length, 6);
});

test("操作の説明はメモ選択・挿入種別に追従し、メモなし上書きでは既存メモの保持を示す", () => {
  const { script, html } = htmlScript("partial");
  assert.match(html, /class="memoImportSummary" id="memoImportSummary" role="status"/);
  const elements = Object.fromEntries(["insertMemoOptions", "replaceMemoOptions", "memoImportSummary"].map((id) => [id, {}]));
  let source = { sourceType: "group", items: [{ kind: "entry", memo }] };
  let insert = true;
  const ctx = vm.createContext({ document: { getElementById: (id) => elements[id] }, getSelectedSource: () => source,
    isInsertMode: () => insert, includeItemMemos: true, replaceItemMemo: false,
    includeItemMemosInput: {}, replaceBodyOnlyInput: {}, replaceBodyAndMemoInput: {} });
  vm.runInContext(clientFunction(script, "renderMemoOptions"), ctx);
  ctx.renderMemoOptions();
  assert.match(elements.memoImportSummary.textContent, /大分類.*一緒に挿入/);
  ctx.includeItemMemos = false; ctx.renderMemoOptions();
  assert.match(elements.memoImportSummary.textContent, /項目メモ 1件.*挿入しません/);
  source = { sourceType: "divider" }; ctx.renderMemoOptions();
  assert.match(elements.memoImportSummary.textContent, /区分.*項目メモはありません/);
  insert = false; source = { memo }; ctx.replaceItemMemo = true; ctx.renderMemoOptions();
  assert.match(elements.memoImportSummary.textContent, /詳細本文と項目メモ.*上書き/);
  source = {}; ctx.renderMemoOptions();
  assert.equal(ctx.replaceItemMemo, false);
  assert.match(elements.memoImportSummary.textContent, /詳細本文だけ.*既存の項目メモは保持/);
});


test("選択インポートの高さはヘッダーとフッターの実寸に追従し、カード全体を下部ボタンの上に収める", () => {
  const { script, html } = htmlScript("partial");
  const properties = {};
  const footer = { top: 740, height: 60 };
  let sourceTop = 330, previewTop = 300;
  const source = { style: {}, getBoundingClientRect: () => ({ top: sourceTop }) };
  const preview = { style: {}, getBoundingClientRect: () => ({ top: previewTop }) };
  const target = { style: {}, getBoundingClientRect: () => ({ top: previewTop + Number.parseFloat(preview.style.maxHeight) + 70 }) };
  const elements = { sourceList: source, previewBody: preview, targetList: { style: {} } };
  const ctx = vm.createContext({ window: { innerWidth: 1200 }, warningCardEl: { hidden: true }, isInsertMode: () => true,
    insertTargetPanel: target, replaceTargetPanel: target, document: {
      querySelector: (selector) => selector === ".footer" ? { getBoundingClientRect: () => footer } : { style: { setProperty: (key, value) => { properties[key] = value; } } },
      getElementById: (id) => elements[id],
    } });
  vm.runInContext(clientFunction(script, "syncPanelHeights"), ctx);
  for (const insert of [true, false]) {
    ctx.isInsertMode = () => insert;
    for (const headerGrowth of [0, 70, 120]) {
      sourceTop = 330 + headerGrowth; previewTop = 300 + headerGrowth;
      ctx.syncPanelHeights();
      assert.equal(properties["--footer-space"], "76px");
      assert.ok(sourceTop + Number.parseFloat(source.style.maxHeight) < footer.top);
      assert.ok(target.getBoundingClientRect().top + Number.parseFloat(target.style.maxHeight) <= footer.top - 16);
      assert.equal(target.style.boxSizing, "border-box");
      assert.equal(target.style.overflow, "auto");
      assert.equal(preview.style.minHeight, "0");
    }
  }
  footer.top = 400; footer.height = 110; ctx.window.innerWidth = 420;
  ctx.syncPanelHeights();
  assert.equal(properties["--footer-space"], "126px");
  assert.ok(Number.parseFloat(target.style.maxHeight) >= 240);
  assert.ok(html.includes("padding-bottom: var(--footer-space, 76px)"));
  assert.match(script, /new ResizeObserver/);
});
