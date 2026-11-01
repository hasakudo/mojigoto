const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const Module = require("node:module");
const service = require("../src/export/web-note-markdown");
const format = require("../web/lib/generated-note-markdown");
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "vscode") return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (key, fallback) => key === "mode" ? "multi" : fallback }) } };
  return originalLoad.call(this, name, ...args);
};
const notes = require("../src/data/note-store");
Module._load = originalLoad;
const root = path.resolve(".review-baseline/test-temp");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const basicNote = (id = "note-id", title = "登場人物") => ({ schemaVersion: 4, id, type: "plot", title,
  groups: [{ id: "group-id", title: "人物", items: [{ id: "entry-id", kind: "entry", heading: "主人公", body: "本文｜名前《なまえ》", memo: { body: "省略対象のメモ" } }] }] });
async function fixture(t) {
  await fs.mkdir(root, { recursive: true });
  const work = await fs.mkdtemp(path.join(root, "web-markdown-"));
  const dir = path.join(work, ".mojigoto");
  await fs.mkdir(path.join(dir, "plots"), { recursive: true });
  const file = path.join(dir, "plots", "note.json");
  const write = (note = basicNote()) => fs.writeFile(file, JSON.stringify(note), "utf8");
  await write();
  t.after(async () => {
    await service.afterNoteSaved(file);
    assert.ok(work.startsWith(root + path.sep));
    await fs.rm(work, { recursive: true, force: true });
  });
  return { work, dir, file, write, output: (id = "note-id", type = "plots") => {
    const kind = type === "references" ? "reference" : "plot", outputDir = path.join(dir, "web-import");
    const suffix = `--${sha(`${kind}:${id}`).slice(0, 8)}.md`;
    const existing = syncFs.existsSync(outputDir) && syncFs.readdirSync(outputDir).find((name) => name.endsWith(suffix));
    let title = "登場人物";
    if (syncFs.existsSync(file)) title = JSON.parse(syncFs.readFileSync(file, "utf8")).title;
    return path.join(outputDir, existing || service.outputFileName(id, title, kind));
  } };
}

test("初期OFFは生成せず、ONで保存済みプロット・資料を生成し原本を書き換えない", async (t) => {
  const h = await fixture(t);
  await service.afterNoteSaved(h.file);
  assert.equal(service.getStatus(h.dir).enabled, false);
  await assert.rejects(fs.access(h.output()), { code: "ENOENT" });
  const before = await fs.readFile(h.file, "utf8");
  await fs.mkdir(path.join(h.dir, "references"));
  await fs.writeFile(path.join(h.dir, "references", "ref.json"), JSON.stringify({ ...basicNote("ref-id", "資料"), type: "reference" }));
  const result = await service.setEnabled(h.dir, true);
  assert.equal(result.count, 2);
  assert.equal(await fs.readFile(h.file, "utf8"), before);
  const decoded = format.decode(await fs.readFile(h.output(), "utf8"));
  assert.equal(decoded.metadata.title, "登場人物");
  assert.equal(decoded.metadata.noteId, "note-id");
  assert.equal(decoded.metadata.sourceHash, sha(before));
  assert.ok(!JSON.stringify(decoded.metadata).includes(h.work));
  assert.ok(!decoded.body.includes("省略対象のメモ"));
  assert.equal(format.decode(await fs.readFile(h.output("ref-id", "references"), "utf8")).metadata.type, "reference");
});

