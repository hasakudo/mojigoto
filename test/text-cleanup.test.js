const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const {
  removeLeadingHalfWidthSpaces,
  countLeadingHalfWidthSpaces,
  getTargetLineNumbers,
} = require("../src/editor/text-cleanup");

test("行頭の連続する半角スペースだけを除去する", () => {
  const source = "  一行目\n　全角字下げ\n行 中 の 空白\n   \n\tタブ";
  assert.equal(
    removeLeadingHalfWidthSpaces(source),
    "一行目\n　全角字下げ\n行 中 の 空白\n\n\tタブ",
  );
  assert.equal(countLeadingHalfWidthSpaces("   本文"), 3);
  assert.equal(countLeadingHalfWidthSpaces("　本文"), 0);
});

test("選択範囲がある場合は選択された行だけを対象にする", () => {
  const document = { lineCount: 6 };
  const selections = [
    {
      isEmpty: false,
      start: { line: 1, character: 2 },
      end: { line: 4, character: 0 },
    },
  ];
  assert.deepEqual(getTargetLineNumbers(document, selections), [1, 2, 3]);
  assert.deepEqual(
    getTargetLineNumbers(document, [{ isEmpty: true }]),
    [0, 1, 2, 3, 4, 5],
  );
});
