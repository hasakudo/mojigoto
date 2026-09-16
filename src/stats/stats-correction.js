const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const { countLikeCountChars } = require("../core/text-count");
const {
  listTextFiles,
  safeRead,
  detectChapter,
} = require("../core/manuscript-helpers");
const {
  getWorkName,
  getWorkId,
  getCurrentWorkGoal,
} = require("../work/work-settings");
const {
  nowJstParts,
  gsGet,
  gsSet,
  ensureDailyObj,
} = require("./stats-utils");
const {
  keyDailyByWorkName,
  keyFilesByWorkName,
  keyEventsByWorkName,
  keyEventsLastLoggedAtByWorkName,
  keyCorrectionBackupByWorkName,
} = require("./stats-keys");

function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function resolveEnvironment(context, options = {}) {
  const root = String(
    options.root ??
      vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") ??
      "",
  ).trim();
  const workName = String(options.workName || getWorkName(context) || "").trim();
  const workId = String(options.workId || getWorkId(context) || "").trim();
  const goal = Number(options.goal ?? getCurrentWorkGoal(context) ?? 0) || 0;

  if (!root || !fs.existsSync(root)) {
    throw new Error("原稿フォルダが見つかりません（mojigoto.manuscriptRoot）");
  }

  return { root, workName, workId, goal };
}

function getStatsKeys(workName) {
  return {
    daily: keyDailyByWorkName(workName),
    files: keyFilesByWorkName(workName),
    events: keyEventsByWorkName(workName),
    eventsLastLoggedAt: keyEventsLastLoggedAtByWorkName(workName),
    backup: keyCorrectionBackupByWorkName(workName),
  };
}

function getDiffPrefix(workId) {
  return `mojigoto.diff.${workId}.`;
}

async function scanCurrentManuscripts(root) {
  const files = listTextFiles(root);
  const chapters = {};
  let total = 0;

  for (const filePath of files) {
    const count = countLikeCountChars(safeRead(filePath));
    const chapter = detectChapter(root, filePath) || "（章なし）";
    total += count;
    chapters[chapter] = Number(chapters[chapter] || 0) + count;
  }

  return { total, chapters, fileCount: files.length };
}

function listGlobalStateKeys(context) {
  try {
    return typeof context.globalState.keys === "function"
      ? context.globalState.keys()
      : [];
  } catch {
    return [];
  }
}

async function saveCorrectionBackup(context, environment, action) {
  const keys = getStatsKeys(environment.workName);
  const diffPrefix = getDiffPrefix(environment.workId);
  const diffValues = {};

  for (const key of listGlobalStateKeys(context)) {
    if (key.startsWith(diffPrefix)) {
      diffValues[key] = cloneValue(gsGet(context, key, undefined));
    }
  }

  const backup = {
    version: 1,
    action: String(action || ""),
    createdAt: new Date().toISOString(),
    workName: environment.workName,
    workId: environment.workId,
    values: {
      [keys.daily]: cloneValue(gsGet(context, keys.daily, undefined)),
      [keys.files]: cloneValue(gsGet(context, keys.files, undefined)),
      [keys.events]: cloneValue(gsGet(context, keys.events, undefined)),
      [keys.eventsLastLoggedAt]: cloneValue(
        gsGet(context, keys.eventsLastLoggedAt, undefined),
      ),
      ...diffValues,
    },
  };

  await gsSet(context, keys.backup, backup);
  return backup;
}

async function replaceDiffBaselines(context, environment, scan) {
  const prefix = getDiffPrefix(environment.workId);
  const nextValues = {
    [`${prefix}total.all`]: scan.total,
  };

  for (const [chapter, total] of Object.entries(scan.chapters)) {
    nextValues[`${prefix}chap.${chapter}`] = total;
  }

  for (const key of listGlobalStateKeys(context)) {
    if (key.startsWith(prefix) && !(key in nextValues)) {
      await context.globalState.update(key, undefined);
    }
  }

  for (const [key, value] of Object.entries(nextValues)) {
    await context.globalState.update(key, value);
  }
}

function buildCurrentDailyRow(daily, dateJst, dateTimeJst, scan, goal, delta) {
  const row = ensureDailyObj(daily, dateJst);
  row.baselineTotal = scan.total - delta;
  row.deltaTotal = delta;
  row.totalSaved = scan.total;
  row.goal = goal;
  row.pct = goal > 0
    ? Math.max(0, Math.min(999, (scan.total / goal) * 100))
    : 0;
  row.updatedAtJst = dateTimeJst;
  row.chapters = Object.fromEntries(
    Object.entries(scan.chapters).map(([chapter, total]) => [
      chapter,
      { delta: 0, total },
    ]),
  );
  return row;
}

function isPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function removeMissingFileHistory(files, root) {
  const next = {};
  let removed = 0;

  for (const [date, entries] of Object.entries(files || {})) {
    const kept = {};
    for (const [relativePath, value] of Object.entries(entries || {})) {
      const absolutePath = path.resolve(root, relativePath);
      if (isPathInside(root, absolutePath) && fs.existsSync(absolutePath)) {
        kept[relativePath] = value;
      } else {
        removed += 1;
      }
    }
    if (Object.keys(kept).length) next[date] = kept;
  }

  return { files: next, removed };
}

