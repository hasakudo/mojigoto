import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createNote, createNoteEntry, createNoteDivider } from "../web/lib/notes.mjs";
import { readTemplateFile } from "../web/lib/template-import.mjs";
import { textHash, noteImportHash, attachImportSource, inspectNoteTemplate, templateDestinations, prepareTemplateDestination, applyTemplateDestination } from "../web/lib/note-template-sync.mjs";
const format = createRequire(import.meta.url)("../web/lib/generated-note-markdown.js");

function sourceNote() {
  const note = createNote("plot", "生成元");
  note.id = "source-note"; note.groups[0].id = "source-group"; note.groups[0].title = "分類";
  note.groups[0].items = [{ ...createNoteEntry(), id: "source-entry", heading: "項目", body: "元の本文" }];
  return note;
}
export async function generatedFile(note = sourceNote(), version = 2) {
  const body = format.formatBody(note);
  const metadata = { format: "mojigoto-web-note", version, escapedHeadings: true, workId: "source-work", noteId: note.id, type: note.type,
    title: note.title, sourceFileName: "source.json", sourceHash: await textHash(JSON.stringify(note)), generatedAt: new Date().toISOString(), bodyHash: await textHash(body),
    ...(version === 2 ? { sourceIds: note.groups.map((group) => ({ id: group.id, items: group.items.map(({ id, kind }) => ({ id, kind })) })) } : {}) };
  metadata.exportHash = await textHash(format.canonical(metadata, body));
  const text = format.encode(metadata, body);
  return { name: "generated.md", size: Buffer.byteLength(text), arrayBuffer: async () => new TextEncoder().encode(text) };
}
const importedNote = async (note, version) => readTemplateFile(await generatedFile(note, version), "note", "plot");
function providerFixture() {
  const folders = [{ id: "plots", name: "plots", folder: {} }, { id: "references", name: "references", folder: {} }];
  const files = new Map(); let writes = 0;
  const add = (id, data, type = "plot", name = `${id}.json`) => {
    const entry = { item: { id, name, file: {}, eTag: "1" }, folder: type === "plot" ? "plots" : "references", raw: JSON.stringify(data) };
    files.set(id, entry); return entry;
  };
  const provider = {
    listChildren: async (id) => id === "meta" ? folders : [...files.values()].filter((entry) => entry.folder === id).map((entry) => ({ ...entry.item })),
    readText: async (item) => files.get(item.id).raw,
    getItemMetadata: async (item) => ({ ...files.get(item.id).item }),
    writeText: async (item, text, etag) => {
      const entry = files.get(item.id);
      if (etag !== entry.item.eTag) throw Object.assign(Error("競合"), { code: "conflict" });
      writes++; entry.raw = text; entry.item.eTag = String(Number(etag) + 1); return { ...entry.item };
    },
  };
  const work = { mojigoto: { id: "meta" } };
  const inspect = (imported) => inspectNoteTemplate(provider, work, imported);
  const prepare = (imported, value) => prepareTemplateDestination(provider, work, imported, value, () => true);
  const apply = async (imported, value) => applyTemplateDestination(provider, imported, await prepare(imported, value), () => true);
  return { provider, work, files, folders, add, inspect, prepare, apply, get writes() { return writes; } };
}

