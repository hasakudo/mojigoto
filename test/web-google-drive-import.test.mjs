import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { googleDriveImportFolderName, planGoogleDriveImport, importGoogleDriveProject } from "../web/lib/google-drive-import.mjs";
import { GoogleDriveProvider } from "../web/storage/google-drive-provider.mjs";

const file = (path, size = 10) => ({ webkitRelativePath: `作品/${path}`, size });
const files = () => [file("原稿/01.txt"), file(".mojigoto/work.json"), file(".mojigoto/note-images/a.png"),
  file(".mojigoto/backups/snapshots/a.json"), file("書き出し/a.txt", 100), file(".vscode/settings.json"),
  file("_WORK/manuscript/01.txt"), file(".git/config"), file(".env"), file(".local-config/secret.php"), file("node_modules/a.js")];

test("PC取り込みは技術用データを除外し、画像と履歴を保持して書き出しを任意除外できる", () => {
  const source = files();
  const plan = planGoogleDriveImport(source);
  assert.deepEqual(plan.optionalFolders, ["書き出し"]);
  assert.equal(plan.skippedCount, 5);
  assert.equal(plan.bytes, 150);
  const selected = planGoogleDriveImport(source, { excludedFolders: ["書き出し"] });
  assert.equal(selected.entries.length, 5);
  assert.equal(selected.bytes, 50);
  assert.equal(selected.skippedCount, 6);
  assert.equal(selected.entries[2].file, source[2]);
  assert.equal(source.length, 11);
});

test("Multi作品フォルダと正本フォルダは取り込み除外を拒否する", () => {
  const source = [file("作品A/原稿/01.txt"), file("作品A/.mojigoto/work.json"), file("倉庫/a.txt")];
  assert.deepEqual(planGoogleDriveImport(source).optionalFolders, ["倉庫"]);
  for (const folder of ["作品A", "存在しないフォルダ"]) {
    assert.throws(() => planGoogleDriveImport(source, { excludedFolders: [folder] }), /除外できません/);
  }
  assert.throws(() => planGoogleDriveImport(files(), { excludedFolders: [".mojigoto"] }), /除外できません/);
  assert.throws(() => planGoogleDriveImport(files(), { excludedFolders: [".vscode"] }), /除外できません/);
});

test("取り込み名は短い日時と識別末尾を持つ", () => {
  assert.equal(googleDriveImportFolderName("作品", new Date("2026-10-14T12:34:56.789Z"), "abc123"), "作品（取込 261014-1234-abc123）");
});

test("Multi取り込みでも_WORKを事前作成せず、設定を保持して再取り込みの出自を作り直す", async () => {
  const source = [file("作品A/原稿/01.txt"), file("作品A/.mojigoto/work.json"), file(".vscode/settings.json"), file(".vscode/mojigoto-import-source.json")];
  const plan = planGoogleDriveImport(source);
  assert.equal(plan.skippedCount, 1);
  const folders = [], uploads = [];
  const provider = {
    async createFolder(_parent, name) { folders.push(name); return { id: name, name }; },
    async createBinaryFile(_parent, name, data) { uploads.push({ name, data }); },
  };
  await importGoogleDriveProject(provider, plan, { rootName: "新しいコピー" });
  assert.ok(!folders.includes("_WORK"));
  assert.equal(uploads.filter((entry) => entry.name === "mojigoto-import-source.json").length, 1);
  assert.equal(JSON.parse(await uploads.at(-1).data.text()).importedRootName, "新しいコピー");
});

test("選択したファイルだけを新しい根フォルダへ取り込み、同名フォルダを再利用しない", async () => {
  const calls = [], uploads = [], progress = [];
  const provider = {
    async createFolder(parent, name, options) {
      const folder = { id: `folder-${calls.length}`, name };
      calls.push({ parent, name, options });
      return folder;
    },
    async createBinaryFile(parent, name, data) { uploads.push({ parent, name, data }); },
  };
  const plan = planGoogleDriveImport(files(), { excludedFolders: ["書き出し"] });
  const root = await importGoogleDriveProject(provider, plan, { rootName: "指定名", onProgress: (value) => progress.push(value) });
  assert.equal(root.name, "指定名");
  assert.deepEqual(calls[0], { parent: { id: "root" }, name: "指定名", options: { reuseExisting: false } });
  assert.equal(uploads.length, 6); // Five source files and one portable provenance marker.
  assert.equal(uploads[0].data, plan.entries[0].file);
  assert.equal(calls.filter((call) => call.name === ".mojigoto").length, 1);
  assert.equal(progress.at(-1).completed, 5);
  assert.equal(calls.filter((call) => call.name === "_WORK").length, 0);
  assert.ok(!uploads.some((upload) => upload.parent.name === "_WORK"));
  assert.equal(uploads[4].data.webkitRelativePath, "作品/.vscode/settings.json");
  assert.deepEqual(JSON.parse(await uploads[5].data.text()), { kind: "mojigoto-drive-import", version: 1, sourceRootName: "作品", importedRootName: "指定名" });
});

test("不正な取り込み名と事前キャンセルはDriveに何も作成しない", async () => {
  let created = 0;
  const provider = { async createFolder() { created++; } };
  const plan = planGoogleDriveImport(files());
  for (const rootName of ["", "..", "a/b", "a\\b", "末尾."]) {
    await assert.rejects(importGoogleDriveProject(provider, plan, { rootName }), /フォルダ名/);
  }
  await assert.rejects(importGoogleDriveProject(provider, plan, { signal: { aborted: true } }), /中断/);
  assert.equal(created, 0);
});