test("既存のv1生成物は原本が同じ保存版でも最新版へ更新し、項目IDと詳細情報を付ける", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const decoded = format.decode(await fs.readFile(h.output(), "utf8"));
  decoded.metadata.version = 1; delete decoded.metadata.sourceIds;
  decoded.metadata.exportHash = sha(format.canonical(decoded.metadata, decoded.body));
  await fs.writeFile(h.output(), format.encode(decoded.metadata, decoded.body));
  await service.regenerate(h.dir);
  const upgraded = format.decode(await fs.readFile(h.output(), "utf8"));
  assert.equal(upgraded.metadata.version, 4);
  assert.deepEqual(upgraded.metadata.sourceIds[0].items, [{ id: "entry-id", kind: "entry" }]);
});
test("Web読込先の対応情報をVS Codeで読み書きしても保持する", async (t) => {
  const h = await fixture(t);
  const source = { version: 1, workId: "other-work", noteId: "other-note", sourceHash: "a".repeat(64), contentHash: "b".repeat(64), groups: [], items: [] };
  await h.write({ ...basicNote(), importSource: source });
  const note = await notes.readNoteFile(h.file); assert.deepEqual(note.importSource, source);
  await notes.saveNoteFile(h.file, note);
  assert.deepEqual(JSON.parse(await fs.readFile(h.file, "utf8")).importSource, source);
});

test("通常保存・タイトル変更・JSON名変更でも同じMarkdown1ファイルを更新し、同じ版は書き直さない", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  let note = await notes.readNoteFile(h.file);
  note.title = "新しいノート名";
  note.groups[0].items[0].body = "更新した本文";
  await notes.saveNoteFile(h.file, note);
  await service.regenerate(h.dir);
  assert.equal(format.decode(await fs.readFile(h.output(), "utf8")).metadata.title, "新しいノート名");
  const renamed = path.join(h.dir, "plots", "renamed.json");
  await fs.rename(h.file, renamed);
  await service.afterNoteSaved(renamed);
  assert.equal(format.decode(await fs.readFile(h.output(), "utf8")).metadata.sourceFileName, "renamed.json");
  const before = await fs.readFile(h.output(), "utf8");
  await service.regenerate(h.dir);
  assert.equal(await fs.readFile(h.output(), "utf8"), before);
  assert.deepEqual(await fs.readdir(path.dirname(h.output())), [path.basename(h.output())]);
});

test("ファイル名は種類とノート名を含み、同名・使用不可文字でも衝突せず直下に揃える", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  assert.match(path.basename(h.output()), /^プロット_登場人物--[a-f0-9]{8}\.md$/);
  assert.equal(path.dirname(h.output()), path.join(h.dir, "web-import"));
  assert.notEqual(service.outputFileName("a", "同名", "plot"), service.outputFileName("b", "同名", "plot"));
  assert.notEqual(service.outputFileName("a", "同名", "plot"), service.outputFileName("a", "同名", "reference"));
  assert.doesNotMatch(service.outputFileName("a", 'a/b:c*?<>|"', "plot"), /[<>:"/\\|?*]/);
});
test("旧フォルダの生成済みファイルを直下の読みやすい名前へ移し、空の旧フォルダを消す", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const current = h.output(), legacy = path.join(h.dir, "web-import", "plots", sha("note-id").slice(0, 32) + ".md");
  await fs.mkdir(path.dirname(legacy)); await fs.rename(current, legacy);
  assert.equal((await service.regenerate(h.dir)).ok, true);
  assert.match(path.basename(h.output()), /登場人物/);
  await assert.rejects(fs.access(legacy), { code: "ENOENT" });
  assert.deepEqual(await fs.readdir(path.join(h.dir, "web-import")), [path.basename(h.output())]);
});
test("旧生成物の手動編集を見つけた場合は移行・削除せず停止する", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const current = h.output(), legacy = path.join(h.dir, "web-import", "plots", sha("note-id").slice(0, 32) + ".md");
  const edited = (await fs.readFile(current, "utf8")) + "手動追記";
  await fs.mkdir(path.dirname(legacy)); await fs.writeFile(legacy, edited); await fs.unlink(current);
  assert.equal((await service.regenerate(h.dir)).ok, false);
  assert.equal(await fs.readFile(legacy, "utf8"), edited);
  await assert.rejects(fs.access(current), { code: "ENOENT" });
});

