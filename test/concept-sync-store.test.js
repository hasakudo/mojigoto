const assert = require("node:assert/strict");
const test = require("node:test");
const { hasSyncConflict, noteMemoPayload, syncFingerprint } = require("../src/data/concept-sync");

test("VS Code側でも両方が変更された同期を停止する", () => {
  const fingerprint = (body) => syncFingerprint(noteMemoPayload({ type: "text", body, tags: [] }));
  const baseline = fingerprint("基準");
  assert.equal(hasSyncConflict(fingerprint("項目側"), fingerprint("構想側"), baseline, true), true);
  assert.equal(hasSyncConflict(baseline, fingerprint("構想側"), baseline, true), false);
  assert.equal(hasSyncConflict(fingerprint("同じ"), fingerprint("同じ"), "", true), false);
  assert.equal(hasSyncConflict(fingerprint("項目側"), fingerprint("構想側"), "", true), true);
});
