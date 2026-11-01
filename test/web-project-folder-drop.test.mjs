import test from "node:test";
import assert from "node:assert/strict";
import { readDroppedProjectFolder, bindProjectFolderDrop } from "../web/lib/project-folder-drop.mjs";
import { planGoogleDriveImport, importGoogleDriveProject } from "../web/lib/google-drive-import.mjs";
const fileEntry = (name, content = "本文") => ({ name, isFile: true, file(resolve) { resolve(new File([content], name, { type: "application/octet-stream", lastModified: 123 })); } });
function directory(name, children, batchSize = 100) {
  return { name, isDirectory: true, createReader() { let offset = 0; return { readEntries(resolve) {
    const batch = children.slice(offset, offset + batchSize); offset += batchSize; resolve(batch);
  } }; } };
}
const transfer = (...entries) => ({ types: ["Files"], items: entries.map(entry => ({ kind: "file", webkitGetAsEntry: () => entry })) });
const project = (name = "作品") => directory(name, [directory("原稿", [fileEntry("01.txt")]), directory(".mojigoto", [fileEntry("work.json", "{}")])]);

test("ドロップした階層と隠しフォルダを既存計画へ渡し、画像のバイト列を保つ", async () => {
  const bytes = new Uint8Array([0, 255, 128, 10]);
  const root = directory("日本語作品", [directory("原稿", [fileEntry("01.txt")]), directory(".mojigoto", [directory("note-images", [fileEntry("画像.png", bytes)])])]);
  const files = await readDroppedProjectFolder(transfer(root));
  const plan = planGoogleDriveImport(files);
  assert.equal(plan.rootName, "日本語作品");
  const image = files.find(f => f.name === "画像.png");
  assert.equal(image.webkitRelativePath, "日本語作品/.mojigoto/note-images/画像.png");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
  assert.ok(image instanceof File);
  assert.equal(image.lastModified, 123);
});
test("readEntriesの100件境界を越えて空のバッチになるまで列挙する", async () => {
  const children = Array.from({ length: 205 }, (_, i) => fileEntry(i + ".txt"));
  const files = await readDroppedProjectFolder(transfer(directory("作品", [directory("原稿", children)])));
  assert.equal(files.length, 205);
  assert.equal(new Set(files.map(file => file.webkitRelativePath)).size, 205);
});
test("dropイベントが終了してitemsが消えても取得済みEntryから読める", async () => {
  const data = transfer(project()); const pending = readDroppedProjectFolder(data); data.items = [];
  assert.equal((await pending).length, 2);
});
for (const [kind, data] of [["ファイルのみ", transfer(fileEntry("原稿.txt"))], ["複数フォルダ", transfer(project(), project("別作品"))], ["未対応ブラウザ", { items: [{ kind: "file" }]}]]) {
  test(kind + "ではフォルダ選択へ案内する", async () => { await assert.rejects(readDroppedProjectFolder(data), /フォルダ.*ドロップ/); });
}
test("空フォルダや子の読込失敗を部分成功扱いにしない", async () => {
  await assert.rejects(readDroppedProjectFolder(transfer(directory("空", []))), /空フォルダ/);
  const broken = { name: "読込不可", isDirectory: true, createReader() { return { readEntries(_resolve, reject) { reject(Error("permission denied")); } }; } };
  await assert.rejects(readDroppedProjectFolder(transfer(directory("作品", [directory("原稿", [fileEntry("01.txt")]), broken]))), /permission denied/);
});
test("ドロップの技術用データ除外・上書きしない取込は既存処理を共用する", async () => {
  const files = await readDroppedProjectFolder(transfer(directory("作品", [directory("原稿", [fileEntry("01.txt")]), directory(".git", [fileEntry("config")])])));
  const plan = planGoogleDriveImport(files), uploads = [];
  assert.equal(plan.skippedCount, 1);
  await importGoogleDriveProject({ createFolder: async (_parent, name) => ({ id: name, name }), createBinaryFile: async (_parent, name, file) => uploads.push({ name, file }) }, plan, { rootName: "新しいコピー" });
  assert.equal(uploads.length, 1); assert.equal(await uploads[0].file.text(), "本文");
});
function fixture() {
  const node = () => ({ listeners: {}, attrs: {}, classes: new Set(),
    addEventListener(name, fn) { this.listeners[name] = fn; }, setAttribute(name, value) { this.attrs[name] = value; },
    classList: { remove() {}, toggle() {} }, contains(target) { return target === this; } });
  const zone = node(), document = node(), files = [], errors = [], states = [];
  let enabled = true;
  const api = bindProjectFolderDrop({ zone, document, canRead: () => enabled,
    onFiles: selected => { planGoogleDriveImport(selected); files.push(selected); },
    onError: error => errors.push(error), onReading: state => states.push(state) });
  const drop = data => zone.listeners.drop({ dataTransfer: data, preventDefault() {}, stopPropagation() {} });
  return { zone, document, files, errors, states, api, drop, disable() { enabled = false; api.updateAvailability(); } };
}
test("ドロップでは選択だけ行い、未接続では取り込まない", async () => {
  const h = fixture(); await h.drop(transfer(project()));
  assert.equal(h.files.length, 1); assert.deepEqual(h.states, [true, false]);
  h.disable(); await h.drop(transfer(project())); assert.equal(h.files.length, 1);
  assert.equal(h.zone.attrs["aria-disabled"], "true");
});
test("無効なフォルダは前の有効な選択を置き換えない", async () => {
  const h = fixture(); await h.drop(transfer(project()));
  await h.drop(transfer(directory("無効", [fileEntry("plain.txt")])));
  assert.equal(h.files.length, 1); assert.equal(h.errors.length, 1);
});
test("遅い旧ドロップの完了で、新しい選択を上書きしない", async () => {
  let release;
  const slow = { name: "old.txt", isFile: true, file(resolve) { release = () => resolve(new File(["old"], "old.txt")); } };
  const h = fixture(), old = h.drop(transfer(directory("旧作品", [directory("原稿", [slow])])));
  await new Promise(resolve => setImmediate(resolve));
  await h.drop(transfer(project("新作品"))); release(); await old;
  assert.equal(h.files.length, 1); assert.equal(h.files[0][0].webkitRelativePath.split("/")[0], "新作品");
  assert.equal(h.errors.length, 0);
});
test("枠外へのファイルドロップはページ移動を防止して案内する", () => {
  const h = fixture(); let prevented = false;
  h.document.listeners.drop({ dataTransfer: transfer(project()), target: {}, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.errors.length, 1); assert.equal(h.files.length, 0);
});
