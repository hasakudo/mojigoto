import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { createNote, createNoteEntry } from "../web/lib/notes.mjs";
import { readTemplateFile, templatePreviewText } from "../web/lib/template-import.mjs";
import { attachImportSource, textHash, noteImportHash, prepareTemplateDestination, applyTemplateDestination, needsTemplateUpdate } from "../web/lib/note-template-sync.mjs";
import { loadPreviewAddressBook } from "../web/lib/imported-address-book.mjs";
import { createTemplateComparison } from "../web/lib/note-template-presentation.mjs";
const require = createRequire(import.meta.url);
const format = require("../web/lib/generated-note-markdown");
const service = require("../src/export/web-note-markdown");
const { removeUnreferencedImage } = require("../src/data/note-image-references");
const originalLoad = Module._load;
let store;
try {
  Module._load = function (name, ...args) {
    if (name === "vscode") return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (key, fallback) => key === "mode" ? "multi" : fallback }) } };
    return originalLoad.call(this, name, ...args);
  };
  store = require("../src/data/note-store");
} finally { Module._load = originalLoad; }
const root = path.resolve(".review-baseline/test-temp");
async function fixture(t) {
  await fs.mkdir(root, { recursive: true }); const dir = await fs.mkdtemp(path.join(root, "note-assets-"));
  t.after(async () => { assert.ok(path.resolve(dir).startsWith(root + path.sep)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}
function source() {
  const note = createNote("reference", "人物"); note.id = "origin-note";
  note.groups = [{ id: "grp-origin", title: "人物", items: [{ ...createNoteEntry(), id: "item-origin", heading: "主人公" }],
    images: [{ id: "image", name: "設定画", fileName: "画像.png", relativePath: "note-images/original/grp-origin/画像.png", createdAt: "2026-10-18" }] }];
  note.addressBook = { characters: [{ id: "legacy", sourceKind: "item", sourceId: "item-origin", label: "主人公" }], firstPerson: { legacy: "私" }, calls: {} };
  return note;
}
function book() { return { characters: [{ id: "a", label: "主人公", noteId: "origin-note" }, { id: "b", label: "友人", noteId: "another" }], firstPerson: { a: "俺" }, calls: { "a::b": "君" }, updatedAt: "2026-10-18" }; }
async function file(note, { version = 4, workBook = book(), alter = () => {} } = {}) {
  const body = format.formatBody(note);
  const metadata = { format: "mojigoto-web-note", version, escapedHeadings: true, workId: "origin-work", noteId: note.id,
    type: note.type, title: note.title, sourceFileName: "人物.json", sourceHash: await textHash(JSON.stringify(note)), generatedAt: "2026-10-18T00:00:00Z", bodyHash: await textHash(body),
    sourceIds: note.groups.map((group) => ({ id: group.id, items: group.items.map(({ id, kind }) => ({ id, kind })) })), details: format.formatDetails(note, "origin-work") };
  if (version >= 4) { metadata.attachments = format.formatAttachments(note, workBook); metadata.attachmentsHash = await textHash(JSON.stringify(metadata.attachments)); }
  alter(metadata); metadata.exportHash = await textHash(format.canonical(metadata, body));
  const text = format.encode(metadata, body);
  return { name: "人物.md", size: Buffer.byteLength(text), arrayBuffer: async () => Buffer.from(text) };
}
const read = async (note, options) => readTemplateFile(await file(note, options), "note", "reference");
function providerFixture() {
  const notes = new Map(); let globalBook, writes = 0;
  const provider = {
    listChildren: async (id) => id === "meta" ? [{ id: "refs", name: "references", folder: {} }, ...(globalBook ? [{ id: "book", name: "address-book.json", file: {} }] : [])]
      : [...notes.values()].map(({ item }) => item),
    readText: async (item) => item.id === "book" ? JSON.stringify(globalBook) : notes.get(item.id).raw,
    getItemMetadata: async (item) => notes.get(item.id).item,
    writeText: async (item, content, etag) => { const entry = notes.get(item.id); assert.equal(entry.item.eTag, etag); entry.raw = content; writes++; entry.item.eTag = String(writes + 1); return entry.item; },
  };
  const work = { id: "work", mojigoto: { id: "meta" } };
  const add = (id, data) => { const entry = { item: { id, name: `${id}.json`, file: {}, eTag: "1" }, raw: JSON.stringify(data) }; notes.set(id, entry); return entry; };
  return { provider, work, notes, add, setBook(value) { globalBook = value; }, get writes() { return writes; },
    prepare: (imported, selection) => prepareTemplateDestination(provider, work, imported, selection, () => true) };
}

test("形式4は画像の参照情報と作品全体の呼び名一覧を読み込み、HTMLや画像本体は実行・取得しない", async () => {
  const original = source(), imported = await read(original);
  assert.deepEqual(imported.note.groups[0].images, original.groups[0].images);
  assert.deepEqual(imported.note.importedAddressBook.book, format.addressBookDetails(book()));
  assert.equal(imported.note.addressBook.characters[0].sourceId, imported.note.groups[0].items[0].id);
  assert.equal(imported.note.addressBook.firstPerson.legacy, "私");
  assert.match(templatePreviewText(imported), /画像の関連付け：1件/); assert.match(templatePreviewText(imported), /呼び名一覧：2人/);
});

test("新規コピー・再反映・バックアップ付き上書きで関連付けを保ち、v3の同じ原本からも形式4へ更新できる", async () => {
  const h = providerFixture(), original = source(), older = await read(original, { version: 3 });
  h.add("copy", await attachImportSource(older.note, older.generated));
  const imported = await read(original);
  const updated = await applyTemplateDestination(h.provider, imported, await h.prepare(imported, "copy:copy"), () => true);
  assert.equal(updated.note.groups[0].images[0].relativePath, original.groups[0].images[0].relativePath);
  assert.equal(updated.note.importedAddressBook.book.characters.length, 2);
  assert.equal(updated.note.addressBook.characters[0].sourceId, updated.note.groups[0].items[0].id);
  const nextBook = book(); nextBook.calls["a::b"] = "お前";
  const updatedFile = await read(original, { workBook: nextBook });
  assert.equal(needsTemplateUpdate(updated.note.importSource, updatedFile.generated), true);
  const next = await applyTemplateDestination(h.provider, updatedFile, await h.prepare(updatedFile, "copy:copy"), () => true);
  assert.equal(next.note.importedAddressBook.book.calls["a::b"], "お前");
  const plan = await h.prepare(imported, "replace:copy"); let backup;
  const replaced = await applyTemplateDestination(h.provider, imported, plan, () => true, { reviewedRaw: plan.entry.raw, backup: async (entry) => { backup = entry.raw; } });
  assert.ok(backup); assert.deepEqual(replaced.note.groups[0].images, original.groups[0].images);
  const oldAgain = await read(original, { version: 3 });
  await assert.rejects(applyTemplateDestination(h.provider, oldAgain, await h.prepare(oldAgain, "copy:copy"), () => true), /旧形式/);
});

test("Web側で画像・取込版呼び名を編集したコピーの再反映は競合として止める", async () => {
  for (const mutate of [(note) => { note.groups[0].images = []; }, (note) => { note.importedAddressBook.book.calls["a::b"] = "変更"; }]) {
    const h = providerFixture(), original = source(), imported = await read(original);
    const target = await attachImportSource(imported.note, imported.generated); mutate(target); h.add("copy", target);
    original.groups[0].items[0].body = "新しい本文";
    const next = await read(original);
    await assert.rejects(applyTemplateDestination(h.provider, next, await h.prepare(next, "copy:copy"), () => true), /編集されています/);
    assert.equal(h.writes, 0);
  }
});

test("Web呼び名一覧は既存ファイルを優先し、ない場合は取込版を参照するだけで作成しない", async () => {
  const h = providerFixture(), imported = await read(source()); h.add("copy", imported.note);
  const result = await loadPreviewAddressBook(h.provider, h.work);
  assert.equal(result.imported, true); assert.equal(result.book.characters.length, 2);
  assert.deepEqual(Object.values(result.book.calls), ["君"]); assert.deepEqual(Object.values(result.book.firstPerson), ["俺"]);
  h.setBook({ characters: [{ id: "existing", label: "既存" }], firstPerson: {}, calls: {} });
  assert.equal((await loadPreviewAddressBook(h.provider, h.work)).book.characters[0].label, "既存");
  h.setBook({ characters: [], firstPerson: {}, calls: {} });
  assert.equal((await loadPreviewAddressBook(h.provider, h.work)).book.characters.length, 0);
  assert.equal(h.writes, 0);
});

test("取込版は同じ作品の最新版を採用し、別作品の人物IDが一致しても呼び方を混ぜない", async () => {
  const h = providerFixture(), a = (await read(source())).note, b = structuredClone(a), foreign = structuredClone(a);
  b.importedAddressBook.generatedAt = "2026-10-19"; b.importedAddressBook.book.calls["a::b"] = "新しい呼び方";
  foreign.importedAddressBook.workId = "foreign-work"; foreign.importedAddressBook.book.calls["a::b"] = "別作品の呼び方";
  h.add("a", a); h.add("b", b); h.add("foreign", foreign);
  const result = await loadPreviewAddressBook(h.provider, h.work);
  assert.equal(result.book.characters.length, 4); assert.deepEqual(new Set(Object.values(result.book.calls)), new Set(["新しい呼び方", "別作品の呼び方"]));
});

test("不正な画像パス・壊れた呼び名・添付情報の改ざんは保存前に拒否する", async () => {
  for (const bad of ["../secret.png", "note-images/../../secret.png", "C:/secret.png", "https://example.com/a.png", "note-images/a/../b.png", "note-images/.. /secret.png"]) {
    await assert.rejects(read(source(), { alter: (m) => { m.attachments.groupImages[0][0].relativePath = bad; } }), /画像の関連付け/);
  }
  await assert.rejects(read(source(), { alter: (m) => { m.attachments.workAddressBook.characters.push(m.attachments.workAddressBook.characters[0]); } }), /呼び名一覧/);
  await assert.rejects(read(source(), { alter: (m) => { m.attachments.workAddressBook.calls["a::b"] = "改ざん"; } }), /変更されています/);
});

test("VS Codeで読み直し・保存しても画像パス・呼び名の取込版・コピー照合ハッシュを維持する", async (t) => {
  const dir = await fixture(t), target = path.join(dir, ".mojigoto/references/copy.json"); await fs.mkdir(path.dirname(target), { recursive: true });
  const imported = await read(source()), note = await attachImportSource(imported.note, imported.generated);
  await fs.writeFile(target, JSON.stringify(note));
  const loaded = await store.readNoteFile(target, "reference"); await store.saveNoteFile(target, loaded); await service.afterNoteSaved(target);
  const saved = await store.readNoteFile(target, "reference");
  assert.deepEqual(saved.groups[0].images, note.groups[0].images); assert.deepEqual(saved.importedAddressBook, note.importedAddressBook);
  assert.equal(await noteImportHash(saved), note.importSource.contentHash);
});

test("呼び名だけの変更でも実生成を更新し、原本や画像ファイルは変更しない", async (t) => {
  const dir = await fixture(t), meta = path.join(dir, ".mojigoto"), target = path.join(meta, "references/original.json"); await fs.mkdir(path.dirname(target), { recursive: true });
  const original = JSON.stringify(source()), image = path.join(meta, source().groups[0].images[0].relativePath);
  await fs.mkdir(path.dirname(image), { recursive: true }); await fs.writeFile(image, "image-bytes");
  await fs.writeFile(target, original); await fs.writeFile(path.join(meta, "address-book.json"), JSON.stringify(book()));
  assert.equal((await service.setEnabled(meta, true)).ok, true);
  const output = path.join(meta, "web-import", (await fs.readdir(path.join(meta, "web-import")))[0]);
  const before = await fs.readFile(output, "utf8"), first = format.decode(before);
  const newer = book(); newer.calls["a::b"] = "新しい呼び名"; await fs.writeFile(path.join(meta, "address-book.json"), JSON.stringify(newer));
  assert.equal((await service.regenerate(meta)).ok, true);
  const updated = await fs.readFile(output, "utf8"), decoded = format.decode(updated);
  assert.notEqual(updated, before); assert.equal(first.metadata.sourceHash, decoded.metadata.sourceHash);
  assert.equal(decoded.metadata.attachments.workAddressBook.calls["a::b"], "新しい呼び名");
  await service.regenerate(meta); assert.equal(await fs.readFile(output, "utf8"), updated);
  assert.equal(await fs.readFile(target, "utf8"), original); assert.equal(await fs.readFile(image, "utf8"), "image-bytes");
});

test("差分で画像の参照先と呼び名の変更を確認できる", async () => {
  const before = (await read(source())).note, after = structuredClone(before);
  after.groups[0].images[0].name = "別の画像"; after.importedAddressBook.book.calls["a::b"] = "殿下";
  const comparison = createTemplateComparison(before, after, { details: true, attachments: true });
  const text = comparison.rows.flatMap((row) => [row.oldText, row.newText]).join("\n"); assert.match(text, /別の画像/); assert.match(text, /殿下/);
});

test("コピーの画像を外しても他ノートが参照する画像を消さず、最後の参照を外したときだけ削除する", async (t) => {
  const dir = await fixture(t), note = source(), target = path.join(dir, "references/copy.json"), original = path.join(dir, "references/original.json"), image = path.join(dir, note.groups[0].images[0].relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.mkdir(path.dirname(image), { recursive: true });
  await fs.writeFile(image, "image"); await fs.writeFile(original, JSON.stringify(note));
  await removeUnreferencedImage(dir, target, [], note.groups[0].images[0].relativePath); assert.equal(await fs.readFile(image, "utf8"), "image");
  await fs.writeFile(original, JSON.stringify({ groups: [] }));
  await removeUnreferencedImage(dir, target, [], note.groups[0].images[0].relativePath); await assert.rejects(fs.access(image), { code: "ENOENT" });
});
