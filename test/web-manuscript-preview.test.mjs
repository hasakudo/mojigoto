import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePreviewLineCharacters,
  parseManuscriptInline,
  parseManuscriptPreview,
} from "../web/lib/manuscript-preview.mjs";

test("原稿プレビュー用にルビと傍点を解析する", () => {
  assert.deepEqual(parseManuscriptInline("彼は|東京《とうきょう》で《《重要》》と告げた。"), [
    { type: "text", text: "彼は" },
    { type: "ruby", text: "東京", reading: "とうきょう" },
    { type: "text", text: "で" },
    { type: "emphasis", text: "重要" },
    { type: "text", text: "と告げた。" },
  ]);
});

test("原稿プレビューで見出し階層と空行を保持する", () => {
  const blocks = parseManuscriptPreview("# 大見出し\n\n本文\n### 小見出し");
  assert.deepEqual(blocks.map(({ type, level }) => ({ type, level })), [
    { type: "heading", level: 1 },
    { type: "blank", level: 0 },
    { type: "paragraph", level: 0 },
    { type: "heading", level: 3 },
  ]);
});

test("縦書きの1行文字数を10から40文字に収める", () => {
  assert.equal(normalizePreviewLineCharacters("5"), 10);
  assert.equal(normalizePreviewLineCharacters("35"), 35);
  assert.equal(normalizePreviewLineCharacters("100"), 40);
  assert.equal(normalizePreviewLineCharacters("未指定"), 40);
});
