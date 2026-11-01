import assert from "node:assert/strict";
import test from "node:test";
import { deleteEditorItem } from "../web/lib/editor-delete.mjs";
import { createConceptMemo, normalizeConceptDocument } from "../web/lib/concept-memos.mjs";

test("原稿とノートは対象ファイルだけを削除する", async () => {
  const deleted = [];
  const provider = { async deleteItem(item) { deleted.push(item.id); } };
  for (const kind of ["manuscript", "note"]) {
    await deleteEditorItem(provider, { kind, item: { id: kind } });
  }
  assert.deepEqual(deleted, ["manuscript", "note"]);
});

test("構想メモは他のメモ・フォルダを残して1件だけ削除する", async () => {
  const document = normalizeConceptDocument({ memos: [createConceptMemo({ id: "delete" }), createConceptMemo({ id: "keep", body: "残す本文" })] });
  let written;
  const provider = {
    async writeText(item, content, version) {
      assert.equal(item.id, "concept-file");
      assert.equal(version, "v1");
      written = JSON.parse(content);
      return { eTag: "v2" };
    },
    async deleteItem() { assert.fail("構想メモの共有ファイルを削除してはいけない"); },
  };
  const result = await deleteEditorItem(provider, { kind: "concept", item: { id: "concept-file", eTag: "v1" }, raw: JSON.stringify(document), memoId: "delete" });
  assert.deepEqual(written.memos, [document.memos[1]]);
  assert.deepEqual(written.folders, document.folders);
  assert.equal(result.item.eTag, "v2");
});

test("未保存の新規メモはクラウドを変更せずに取り除ける", async () => {
  const result = await deleteEditorItem({}, { kind: "concept", item: { id: "concept-file" }, raw: JSON.stringify(normalizeConceptDocument({ memos: [] })), memoId: "unsaved" });
  assert.equal(result, null);
});

test("削除失敗と構想メモの外部編集は上書きせずに伝える", async () => {
  const failure = new Error("delete failed");
  await assert.rejects(deleteEditorItem({ async deleteItem() { throw failure; } }, { kind: "note", item: { id: "note" } }), (error) => error === failure);
  const document = normalizeConceptDocument({ memos: [createConceptMemo({ id: "delete" }), createConceptMemo({ id: "keep" })] });
  const remote = structuredClone(document);
  remote.memos[1].body = "外部の編集";
  const conflict = Object.assign(new Error("conflict"), { code: "conflict" });
  let writes = 0;
  const provider = {
    async writeText() { writes += 1; throw conflict; },
    async getItemMetadata() { return { eTag: "v2" }; },
    async readText() { return JSON.stringify(remote); },
  };
  await assert.rejects(deleteEditorItem(provider, { kind: "concept", item: { id: "concept", eTag: "v1" }, raw: JSON.stringify(document), memoId: "delete" }), (error) => error === conflict);
  assert.equal(writes, 1);
});
