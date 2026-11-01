import assert from "node:assert/strict";
import test from "node:test";
import { createLineDiffRows, selectDiffContext, summarizeLineDiff } from "../web/lib/text-diff.mjs";

test("長文比較で追加・削除・変更行を識別する", () => {
  const rows = createLineDiffRows("一\n二\n三\n四", "一\n追加\n二\n三変更\n四");
  assert.deepEqual(rows.map((row) => row.type), ["equal", "insert", "equal", "change", "equal"]);
  assert.deepEqual(summarizeLineDiff(rows), { changed: 1, inserted: 1, deleted: 0 });
});

test("変更箇所だけを前後の文脈付きで抽出する", () => {
  const before = Array.from({ length: 20 }, (_, index) => `行${index + 1}`).join("\n");
  const after = before.replace("行10", "変更した行10");
  const visible = selectDiffContext(createLineDiffRows(before, after), { context: 2 });
  assert.ok(visible.some((row) => row.type === "gap"));
  assert.ok(visible.some((row) => row.type === "change"));
  assert.ok(visible.length < 10);
});
