import assert from "node:assert/strict";
import test from "node:test";
import { addRelatedTarget, collectRelatedTargets, createNote, createNoteEntry, matchesNoteQuery, moveNoteItem, moveNoteItemToGroup, normalizeAddressBook, normalizeNote, notePreview, relatedTargetKey, slugifyNoteTitle } from "../web/lib/notes.mjs";

test("新規ノートはVS Code版と互換のschemaVersion 4で作る", () => {
  const note = createNote("plot", "第一稿");
  assert.equal(note.schemaVersion, 4);
  assert.equal(note.type, "plot");
  assert.equal(note.title, "第一稿");
  assert.equal(note.groups.length, 1);
});

test("区分と項目を同じ大分類内で上下移動する", () => {
  const items = [{ id: "a", kind: "divider" }, { id: "b", kind: "entry" }, { id: "c", kind: "divider" }];
  assert.equal(moveNoteItem(items, 1, 0), true);
  assert.deepEqual(items.map((item) => item.id), ["b", "a", "c"]);
  assert.equal(moveNoteItem(items, 0, -1), false);
  assert.deepEqual(items.map((item) => item.id), ["b", "a", "c"]);
});

test("区分と項目を別の大分類の末尾へ移動する", () => {
  const groups = [
    { id: "g1", items: [{ id: "a", kind: "divider" }, { id: "b", kind: "entry" }] },
    { id: "g2", items: [{ id: "c", kind: "entry" }] },
  ];
  assert.equal(moveNoteItemToGroup(groups, 0, 1, 1), true);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["a"]);
  assert.deepEqual(groups[1].items.map((item) => item.id), ["c", "b"]);
  assert.equal(moveNoteItemToGroup(groups, 0, 0, 0), false);
});

test("未知の既存フィールドを保持してノートを正規化する", () => {
  const note = normalizeNote({ title: "資料", order: null, custom: { keep: true }, groups: [] }, "reference");
  assert.deepEqual(note.custom, { keep: true });
  assert.equal(note.type, "reference");
  assert.equal(note.groups.length, 1);
  assert.equal(note.order, null);
});

test("関連付け・画像・呼び名情報を正規化後も保持する", () => {
  const relation = { noteId: "other", itemId: "target" };
  const note = normalizeNote({
    addressBook: { characters: [{ id: "person" }] },
    groups: [{
      id: "group",
      images: [{ id: "image", relativePath: "note-images/a.png" }],
      items: [{ id: "item", kind: "entry", relatedReferences: [relation] }],
    }],
  });
  assert.deepEqual(note.addressBook.characters, [{ id: "person" }]);
  assert.equal(note.groups[0].images[0].id, "image");
  assert.deepEqual(note.groups[0].items[0].relatedReferences, [relation]);
});

test("タイトル・本文・項目メモ・タグを横断検索する", () => {
  const note = createNote("reference", "人物資料");
  const entry = createNoteEntry();
  entry.heading = "ロディアス";
  entry.body = "港町の大公";
  entry.memo.body = "片目を失明";
  entry.memo.tags = ["主人公"];
  note.groups[0].items.push(entry);
  assert.equal(matchesNoteQuery(note, "ロディアス 主人公"), true);
  assert.equal(matchesNoteQuery(note, "王子"), false);
  assert.match(notePreview(note), /港町の大公/);
});

test("ノート名からOneDrive用ファイル名を作る", () => {
  assert.equal(slugifyNoteTitle("人物 設定", "reference"), "人物-設定");
  assert.equal(slugifyNoteTitle("", "reference"), "reference");
});

test("プロットは資料と別プロット、資料は別資料だけを関連候補にする", () => {
  const plot = createNote("plot", "筋書き");
  plot.groups[0].items.push({ ...createNoteEntry(), heading: "事件" });
  const reference = createNote("reference", "人物");
  reference.groups[0].items.push({ ...createNoteEntry(), heading: "主人公" });
  const entries = [
    { item: { name: "plot.json" }, data: plot },
    { item: { name: "reference.json" }, data: reference },
  ];
  assert.deepEqual(collectRelatedTargets(entries, "plot", "other").map((item) => item.noteType), ["plot", "reference"]);
  assert.deepEqual(collectRelatedTargets(entries, "reference", "other").map((item) => item.noteType), ["reference"]);
});

test("関連先は同じ項目を重複登録しない", () => {
  const target = { noteType: "reference", noteId: "n", groupId: "g", itemId: "i" };
  const links = addRelatedTarget(addRelatedTarget([], target), target);
  assert.equal(links.length, 1);
  assert.equal(relatedTargetKey(links[0]), "reference:n:g:i");
});

test("関連先が区分なら区分名と補足を一覧ラベルに含める", () => {
  const note = createNote("reference", "世界観");
  note.groups[0].items.push({ id: "division", kind: "divider", label: "王都", value: "北部" });
  const targets = collectRelatedTargets([{ item: { name: "world.json" }, data: note }], "reference", "other");
  assert.equal(targets[0].itemLabel, "王都 / 北部");
});

test("呼び名一覧の欠損フィールドを空データとして扱う", () => {
  assert.deepEqual(normalizeAddressBook({ characters: [{ id: "p", label: "人物" }] }), {
    characters: [{ id: "p", label: "人物" }], firstPerson: {}, calls: {}, updatedAt: "",
  });
});
