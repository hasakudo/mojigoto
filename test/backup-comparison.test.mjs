import assert from "node:assert/strict";
import test from "node:test";
import { createBackupComparisonRows } from "../web/lib/backup-comparison.mjs";
import { createLineDiffRows, summarizeLineDiff } from "../web/lib/text-diff.mjs";

const note = () => ({
  schemaVersion: 4, id: "note-1", type: "plot", title: "エピソード",
  updatedAt: "2026-10-02T13:57:40.580Z",
  groups: [{
    id: "group-1", title: "序章", images: [],
    items: [{
      id: "item-1", kind: "entry", heading: "出会い", headingRuby: "であい",
      body: "最初の行\n次の行", memo: { body: "覚書", updatedAt: "old" },
    }, { id: "divider-1", kind: "divider", label: "場面", value: "夜" }],
  }],
});
const compare = (before, after) => createBackupComparisonRows(JSON.stringify(before, null, 2) + "\n", JSON.stringify(after), "note");
const changes = (rows) => rows.filter((row) => row.type !== "equal");

test("ノート比較はJSONの整形・キー順・更新日時・内部IDを差分にしない", () => {
  const before = note();
  const after = { ...before, id: "new-note", updatedAt: "new", schemaVersion: 3 };
  after.groups = structuredClone(before.groups);
  after.groups[0].id = "new-group";
  after.groups[0].items[0].id = "new-item";
  after.groups[0].items[0].memo = {
    updatedAt: "new", conceptMemoSyncedAt: "new", conceptMemoSyncFingerprint: "hash", body: "覚書",
  };
  assert.equal(changes(compare(before, after)).length, 0);
});

test("ノート本文の改行を展開し、編集した一行だけを差分にする", () => {
  const before = note();
  const after = structuredClone(before);
  after.groups[0].items[0].body = "最初の行\n書き換えた行";
  const rows = compare(before, after);
  assert.deepEqual(summarizeLineDiff(rows), { changed: 1, inserted: 0, deleted: 0 });
  assert.equal(changes(rows)[0].oldText, "次の行");
  assert.equal(changes(rows)[0].newText, "書き換えた行");
  const text = rows.map((row) => row.oldText).join("\n");
  assert.match(text, /タイトル：エピソード/);
  assert.match(text, /【分類 1】序章/);
  assert.match(text, /【項目 1】出会い/);
  assert.match(text, /メモ：\n覚書/);
  assert.doesNotMatch(text, /updatedAt|schemaVersion|"body"|\\n/);
});

test("タイトル・分類・区切り・ルビ・メモ・関連・画像・順序の変更を見落とさない", () => {
  const edits = [
    (data) => { data.title = "新しいタイトル"; },
    (data) => { data.groups[0].title = "終章"; },
    (data) => { data.groups[0].items[1].value = "朝"; },
    (data) => { data.groups[0].items[0].headingRuby = "あいさつ"; },
    (data) => { data.groups[0].items[0].memo.body = "新しい覚書"; },
    (data) => { data.groups[0].items[0].memo.tags = ["確認"]; },
    (data) => { data.groups[0].items[0].memo.autoSyncToConceptMemo = true; },
    (data) => { data.groups[0].items[0].relatedReferences = [{ noteTitle: "人物", itemId: "target" }]; },
    (data) => { data.groups[0].images = [{ id: "image", name: "風景", relativePath: "images/scene.png" }]; },
    (data) => { data.groups[0].items.reverse(); },
    (data) => { data.groups[0].items.push({ kind: "entry", heading: "追加", body: "本文" }); },
    (data) => { data.groups[0].items.pop(); },
  ];
  for (const edit of edits) {
    const before = note();
    const after = structuredClone(before);
    edit(after);
    assert.ok(changes(compare(before, after)).length > 0);
  }
});

test("呼び名表は人物名と呼び方で表示し、IDだけの変更を無視する", () => {
  const before = note();
  before.addressBook = {
    characters: [{ id: "a", label: "太郎" }, { id: "b", label: "花子" }],
    firstPerson: { a: "僕" }, calls: { "a::b": "花子さん" }, updatedAt: "old",
  };
  const after = structuredClone(before);
  after.addressBook = {
    characters: [{ id: "x", label: "太郎" }, { id: "y", label: "花子" }],
    firstPerson: { x: "僕" }, calls: { "x::y": "花子さん" }, updatedAt: "new",
  };
  assert.equal(changes(compare(before, after)).length, 0);
  after.addressBook.calls["x::y"] = "花ちゃん";
  const rows = changes(compare(before, after));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].oldText, "太郎 → 花子：花子さん");
  assert.equal(rows[0].newText, "太郎 → 花子：花ちゃん");
});

test("旧形式sectionsと現行groupsで同じノート内容を比較できる", () => {
  const legacy = { title: "旧ノート", sections: [{ heading: "項目", body: "本文" }] };
  const current = { title: "旧ノート", groups: [{ items: [{ heading: "項目", body: "本文" }] }] };
  assert.equal(changes(compare(legacy, current)).length, 0);
});

