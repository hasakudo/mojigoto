const fs = require("fs");
const path = require("path");

const SHARED_WORK_METRICS_FILE = "work-metrics.json";

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function scanJsonFiles(dirPath) {
  const snapshot = { count: 0, latestModifiedAt: "" };

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") {
        snapshot.count += 1;
        try {
          const modifiedAt = fs.statSync(fullPath).mtime.toISOString();
          if (!snapshot.latestModifiedAt || modifiedAt > snapshot.latestModifiedAt) {
            snapshot.latestModifiedAt = modifiedAt;
          }
        } catch {}
      }
    }
  }

  walk(dirPath);
  return snapshot;
}

function countJsonFiles(dirPath) {
  return scanJsonFiles(dirPath).count;
}

function countWorkNotes(mojigotoDir) {
  return countJsonFiles(path.join(mojigotoDir, "plots"))
    + countJsonFiles(path.join(mojigotoDir, "references"));
}

function scanWorkNotes(mojigotoDir) {
  const plots = scanJsonFiles(path.join(mojigotoDir, "plots"));
  const references = scanJsonFiles(path.join(mojigotoDir, "references"));
  return {
    count: plots.count + references.count,
    latestModifiedAt: [plots.latestModifiedAt, references.latestModifiedAt].filter(Boolean).sort().at(-1) || "",
  };
}

function hasSameMetricValues(previous, next) {
  const keys = [
    "schemaVersion", "totalChars", "noteCount", "countMode",
    "manuscriptUpdatedAt", "notesUpdatedAt",
  ];
  return keys.every((key) => String(previous?.[key] ?? "") === String(next?.[key] ?? ""))
    && JSON.stringify(previous?.progress || null) === JSON.stringify(next?.progress || null);
}

function normalizeProgressDailyRecords(records) {
  return Object.fromEntries(Object.entries(records && typeof records === "object" ? records : {})
    .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-400)
    .map(([date, row]) => [date, {
      deltaTotal: Number(row?.deltaTotal || 0),
      totalSaved: Number(row?.totalSaved || 0),
    }]));
}

function writeSharedWorkMetrics(settingsPath, {
  totalChars,
  countMode = "default",
  reason = "manuscript",
  now = new Date(),
  manuscriptUpdatedAt = "",
  dailyRecords = null,
  includedWebEventIds = null,
} = {}) {
  if (!settingsPath || !Number.isFinite(Number(totalChars))) return false;

  try {
    const mojigotoDir = path.dirname(settingsPath);
    fs.mkdirSync(mojigotoDir, { recursive: true });
    // Prepare a stable file that can be authorized before the first Web save.
    try {
      fs.writeFileSync(path.join(mojigotoDir, "web-writing-events.json"),
        JSON.stringify({ schemaVersion: 1, updatedAt: "", events: [] }, null, 2) + "\n",
        { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const filePath = path.join(mojigotoDir, SHARED_WORK_METRICS_FILE);
    const previous = readJsonSafe(filePath);
    const eventUpdatedAt = now.toISOString();
    const notes = scanWorkNotes(mojigotoDir);
    const nextManuscriptUpdatedAt = reason === "startup"
      ? String(manuscriptUpdatedAt || previous.manuscriptUpdatedAt || "")
      : reason === "manuscript" ? eventUpdatedAt : String(previous.manuscriptUpdatedAt || manuscriptUpdatedAt || "");
    const nextNotesUpdatedAt = reason === "startup"
      ? String(notes.latestModifiedAt || previous.notesUpdatedAt || "")
      : reason === "notes"
        ? String(notes.latestModifiedAt || eventUpdatedAt)
        : String(previous.notesUpdatedAt || notes.latestModifiedAt || "");
    const updatedAt = [nextManuscriptUpdatedAt, nextNotesUpdatedAt].filter(Boolean).sort().at(-1) || eventUpdatedAt;
    const next = {
      ...previous,
      schemaVersion: 1,
      totalChars: Number(totalChars),
      noteCount: notes.count,
      countMode: String(countMode || "default"),
      source: "vscode",
      updatedAt,
      manuscriptUpdatedAt: nextManuscriptUpdatedAt,
      notesUpdatedAt: nextNotesUpdatedAt,
    };
    if (dailyRecords && typeof dailyRecords === "object") {
      next.progress = {
        updatedAt: eventUpdatedAt,
        dailyRecords: normalizeProgressDailyRecords(dailyRecords),
        includedWebEventIds: [...new Set(Array.isArray(includedWebEventIds) ? includedWebEventIds.map(String) : [])].slice(-2000),
      };
    }
    if (hasSameMetricValues(previous, next)) return true;
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return true;
  } catch {
    // 集計共有の失敗で通常の保存処理を止めない。
    return false;
  }
}

module.exports = {
  SHARED_WORK_METRICS_FILE,
  countJsonFiles,
  countWorkNotes,
  scanWorkNotes,
  normalizeProgressDailyRecords,
  hasSameMetricValues,
  writeSharedWorkMetrics,
};