test("取り込み途中の失敗は元データと途中の根フォルダを保持して場所を案内する", async () => {
  const source = files(), plan = planGoogleDriveImport(source);
  let uploaded = 0;
  const provider = {
    async createFolder(_parent, name) { return { id: name, name }; },
    async createBinaryFile() { if (++uploaded === 2) throw new Error("network"); },
    async deleteItem() { assert.fail("途中データを自動削除しない"); },
  };
  await assert.rejects(importGoogleDriveProject(provider, plan, { rootName: "別の作品" }), (error) => {
    assert.equal(error.importRoot.name, "別の作品");
    assert.match(error.message, /1\/6 件.*元の作品は変更していません/);
    return true;
  });
  assert.equal(source[0].webkitRelativePath, "作品/原稿/01.txt");
});

test("Drive providerは通常のフォルダ再利用を維持し、取り込み指定時のみPOSTで新規作成する", async () => {
  const requests = [];
  const provider = new GoogleDriveProvider({ getAccessToken: async () => "token" }, async (url, options) => {
    requests.push(options);
    return { ok: true, json: async () => ({ id: "new", name: "同名", mimeType: "application/vnd.google-apps.folder" }) };
  });
  let listed = 0;
  provider.listChildren = async () => { listed++; return [{ id: "old", name: "同名", folder: {} }]; };
  assert.equal((await provider.createFolder({ id: "root" }, "同名")).id, "old");
  assert.equal((await provider.createFolder({ id: "root" }, "同名", { reuseExisting: false })).id, "new");
  assert.equal(listed, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
});

const setupSource = fs.readFileSync(new URL("../web/google-drive-setup.mjs", import.meta.url), "utf8");
function setupDom() {
  const nodes = new Map();
  const make = () => ({ hidden: true, dataset: {}, children: [], events: {},
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, callback) { this.events[name] = callback; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    querySelectorAll() { return this.children.flatMap((label) => label.children).filter((input) => input.checked); },
  });
  const el = (id) => { if (!nodes.has(id)) nodes.set(id, make()); return nodes.get(id); };
  const context = vm.createContext({ el, document: { createElement: make, createTextNode: (text) => ({ textContent: text }) },
    planGoogleDriveImport, googleDriveImportFolderName, candidate: null, connected: true, plan: null, localImportFiles: null, localImportReading: false });
  vm.runInContext(setupSource.slice(setupSource.indexOf("const status ="), setupSource.indexOf("const header ="))
    + "\nglobalThis.status = status;", context);
  return { el, context };
}

test("操作通知は画面内に残り、成功で警告を消さず、閉じた後の結果を表示する", () => {
  const { el, context } = setupDom();
  context.status("失敗", "error");
  assert.equal(el("setupActionNotice").hidden, false);
  assert.equal(el("setupActionNotice").role, "alert");
  context.status("成功", "success");
  assert.equal(el("setupActionNoticeText").textContent, "失敗");
  el("setupActionNoticeClose").events.click();
  assert.equal(el("setupActionNotice").hidden, true);
  context.status("新しい成功", "success");
  assert.equal(el("setupActionNoticeText").textContent, "新しい成功");
});

test("取り込み確認欄で除外を変えると対象数が更新され、入力した名前を維持する", () => {
  const { el, context } = setupDom();
  const start = setupSource.indexOf("function updateImportPlan(");
  vm.runInContext(setupSource.slice(start, setupSource.indexOf('\nfolderDrop = bindProjectFolderDrop', start)), context);
  el("setupLocalFiles").files = files();
  context.updateImportPlan({ reset: true });
  assert.equal(context.plan.entries.length, 6);
  el("setupImportName").value = "編集した名前";
  el("setupImportExclusions").children[0].children[0].checked = true;
  context.updateImportPlan();
  assert.equal(context.plan.entries.length, 5);
  assert.equal(el("setupImportName").value, "編集した名前");
  assert.match(el("setupImportSummary").textContent, /取り込み 5 ファイル、除外 6/);
  el("setupLocalFiles").files = [];
  context.updateImportPlan({ reset: true });
  assert.equal(context.plan, null);
  assert.equal(el("setupImport").disabled, true);
  assert.equal(el("setupImportOptions").hidden, true);
});


test("ドロップ選択を使って除外設定を変え、空のfile inputへ戻らない", () => {
  const { el, context } = setupDom();
  const start = setupSource.indexOf("function updateImportPlan(");
  vm.runInContext(setupSource.slice(start, setupSource.indexOf('\nfolderDrop = bindProjectFolderDrop', start)), context);
  el("setupLocalFiles").files = [];
  context.localImportFiles = files();
  context.updateImportPlan({ reset: true });
  assert.equal(context.plan.entries.length, 6);
  assert.match(el("setupLocalSelection").textContent, /作品/);
  el("setupImportName").value = "ドロップ先";
  el("setupImportExclusions").children[0].children[0].checked = true;
  context.updateImportPlan();
  assert.equal(context.plan.entries.length, 5);
  assert.equal(el("setupImportName").value, "ドロップ先");
});
