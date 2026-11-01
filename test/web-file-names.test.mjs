import assert from "node:assert/strict";
import test from "node:test";
import { normalizeManuscriptFileName, normalizeManuscriptFolderName } from "../web/lib/file-names.mjs";

test("新規原稿の拡張子を正規化する", () => {
  assert.equal(normalizeManuscriptFileName("01. 新しい章", ".txt"), "01. 新しい章.txt");
  assert.equal(normalizeManuscriptFileName("設定.txt", ".md"), "設定.md");
});

test("OneDriveで使用できないファイル名を拒否する", () => {
  assert.throws(() => normalizeManuscriptFileName("章/節", ".txt"), /使用できない文字/);
  assert.throws(() => normalizeManuscriptFileName("   ", ".txt"), /入力してください/);
});

test("原稿フォルダ名を検証する", () => {
  assert.equal(normalizeManuscriptFolderName("  第一章  "), "第一章");
  assert.throws(() => normalizeManuscriptFolderName("章/節"), /使用できない文字/);
  assert.throws(() => normalizeManuscriptFolderName(".."), /使用できない文字/);
  assert.throws(() => normalizeManuscriptFolderName("   "), /入力してください/);
});
