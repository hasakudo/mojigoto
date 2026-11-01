import test from "node:test";
import assert from "node:assert/strict";
import { createNote, createNoteEntry } from "../web/lib/notes.mjs";
import { templateDestinationPresentation, createTemplateComparison, templateComparisonPage } from "../web/lib/note-template-presentation.mjs";
const note = (body) => { const value = createNote("plot", "人物"); value.groups[0].title = "主人公"; value.groups[0].items = [{ ...createNoteEntry(), heading: "名前", body }]; return value; };
test("原本を開くこととコピー作成の結果を、別々の短い説明と実行名で伝える", () => {
  const imported = { note: note("本文"), generated: { sourceHash: "same" } };
  const original = templateDestinationPresentation({ mode: "original", entry: { data: imported.note } }, imported);
  const copy = templateDestinationPresentation({ mode: "new" }, imported);
  assert.match(original.detail, /そのまま編集/); assert.match(original.detail, /上書きしません/);
  assert.match(copy.detail, /別のノート/); assert.match(copy.detail, /元のノートは変わりません/);
  assert.match(copy.action, /コピーを作成/);
});
test("比較は分類・項目・本文を比べ、コピーのID・名前・メモを差分にしない", () => {
  const before = note("本文"), after = note("本文\n"); before.title = "Webの名前"; before.groups[0].items[0].memo.body = "対象外のメモ";
  before.importSource = { sourceHash: "内部情報" };
  assert.deepEqual(createTemplateComparison(before, after).summary, { changed: 0, inserted: 0, deleted: 0 });
  after.groups[0].items[0].body = "Markdownの本文";
  const comparison = createTemplateComparison(before, after);
  assert.equal(comparison.summary.changed, 1);
  const texts = comparison.rows.flatMap((row) => [row.oldText, row.newText]).join("\n");
  assert.match(texts, /Markdownの本文/); assert.doesNotMatch(texts, /内部情報|対象外のメモ|Webの名前/);
});
test("長い比較は差分を欠落させず100行ごとに読み進められる", () => {
  const comparison = createTemplateComparison(note(Array.from({ length: 350 }, (_, i) => `旧${i}`).join("\n")), note(Array.from({ length: 350 }, (_, i) => `新${i}`).join("\n")));
  const first = templateComparisonPage(comparison), last = templateComparisonPage(comparison, 999);
  assert.equal(first.rows.length, 100); assert.equal(last.index, last.pages - 1);
  const rows = Array.from({ length: first.pages }, (_, index) => templateComparisonPage(comparison, index).rows).flat();
  assert.equal(rows.length, comparison.rows.length); assert.ok(rows.some((row) => row.newText === "新349"));
});