test("生成元を記録して同じ版を再読込しても、書込・追加コピーをしない", async () => {
  const h = providerFixture(), imported = await importedNote();
  const target = await attachImportSource(imported.note, imported.generated); h.add("copy", target);
  const options = templateDestinations(await h.inspect(imported), imported);
  assert.deepEqual(options.filter((item) => item.mode !== "replace" && item.mode !== "replace-select").map((item) => item.value), ["copy:copy"]);
  const result = await h.apply(imported, "copy:copy");
  assert.equal(result.operation, "open"); assert.equal(h.writes, 0);
  assert.equal(await noteImportHash(target), target.importSource.contentHash);
});
test("生成元だけの変更は既存の名前・並び順・項目IDを維持し、追加・並替えを反映する", async () => {
  const h = providerFixture(), source = sourceNote(), imported = await importedNote(source);
  imported.note.title = "Web用の名前"; imported.note.order = 8;
  const target = await attachImportSource(imported.note, imported.generated); h.add("copy", target);
  source.groups[0].items[0].heading = "変更後"; source.groups[0].items[0].body = "新しい本文";
  source.groups[0].items.unshift({ ...createNoteDivider(), id: "new-divider", label: "追加" });
  const result = await h.apply(await importedNote(source), "copy:copy");
  assert.equal(h.writes, 1); assert.equal(result.note.id, target.id); assert.equal(result.note.title, "Web用の名前"); assert.equal(result.note.order, 8);
  assert.equal(result.note.groups[0].id, target.groups[0].id);
  assert.equal(result.note.groups[0].items[1].id, target.groups[0].items[0].id);
  assert.equal(result.note.groups[0].items[1].body.trimEnd(), "新しい本文");
  assert.equal(result.note.importSource.contentHash, await noteImportHash(result.note));
  await h.apply(await importedNote(source), "copy:copy"); assert.equal(h.writes, 1);
});
test("Web側の保存済み編集があれば上書きせず、同じ元保存版なら編集済みでも開く", async () => {
  const h = providerFixture(), source = sourceNote(), imported = await importedNote(source);
  const target = await attachImportSource(imported.note, imported.generated);
  target.groups[0].items[0].memo.body = "Webで追加したメモ"; h.add("copy", target);
  await h.apply(imported, "copy:copy"); assert.equal(h.writes, 0);
  source.groups[0].items[0].body = "VS Code変更";
  await assert.rejects(h.apply(await importedNote(source), "copy:copy"), /ノートも編集/);
  assert.equal(h.writes, 0); assert.match(h.files.get("copy").raw, /Webで追加/);
});
test("旧コピーは同じ内容のときだけ対応先に登録し、通常のMarkdownには対応情報を要求しない", async () => {
  const h = providerFixture(), imported = await importedNote(); h.add("old-copy", imported.note);
  assert.equal(templateDestinations(await h.inspect(imported), imported)[0].mode, "adopt");
  const result = await h.apply(imported, "adopt:old-copy");
  assert.equal(result.note.id, imported.note.id); assert.equal(h.writes, 1);
  assert.equal(templateDestinations(await h.inspect(imported), imported)[0].mode, "copy");
  assert.equal(await inspectNoteTemplate(h.provider, h.work, { generated: null }), null);
});
test("許可済み原本を優先して開き、古いMarkdownでも原本に書き込まない", async () => {
  const h = providerFixture(), source = sourceNote(), imported = await importedNote(source);
  source.groups[0].items[0].body = "原本の最新本文"; h.add("original", source, "plot", "source.json");
  assert.equal(templateDestinations(await h.inspect(imported), imported)[0].value, "original:original");
  const result = await h.apply(imported, "original:original");
  assert.equal(result.note.groups[0].items[0].body, "原本の最新本文"); assert.equal(h.writes, 0);
});
test("別作品の識別情報がある場合は同じID・ファイル名でも原本と推測しない", async () => {
  const h = providerFixture(), source = sourceNote(), imported = await importedNote(source);
  h.add("original", source, "plot", "source.json");
  const config = h.add("config", { workId: "different-work" }); config.item.name = "web-import-settings.json"; h.folders.push(config.item);
  const inspection = await h.inspect(imported); assert.equal(inspection.originals.length, 0); assert.equal(inspection.foreign, true);
});
test("確認後にコピーが作成されていたら新規作成を止め、重複対応先・破損情報も止める", async () => {
  const h = providerFixture(), imported = await importedNote();
  assert.equal((await h.prepare(imported, "new")).mode, "new");
  const target = await attachImportSource(imported.note, imported.generated); h.add("copy", target);
  await assert.rejects(h.prepare(imported, "new"), /読込先が変わり/);
  h.add("second", { ...target, id: "second-note" }); await assert.rejects(h.inspect(imported), /複数/);
  h.files.delete("second"); target.importSource.items.push({ ...target.importSource.items[0] }); h.add("copy", target);
  assert.match((await h.inspect(imported)).copies[0].mappingError, /対応情報/);
  await assert.rejects(h.apply(imported, "copy:copy"), /対応情報/); assert.equal(h.writes, 0);
});
test("関連リンクの参照先が消える変更・項目種類変更は書込前に止める", async () => {
  const h = providerFixture(), source = sourceNote(), imported = await importedNote(source);
  const target = await attachImportSource(imported.note, imported.generated); h.add("copy", target);
  const other = sourceNote(); other.id = "other"; other.groups[0].items[0].relatedReferences = [{ noteId: target.id, groupId: target.groups[0].id, itemId: target.groups[0].items[0].id }]; h.add("other", other);
  source.groups[0].items = []; await assert.rejects(h.apply(await importedNote(source), "copy:copy"), /関連リンク/);
  source.groups[0].items = [{ ...createNoteDivider(), id: "source-entry", label: "変更" }];
  await assert.rejects(h.apply(await importedNote(source), "copy:copy"), /種類/); assert.equal(h.writes, 0);
});
test("反映直前の外部変更と未保存状態・作品切替は保存を止める", async () => {
  const h = providerFixture(), source = sourceNote(), imported = await importedNote(source);
  h.add("copy", await attachImportSource(imported.note, imported.generated)); source.groups[0].items[0].body = "新しい元本文";
  const updated = await importedNote(source), plan = await h.prepare(updated, "copy:copy");
  await assert.rejects(applyTemplateDestination(h.provider, updated, plan, () => false), /保存状態/);
  const write = h.provider.writeText;
  h.provider.writeText = async (...args) => {
    const entry = h.files.get("copy"), data = JSON.parse(entry.raw); data.title = "別端末の変更";
    entry.raw = JSON.stringify(data); entry.item.eTag = "2"; h.provider.writeText = write; return write(...args);
  };
  await assert.rejects(applyTemplateDestination(h.provider, updated, plan, () => true), /競合/); assert.equal(h.writes, 0);
});
test("v1も読めるが構造対応なしの変更反映は停止し、同内容v2なら対応情報を移行できる", async () => {
  const h = providerFixture(), source = sourceNote(), old = await importedNote(source, 1);
  const target = await attachImportSource(old.note, old.generated); h.add("copy", target);
  source.groups[0].items[0].body = "変更本文";
  await assert.rejects(h.apply(await importedNote(source), "copy:copy"), /旧形式/);
  source.groups[0].items[0].body = "元の本文"; source.updatedAt = "new-save";
  const result = await h.apply(await importedNote(source), "copy:copy"); assert.equal(result.note.importSource.groups.length, 1);
});
test("同じ保存版のv1読込先にv2の項目対応を補い、次回から更新できる", async () => {
  const h = providerFixture(), source = sourceNote(), old = await importedNote(source, 1);
  h.add("copy", await attachImportSource(old.note, old.generated));
  const result = await h.apply(await importedNote(source), "copy:copy"); assert.equal(result.note.importSource.groups.length, 1);
  source.groups[0].items[0].body = "次の版";
  await h.apply(await importedNote(source), "copy:copy"); assert.equal(h.writes, 2);
});
test("同内容の旧コピーが複数あれば選択を求め、対応先がすでにあれば別コピーの登録を出さない", async () => {
  const h = providerFixture(), imported = await importedNote();
  h.add("old1", imported.note); h.add("old2", { ...imported.note, id: "old2" });
  const options = templateDestinations(await h.inspect(imported), imported); assert.equal(options[0].mode, "choose");
  await assert.rejects(h.prepare(imported, ""), /読込先を選択/);
  h.add("copy", await attachImportSource({ ...imported.note, id: "tracked" }, imported.generated));
  assert.deepEqual(templateDestinations(await h.inspect(imported), imported).filter((option) => !option.mode.startsWith("replace")).map((option) => option.mode), ["copy"]);
});

