import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import { readTemplateFile } from "../web/lib/template-import.mjs";
const require = createRequire(import.meta.url);
const parser = require("../src/import/note-markdown-import");
const helpers = require("../src/import/note-memo-options");
const markdown = "### 最初の場面\n項目詳細\n\n#### 項目メモ\nメモ本文\n\n次の段落\n\n### 次の場面\n詳細2\n#### 項目メモ（リスト）\n確認1\n確認2";

test("手入力の簡易見出しで詳細本文とメモを分け、次の項目へ漏らさない", () => {
  for (const [parse, field] of [[parser.parseMarkdownImport, "parsedNote"], [parser.parseMarkdownEntriesImport, "entries"]]) {
    const parsed = parse(markdown);
    const entries = field === "entries" ? parsed.entries : parsed.parsedNote.groups[0].items;
    assert.equal(entries.length, 2);
    assert.equal(entries[0].body.trimEnd(), "項目詳細");
    assert.equal(entries[0].memo.body, "メモ本文\n\n次の段落");
    assert.equal(entries[0].memo.type, "text");
    assert.equal(entries[1].body, "詳細2");
    assert.equal(entries[1].memo.type, "list");
    assert.equal(entries[1].memo.body, "確認1\n確認2");
    assert.equal(entries[0].memo.autoSyncToConceptMemoOverride, false);
    assert.deepEqual(entries[0].memo.linkedConceptMemoIds, []);
  }
});

test("簡易メモは大分類・区分で終わり、コード内の見出しは内容として保持する", () => {
  const parsed = parser.parseMarkdownImport("# 分類\n### 項目\n詳細\n#### 項目メモ\nメモ\n```md\n### コード内\n#### 項目メモ\n```\n#### メモ内の小見出し\n補足\n## 区分\n> 補足: 補足本文\n### 別項目\n別本文\n# 別分類\n### 末尾\n本文");
  assert.equal(parsed.parsedNote.groups.length, 2);
  const items = parsed.parsedNote.groups[0].items;
  assert.equal(items.length, 3);
  assert.match(items[0].memo.body, /### コード内/);
  assert.match(items[0].memo.body, /#### メモ内の小見出し\n補足$/);
  assert.equal(items[1].kind, "divider");
  assert.equal(items[2].body, "別本文");
  const example = parser.parseMarkdownEntriesImport("### 項目\n```md\n#### 項目メモ\n例文\n```");
  assert.equal(example.entries[0].memo, undefined);
  assert.match(example.entries[0].body, /#### 項目メモ/);
});

test("旧形式のメモ・壊れた形式・重複の保護を維持する", () => {
  const rich = parser.formatItemMemoMarkdown({ type: "list", body: "本文", tags: ["伏線"] });
  const parsed = parser.parseMarkdownEntriesImport("### 項目\n詳細\n" + rich);
  assert.deepEqual(parsed.entries[0].memo.tags, ["伏線"]);
  const duplicate = parser.parseMarkdownEntriesImport("### 項目\n#### 項目メモ\n初回\n#### 項目メモ\n重複");
  assert.equal(duplicate.entries[0].memo.body, "初回");
  assert.match(duplicate.entries[0].body, /#### 項目メモ\n重複/);
  assert.ok(duplicate.previewData.warnings.some((warning) => warning.code === "INVALID_ITEM_MEMO"));
  const broken = parser.parseMarkdownEntriesImport("### 項目\n" + rich.replace(/\n~~~$/, ""));
  assert.equal(broken.entries[0].memo, undefined);
  assert.match(broken.entries[0].body, /mojigoto-item-memo-v1/);
});

test("Web通常Markdown読込も簡易メモを読み込み、読込無効時は本文のまま残す", async () => {
  const text = "# 分類\n" + markdown;
  const file = { name: "note.md", size: Buffer.byteLength(text), arrayBuffer: async () => new TextEncoder().encode(text) };
  const imported = await readTemplateFile(file, "note");
  assert.equal(imported.note.groups[0].items[0].memo.body, "メモ本文\n\n次の段落");
  const literal = parser.parseMarkdownImport(text, { readItemMemos: false });
  assert.equal(literal.parsedNote.groups[0].items[0].memo, undefined);
  assert.match(literal.parsedNote.groups[0].items[0].body, /#### 項目メモ/);
});

function fn(source, name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source).index;
  const end = /\r?\n}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + end.index + end[0].length);
}
test("項目の下への挿入でメモあり・なし・取消を選び、メモなしファイルでは選択を増やさない", async () => {
  const source = await fs.readFile(new URL("../src/import/note-import-commands.js", import.meta.url), "utf8");
  for (const choice of [true, false, undefined, "no-memo"]) {
    let picks = 0;
    const ctx = vm.createContext({ parseMarkdownEntriesImport: parser.parseMarkdownEntriesImport, require: () => helpers,
      resolveTargetWorkContext: () => ({}), resolveExportDirForTargetIfConfigured: async () => "", pickImportFile: async () => "source.md",
      readMarkdownFile: async () => ({ ok: true, text: choice === "no-memo" ? "### 項目\n詳細" : markdown }),
      path: { basename: (value) => value }, vscode: { window: { showQuickPick: async () => { picks++; return choice === undefined ? undefined : { include: choice }; } } } });
    vm.runInContext(fn(source, "runNoteItemAppendImportFlow"), ctx);
    const result = await ctx.runNoteItemAppendImportFlow({}, {});
    if (choice === undefined) assert.equal(result.cancelled, true);
    else {
      assert.equal(result.ok, true);
      assert.equal(Boolean(result.entries[0].memo), choice === true);
      if (choice === true) assert.equal(result.entries[0].memo.body, "メモ本文\n\n次の段落");
    }
    assert.equal(picks, choice === "no-memo" ? 0 : 1);
  }
});

test("簡易形式のメモを含めた項目を指定項目の直後へ挿入し、既存メモを維持する", async () => {
  const context = require("../src/views/note-webview/item-operations");
  for (const include of [true, false]) {
    const parsed = parser.parseMarkdownEntriesImport(markdown);
    const entries = helpers.prepareImportedGroups([{ items: parsed.entries }], include)[0].items;
    const note = { groups: [{ id: "g", items: [{ id: "target", kind: "entry", memo: { body: "既存メモ" } }, { id: "last", kind: "entry" }] }] };
    context.insertEntriesAfterItem(note, "g", "target", entries);
    assert.equal(note.groups[0].items[1].heading, "最初の場面");
    assert.equal(Boolean(note.groups[0].items[1].memo), include);
    assert.equal(note.groups[0].items[0].memo.body, "既存メモ");
    assert.equal(note.groups[0].items[3].id, "last");
  }
});
