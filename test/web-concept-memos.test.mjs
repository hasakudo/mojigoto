import assert from "node:assert/strict";
import test from "node:test";
import { applyMemoEditableText, conceptMemoFolderIds, conceptSourceFileName, createConceptMemo, matchesConceptMemo, memoEditableText, normalizeConceptDocument, sortConceptMemos } from "../web/lib/concept-memos.mjs";

test("構想メモ文書を既存フィールドを保ったまま正規化する", () => {
  const data = normalizeConceptDocument({ custom: true, memos: [{ id: "m", title: "案", customMemo: 1 }] });
  assert.equal(data.custom, true);
  assert.equal(data.memos[0].customMemo, 1);
  assert.equal(data.folders.length, 4);
});

test("構想メモの旧フォルダを複数フォルダ形式へ移行して絞り込む", () => {
  const legacy = normalizeConceptDocument({
    memos: [{ id: "legacy", folderId: "writing" }],
  }).memos[0];
  assert.deepEqual(legacy.folderIds, ["writing"]);
  assert.equal(legacy.folderId, "writing");

  const memo = createConceptMemo({ folderIds: ["writing", "dialogue", "writing"] });
  assert.deepEqual(conceptMemoFolderIds(memo), ["writing", "dialogue"]);
  assert.equal(memo.folderId, "writing");
  assert.equal(matchesConceptMemo(memo, { folderId: "dialogue" }), true);
  assert.equal(matchesConceptMemo(memo, { folderId: "review" }), false);
});

test("リストとTODOを1行1項目で編集して既存チェック状態を保つ", () => {
  const memo = createConceptMemo({ type: "list", listItems: [{ id: "a", text: "旧", checked: true, custom: 1 }] });
  applyMemoEditableText(memo, "新しい項目\n次の項目");
  assert.equal(memoEditableText(memo), "新しい項目\n次の項目");
  assert.equal(memo.listItems[0].checked, true);
  assert.equal(memo.listItems[0].custom, 1);

  const todo = createConceptMemo({ type: "todo", todoItems: [{ id: "t", text: "確認", done: false }] });
  applyMemoEditableText(todo, "[x] 確認\n[ ] 修正");
  assert.equal(todo.todoItems[0].done, true);
  assert.equal(todo.todoItems[1].done, false);
  assert.equal(memoEditableText(todo), "[x] 確認\n[ ] 修正");
});

test("構想メモを検索・タグ・状態で絞り込み、昇降順に並べる", () => {
  const a = createConceptMemo({ title: "B", body: "王都", tags: ["伏線"], isPinned: true, updatedAt: "2026-01-02" });
  const b = createConceptMemo({ title: "A", body: "港町", tags: [], updatedAt: "2026-01-01" });
  assert.equal(matchesConceptMemo(a, { query: "王都", tag: "伏線", status: "pinned" }), true);
  assert.deepEqual(sortConceptMemos([a, b], "title", "asc").map((memo) => memo.title), ["B", "A"]);
});

test("Windows形式の出典パスからノートファイル名を取得する", () => {
  assert.equal(conceptSourceFileName({ notePath: "C:\\works\\.mojigoto\\plots\\plot.json" }), "plot.json");
});