test("OFFは既存生成物を残して更新を止め、再ONで保存版へ追いつく", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const before = await fs.readFile(h.output(), "utf8");
  await service.setEnabled(h.dir, false);
  await h.write(basicNote("note-id", "OFF中の保存")); await service.afterNoteSaved(h.file);
  assert.equal(await fs.readFile(h.output(), "utf8"), before);
  await service.setEnabled(h.dir, true);
  assert.equal(format.decode(await fs.readFile(h.output(), "utf8")).metadata.title, "OFF中の保存");
});

test("手動編集したMarkdownを上書きせず、他のノートの成功でも警告を消さない", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const manual = (await fs.readFile(h.output(), "utf8")) + "手動追記";
  await fs.writeFile(h.output(), manual);
  await h.write(basicNote("note-id", "ノート更新"));
  await service.afterNoteSaved(h.file);
  assert.match(service.getStatus(h.dir).error, /手動編集/);
  const other = path.join(h.dir, "plots", "other.json");
  await fs.writeFile(other, JSON.stringify(basicNote("other")));
  await service.afterNoteSaved(other);
  assert.match(service.getStatus(h.dir).error, /手動編集/);
  assert.equal(await fs.readFile(h.output(), "utf8"), manual);
  await fs.rename(h.output(), h.output() + ".kept");
  await service.regenerate(h.dir);
  assert.equal(service.getStatus(h.dir).error, "");
});

test("生成先に同名の手書きファイルがある場合も上書きしない", async (t) => {
  const h = await fixture(t);
  await fs.mkdir(path.dirname(h.output()), { recursive: true });
  await fs.writeFile(h.output(), "# 手書きの内容");
  assert.equal((await service.setEnabled(h.dir, true)).ok, false);
  assert.equal(await fs.readFile(h.output(), "utf8"), "# 手書きの内容");
});

test("同じ作品の重複IDは両方を止め、別作品の同じIDは独立して生成する", async (t) => {
  const h = await fixture(t), other = await fixture(t);
  await fs.writeFile(path.join(h.dir, "plots", "duplicate.json"), JSON.stringify(basicNote()));
  assert.equal((await service.setEnabled(h.dir, true)).ok, false);
  await assert.rejects(fs.access(h.output()), { code: "ENOENT" });
  await service.setEnabled(other.dir, true);
  assert.ok(format.decode(await fs.readFile(other.output(), "utf8")));
});

test("IDなしの旧ノートは書き換えず、通常保存でIDが確定したら生成できる", async (t) => {
  const h = await fixture(t), legacy = basicNote(); delete legacy.id;
  await h.write(legacy); const before = await fs.readFile(h.file, "utf8");
  assert.equal((await service.setEnabled(h.dir, true)).ok, false);
  assert.equal(await fs.readFile(h.file, "utf8"), before);
  const note = await notes.readNoteFile(h.file); await notes.saveNoteFile(h.file, note); await service.regenerate(h.dir);
  assert.ok(await fs.readFile(h.output(note.id), "utf8"));
});

test("原本の保存競合時にはMarkdownを更新せず、生成失敗も原本の保存成功を覆さない", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const stale = await notes.readNoteFile(h.file), before = await fs.readFile(h.output(), "utf8");
  await h.write(basicNote("note-id", "別端末の更新"));
  await assert.rejects(notes.saveNoteFile(h.file, stale), { code: "conflict" });
  assert.equal(await fs.readFile(h.output(), "utf8"), before);
  await fs.writeFile(h.output(), "手動のファイル");
  const live = await notes.readNoteFile(h.file); live.title = "保存は成功する";
  const saved = await notes.saveNoteFile(h.file, live); await service.afterNoteSaved(h.file);
  assert.equal(saved.title, "保存は成功する");
  assert.equal(JSON.parse(await fs.readFile(h.file, "utf8")).title, "保存は成功する");
  assert.match(service.getStatus(h.dir).error, /上書き|別のファイル/);
});

