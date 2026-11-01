const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const vscode = { workspace: {}, ConfigurationTarget: { Workspace: 2 }, window: { showInformationMessage() {} } };
const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") return vscode;
  return originalLoad(request, parent, isMain);
};
const { planCopiedWorkspacePathRepair, repairCopiedWorkspacePaths } = require("../src/core/workspace-path-repair");
Module._load = originalLoad;

test("Google DriveへコピーしたSingle設定を現在のワークスペースへ読み替える", () => {
  const source = "C:\\Users\\HADUKI\\OneDrive\\novel_tools\\test_single_folder";
  const current = "G:\\マイドライブ\\test_single_folder";
  const existing = new Set([
    path.normalize(path.join(current, ".mojigoto")),
    path.normalize(path.join(current, "manuscript")),
  ]);
  const plan = planCopiedWorkspacePathRepair({
    mode: "single",
    workspaceRoot: current,
    manuscriptRoot: path.join(source, "manuscript"),
    workRoot: "",
    exportRoot: "",
    pathExists: (value) => existing.has(path.normalize(value)),
  });
  assert.equal(path.normalize(plan.changes.manuscriptRoot), path.normalize(path.join(current, "manuscript")));
});

test("Google DriveへコピーしたMultiの作品・原稿・書き出し先をまとめて読み替える", () => {
  const source = "C:\\Users\\HADUKI\\OneDrive\\novel_tools\\test_multi_folder";
  const current = "G:\\マイドライブ\\test_multi_folder";
  const existing = new Set([
    path.normalize(path.join(current, "_WORK")),
    path.normalize(current),
  ]);
  const plan = planCopiedWorkspacePathRepair({
    mode: "multi",
    workspaceRoot: current,
    workRoot: source,
    manuscriptRoot: path.join(source, "_WORK", "manuscript"),
    exportRoot: path.join(source, "novel_log"),
    pathExists: (value) => existing.has(path.normalize(value)),
  });
  assert.equal(path.normalize(plan.changes.workRoot), path.normalize(current));
  assert.equal(path.normalize(plan.changes.manuscriptRoot), path.normalize(path.join(current, "_WORK", "manuscript")));
  assert.equal(path.normalize(plan.changes.exportRoot), path.normalize(path.join(current, "novel_log")));
});

test("別名の外部フォルダを意図的に設定している場合は変更しない", () => {
  const plan = planCopiedWorkspacePathRepair({
    mode: "single",
    workspaceRoot: "G:\\マイドライブ\\執筆環境",
    manuscriptRoot: "C:\\作品\\原稿",
    workRoot: "",
    exportRoot: "",
    pathExists: () => true,
  });
  assert.equal(plan, null);
});

test("Web取り込みで名前が変わったMultiも出自を使って設定を読み替え、外部の書き出し先は保持する", () => {
  const source = path.resolve("元のMulti"), current = path.resolve("Drive用の任意の名前");
  const existing = new Set([current, path.join(current, "_WORK")]);
  const plan = planCopiedWorkspacePathRepair({ mode: "multi", workspaceRoot: current,
    workRoot: source, manuscriptRoot: path.join(source, "作品A", "原稿"), exportRoot: path.resolve("外部倉庫"),
    importedRootNames: ["元のMulti", "Drive用の任意の名前"], pathExists: (value) => existing.has(value),
  });
  assert.equal(plan.changes.workRoot, current);
  assert.equal(plan.changes.manuscriptRoot, path.join(current, "作品A", "原稿"));
  assert.equal(plan.changes.exportRoot, undefined);
});

test("出自があっても現在の作品構造を確認できない場所への自動設定変更は止める", () => {
  const source = path.resolve("元のSingle"), current = path.resolve("任意のコピー名");
  const options = { mode: "single", workspaceRoot: current, manuscriptRoot: path.join(source, "原稿"),
    importedRootNames: ["元のSingle"], pathExists: () => false };
  assert.equal(planCopiedWorkspacePathRepair(options), null);
});

