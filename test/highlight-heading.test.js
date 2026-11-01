const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

let highlightGroups = [];
class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return {
      Position,
      Range,
      workspace: {
        getConfiguration: () => ({ get: () => highlightGroups }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  collectHighlightMatches,
  parseHeadingLine,
  readHighlightGroups,
} = require("../src/highlight/highlight-core");
const {
  normalizeStoredHeadingGroups,
} = require("../src/highlight/highlight-commands");

function makeDocument(lines) {
  return {
    lineCount: lines.length,
    lineAt: (index) => ({ text: lines[index] }),
  };
}

test("旧見出し設定を見出し専用ルールへ自動移行する", () => {
  highlightGroups = [{
    name: "heading",
    label: "見出し",
    enabled: true,
    countable: false,
    regex: "[#]",
    words: ["#"],
    style: { fontWeight: "bold" },
  }];
  const [heading] = readHighlightGroups();
  assert.equal(heading.type, "lineRule");
  assert.equal(heading.rule, "heading");
  assert.equal(heading.regex, "^(#{1,3})(?!#)(?=\\s|$)");
  assert.deepEqual(heading.words, []);
});

test("ワークスペースに保存済みの旧見出し設定を新形式へ変換する", () => {
  const source = [{
    name: "heading",
    label: "見出し",
    enabled: true,
    countable: false,
    regex: "[#]",
    style: { fontWeight: "bold" },
  }];
  const result = normalizeStoredHeadingGroups(source);

  assert.equal(result.changed, true);
  assert.equal(result.groups[0].type, "lineRule");
  assert.equal(result.groups[0].rule, "heading");
  assert.equal(result.groups[0].regex, "^(#{1,3})(?!#)(?=\\s|$)");
  assert.deepEqual(result.groups[0].words, []);
  assert.deepEqual(result.groups[0].style, { fontWeight: "bold" });

  assert.equal(normalizeStoredHeadingGroups(result.groups).changed, false);
});

test("大・中・小見出しを各行1件だけ検出する", () => {
  const groups = readHighlightGroups();
  const [result] = collectHighlightMatches(
    makeDocument([
      "# 大見出し",
      "## 中見出し",
      "### 小見出し",
      "#### 対象外",
      "本文の#記号",
      "#空白なしは対象外",
    ]),
    groups,
  );
  assert.equal(result.count, 3);
  assert.deepEqual(result.ranges.map((range) => range.start.line), [0, 1, 2]);
  assert.deepEqual(result.ranges.map((range) => range.end.character), [1, 2, 3]);
});

test("見出し階層と表示名を解析する", () => {
  assert.deepEqual(parseHeadingLine("###  小見出し "), {
    level: 3,
    markerLength: 3,
    text: "小見出し",
  });
  assert.equal(parseHeadingLine("#### 対象外"), null);
  assert.equal(parseHeadingLine("本文 # 記号"), null);
});
