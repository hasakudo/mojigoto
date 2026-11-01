const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  countWorkNotes,
  writeSharedWorkMetrics,
} = require("../src/stats/shared-work-metrics");

test("VS Code集計で初回のWeb執筆記録を準備し、既存・破損ファイルは上書きしない", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mojigoto-events-init-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const settings = path.join(root, ".mojigoto", "work.json");
  const eventsPath = path.join(path.dirname(settings), "web-writing-events.json");
  writeSharedWorkMetrics(settings, { totalChars: 1, reason: "startup" });
  assert.deepEqual(JSON.parse(fs.readFileSync(eventsPath, "utf8")).events, []);
  for (const raw of ['{"events":[{"id":"keep"}]}', '{broken']) {
    fs.writeFileSync(eventsPath, raw);
    writeSharedWorkMetrics(settings, { totalChars: 2, reason: "startup" });
    assert.equal(fs.readFileSync(eventsPath, "utf8"), raw);
  }
});

test("Web共有用の文字数とノート数を作品管理フォルダへ保存する", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mojigoto-metrics-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const meta = path.join(root, ".mojigoto");
  fs.mkdirSync(path.join(meta, "plots", "人物"), { recursive: true });
  fs.mkdirSync(path.join(meta, "references"), { recursive: true });
  const plotPath = path.join(meta, "plots", "人物", "主人公.json");
  const referencePath = path.join(meta, "references", "世界.json");
  fs.writeFileSync(plotPath, "{}");
  fs.writeFileSync(referencePath, "{}");
  const noteTime = new Date("2026-09-18T00:00:00.000Z");
  fs.utimesSync(plotPath, noteTime, noteTime);
  fs.utimesSync(referencePath, noteTime, noteTime);
  fs.writeFileSync(path.join(meta, "plots", "一覧.txt"), "not a note");

  assert.equal(countWorkNotes(meta), 2);
  assert.equal(writeSharedWorkMetrics(path.join(meta, "work.json"), {
    totalChars: 1234,
    countMode: "default",
    now: new Date("2026-09-19T00:00:00.000Z"),
    dailyRecords: {
      "2026-09-18": { deltaTotal: 12, totalSaved: 1222 },
      "2026-09-19": { deltaTotal: 12, totalSaved: 1234 },
    },
    includedWebEventIds: ["web_1"],
  }), true);

  const saved = JSON.parse(fs.readFileSync(path.join(meta, "work-metrics.json"), "utf8"));
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.totalChars, 1234);
  assert.equal(saved.noteCount, 2);
  assert.equal(saved.source, "vscode");
  assert.equal(saved.updatedAt, "2026-09-19T00:00:00.000Z");
  assert.equal(saved.manuscriptUpdatedAt, "2026-09-19T00:00:00.000Z");
  assert.equal(saved.notesUpdatedAt, "2026-09-18T00:00:00.000Z");
  assert.equal(saved.progress.dailyRecords["2026-09-19"].deltaTotal, 12);
  assert.deepEqual(saved.progress.includedWebEventIds, ["web_1"]);

  const metricsPath = path.join(meta, "work-metrics.json");
  fs.writeFileSync(metricsPath, `${JSON.stringify({ ...saved, source: "web" }, null, 2)}\n`, "utf8");
  const beforeStartup = fs.readFileSync(metricsPath, "utf8");
  assert.equal(writeSharedWorkMetrics(path.join(meta, "work.json"), {
    totalChars: 1234,
    countMode: "default",
    reason: "startup",
    now: new Date("2026-09-20T00:00:00.000Z"),
    manuscriptUpdatedAt: "2026-09-19T00:00:00.000Z",
  }), true);
  assert.equal(fs.readFileSync(metricsPath, "utf8"), beforeStartup);
});
