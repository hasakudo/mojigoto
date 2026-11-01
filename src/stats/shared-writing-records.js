const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const { countLikeCountChars, getCountMode } = require("../core/text-count");
const { writeSharedWorkMetrics } = require("./shared-work-metrics");
const { listTextFiles, safeRead, detectChapter } = require("../core/manuscript-helpers");
const {
  getCurrentWorkSettingsPath,
  getCurrentWorkGoal,
  getWorkId,
  diffKeyForWork,
} = require("../work/work-settings");
const { keyDaily, keyFiles, keyEvents } = require("./stats-keys");
const { gsGet, gsSet, ensureDailyObj, ensureFilesObj, nowJstParts } = require("./stats-utils");

const FILE_NAME = "web-writing-events.json";

function processedKey(context) {
  return `mojigoto.stats.${getWorkId(context)}.webImportedEventIds`;
}

function getProcessedSharedWritingEventIds(context) {
  return gsGet(context, processedKey(context), []);
}

function readSharedEvents(context) {
  const settingsPath = getCurrentWorkSettingsPath(context);
  if (!settingsPath) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(path.dirname(settingsPath), FILE_NAME), "utf8"));
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function manuscriptSnapshot(root) {
  const files = listTextFiles(root);
  const chapterTotals = {};
  let total = 0;
  for (const file of files) {
    const count = countLikeCountChars(safeRead(file));
    total += count;
    const chapter = detectChapter(root, file) || "（章なし）";
    chapterTotals[chapter] = (chapterTotals[chapter] || 0) + count;
  }
  return { total, chapterTotals };
}

function validEvent(event) {
  return event && typeof event.id === "string" && /^web_/.test(event.id) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(event.dateJst || "")) &&
    typeof event.file === "string";
}

async function importSharedWritingRecords(context) {
  const root = String(vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") || "").trim();
  if (!root || !fs.existsSync(root)) return { imported: 0 };

  const already = new Set(gsGet(context, processedKey(context), []));
  const incoming = readSharedEvents(context).filter(validEvent).filter((event) => !already.has(event.id));
  if (!incoming.length) return { imported: 0 };

  const snapshot = manuscriptSnapshot(root);
  const daily = gsGet(context, keyDaily(context), {});
  const files = gsGet(context, keyFiles(context), {});
  const events = gsGet(context, keyEvents(context), []);
  const byDate = new Map();

  for (const event of incoming) {
    const list = byDate.get(event.dateJst) || [];
    list.push(event);
    byDate.set(event.dateJst, list);
    ensureFilesObj(files, event.dateJst)[event.file] = 1;
    const chapter = event.file.includes("/") ? event.file.split("/")[0] : "（章なし）";
    events.push({
      id: event.id,
      source: "web",
      savedAtJst: event.savedAtJst,
      dateJst: event.dateJst,
      file: event.file,
      chapter,
      deltaTotal: Number(event.delta) || 0,
      totalSaved: snapshot.total,
      deltaChap: Number(event.delta) || 0,
      chapTotalSaved: snapshot.chapterTotals[chapter] || 0,
      sent: false,
    });
  }

  const dates = [...byDate.keys()].sort();
  const today = nowJstParts().dateJst;
  for (const date of dates) {
    const dateEvents = byDate.get(date);
    const importedDelta = dateEvents.reduce((sum, event) => sum + (Number(event.delta) || 0), 0);
    const existed = Boolean(daily[date]);
    const row = ensureDailyObj(daily, date);
    if (date === today) {
      if (!existed) row.baselineTotal = snapshot.total - importedDelta;
      else if (typeof row.baselineTotal !== "number") row.baselineTotal = Number(row.totalSaved || 0) - Number(row.deltaTotal || 0);
      row.totalSaved = snapshot.total;
      row.deltaTotal = snapshot.total - Number(row.baselineTotal || 0);
      row.goal = getCurrentWorkGoal(context);
      row.pct = row.goal > 0 ? Math.max(0, Math.min(999, (snapshot.total / row.goal) * 100)) : 0;
    } else {
      row.deltaTotal += importedDelta;
      row.totalSaved += importedDelta;
    }
    row.updatedAtJst = dateEvents.at(-1).savedAtJst || row.updatedAtJst;
    const chapters = new Set(dateEvents.map((event) => event.file.includes("/") ? event.file.split("/")[0] : "（章なし）"));
    for (const chapter of chapters) {
      const delta = dateEvents.filter((event) => (event.file.includes("/") ? event.file.split("/")[0] : "（章なし）") === chapter)
        .reduce((sum, event) => sum + (Number(event.delta) || 0), 0);
      row.chapters[chapter] ||= { delta: 0, total: 0 };
      row.chapters[chapter].delta += delta;
      row.chapters[chapter].total = date === today
        ? snapshot.chapterTotals[chapter] || 0
        : Number(row.chapters[chapter].total || 0) + delta;
      await context.globalState.update(diffKeyForWork(context, "chap", chapter), snapshot.chapterTotals[chapter] || 0);
    }
  }

  await gsSet(context, keyDaily(context), daily);
  await gsSet(context, keyFiles(context), files);
  await gsSet(context, keyEvents(context), events);
  await context.globalState.update(diffKeyForWork(context, "total", "all"), snapshot.total);
  incoming.forEach((event) => already.add(event.id));
  await context.globalState.update(processedKey(context), [...already].slice(-2000));
  writeSharedWorkMetrics(getCurrentWorkSettingsPath(context), {
    totalChars: snapshot.total,
    countMode: getCountMode(),
    reason: "manuscript",
    dailyRecords: daily,
    includedWebEventIds: [...already],
  });
  return { imported: incoming.length };
}

function registerSharedWritingRecords(context, onImported = () => {}) {
  let running = false;
  let pending = false;
  const run = async () => {
    if (running) {
      pending = true;
      return { imported: 0 };
    }
    running = true;
    try {
      let total = 0;
      do {
        pending = false;
        const result = await importSharedWritingRecords(context);
        total += result.imported;
        if (result.imported > 0) await onImported(result);
      } while (pending);
      return { imported: total };
    } finally {
      running = false;
    }
  };
  const watcher = vscode.workspace.createFileSystemWatcher(`**/.mojigoto/${FILE_NAME}`);
  watcher.onDidCreate(run, null, context.subscriptions);
  watcher.onDidChange(run, null, context.subscriptions);
  context.subscriptions.push(watcher);
  return { run };
}

module.exports = {
  FILE_NAME,
  getProcessedSharedWritingEventIds,
  readSharedEvents,
  manuscriptSnapshot,
  importSharedWritingRecords,
  registerSharedWritingRecords,
};