const concept = () => ({
  version: 1, updatedAt: "old",
  folders: [{ id: "ideas", name: "アイデア", order: 0 }],
  memos: [{
    id: "memo-1", title: "物語の案", type: "text", body: "最初の行\n次の行",
    folderId: "ideas", tags: ["伏線"], createdAt: "old", updatedAt: "old",
    source: { kind: "noteItem", noteTitle: "人物", itemHeading: "主人公", syncedAt: "old", syncFingerprint: "old" },
  }, {
    id: "memo-2", title: "準備", type: "list", listItems: [{ id: "li", text: "資料を読む", checked: false }],
  }, {
    id: "memo-3", title: "確認", type: "todo", todoItems: [{ id: "td", text: "伏線を確認", done: false }],
  }],
  commonTodoItems: [{ id: "common", text: "推敲", done: false }],
});
const compareConcept = (before, after) => createBackupComparisonRows(JSON.stringify(before, null, 2) + "\n", JSON.stringify(after), "conceptMemo");

test("構想メモ比較は整形・管理日時・ID・同期記録・バージョンを差分にしない", () => {
  const before = concept();
  const after = structuredClone(before);
  after.version = 2;
  after.updatedAt = "new";
  after.memos.forEach((memo) => {
    memo.id += "-new";
    memo.createdAt = "new";
    memo.updatedAt = "new";
  });
  after.memos[0].source = { ...after.memos[0].source, syncedAt: "new", syncFingerprint: "new" };
  after.memos[1].listItems[0].id = "new-li";
  after.memos[2].todoItems[0].id = "new-td";
  after.commonTodoItems[0].id = "new-common";
  after.folders[0].id = "new-folder";
  after.memos[0].folderId = "new-folder";
  assert.equal(changes(compareConcept(before, after)).length, 0);
});

test("構想メモの本文を行単位で比較し、フォルダ名・リスト・出典を読める形で表示する", () => {
  const before = concept();
  const after = structuredClone(before);
  after.memos[0].body = "最初の行\n変更した行";
  const rows = compareConcept(before, after);
  assert.deepEqual(summarizeLineDiff(rows), { changed: 1, inserted: 0, deleted: 0 });
  assert.equal(changes(rows)[0].oldText, "次の行");
  assert.equal(changes(rows)[0].newText, "変更した行");
  const text = rows.map((row) => row.oldText).join("\n");
  assert.match(text, /【メモ 1】物語の案/);
  assert.match(text, /所属フォルダ：アイデア/);
  assert.match(text, /リスト：\n\[ \] 資料を読む/);
  assert.match(text, /チェックリスト：\n\[ \] 伏線を確認/);
  assert.match(text, /【共通チェック項目】\n\[ \] 推敲/);
  assert.match(text, /出典 \/ ノート：人物/);
  assert.doesNotMatch(text, /updatedAt|createdAt|syncedAt|syncFingerprint|"memos"|\\n/);
});

test("リスト・TODOのチェック状態だけの変更を一行の差分にする", () => {
  for (const [memoIndex, field, checkedField] of [[1, "listItems", "checked"], [2, "todoItems", "done"]]) {
    const before = concept();
    const after = structuredClone(before);
    after.memos[memoIndex][field][0][checkedField] = true;
    const rows = changes(compareConcept(before, after));
    assert.equal(rows.length, 1);
    assert.match(rows[0].oldText, /^\[ \]/);
    assert.match(rows[0].newText, /^\[x\]/);
  }
});

test("構想メモのタグ・所属・保管・同期設定・出典・共通TODO・追加削除・順序の変更を比較する", () => {
  const edits = [
    (data) => { data.memos[0].title = "新しい案"; },
    (data) => { data.memos[0].tags.push("確認"); },
    (data) => { data.memos[0].folderId = "writing"; },
    (data) => { data.folders[0].name = "新しいフォルダ"; },
    (data) => { data.memos[0].isPinned = true; },
    (data) => { data.memos[0].isArchived = true; },
    (data) => { data.memos[0].showInDashboard = true; },
    (data) => { data.memos[0].source.autoSyncToNoteItem = true; },
    (data) => { data.memos[0].source.noteTitle = "別ノート"; },
    (data) => { data.autoSyncToNoteItemDefault = true; },
    (data) => { data.commonTodoItems[0].done = true; },
    (data) => { data.commonTodoItems[0].text = "校正"; },
    (data) => { data.memos.reverse(); },
    (data) => { data.memos.pop(); },
    (data) => { data.memos.push({ title: "追加", body: "新しいメモ" }); },
    (data) => { data.memos[0].customField = "拡張情報"; },
  ];
  for (const edit of edits) {
    const before = concept();
    const after = structuredClone(before);
    edit(after);
    assert.ok(changes(compareConcept(before, after)).length > 0);
  }
});

test("構想メモの旧folderIdと現行folderIdsは同じ所属として比較する", () => {
  const before = concept();
  const after = structuredClone(before);
  delete after.memos[0].folderId;
  after.memos[0].folderIds = ["ideas"];
  assert.equal(changes(compareConcept(before, after)).length, 0);
});

test("不正な構造化データと原稿は元のテキスト比較を維持する", () => {
  for (const [before, after, type] of [
    ["{broken", JSON.stringify(note()), "note"],
    ["null", "[]", "note"],
    ["一行\n二行\n", "一行\n三行", "manuscript"],
    ["{broken", '{"memos":[]}', "conceptMemo"],
    ["null", "[]", "conceptMemo"],
  ]) {
    assert.deepEqual(createBackupComparisonRows(before, after, type), createLineDiffRows(before, after));
  }
});
