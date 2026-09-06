const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DISPLAY_NAMES_FILE = "manuscript-display-names.json";

function getDisplayNamesFilePath(manuscriptRoot) {
  const rawRoot = String(manuscriptRoot || "").trim();
  if (!rawRoot) return "";
  const root = path.resolve(rawRoot);
  return path.join(path.dirname(root), ".mojigoto", DISPLAY_NAMES_FILE);
}

function normalizeStorageKey(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/g, "")
    .trim();
}

function toStorageKey(manuscriptRoot, targetPath) {
  const rawRoot = String(manuscriptRoot || "").trim();
  const rawTarget = String(targetPath || "").trim();
  if (!rawRoot || !rawTarget) return "";
  const root = path.resolve(rawRoot);
  const target = path.resolve(rawTarget);

  const relative = path.relative(root, target);
  if (!relative || relative === ".") return "";
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return "";
  }
  return normalizeStorageKey(relative);
}

function normalizeDisplayNamesData(value) {
  const source = value && typeof value === "object" ? value.labels : null;
  const labels = {};

  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const [rawKey, rawLabel] of Object.entries(source)) {
      const key = normalizeStorageKey(rawKey);
      const label = String(rawLabel || "").trim();
      if (key && label) labels[key] = label;
    }
  }

  return { version: 1, labels };
}

function readDisplayNamesSync(manuscriptRoot) {
  const filePath = getDisplayNamesFilePath(manuscriptRoot);
  if (!filePath || !fs.existsSync(filePath)) {
    return { version: 1, labels: {} };
  }

  try {
    return normalizeDisplayNamesData(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
  } catch {
    return { version: 1, labels: {} };
  }
}

async function readDisplayNames(manuscriptRoot) {
  const filePath = getDisplayNamesFilePath(manuscriptRoot);
  if (!filePath) return { version: 1, labels: {} };

  try {
    return normalizeDisplayNamesData(
      JSON.parse(await fsp.readFile(filePath, "utf8")),
    );
  } catch {
    return { version: 1, labels: {} };
  }
}

async function writeDisplayNames(manuscriptRoot, value) {
  const filePath = getDisplayNamesFilePath(manuscriptRoot);
  if (!filePath) throw new Error("表示名の保存先を特定できませんでした。");

  const normalized = normalizeDisplayNamesData(value);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    labels: normalized.labels,
  };

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function getDisplayNameFromData(data, manuscriptRoot, targetPath) {
  const key = toStorageKey(manuscriptRoot, targetPath);
  return key ? String(data?.labels?.[key] || "").trim() : "";
}

function getDisplayNameSync(manuscriptRoot, targetPath) {
  return getDisplayNameFromData(
    readDisplayNamesSync(manuscriptRoot),
    manuscriptRoot,
    targetPath,
  );
}

function getDisplayPathLabelFromData(
  data,
  manuscriptRoot,
  targetPath,
  options = {},
) {
  const rawRoot = String(manuscriptRoot || "").trim();
  const rawTarget = String(targetPath || "").trim();
  const rawRelativeTo = String(options.relativeTo || rawRoot).trim();
  if (!rawRoot || !rawTarget || !rawRelativeTo) return "";

  const root = path.resolve(rawRoot);
  const target = path.resolve(rawTarget);
  const relativeTo = path.resolve(rawRelativeTo);
  const relative = path.relative(relativeTo, target);
  if (
    !relative ||
    relative === "." ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return "";
  }

  const separator = String(options.separator || " / ");
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = relativeTo;
  const labels = parts.map((part) => {
    cursor = path.join(cursor, part);
    return getDisplayNameFromData(data, root, cursor) || part;
  });
  return labels.join(separator);
}

function getDisplayPathLabelSync(manuscriptRoot, targetPath, options = {}) {
  return getDisplayPathLabelFromData(
    readDisplayNamesSync(manuscriptRoot),
    manuscriptRoot,
    targetPath,
    options,
  );
}

function removeKeyForPath(labels, manuscriptRoot, targetPath) {
  const key = toStorageKey(manuscriptRoot, targetPath);
  if (!key) return;
  delete labels[key];
}

function migratePathKeys(labels, manuscriptRoot, moves) {
  const snapshot = { ...labels };
  const normalizedMoves = (Array.isArray(moves) ? moves : [])
    .map((move) => ({
      from: toStorageKey(manuscriptRoot, move?.from),
      to: toStorageKey(manuscriptRoot, move?.to),
    }))
    .filter((move) => move.from && move.to && move.from !== move.to)
    .sort((a, b) => b.from.length - a.from.length);

  for (const move of normalizedMoves) {
    for (const [storedKey, label] of Object.entries(snapshot)) {
      if (storedKey !== move.from && !storedKey.startsWith(`${move.from}/`)) {
        continue;
      }
      delete labels[storedKey];
      const suffix = storedKey.slice(move.from.length);
      labels[`${move.to}${suffix}`] = label;
    }
  }
}

async function saveDisplayNameChanges(
  manuscriptRoot,
  entries,
  options = {},
) {
  const data = await readDisplayNames(manuscriptRoot);
  const labels = { ...data.labels };

  migratePathKeys(labels, manuscriptRoot, options.moves);

  for (const entry of Array.isArray(entries) ? entries : []) {
    const targetPath = String(entry?.path || "").trim();
    const key = toStorageKey(manuscriptRoot, targetPath);
    if (!key) continue;

    removeKeyForPath(labels, manuscriptRoot, targetPath);

    const displayName = String(entry?.displayName || "").trim();
    if (displayName) labels[key] = displayName;
  }

  return writeDisplayNames(manuscriptRoot, { labels });
}

module.exports = {
  DISPLAY_NAMES_FILE,
  getDisplayNamesFilePath,
  normalizeStorageKey,
  toStorageKey,
  normalizeDisplayNamesData,
  readDisplayNamesSync,
  readDisplayNames,
  writeDisplayNames,
  getDisplayNameFromData,
  getDisplayNameSync,
  getDisplayPathLabelFromData,
  getDisplayPathLabelSync,
  migratePathKeys,
  saveDisplayNameChanges,
};
