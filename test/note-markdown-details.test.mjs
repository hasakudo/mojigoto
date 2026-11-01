import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import Module, { createRequire } from "node:module";
import { createNote, createNoteEntry, createNoteDivider } from "../web/lib/notes.mjs";
import { readTemplateFile, templatePreviewText } from "../web/lib/template-import.mjs";
import { attachImportSource, textHash, noteImportHash, prepareTemplateDestination, applyTemplateDestination, resolveImportedNoteLink } from "../web/lib/note-template-sync.mjs";
import { createTemplateComparison } from "../web/lib/note-template-presentation.mjs";
const require = createRequire(import.meta.url);
const format = require("../web/lib/generated-note-markdown");
const service = require("../src/export/web-note-markdown");
const originalLoad = Module._load;
let noteStore;
try {
  Module._load = function (name, ...args) {
    if (name === "vscode") return { workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (key, fallback) => key === "mode" ? "multi" : fallback }) } };
    return originalLoad.call(this, name, ...args);
  };
  noteStore = require("../src/data/note-store");
} finally { Module._load = originalLoad; }
const { getUtilsScript } = require("../src/views/note-webview/script-utils");
const root = path.resolve(".review-baseline/test-temp");
async function fixture(t) {
  await fs.mkdir(root, { recursive: true }); const dir = await fs.mkdtemp(path.join(root, "note-details-"));
  t.after(async () => { assert.ok(path.resolve(dir).startsWith(root + path.sep)); await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}
const reference = (note, item, extras = {}) => ({ noteType: note.type, noteId: note.id, noteFileName: "人物.json", noteTitle: note.title,
  groupId: note.groups[0].id, groupTitle: "分類", itemId: item.id, itemKind: item.kind, itemLabel: item.heading || item.label, ...extras });
function source() {
  const note = createNote("reference", "人物"); note.id = "source-note";
  note.groups = [{ id: "source-group", title: "分類", images: [{ id: "image", relativePath: "note-images/private.png" }], items: [
    { ...createNoteEntry(), id: "a", heading: "当て字", headingRuby: "ファンタジー", body: "本文｜国《くに》\n# 本文の見出し", memo: {
      type: "list", body: "- リスト\n<script>文字列</script>\n### メモの見出し", tags: ["重要", "日本語"],
      linkedConceptMemoIds: ["never-copy"], autoSyncToConceptMemo: true, autoSyncToConceptMemoOverride: true,
      conceptMemoSyncFingerprint: "private-fingerprint", conceptMemoSyncedAt: "today",
    } }, { ...createNoteDivider(), id: "b", label: "場面", value: "補足" },
  ] }];
  note.groups[0].items[0].relatedReferences = [reference(note, note.groups[0].items[1])];
  note.groups[0].items[1].relatedReferences = [reference(note, note.groups[0].items[0])];
  return note;
}
async function generated(note, version = 3, alter = () => {}) {
  const body = format.formatBody(note);
  const metadata = { format: "mojigoto-web-note", version, escapedHeadings: true, workId: "source-work", noteId: note.id,
    type: note.type, title: note.title, sourceFileName: "人物.json", sourceHash: await textHash(JSON.stringify(note)), generatedAt: "2026-10-17", bodyHash: await textHash(body),
    ...(version >= 2 ? { sourceIds: note.groups.map((group) => ({ id: group.id, items: group.items.map(({ id, kind }) => ({ id, kind })) })) } : {}),
    ...(version >= 3 ? { details: format.formatDetails(note, "source-work") } : {}) };
  alter(metadata); metadata.exportHash = await textHash(format.canonical(metadata, body));
  const text = format.encode(metadata, body);
  return { name: "見本.md", size: Buffer.byteLength(text), arrayBuffer: async () => Buffer.from(text) };
}
const read = async (note, version = 3, alter) => readTemplateFile(await generated(note, version, alter), "note", "plot");

test("専用Markdownの本文中に通常メモ形式があっても本文として保持する", async () => {
  const original = source();
  const { formatItemMemoMarkdown } = require("../src/import/note-markdown-import");
  original.groups[0].items[0].body = formatItemMemoMarkdown({body:"本文内の形式の見本",tags:["見本"]});
  const imported = await read(original);
  assert.equal(imported.note.groups[0].items[0].body.trimEnd(), original.groups[0].items[0].body);
  assert.equal(imported.note.groups[0].items[0].memo.body, original.groups[0].items[0].memo.body);
});
function providerFixture() {
  const files = new Map(); let writes = 0, workId = "";
  const folders = [{ id: "plots", name: "plots", folder: {} }, { id: "references", name: "references", folder: {} }];
  const provider = {
    listChildren: async (id) => id === "meta" ? [...folders, ...(workId ? [{ id: "settings", name: "web-import-settings.json", file: {} }] : [])]
      : [...files.values()].filter((entry) => entry.folder === id).map((entry) => ({ ...entry.item })),
    readText: async (item) => item.id === "settings" ? JSON.stringify({ workId }) : files.get(item.id).raw,
    getItemMetadata: async (item) => ({ ...files.get(item.id).item }),
    writeText: async (item, content, etag) => { const entry = files.get(item.id); assert.equal(etag, entry.item.eTag); writes++;
      entry.raw = content; entry.item.eTag = String(Number(etag) + 1); return { ...entry.item }; },
  };
  const work = { id: "work", mojigoto: { id: "meta" } };
  const add = (id, data, name = `${id}.json`) => {
    const entry = { item: { id, name, file: {}, eTag: "1" }, folder: data.type === "plot" ? "plots" : "references", raw: JSON.stringify(data) };
    files.set(id, entry); return entry;
  };
  return { files, provider, work, add, setWorkId(id) { workId = id; }, get writes() { return writes; },
    prepare: (imported, selection) => prepareTemplateDestination(provider, work, imported, selection, () => true),
    apply: async (imported, selection, options) => applyTemplateDestination(provider, imported, await prepareTemplateDestination(provider, work, imported, selection, () => true), () => true, options) };
}

test("v3は項目メモ・タグ・ふりがな・区分のリンクを読み込み、連携設定と画像を除外する", async () => {
  const imported = await read(source());
  const [entry, divider] = imported.note.groups[0].items;
  assert.equal(entry.headingRuby, "ファンタジー");
  assert.match(entry.memo.body, /<script>文字列<\/script>/); assert.match(entry.memo.body, /### メモの見出し/);
  assert.deepEqual(entry.memo.tags, ["重要", "日本語"]); assert.equal(entry.memo.type, "list");
  assert.deepEqual(entry.memo.linkedConceptMemoIds, []); assert.equal(entry.memo.autoSyncToConceptMemo, false);
  assert.equal(entry.memo.autoSyncToConceptMemoOverride, false); assert.equal(entry.memo.conceptMemoSyncFingerprint, "");
  assert.deepEqual(imported.note.groups[0].images, []);
  assert.equal(entry.relatedReferences[0].noteId, imported.note.id); assert.equal(entry.relatedReferences[0].noteType, "plot");
  assert.equal(entry.relatedReferences[0].itemId, divider.id); assert.equal(divider.relatedReferences[0].itemId, entry.id);
  assert.match(entry.body, /\n# 本文の見出し/);
  assert.match(templatePreviewText(imported), /ふりがな：ファンタジー/);
  assert.match(templatePreviewText(imported), /項目メモ/);
  assert.ok(!JSON.stringify(imported.generated).includes("never-copy"));
});

test("自己リンクはコピー作成と既存IDへ上書きした後も正しい区分・項目へ向く", async () => {
  const h = providerFixture(), original = source(), imported = await read(original);
  const target = await attachImportSource(imported.note, imported.generated); h.add("target", target);
  const before = structuredClone(target);
  original.groups[0].items[0].headingRuby = "読み直し";
  original.groups[0].items[0].memo.body = "更新メモ";
  const next = await h.apply(await read(original), "copy:target");
  assert.equal(next.note.groups[0].items[0].id, before.groups[0].items[0].id);
  assert.equal(next.note.groups[0].items[0].memo.body, "更新メモ");
  assert.equal(next.note.groups[0].items[0].relatedReferences[0].itemId, next.note.groups[0].items[1].id);
  assert.equal(next.note.groups[0].items[1].relatedReferences[0].noteId, next.note.id);
  const newer = await read(original); const plan = await h.prepare(newer, "replace:target");
  let snapshot;
  const replaced = await applyTemplateDestination(h.provider, newer, plan, () => true, { reviewedRaw: plan.entry.raw, backup: async (entry) => { snapshot = entry.raw; } });
  assert.ok(snapshot); assert.equal(replaced.note.groups[0].items[0].relatedReferences[0].itemId, replaced.note.groups[0].items[1].id);
});

test("v2のコピーは同じ元保存版でもv3の詳細を追加し、Web編集済みなら止める", async () => {
  const h = providerFixture(), note = source(), old = await read(note, 2);
  const target = await attachImportSource(old.note, old.generated); h.add("target", target);
  const firstId = target.groups[0].items[0].id;
  const result = await h.apply(await read(note), "copy:target");
  assert.equal(result.operation, "update"); assert.equal(result.note.importSource.formatVersion, 3);
  assert.equal(result.note.groups[0].items[0].id, firstId);
  assert.equal(result.note.groups[0].items[0].memo.body, note.groups[0].items[0].memo.body);
  const edited = await attachImportSource(old.note, old.generated); edited.groups[0].items[0].memo.body = "Webの変更"; h.add("target", edited);
  await assert.rejects(h.apply(await read(note), "copy:target"), /読込先のノートも編集/);
  assert.equal(JSON.parse(h.files.get("target").raw).groups[0].items[0].memo.body, "Webの変更");
});

test("v1/v2は読み込みを維持し、v3のコピーに旧形式を反映して詳細を消すことは止める", async () => {
  for (const version of [1, 2]) {
    const result = await read(source(), version);
    assert.equal(result.note.groups[0].items[0].headingRuby, ""); assert.equal(result.note.groups[0].items[0].memo.body, "");
  }
  const h = providerFixture(), note = source(), imported = await read(note);
  h.add("target", await attachImportSource(imported.note, imported.generated));
  await assert.rejects(h.apply(await read(note, 2), "copy:target"), /旧形式/); assert.equal(h.writes, 0);
});

test("詳細の数・型・リンク先・改ざん・未対応形式を作成前に止める", async () => {
  for (const alter of [
    (m) => { m.details = []; }, (m) => { m.details[0][0].memo.tags = [1]; },
    (m) => { m.details[0][0].headingRuby = {}; }, (m) => { m.details[0][0].relatedReferences[0].noteFileName = "C:/secret.json"; },
    (m) => { m.details[0][0].relatedReferences[0].itemId = "missing"; }, (m) => { m.version = 4; },
  ]) await assert.rejects(read(source(), 3, alter));
  const file = await generated(source()); const raw = (await file.arrayBuffer()).toString().replace("ファンタジー", "改ざん");
  await assert.rejects(readTemplateFile({ ...file, arrayBuffer: async () => Buffer.from(raw) }, "note"), /変更されています/);
});

test("メタデータに余分なフィールドがあっても構想メモIDと自動反映を採用しない", async () => {
  const result = await read(source(), 3, (m) => Object.assign(m.details[0][0].memo, {
    linkedConceptMemoIds: ["malicious"], autoSyncToConceptMemo: true, autoSyncToConceptMemoOverride: true, secretPath: "C:/private.json",
  }));
  const memo = result.note.groups[0].items[0].memo;
  assert.deepEqual(memo.linkedConceptMemoIds, []); assert.equal(memo.autoSyncToConceptMemoOverride, false); assert.ok(!("secretPath" in memo));
});

test("リンク先は後から取り込んでもコピーの項目対応で開け、同名・同IDの別作品へ接続しない", async () => {
  const h = providerFixture(), note = source();
  const link = { ...reference(note, note.groups[0].items[0]), importTarget: format.formatDetails({ ...note, groups: [{ items: [{ relatedReferences: [reference(note, note.groups[0].items[0])] }] }] }, "source-work")[0][0].relatedReferences[0] };
  h.add("unrelated", { ...note, id: note.id });
  await assert.rejects(resolveImportedNoteLink(h.provider, h.work, link), /関連先を特定できません/);
  h.files.clear();
  const imported = await read(note); const target = await attachImportSource(imported.note, imported.generated); h.add("copy", target);
  const resolved = await resolveImportedNoteLink(h.provider, h.work, link);
  assert.equal(resolved.entry.item.id, "copy"); assert.equal(resolved.link.itemId, target.groups[0].items[0].id);
  const current = { ...resolved.entry, data: structuredClone(target) }; current.data.groups[0].items[0].heading = "未保存の名前";
  assert.equal((await resolveImportedNoteLink(h.provider, h.work, link, current)).link.itemLabel, "未保存の名前");
  h.add("duplicate", structuredClone(target));
  await assert.rejects(resolveImportedNoteLink(h.provider, h.work, link), /特定できません/);
});

test("同じ作品の原本はworkId照合後にだけ開き、別作品の同IDは候補にしない", async () => {
  const h = providerFixture(), note = source(); h.add("original", note, "人物.json");
  const target = { ...reference(note, note.groups[0].items[1]), workId: "source-work" };
  const link = { ...target, importTarget: target };
  h.setWorkId("another-work");
  await assert.rejects(resolveImportedNoteLink(h.provider, h.work, link), /特定できません/);
  h.setWorkId("source-work");
  assert.equal((await resolveImportedNoteLink(h.provider, h.work, link)).link.itemId, "b");
  const byFile = { ...link, importTarget: { ...target, noteId: "" } };
  assert.equal((await resolveImportedNoteLink(h.provider, h.work, byFile)).entry.item.id, "original");
});

test("別作品を指す既存の生成元情報を、同じIDだからと自己リンクへ変換しない", async () => {
  const note = source(), item = note.groups[0].items[0];
  item.relatedReferences[0].importTarget = { ...reference(note, note.groups[0].items[1]), workId: "foreign-work", self: false };
  const imported = await read(note);
  assert.equal(imported.note.groups[0].items[0].relatedReferences[0].importTarget.self, false);
  assert.equal(imported.note.groups[0].items[0].relatedReferences[0].importTarget.workId, "foreign-work");
});

test("自己リンクは項目が別大分類へ移動しても対応を更新する", async () => {
  const h = providerFixture(), note = source(), imported = await read(note);
  h.add("target", await attachImportSource(imported.note, imported.generated));
  note.groups.push({ id: "other-group", title: "移動先", items: [note.groups[0].items.pop()], images: [] });
  const result = await h.apply(await read(note), "copy:target");
  assert.equal(result.note.groups[0].items[0].relatedReferences[0].groupId, result.note.groups[1].id);
  assert.equal(result.note.groups[0].items[0].relatedReferences[0].itemId, result.note.groups[1].items[0].id);
});

test("VS Codeで読み直し・保存しても参照元情報と項目メモを落とさない", async (t) => {
  const dir = await fixture(t), imported = await read(source());
  const note = await attachImportSource(imported.note, imported.generated);
  const file = path.join(dir, ".mojigoto", "plots", "note.json"); await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(note));
  const loaded = await noteStore.readNoteFile(file, "plot");
  const context = vm.createContext({ structuredClone }); vm.runInContext(getUtilsScript(), context);
  context.links = loaded.groups[0].items[0].relatedReferences;
  const normalized = vm.runInContext("normalizeRelatedReferenceLinks(links)", context);
  assert.deepEqual(structuredClone(normalized[0].importTarget), loaded.groups[0].items[0].relatedReferences[0].importTarget);
  loaded.groups[0].items[0].relatedReferences = normalized;
  await noteStore.saveNoteFile(file, loaded);
  const saved = await noteStore.readNoteFile(file, "plot");
  assert.equal(saved.groups[0].items[0].memo.autoSyncToConceptMemoOverride, false);
  assert.equal(saved.groups[0].items[0].headingRuby, "ファンタジー");
  assert.equal(saved.groups[0].items[0].relatedReferences[0].importTarget.workId, "source-work");
  assert.equal(await noteImportHash(saved), saved.importSource.contentHash);
  const descriptor = { ...reference(source(), source().groups[0].items[0]), workId: "source-work" };
  const found = await noteStore.resolveRelatedNoteTarget({ fsPath: dir }, { ...descriptor, importTarget: descriptor });
  assert.equal(found.filePath, file); assert.equal(found.item.id, saved.groups[0].items[0].id);
  await fs.writeFile(path.join(path.dirname(file), "duplicate.json"), JSON.stringify(saved));
  assert.equal(await noteStore.resolveRelatedNoteTarget({ fsPath: dir }, { ...descriptor, importTarget: descriptor }), null);
});

test("VS Codeの実生成はv2を最新版へ移し、メモを含めても原本と出力ファイル数を変えない", async (t) => {
  const dir = await fixture(t), note = source(), meta = path.join(dir, ".mojigoto"), file = path.join(meta, "references", "人物.json");
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(note));
  await service.setEnabled(meta, true);
  const output = path.join(meta, "web-import", (await fs.readdir(path.join(meta, "web-import")))[0]);
  const decoded = format.decode(await fs.readFile(output, "utf8"));
  assert.equal(decoded.metadata.version, 4);
  assert.equal(decoded.metadata.details[0][0].memo.body, note.groups[0].items[0].memo.body);
  decoded.metadata.version = 2; delete decoded.metadata.details;
  decoded.metadata.exportHash = await textHash(format.canonical(decoded.metadata, decoded.body)); await fs.writeFile(output, format.encode(decoded.metadata, decoded.body));
  assert.equal((await service.regenerate(meta)).ok, true);
  assert.equal(format.decode(await fs.readFile(output, "utf8")).metadata.version, 4);
  assert.equal(await fs.readFile(file, "utf8"), JSON.stringify(note));
  assert.equal((await fs.readdir(path.dirname(output))).length, 1);
});

test("詳細も比較に含め、通常Markdownでは従来の比較範囲を維持する", async () => {
  const before = (await read(source())).note, after = structuredClone(before);
  after.groups[0].items[0].memo.body = "新しいメモ"; after.groups[0].items[0].headingRuby = "あてじ";
  assert.equal(createTemplateComparison(before, after).summary.changed, 0);
  const comparison = createTemplateComparison(before, after, { details: true });
  assert.ok(comparison.summary.changed + comparison.summary.inserted + comparison.summary.deleted > 0);
  const text = comparison.rows.flatMap((row) => [row.oldText, row.newText]).join("\n"); assert.match(text, /新しいメモ/); assert.match(text, /ふりがな：あてじ/);
});

test("10MBを超える詳細と、リンク先が消えた生成では既存Markdownを残す", async (t) => {
  const dir = await fixture(t), note = source(), meta = path.join(dir, ".mojigoto"), file = path.join(meta, "references", "人物.json");
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(note));
  await service.setEnabled(meta, true);
  const output = path.join(meta, "web-import", (await fs.readdir(path.join(meta, "web-import")))[0]), before = await fs.readFile(output, "utf8");
  note.groups[0].items[0].memo.body = "x".repeat(10 * 1024 * 1024);
  await fs.writeFile(file, JSON.stringify(note));
  assert.equal((await service.regenerate(meta)).ok, false); assert.match(service.getStatus(meta).error, /10MB/);
  assert.equal(await fs.readFile(output, "utf8"), before);
  note.groups[0].items[0].memo.body = "通常メモ"; note.groups[0].items.pop(); await fs.writeFile(file, JSON.stringify(note));
  assert.equal((await service.regenerate(meta)).ok, false); assert.match(service.getStatus(meta).error, /関連リンク先/);
  assert.equal(await fs.readFile(output, "utf8"), before);
});