test("作り直した新IDの生成物を、バックアップ後に指定した既存ノートへ上書きする", async () => {
  const h = providerFixture(), old = sourceNote(); old.title = "Webのノート名"; old.order = 3; old.groups[0].items[0].memo.body = "復元用メモ";
  h.add("target", old);
  const source = sourceNote(); source.id = "rebuilt-source"; source.groups[0].items[0].body = "作り直した本文";
  const imported = await importedNote(source), plan = await h.prepare(imported, "replace:target");
  const snapshots = [];
  const result = await applyTemplateDestination(h.provider, imported, plan, () => true, { reviewedRaw: plan.entry.raw,
    backup: async (entry) => { assert.equal(h.writes, 0); snapshots.push(entry.raw); } });
  assert.equal(h.writes, 1); assert.equal(result.note.id, old.id); assert.equal(result.note.title, old.title); assert.equal(result.note.order, 3);
  assert.equal(result.note.groups[0].items[0].body.trimEnd(), "作り直した本文");
  assert.equal(result.note.groups[0].items[0].memo.body, ""); assert.match(snapshots[0], /復元用メモ/);
  assert.equal(result.note.importSource.noteId, "rebuilt-source"); assert.equal(h.files.size, 1);
});
test("上書きは比較時点の内容とバックアップ成功を必須とし、途中の更新でも停止する", async () => {
  const h = providerFixture(), imported = await importedNote(); h.add("target", { ...sourceNote(), id: "web-target" });
  const plan = await h.prepare(imported, "replace:target");
  await assert.rejects(applyTemplateDestination(h.provider, imported, plan, () => true), /比較した後/);
  await assert.rejects(applyTemplateDestination(h.provider, imported, plan, () => true, { reviewedRaw: plan.entry.raw, backup: async () => { throw Error("バックアップ失敗"); } }), /バックアップ失敗/);
  await assert.rejects(applyTemplateDestination(h.provider, imported, plan, () => true, { reviewedRaw: plan.entry.raw, backup: async () => { h.files.get("target").raw += " "; } }), /バックアップ中/);
  assert.equal(h.writes, 0);
});
test("上書きでも他ノートの関連リンク先を壊す変更は止める", async () => {
  const h = providerFixture(), old = sourceNote(); old.id = "web-target"; h.add("target", old);
  const other = sourceNote(); other.id = "other-note"; other.groups[0].items[0].relatedReferences = [{ noteId: old.id, groupId: old.groups[0].id, itemId: old.groups[0].items[0].id }]; h.add("other", other);
  const source = sourceNote(); source.groups[0].items = [];
  const imported = await importedNote(source), plan = await h.prepare(imported, "replace:target"); let backups = 0;
  await assert.rejects(applyTemplateDestination(h.provider, imported, plan, () => true, { reviewedRaw: plan.entry.raw, backup: async () => { backups++; } }), /関連リンク/);
  assert.equal(backups, 0); assert.equal(h.writes, 0);
});
test("明示した上書きは両側の本文が違っていても、退避後に選んだ内容へ置き換えられる", async () => {
  const h = providerFixture(), source = sourceNote(), first = await importedNote(source);
  const target = await attachImportSource(first.note, first.generated); target.groups[0].items[0].body = "Web側の編集"; h.add("target", target);
  source.groups[0].items[0].body = "VS Codeで作り直した内容";
  const imported = await importedNote(source), plan = await h.prepare(imported, "replace:target"); let saved;
  const result = await applyTemplateDestination(h.provider, imported, plan, () => true, { reviewedRaw: plan.entry.raw, backup: async (entry) => { saved = entry.raw; } });
  assert.match(saved, /Web側の編集/); assert.match(result.note.groups[0].items[0].body, /VS Codeで作り直した内容/);
  assert.equal(h.writes, 1); assert.equal(result.note.id, target.id);
});
