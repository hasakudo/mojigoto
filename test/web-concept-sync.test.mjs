import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyzeConceptNoteSync,
  applyNotePayloadToConcept,
  notePayloadFromConcept,
  syncFingerprint,
} from "../web/lib/concept-sync.mjs";

const require = createRequire(import.meta.url);
const desktopSync = require("../src/data/concept-sync");

function linkedPair(body = "最初") {
  const concept = { type: "text", body, tags: ["案"], source: {} };
  const note = { type: "text", body, tags: ["案"] };
  const fingerprint = syncFingerprint(notePayloadFromConcept(concept));
  concept.source.syncFingerprint = fingerprint;
  note.conceptMemoSyncFingerprint = fingerprint;
  return { concept, note, fingerprint };
}

test("Web版とVS Code版で同じ同期指紋を生成する", () => {
  const memo = { type: "todo", todoItems: [{ text: "確認", done: true }, { text: "修正", done: false }], tags: ["要確認"] };
  const payload = notePayloadFromConcept(memo);
  assert.equal(syncFingerprint(payload), desktopSync.syncFingerprint(desktopSync.notePayloadFromConcept(memo)));
});

test("片側変更と両側変更を区別する", () => {
  const { concept, note } = linkedPair();
  concept.body = "構想側";
  assert.equal(analyzeConceptNoteSync(concept, note).status, "concept-changed");
  note.body = "項目側";
  assert.equal(analyzeConceptNoteSync(concept, note).status, "conflict");
});

test("項目メモをTODO構想メモへ反映して完了状態を保つ", () => {
  const memo = { type: "todo", todoItems: [{ id: "one", text: "旧", done: false }], tags: [], source: {} };
  applyNotePayloadToConcept(memo, { type: "list", body: "[x] 確認\n[ ] 修正", tags: ["作業"] });
  assert.deepEqual(memo.todoItems.map(({ text, done }) => ({ text, done })), [
    { text: "確認", done: true },
    { text: "修正", done: false },
  ]);
  assert.deepEqual(memo.tags, ["作業"]);
});

test("Webでは各メモ側に反映方向が明確なボタンを表示する", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../web/app.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, />項目メモへ反映<\/button>/);
  assert.match(app, /"構想メモへ反映"/);
  assert.match(app, /dataset\.noteAction = linkedConceptIds\.length \? "sync-concept" : "create-concept"/);
  assert.match(app, /"構想メモを作成"/);
  assert.doesNotMatch(html, /構想メモを採用|項目メモを採用/);
});