test("取り込み元メタデータを読み、保持したVS Code設定のもじごとパスだけを更新する", async (t) => {
  const fs = require("node:fs/promises");
  const root = path.resolve(".review-baseline/test-temp");
  await fs.mkdir(root, { recursive: true });
  const current = await fs.mkdtemp(path.join(root, "import-settings-"));
  t.after(async () => { assert.ok(current.startsWith(root + path.sep)); await fs.rm(current, { recursive: true, force: true }); });
  await fs.mkdir(path.join(current, ".vscode"));
  await fs.mkdir(path.join(current, ".mojigoto"));
  await fs.mkdir(path.join(current, "原稿"));
  const source = path.resolve("元PCの作品");
  const settings = { mode: "single", manuscriptRoot: path.join(source, "原稿"), workRoot: "", exportRoot: path.join(source, "書き出し"), customPreference: "保持" };
  await fs.writeFile(path.join(current, ".vscode", "mojigoto-import-source.json"), JSON.stringify({ kind: "mojigoto-drive-import", version: 1, sourceRootName: "元PCの作品", importedRootName: path.basename(current) }));
  vscode.workspace.workspaceFolders = [{ uri: { fsPath: current } }];
  vscode.workspace.getConfiguration = () => ({ get: (key) => settings[key], inspect: (key) => ({ workspaceValue: settings[key] }), update: async (key, value) => { settings[key] = value; } });
  assert.ok(await repairCopiedWorkspacePaths());
  assert.equal(settings.manuscriptRoot, path.join(current, "原稿"));
  assert.equal(settings.exportRoot, path.join(current, "書き出し"));
  assert.equal(settings.customPreference, "保持");
});

test("_WORKのないMulti取り込みでも作品データを確認して直接参照を追従し、目印がなければ更新しない", async (t) => {
  const fs = require("node:fs/promises");
  const root = path.resolve(".review-baseline/test-temp");
  await fs.mkdir(root, { recursive: true });
  const current = await fs.mkdtemp(path.join(root, "import-direct-multi-"));
  t.after(async () => { assert.ok(current.startsWith(root + path.sep)); await fs.rm(current, { recursive: true, force: true }); });
  await fs.mkdir(path.join(current, ".vscode"));
  await fs.mkdir(path.join(current, "作品A", ".mojigoto"), { recursive: true });
  await fs.mkdir(path.join(current, "作品A", "原稿"));
  const workJson = path.join(current, "作品A", ".mojigoto", "work.json");
  await fs.writeFile(workJson, JSON.stringify({ title: "作品A" }));
  const source = path.resolve("元PCのMulti");
  await fs.writeFile(path.join(current, ".vscode", "mojigoto-import-source.json"), JSON.stringify({ kind: "mojigoto-drive-import", version: 1, sourceRootName: "元PCのMulti", importedRootName: path.basename(current) }));
  const settings = { mode: "multi", workRoot: source, manuscriptRoot: path.join(source, "作品A", "原稿"), exportRoot: "", customPreference: "保持" };
  vscode.workspace.workspaceFolders = [{ uri: { fsPath: current } }];
  vscode.workspace.getConfiguration = () => ({ get: (key) => settings[key], inspect: (key) => ({ workspaceValue: settings[key] }), update: async (key, value) => { settings[key] = value; } });
  assert.ok(await repairCopiedWorkspacePaths());
  assert.equal(settings.workRoot, current);
  assert.equal(settings.manuscriptRoot, path.join(current, "作品A", "原稿"));
  assert.equal(settings.customPreference, "保持");
  await assert.rejects(fs.stat(path.join(current, "_WORK")), { code: "ENOENT" });
  await fs.unlink(workJson);
  settings.workRoot = source;
  settings.manuscriptRoot = path.join(source, "作品A", "原稿");
  assert.equal(await repairCopiedWorkspacePaths(), null);
  assert.equal(settings.workRoot, source);
});
