const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const configuredRoot = path.join("C:", "novel", "manuscript");
const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return {
      workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({
          get: (key, fallback) => key === "manuscriptRoot" ? configuredRoot : fallback,
        }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  findManuscriptRootFromPath,
  resolveManuscriptRootForTreeItem,
} = require("../src/writing-memo/writing-memo-tracker");
Module._load = originalLoad;

test("manuscript/原稿の二重構造では外側を原稿ルートとして推測する", () => {
  const filePath = path.join(configuredRoot, "原稿", "第一章", "01.txt");
  assert.equal(findManuscriptRootFromPath(filePath), configuredRoot);
});

test("作品ツリー項目の原稿ルートを二重になった内側のフォルダ名より優先する", () => {
  const innerFolder = {
    kind: "chapterFolder",
    fsPath: path.join(configuredRoot, "原稿"),
    parent: {
      kind: "manuscriptRoot",
      fsPath: configuredRoot,
      parent: null,
    },
  };
  const filePath = path.join(innerFolder.fsPath, "01.txt");
  assert.equal(resolveManuscriptRootForTreeItem(innerFolder, filePath), configuredRoot);
});
