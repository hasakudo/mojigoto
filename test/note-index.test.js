const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { writeNoteIndex } = require("../src/data/note-index");

test("VS Code用ノート索引へ一覧・検索に必要な要約を保存する", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mojigoto-note-index-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plots = path.join(root, "plots");
  fs.mkdirSync(plots, { recursive: true });
  fs.writeFileSync(path.join(plots, "hero.json"), JSON.stringify({
    id: "plot-1",
    type: "plot",
    title: "主人公",
    order: 2,
    updatedAt: "2026-09-19T01:00:00Z",
    groups: [{ title: "人物", items: [{ kind: "entry", heading: "名前", body: "葉月", memo: { body: "秘密", tags: ["重要"] } }] }],
  }));

  const index = writeNoteIndex(root, new Date("2026-09-19T02:00:00Z"));

  assert.equal(index.plots.length, 1);
  assert.equal(index.plots[0].title, "主人公");
  assert.equal(index.plots[0].groupCount, 1);
  assert.match(index.plots[0].searchText, /葉月/);
  assert.match(index.plots[0].searchText, /重要/);
  assert.equal(index.references.length, 0);
  const indexPath = path.join(root, "notes-index.json");
  assert.equal(JSON.parse(fs.readFileSync(indexPath, "utf8")).schemaVersion, 1);
  const firstContent = fs.readFileSync(indexPath, "utf8");
  const unchanged = writeNoteIndex(root, new Date("2026-09-20T02:00:00Z"));
  assert.equal(fs.readFileSync(indexPath, "utf8"), firstContent);
  assert.equal(unchanged.updatedAt, "2026-09-19T02:00:00.000Z");
});
