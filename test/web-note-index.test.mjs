import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  makeNoteIndexEntry,
  matchesNoteIndexEntry,
  mergeNoteIndexEntries,
  normalizeNoteIndex,
} from "../web/lib/note-index.mjs";

test("Webノート索引でプレビューと本文横断検索を行う", () => {
  const summary = makeNoteIndexEntry(
    { name: "hero.json", lastModifiedDateTime: "2026-09-19T00:00:00Z" },
    { id: "1", type: "plot", title: "主人公", groups: [{ title: "人物", items: [{ heading: "名前", body: "葉月", memo: { body: "秘密", tags: ["重要"] } }] }] },
  );
  assert.equal(summary.groupCount, 1);
  assert.equal(matchesNoteIndexEntry(summary, "葉月 重要"), true);
  assert.equal(matchesNoteIndexEntry(summary, "存在しない"), false);
  const normalized = normalizeNoteIndex({ schemaVersion: 1, plots: [summary], references: [] });
  assert.equal(mergeNoteIndexEntries(normalized.plots, [{ id: "file", name: "hero.json", file: {} }]).length, 1);
  assert.equal(mergeNoteIndexEntries(normalized.plots, [{ id: "other", name: "other.json", file: {} }]).length, 0);
});

test("ノート一覧は索引にないファイルだけ本文を読み込む", () => {
  const app = fs.readFileSync(new URL("../web/app.mjs", import.meta.url), "utf8");
  assert.match(app, /mergeNoteIndexEntries\(indexEntries, items\)/);
  assert.match(app, /missingItems\.map\(\(item\) => readNoteEntry/);
  assert.match(app, /loadSelectedNoteIndex\(\{ refresh: true \}\)/);
  assert.match(app, /const itemsPromise = listChildrenCached\(folder\)/);
  assert.match(app, /indexEntries\.map\(\(summary\) => indexedNoteEntry\(\{ name: summary\.fileName \}, summary\)\)/);
  assert.match(app, /state\.selectedWork\.mojigotoChildren/);
});
