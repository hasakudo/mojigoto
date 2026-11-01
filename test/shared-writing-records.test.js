const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let configuration = {};
const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (key, fallback) => key in configuration ? configuration[key] : fallback,
        }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { importSharedWritingRecords } = require("../src/stats/shared-writing-records");
const { nowJstParts } = require("../src/stats/stats-utils");
const { keyDailyByWorkName, keyFilesByWorkName, keyEventsByWorkName } = require("../src/stats/stats-keys");
Module._load = originalLoad;

function createContext(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    globalState: {
      get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
      async update(key, value) { values.set(key, value); },
    },
  };
}

test("Web執筆記録を一度だけ取り込み、現在文字数へ再基準化する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-web-stats-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const work = path.join(root, "work-a");
  const manuscript = path.join(work, "manuscript");
  const metadata = path.join(work, ".mojigoto");
  await fs.mkdir(path.join(manuscript, "第一章"), { recursive: true });
  await fs.mkdir(metadata, { recursive: true });
  await fs.writeFile(path.join(manuscript, "第一章", "01.txt"), "あいうえおかきくけこ", "utf8");
  await fs.writeFile(path.join(metadata, "work.json"), JSON.stringify({ folderName: "work-a", targetChars: 100 }), "utf8");

  const { dateJst, dateTimeJst } = nowJstParts();
  await fs.writeFile(path.join(metadata, "web-writing-events.json"), JSON.stringify({
    schemaVersion: 1,
    events: [{
      id: "web_test_1",
      source: "web",
      dateJst,
      savedAtJst: dateTimeJst,
      file: "第一章/01.txt",
      beforeCount: 6,
      afterCount: 10,
      delta: 4,
    }],
  }), "utf8");

  configuration = { mode: "multi", workRoot: root, manuscriptRoot: manuscript };
  const context = createContext({ "mojigoto.currentWorkName": "work-a" });
  const first = await importSharedWritingRecords(context);
  const second = await importSharedWritingRecords(context);

  assert.equal(first.imported, 1);
  assert.equal(second.imported, 0);
  const daily = context.values.get(keyDailyByWorkName("work-a"));
  assert.equal(daily[dateJst].totalSaved, 10);
  assert.equal(daily[dateJst].deltaTotal, 4);
  assert.equal(daily[dateJst].chapters["第一章"].total, 10);
  assert.deepEqual(context.values.get(keyFilesByWorkName("work-a"))[dateJst], { "第一章/01.txt": 1 });
  assert.equal(context.values.get(keyEventsByWorkName("work-a")).length, 1);
  assert.equal(context.values.get("mojigoto.diff.m__work-a.total.all"), 10);
  const sharedMetrics = JSON.parse(await fs.readFile(path.join(metadata, "work-metrics.json"), "utf8"));
  assert.equal(sharedMetrics.progress.dailyRecords[dateJst].deltaTotal, 4);
  assert.deepEqual(sharedMetrics.progress.includedWebEventIds, ["web_test_1"]);
});