async function getStatsCorrectionStatus(context, options = {}) {
  const environment = resolveEnvironment(context, options);
  const keys = getStatsKeys(environment.workName);
  const scan = await scanCurrentManuscripts(environment.root);
  const daily = gsGet(context, keys.daily, {});
  const dates = Object.keys(daily || {}).sort();
  const latest = dates.length ? daily[dates[dates.length - 1]] : null;
  const cleanup = removeMissingFileHistory(
    gsGet(context, keys.files, {}),
    environment.root,
  );

  return {
    ...environment,
    ...scan,
    recordedTotal: Number(latest?.totalSaved || 0),
    missingFileHistoryCount: cleanup.removed,
    hasBackup: Boolean(gsGet(context, keys.backup, null)),
  };
}

async function rebaseStatsToCurrentManuscripts(context, options = {}) {
  const environment = resolveEnvironment(context, options);
  const keys = getStatsKeys(environment.workName);
  const scan = await scanCurrentManuscripts(environment.root);
  const { dateJst, dateTimeJst } = nowJstParts(new Date());

  await saveCorrectionBackup(context, environment, "rebase");

  const daily = cloneValue(gsGet(context, keys.daily, {})) || {};
  buildCurrentDailyRow(daily, dateJst, dateTimeJst, scan, environment.goal, 0);
  await gsSet(context, keys.daily, daily);

  const cleanup = removeMissingFileHistory(
    cloneValue(gsGet(context, keys.files, {})) || {},
    environment.root,
  );
  await gsSet(context, keys.files, cleanup.files);
  await replaceDiffBaselines(context, environment, scan);

  return { ...scan, removedFileHistoryCount: cleanup.removed, dateJst };
}

async function correctTodayDelta(context, desiredDelta, options = {}) {
  const delta = Number(desiredDelta);
  if (!Number.isFinite(delta)) {
    throw new Error("今日の差分には数値を指定してください。");
  }

  const environment = resolveEnvironment(context, options);
  const keys = getStatsKeys(environment.workName);
  const scan = await scanCurrentManuscripts(environment.root);
  const { dateJst, dateTimeJst } = nowJstParts(new Date());

  await saveCorrectionBackup(context, environment, "correctTodayDelta");

  const daily = cloneValue(gsGet(context, keys.daily, {})) || {};
  buildCurrentDailyRow(
    daily,
    dateJst,
    dateTimeJst,
    scan,
    environment.goal,
    Math.trunc(delta),
  );
  await gsSet(context, keys.daily, daily);
  await replaceDiffBaselines(context, environment, scan);

  return {
    ...scan,
    delta: Math.trunc(delta),
    baselineTotal: scan.total - Math.trunc(delta),
    dateJst,
  };
}

async function resetStatsRecords(context, scope = "today", options = {}) {
  const normalizedScope = scope === "all" ? "all" : "today";
  const environment = resolveEnvironment(context, options);
  const keys = getStatsKeys(environment.workName);
  const scan = await scanCurrentManuscripts(environment.root);
  const { dateJst, dateTimeJst } = nowJstParts(new Date());

  await saveCorrectionBackup(context, environment, `reset:${normalizedScope}`);

  let daily = cloneValue(gsGet(context, keys.daily, {})) || {};
  let files = cloneValue(gsGet(context, keys.files, {})) || {};
  let events = cloneValue(gsGet(context, keys.events, [])) || [];

  if (normalizedScope === "all") {
    daily = {};
    files = {};
    events = [];
  } else {
    delete daily[dateJst];
    delete files[dateJst];
    events = events.filter((event) => String(event?.dateJst || "") !== dateJst);
  }

  buildCurrentDailyRow(daily, dateJst, dateTimeJst, scan, environment.goal, 0);

  await gsSet(context, keys.daily, daily);
  await gsSet(context, keys.files, files);
  await gsSet(context, keys.events, events);
  await gsSet(context, keys.eventsLastLoggedAt, 0);
  await replaceDiffBaselines(context, environment, scan);

  return { ...scan, scope: normalizedScope, dateJst };
}

async function undoLastStatsCorrection(context, options = {}) {
  const environment = resolveEnvironment(context, options);
  const keys = getStatsKeys(environment.workName);
  const backup = gsGet(context, keys.backup, null);

  if (!backup || backup.workId !== environment.workId) {
    throw new Error("元に戻せる補正記録がありません。");
  }

  const diffPrefix = getDiffPrefix(environment.workId);
  const backupValues = backup.values || {};

  for (const key of listGlobalStateKeys(context)) {
    if (key.startsWith(diffPrefix) && !(key in backupValues)) {
      await context.globalState.update(key, undefined);
    }
  }

  for (const [key, value] of Object.entries(backupValues)) {
    await context.globalState.update(key, cloneValue(value));
  }

  await context.globalState.update(keys.backup, undefined);
  return { action: String(backup.action || ""), restoredAt: backup.createdAt || "" };
}

module.exports = {
  getStatsCorrectionStatus,
  rebaseStatsToCurrentManuscripts,
  correctTodayDelta,
  resetStatsRecords,
  undoLastStatsCorrection,
  scanCurrentManuscripts,
  removeMissingFileHistory,
};
