const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isNoteMemoAutoSyncEnabled,
  isConceptMemoAutoSyncEnabled,
} = require("../src/data/memo-auto-sync");

test("全体設定は個別設定のない項目メモに適用される", () => {
  assert.equal(isNoteMemoAutoSyncEnabled({}, false), false);
  assert.equal(isNoteMemoAutoSyncEnabled({}, true), true);
});

test("項目メモの個別設定は全体設定より優先される", () => {
  assert.equal(
    isNoteMemoAutoSyncEnabled(
      { autoSyncToConceptMemoOverride: false },
      true,
    ),
    false,
  );
  assert.equal(
    isNoteMemoAutoSyncEnabled(
      { autoSyncToConceptMemoOverride: true },
      false,
    ),
    true,
  );
});

test("構想メモの個別設定は全体設定より優先される", () => {
  assert.equal(
    isConceptMemoAutoSyncEnabled(
      { autoSyncToNoteItemOverride: false },
      true,
    ),
    false,
  );
  assert.equal(
    isConceptMemoAutoSyncEnabled(
      { autoSyncToNoteItemOverride: true },
      false,
    ),
    true,
  );
});

test("移行前にONだった自動反映は維持される", () => {
  assert.equal(
    isNoteMemoAutoSyncEnabled({ autoSyncToConceptMemo: true }, false),
    true,
  );
  assert.equal(
    isConceptMemoAutoSyncEnabled({ autoSyncToNoteItem: true }, false),
    true,
  );
});
