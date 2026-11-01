const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

const read = (relativePath) => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return { workspace: { getConfiguration: () => ({ get: () => "" }) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const reorderCore = require("../src/reorder/reorder-core");
Module._load = originalLoad;

test("原稿構成エディタから複数原稿とフォルダを安全に移動できる", () => {
  const commands = read("src/reorder/reorder-commands.js");
  const webview = read("src/reorder/reorder-webview.js");
  const client = read("media/reorder-editor.js");

  assert.match(webview, /id="moveSelectedFilesBtn"/);
  assert.match(client, /selectedFilePaths: new Set\(\)/);
  assert.match(client, /type: "move-entries"/);
  assert.match(commands, /async function handleMoveEntries/);
  assert.match(commands, /new vscode\.WorkspaceEdit\(\)/);
  assert.match(commands, /saveDisplayNameChanges\(rootDir, \[\], \{ moves \}\)/);
  assert.match(commands, /migrateManuscriptBackupsForMove\(move\.from, move\.to\)/);
  assert.match(commands, /updateWritingMemoFilePathForRenameOrMove/);
  assert.match(commands, /updateWritingMemoPathsForFolderRename/);
  assert.match(commands, /refreshMojigotoTreeAfterReorder\(\)/);
  assert.match(commands, /!isSameOrChildPath\(candidate, sourcePath\)/);
});

test("原稿構成エディタで入れ子フォルダを同じ親の中で並び替える", () => {
  const core = read("src/reorder/reorder-core.js");
  const commands = read("src/reorder/reorder-commands.js");
  const webview = read("src/reorder/reorder-webview.js");
  const client = read("media/reorder-editor.js");

  assert.match(client, /function siblingFolders\(item, items = state\.folders\)/);
  assert.match(client, /fromItem\.parentPath !== toItem\.parentPath/);
  assert.match(client, /state\.folderOrderParentPath = fromItem\.parentPath/);
  assert.match(client, /folderOrderParentPath: state\.folderOrderParentPath/);
  assert.match(core, /parentDir = rootDir/);
  assert.match(core, /path\.resolve\(path\.dirname\(item\.path\)\) === resolvedParent/);
  assert.match(commands, /folderOrderParentPath/);
  assert.match(commands, /migrateManuscriptBackupsForMove\(move\.from, move\.temporary\)/);
  assert.match(commands, /updateWritingMemoPathsForFolderRename\(trackerItem, move\.temporary, move\.to\)/);
  assert.match(commands, /並び替えるフォルダ内に未保存の原稿があります/);
  assert.match(webview, /同じ親フォルダ内の兄弟同士で並び替えられます/);
});

test("入れ子フォルダの保存は親直下だけを連番変更する", async (t) => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "mojigoto-reorder-nested-"));
  t.after(() => fsp.rm(base, { recursive: true, force: true }));

  const root = path.join(base, "manuscript");
  const parent = path.join(root, "01. 第一部");
  await fsp.mkdir(path.join(parent, "01. 前半"), { recursive: true });
  await fsp.mkdir(path.join(parent, "02. 後半"), { recursive: true });
  await fsp.mkdir(path.join(root, "02. 第二部"), { recursive: true });

  const folders = await reorderCore.buildFolderViewModel(root);
  const nested = folders
    .filter((item) => item.kind === "folder" && item.parentPath === parent)
    .reverse();
  const ordered = [
    ...folders.filter((item) => !nested.some((nestedItem) => nestedItem.path === item.path)),
    ...nested,
  ];

  await reorderCore.saveFolderListOrder(root, ordered, 1, parent);

  assert.deepEqual(
    (await fsp.readdir(parent)).sort(),
    ["01. 後半", "02. 前半"],
  );
  assert.deepEqual(
    (await fsp.readdir(root)).sort(),
    ["01. 第一部", "02. 第二部"],
  );
});
