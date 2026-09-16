const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (_key, fallback) => fallback,
        }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  rebaseStatsToCurrentManuscripts,
  correctTodayDelta,
  resetStatsRecords,
  undoLastStatsCorrection,
} = require("../src/stats/stats-correction");
const { nowJstParts } = require("../src/stats/stats-utils");
const {
  keyDailyByWorkName,
  keyFilesByWorkName,
  keyEventsByWorkName,
} = require("../src/stats/stats-keys");
Module._load = originalLoad;

function createContext(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    globalState: {
      get(key, fallback) {
        return values.has(key) ? values.get(key) : fallback;
      },
      async update(key, value) {
        if (value === undefined) values.delete(key);
        else values.set(key, value);
      },
      keys() {
        return [...values.keys()];
      },
    },
  };
}

test("執筆記録を現在の原稿へ再基準化し、差分補正を元に戻せる", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-stats-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, "第一章"), { recursive: true });
  await fs.writeFile(path.join(root, "第一章", "a.txt"), "あいうえお", "utf8");
  await fs.writeFile(path.join(root, "root.md"), "かきく", "utf8");

  const workName = "work-a";
  const workId = "m__work-a";
  const dailyKey = keyDailyByWorkName(workName);
  const filesKey = keyFilesByWorkName(workName);
  const eventsKey = keyEventsByWorkName(workName);
  const { dateJst } = nowJstParts(new Date());
  const context = createContext({
    [dailyKey]: {
      [dateJst]: { deltaTotal: 500, totalSaved: 500, chapters: {} },
    },
    [filesKey]: {
      [dateJst]: { "missing.txt": 1, "第一章/a.txt": 1 },
    },
    [eventsKey]: [{ dateJst, file: "missing.txt" }],
    [`mojigoto.diff.${workId}.total.all`]: 500,
    [`mojigoto.diff.${workId}.chap.旧章`]: 500,
  });
  const options = { root, workName, workId, goal: 100 };

  const rebased = await rebaseStatsToCurrentManuscripts(context, options);
  assert.equal(rebased.total, 8);
  assert.equal(rebased.removedFileHistoryCount, 1);
  assert.equal(context.values.get(dailyKey)[dateJst].deltaTotal, 0);
  assert.equal(context.values.get(dailyKey)[dateJst].baselineTotal, 8);
  assert.deepEqual(Object.keys(context.values.get(filesKey)[dateJst]), ["第一章/a.txt"]);
  assert.equal(context.values.get(`mojigoto.diff.${workId}.total.all`), 8);
  assert.equal(context.values.has(`mojigoto.diff.${workId}.chap.旧章`), false);

  const corrected = await correctTodayDelta(context, 3, options);
  assert.equal(corrected.delta, 3);
  assert.equal(context.values.get(dailyKey)[dateJst].baselineTotal, 5);
  assert.equal(context.values.get(dailyKey)[dateJst].totalSaved, 8);

  await undoLastStatsCorrection(context, options);
  assert.equal(context.values.get(dailyKey)[dateJst].deltaTotal, 0);
  assert.equal(context.values.get(dailyKey)[dateJst].baselineTotal, 8);
});

test("全期間の執筆記録リセット後も現在総文字数を基準として残す", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-stats-reset-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "novel.txt"), "123456", "utf8");

  const workName = "work-b";
  const workId = "m__work-b";
  const dailyKey = keyDailyByWorkName(workName);
  const filesKey = keyFilesByWorkName(workName);
  const eventsKey = keyEventsByWorkName(workName);
  const context = createContext({
    [dailyKey]: { "2026-01-01": { deltaTotal: 10, totalSaved: 10 } },
    [filesKey]: { "2026-01-01": { "old.txt": 1 } },
    [eventsKey]: [{ dateJst: "2026-01-01" }],
  });

  const result = await resetStatsRecords(context, "all", {
    root,
    workName,
    workId,
    goal: 0,
  });

  assert.equal(result.total, 6);
  assert.deepEqual(context.values.get(filesKey), {});
  assert.deepEqual(context.values.get(eventsKey), []);
  assert.equal(Object.keys(context.values.get(dailyKey)).length, 1);
  assert.equal(context.values.get(dailyKey)[result.dateJst].totalSaved, 6);
  assert.equal(context.values.get(dailyKey)[result.dateJst].deltaTotal, 0);
});
