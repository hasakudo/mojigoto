import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNote, createNoteEntry } from "../web/lib/notes.mjs";
import { normalizeConceptDocument } from "../web/lib/concept-memos.mjs";
import { ensureNoteItemConcept } from "../web/lib/note-concept-link.mjs";
import { syncFingerprint, noteMemoPayload } from "../web/lib/concept-sync.mjs";
const require = createRequire(import.meta.url);
const store = require("../src/data/concept-memo-store");

function fixture() {
  const note = createNote("plot", "プロット");
  const item = createNoteEntry();
  item.heading = "人物";
  item.memo.type = "list";
  item.memo.body = "案1\n案2";
  item.memo.tags = ["人物"];
  note.groups[0].items.push(item);
  return { note, item, document: normalizeConceptDocument({}) };
}
test("項目メモの形式・タグ・出典・同期基準を構想メモへ引き継ぐ", () => {
  const h = fixture();
  const result = ensureNoteItemConcept(h.document, h.note, 0, 0, ".mojigoto/plots/note.json");
  assert.equal(result.created, true);
  assert.equal(result.memo.type, "list");
  assert.deepEqual(result.memo.listItems.map((item) => item.text), ["案1", "案2"]);
  assert.deepEqual(result.memo.tags, ["人物"]);
  assert.equal(result.memo.source.itemId, h.item.id);
  assert.equal(result.memo.source.syncFingerprint, syncFingerprint(noteMemoPayload(h.item.memo)));
  assert.equal(result.memo.source.autoSyncToConceptMemo, false);
});
test("リンク保存を再試行しても構想を重複作成せず構想側の編集を上書きしない", () => {
  const h = fixture();
  const first = ensureNoteItemConcept(h.document, h.note, 0, 0, ".mojigoto/plots/note.json");
  first.memo.title = "構想側で変更";
  h.item.memo.body = "項目側も変更";
  const second = ensureNoteItemConcept(h.document, h.note, 0, 0, ".mojigoto/plots/note.json");
  assert.equal(second.created, false);
  assert.equal(second.memo.id, first.memo.id);
  assert.equal(second.memo.title, "構想側で変更");
  assert.equal(h.document.memos.length, 1);
});
test("Web作成の相対出典をVS Codeで同期しても同じ構想IDを再利用する", async (t) => {
  const tempRoot = fileURLToPath(new URL("../.review-baseline/test-temp/", import.meta.url));
  await mkdir(tempRoot, { recursive: true });
  const base = await mkdtemp(path.join(tempRoot, "note-link-"));
  t.after(async () => { assert.ok(base.startsWith(tempRoot)); await rm(base, { recursive: true, force: true }); });
  const h = fixture();
  const linked = ensureNoteItemConcept(h.document, h.note, 0, 0, ".mojigoto/plots/note.json");
  const file = path.join(base, "concept-memos.json");
  await store.writeConceptMemos(file, h.document);
  const result = await store.createConceptMemoFromNoteItem(file, {
    notePath: path.join(base, ".mojigoto", "plots", "note.json"), noteType: "plot", noteTitle: h.note.title,
    groupId: h.note.groups[0].id, itemId: h.item.id, heading: h.item.heading,
    memoType: "list", memoBody: h.item.memo.body, memoTags: h.item.memo.tags,
    linkedConceptMemoIds: [linked.memo.id], baseSyncFingerprint: linked.memo.source.syncFingerprint, requireSyncBaseline: true,
  });
  assert.equal(result.memo.id, linked.memo.id);
  assert.equal((await store.readConceptMemos(file)).memos.length, 1);
});
