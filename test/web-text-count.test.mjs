import assert from "node:assert/strict";
import test from "node:test";
import { countTextByMode, stripRubyForCount } from "../web/lib/text-count.mjs";

test("従来のWeb文字数は空白と改行を除いてルビ記法を含む", () => {
  assert.equal(countTextByMode("　|漢字《かんじ》\n", "compact"), 8);
});

test("ルビ除外では親文字だけを数える", () => {
  assert.equal(stripRubyForCount("|漢字《かんじ》と｜言葉《ことば》"), "漢字と言葉");
  assert.equal(countTextByMode("# |漢字《かんじ》\n", "default"), 2);
});

test("すべて含む方式と改行だけ除く方式を選べる", () => {
  assert.equal(countTextByMode("字　字\n", "allInclusive"), 4);
  assert.equal(countTextByMode("字　字\n", "allExceptNewlines"), 3);
});
