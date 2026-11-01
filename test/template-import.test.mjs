import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { parseMarkdownImport, parseMarkdownEntriesImport } from "../web/lib/note-markdown.mjs";
import { NewDocumentDraft, readTemplateFile, TEMPLATE_FILE_LIMIT } from "../web/lib/template-import.mjs";

const require = createRequire(import.meta.url);
const extension = require("../src/import/note-markdown-import.js");
const file = (name, text) => ({ name, size: Buffer.byteLength(text), arrayBuffer: async () => new TextEncoder().encode(text) });
const example = "# 人物\n\n## 主人公\n> 補足: 設定\n> 補足: 続き\n\n### 名前\n｜名前《なまえ》です。\n\n# 場所\n### 城\n<script>alert(1)</script>";
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { resolve, promise }; };

test("WebとVS Codeは同じ同期パーサーを使い、基本構造と本文のルビ・HTML文字列を維持する", async () => {
  assert.equal(extension.parseMarkdownImport, parseMarkdownImport);
  const result = await readTemplateFile(file("見本.md", example), "note", "reference");
  assert.equal(result.note.title, "見本");
  assert.equal(result.note.type, "reference");
  assert.deepEqual(result.preview.counts, { groups: 2, dividers: 1, entries: 2, warnings: 0 });
  assert.equal(result.note.groups[0].items[0].value, "設定\n続き");
  assert.match(result.note.groups[0].items[1].body, /｜名前《なまえ》です。/);
  assert.equal(result.note.groups[1].items[0].body, "<script>alert(1)</script>");
  assert.equal(result.note.groups[0].items[1].memo.autoSyncToConceptMemo, false);
  assert.deepEqual(result.note.groups[0].items[1].relatedReferences, []);
  assert.ok(!("importMeta" in result.note.groups[0]));
  const again = await readTemplateFile(file("見本.md", example), "note");
  assert.notEqual(again.note.id, result.note.id);
  assert.notEqual(again.note.groups[0].id, result.note.groups[0].id);
});

test("既存のVS Code Markdown書き出しを大分類・区分・補足・項目・本文へ戻す", async () => {
  const {createSingleExportFormatters}=require("../src/export/single-export-formatters");
  const format=createSingleExportFormatters({}).getFormatters("reference").md;
  const original = (await readTemplateFile(file("資料.md", example), "note", "reference")).note;
  const result = parseMarkdownImport(format(original), { fileName: "資料.md", noteType: "reference" });
  const basic = (groups) => groups.map((g) => [g.title, g.items.map((i) => i.kind === "divider"
    ? [i.kind, i.label, i.value] : [i.kind, i.heading, i.body.trimEnd()])]);
  assert.deepEqual(basic(result.parsedNote.groups), basic(original.groups));
});