test("削除したノートの生成物は残し、未保存データから生成しない", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const before = await fs.readFile(h.output(), "utf8");
  const unsaved = await notes.readNoteFile(h.file); unsaved.title = "未保存";
  await service.regenerate(h.dir);
  assert.equal(await fs.readFile(h.output(), "utf8"), before);
  await fs.writeFile(h.output(), before + "手動変更");
  await service.regenerate(h.dir);
  assert.ok(service.getStatus(h.dir).error);
  await fs.unlink(h.file); await service.regenerate(h.dir);
  assert.equal(await fs.readFile(h.output(), "utf8"), before + "手動変更");
  assert.equal(service.getStatus(h.dir).error, "");
});

test("連続した保存後通知は最後の保存版に揃い、一時ファイルを残さない", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const tasks = [];
  for (let i = 0; i < 4; i++) { await h.write(basicNote("note-id", `保存${i}`)); tasks.push(service.afterNoteSaved(h.file)); }
  await Promise.all(tasks); await service.regenerate(h.dir);
  assert.equal(format.decode(await fs.readFile(h.output(), "utf8")).metadata.title, "保存3");
  assert.ok((await fs.readdir(path.dirname(h.output()))).every((name) => name.endsWith(".md")));
});

test("破損した専用設定を勝手に置換しない", async (t) => {
  const h = await fixture(t), file = path.join(h.dir, "web-import-settings.json");
  await fs.writeFile(file, "broken");
  await assert.rejects(service.setEnabled(h.dir, true));
  assert.equal(await fs.readFile(file, "utf8"), "broken");
  assert.ok(service.getStatus(h.dir).error);
});

test("生成先のリンクを辿って作品外へ書き込まない", async (t) => {
  const h = await fixture(t), outside = path.join(h.work, "outside");
  await fs.mkdir(outside); await fs.symlink(outside, path.join(h.dir, "web-import"), "junction");
  assert.equal((await service.setEnabled(h.dir, true)).ok, false);
  assert.deepEqual(await fs.readdir(outside), []);
});

test("生成MarkdownはWebでタイトルと基本構造を読み、新IDのコピーを作る", async (t) => {
  const h = await fixture(t);
  const note = basicNote("note-id", "名前<!-- -->の見本");
  note.groups[0].items[0].body = "# 本文の見出し\n  ## 字下げ\n　### 全角字下げ\n\\## 元からスラッシュ\n```md\n### コード\n```\n終わり";
  await h.write(note); await service.setEnabled(h.dir, true);
  const text = await fs.readFile(h.output(), "utf8");
  const { readTemplateFile } = await import("../web/lib/template-import.mjs");
  const imported = await readTemplateFile({ name: path.basename(h.output()), size: Buffer.byteLength(text), arrayBuffer: async () => Buffer.from(text) }, "note", "reference");
  assert.equal(imported.title, note.title);
  assert.equal(imported.note.type, "reference");
  assert.notEqual(imported.note.id, "note-id");
  assert.equal(imported.note.groups[0].items[0].body.trimEnd(), note.groups[0].items[0].body);
  assert.equal(imported.generated.noteId, "note-id");
});

test("Webは手動変更・未対応版の生成物を読込エラーにし通常Markdownの処理は維持する", async (t) => {
  const h = await fixture(t); await service.setEnabled(h.dir, true);
  const text = await fs.readFile(h.output(), "utf8");
  const { readTemplateFile } = await import("../web/lib/template-import.mjs");
  const load = (value) => readTemplateFile({ name: "file.md", size: Buffer.byteLength(value), arrayBuffer: async () => Buffer.from(value) }, "note");
  await assert.rejects(load(text + "変更"), /変更されています/);
  await assert.rejects(load(text.replace('"version":4', '"version":99')), /未対応/);
  assert.equal((await load("# 分類\n### 項目\n本文")).note.title, "file");
});