for (const marker of ["```", "~~~~"]) {
  test(`${marker}コードフェンス内の見出し・補足は構造に変換せず、閉じた後の項目は変換する`, () => {
    const md = `# 分類\n### 項目\n${marker}md\n# 本文の見出し\n## 本文の区分\n### 本文の項目\n> 補足: 本文\n${marker}\n### 次\n終わり`;
    const result = parseMarkdownImport(md);
    assert.equal(result.parsedNote.groups.length, 1);
    assert.equal(result.parsedNote.groups[0].items.length, 2);
    assert.match(result.parsedNote.groups[0].items[0].body, /### 本文の項目/);
    assert.match(result.parsedNote.groups[0].items[0].body, /> 補足: 本文/);
    assert.equal(result.parsedNote.groups[0].items[1].heading, "次");
    const partial = parseMarkdownEntriesImport(md);
    assert.equal(partial.entries.length, 3); // 大分類の行は従来どおり無題項目へ。
    assert.match(partial.entries[1].body, /### 本文の項目/);
  });
}

test("長さ不足・異なる種類のフェンスでは閉じず、未閉鎖も本文として保持する", () => {
  const result = parseMarkdownImport("````\n# コード\n```\n~~~\n### コードのまま");
  assert.equal(result.parsedNote.groups.length, 1);
  assert.equal(result.parsedNote.groups[0].items.length, 1);
  assert.match(result.parsedNote.groups[0].items[0].body, /### コードのまま/);
  assert.ok(result.previewData.warnings.some((w) => w.code === "MISSING_GROUP_AND_ENTRY_FOR_BODY"));
});

test("UTF-8 BOM・Windows改行・日本語ファイル名を読み、原稿の本文はそのまま渡す", async () => {
  const result = await readTemplateFile(file("原稿.md", "\uFEFF# 見出し\r\n本文｜漢字《かんじ》"), "manuscript");
  assert.equal(result.text, "# 見出し\r\n本文｜漢字《かんじ》");
  assert.equal(result.extension, ".md");
  assert.equal(parseMarkdownImport("\uFEFF# 分類\r\n### 項目", { fileName: "C:\\資料\\人物.md" }).parsedNote.title, "人物");
});

test("空・不正UTF-8・文字化け・非対応形式・大きいファイルを作成前に止める", async () => {
  await assert.rejects(readTemplateFile(file("empty.md", " \n"), "note"), /内容がありません/);
  await assert.rejects(readTemplateFile({ name: "bad.txt", size: 2, arrayBuffer: async () => new Uint8Array([0x82, 0xa0]) }, "manuscript"), /UTF-8/);
  await assert.rejects(readTemplateFile(file("bad.md", "\uFFFD"), "note"), /文字化け/);
  await assert.rejects(readTemplateFile(file("note.json", "{}"), "note"), /Markdown/);
  await assert.rejects(readTemplateFile(file("note.txt", "本文"), "note"), /Markdown/);
  await assert.rejects(readTemplateFile({ name: "big.md", size: TEMPLATE_FILE_LIMIT + 1 }, "note"), /10MB/);
});

test("読込の取消・遅れた解析結果・別作品への移動では内容を差し替えない", async () => {
  const wait = deferred();
  const draft = new NewDocumentDraft();
  const pending = draft.read({ name: "old.md", size: 1, arrayBuffer: () => wait.promise }, "note");
  await draft.read(file("new.md", "### 新しい項目"), "note");
  wait.resolve(new TextEncoder().encode("### 古い項目"));
  assert.equal(await pending, false);
  assert.equal(draft.content.title, "new");
  draft.clear();
  assert.equal(draft.content, null);
  draft.cancel();
  assert.equal(await draft.read(file("cancel.md", "本文"), "note"), false);
});

test("解析失敗は前に読み込んだ内容を保持する", async () => {
  const draft = new NewDocumentDraft();
  await draft.read(file("good.md", example), "note");
  const previous = draft.content;
  await assert.rejects(draft.read(file("bad.md", ""), "note"));
  assert.equal(draft.content, previous);
  assert.equal(draft.reading, false);
});

test("保存先の事前確認中の連打を1回にし、開く処理が失敗しても作成済みIDで再試行する", async () => {
  const wait = deferred();
  const draft = new NewDocumentDraft();
  let prepares = 0, creates = 0, opens = 0;
  const actions = { prepare: async () => { prepares++; await wait.promise; return {}; }, create: async () => { creates++; return { item: { id: "created", name: "新規.json" } }; }, open: async (record) => { opens++; assert.equal(record.item.id, "created"); if (opens === 1) throw Error("索引・表示の失敗"); } };
  const pending = draft.submit(actions);
  assert.equal(await draft.submit(actions), false);
  wait.resolve();
  await assert.rejects(pending, /索引/);
  assert.equal(await draft.submit(actions), true);
  assert.deepEqual([prepares, creates, opens], [1, 1, 2]);
});

test("未許可・保存先消失では作らず、確認中の作品変更も作成を止める", async () => {
  const draft = new NewDocumentDraft();
  let creates = 0;
  const create = async () => { creates++; };
  await assert.rejects(draft.submit({ prepare: async () => { throw Error("追加許可してください"); }, create }), /追加許可/);
  let current = true;
  const moved = new NewDocumentDraft(() => current);
  await assert.rejects(moved.submit({ prepare: async () => { current = false; return {}; }, create }), /保存先が変わった/);
  assert.equal(creates, 0);
});

test("クラウド作成後に作品が変わった場合は作成IDを保持し、別作品の編集を開かない", async () => {
  let current = true, opens = 0;
  const draft = new NewDocumentDraft(() => current);
  await assert.rejects(draft.submit({ prepare: async () => ({}), create: async () => { current = false; return { item: { id: "saved", name: "saved.md" } }; }, open: async () => { opens++; } }), /作成済み/);
  assert.equal(draft.created.item.id, "saved");
  assert.equal(opens, 0);
});
