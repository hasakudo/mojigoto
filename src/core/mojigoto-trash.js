const fs = require("fs/promises");
const path = require("path");
const { isSingleMode } = require("./mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("./mojigoto-paths");

const TRASH_DIR_NAME = "trash";
const META_SUFFIX = ".mojigoto-trash.json";

function getTimestamp() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function getTrashDirForSingle() {
  const mojigotoDir = getMojigotoDirForSingle();
  return mojigotoDir ? path.join(mojigotoDir, TRASH_DIR_NAME) : "";
}

function getTrashDirForWork(workDir) {
  const mojigotoDir = getMojigotoDirForWork(workDir);
  return mojigotoDir ? path.join(mojigotoDir, TRASH_DIR_NAME) : "";
}

function normalizePathForCompare(targetPath) {
  return path.normalize(targetPath || "");
}

function getShortOriginalLocation(originalPath, workDir = "") {
  const normalizedOriginalPath = normalizePathForCompare(originalPath);
  const normalizedWorkDir = normalizePathForCompare(workDir);

  if (!normalizedOriginalPath) {
    return "";
  }

  const plotDir = normalizedWorkDir
    ? normalizePathForCompare(path.join(normalizedWorkDir, ".mojigoto", "plots"))
    : "";
  const referenceDir = normalizedWorkDir
    ? normalizePathForCompare(
        path.join(normalizedWorkDir, ".mojigoto", "references"),
      )
    : "";
  const manuscriptDir = normalizedWorkDir
    ? normalizePathForCompare(path.join(normalizedWorkDir, "manuscript"))
    : "";

  if (plotDir && normalizedOriginalPath.startsWith(`${plotDir}${path.sep}`)) {
    return "プロット";
  }

  if (
    referenceDir &&
    normalizedOriginalPath.startsWith(`${referenceDir}${path.sep}`)
  ) {
    return "資料";
  }

  if (manuscriptDir) {
    if (normalizedOriginalPath === manuscriptDir) {
      return "原稿";
    }

    if (normalizedOriginalPath.startsWith(`${manuscriptDir}${path.sep}`)) {
      const relativePath = path.relative(manuscriptDir, normalizedOriginalPath);
      const segments = relativePath.split(path.sep).filter(Boolean);

      if (segments.length <= 1) {
        return "原稿";
      }

      segments.pop();
      return `原稿 / ${segments.join(" / ")}`;
    }
  }

  return path.basename(path.dirname(originalPath)) || "元の場所";
}

function formatTrashedAtForTooltip(trashedAt) {
  if (!trashedAt) {
    return "";
  }

  try {
    return new Date(trashedAt).toLocaleString("ja-JP");
  } catch {
    return String(trashedAt);
  }
}

async function resolveTrashDirFromItem(targetPath, item = null) {
  if (item?.workDir) {
    const workTrashDir = getTrashDirForWork(item.workDir);
    if (workTrashDir) {
      return workTrashDir;
    }
  }

  if (isSingleMode()) {
    const singleTrashDir = getTrashDirForSingle();
    if (singleTrashDir) {
      return singleTrashDir;
    }
  }

  const startPath = item?.fsPath || targetPath;
  if (!startPath) {
    return "";
  }

  let cursor = path.dirname(startPath);
  const parsed = path.parse(cursor);

  while (true) {
    const candidate = path.join(cursor, ".mojigoto");
    if (await pathExists(candidate)) {
      return path.join(candidate, TRASH_DIR_NAME);
    }

    if (cursor === parsed.root) break;
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }

  return "";
}

function makeTrashStoredName(baseName) {
  return `${getTimestamp()}__${baseName}`;
}

function getMetaPathForTrashItem(trashItemPath) {
  return `${trashItemPath}${META_SUFFIX}`;
}

async function ensureUniquePath(destPath) {
  if (!(await pathExists(destPath))) {
    return destPath;
  }

  const parsed = path.parse(destPath);

  for (let i = 1; i <= 999; i += 1) {
    const suffix = String(i).padStart(3, "0");
    const candidate = path.join(
      parsed.dir,
      parsed.ext
        ? `${parsed.name}__${suffix}${parsed.ext}`
        : `${parsed.base}__${suffix}`,
    );

    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error("保存先のファイル名を確保できませんでした。");
}

async function moveToTrash(targetPath, item = null) {
  if (!targetPath) {
    throw new Error("移動対象のパスがありません。");
  }

  const stat = await fs.stat(targetPath);
  const trashDir = await resolveTrashDirFromItem(targetPath, item);

  if (!trashDir) {
    throw new Error("ゴミ箱フォルダを解決できませんでした。");
  }

  await ensureDir(trashDir);

  const baseName = path.basename(targetPath);
  const storedName = makeTrashStoredName(baseName);
  const destinationPath = await ensureUniquePath(
    path.join(trashDir, storedName),
  );
  const metaPath = getMetaPathForTrashItem(destinationPath);

  await fs.rename(targetPath, destinationPath);

  const payload = {
    schemaVersion: 1,
    itemType: stat.isDirectory() ? "directory" : "file",
    originalPath: targetPath,
    originalBaseName: baseName,
    trashedAt: new Date().toISOString(),
    storedName: path.basename(destinationPath),
    workDir: item?.workDir || "",
    workName: item?.workName || "",
  };

  await fs.writeFile(metaPath, JSON.stringify(payload, null, 2), "utf8");

  return {
    destinationPath,
    metaPath,
    itemName: baseName,
    trashDir,
  };
}

async function listTrashEntries(trashRootItem) {
  const trashDir = trashRootItem?.fsPath || "";
  if (!trashDir || !(await pathExists(trashDir))) {
    return [];
  }

  const entries = await fs.readdir(trashDir, { withFileTypes: true });
  const visibleEntries = entries.filter(
    (entry) => !entry.name.endsWith(META_SUFFIX),
  );

  const result = [];

  for (const entry of visibleEntries) {
    const itemPath = path.join(trashDir, entry.name);
    const metaPath = getMetaPathForTrashItem(itemPath);

    let meta = null;
    try {
      if (await pathExists(metaPath)) {
        meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
      }
    } catch {
      meta = null;
    }

    const resolvedWorkDir = meta?.workDir || trashRootItem.workDir || "";
    const shortLocation = getShortOriginalLocation(
      meta?.originalPath || "",
      resolvedWorkDir,
    );

    const trashedAtText = formatTrashedAtForTooltip(meta?.trashedAt || "");

    result.push({
      label: meta?.originalBaseName || entry.name.replace(/^\d{8}-\d{6}__/, ""),
      fsPath: itemPath,
      metaPath,
      itemType: entry.isDirectory() ? "directory" : "file",
      originalPath: meta?.originalPath || "",
      trashedAt: meta?.trashedAt || "",
      workName: meta?.workName || trashRootItem.workName || "",
      workDir: resolvedWorkDir,
      description: shortLocation,
      tooltip:
        [
          shortLocation ? `元の場所: ${shortLocation}` : "",
          trashedAtText ? `削除日時: ${trashedAtText}` : "",
        ]
          .filter(Boolean)
          .join("\n") || itemPath,
    });
  }

  result.sort((a, b) =>
    String(b.trashedAt || "").localeCompare(String(a.trashedAt || ""), "ja"),
  );

  return result;
}

async function restoreTrashItem(trashItem) {
  if (!trashItem?.fsPath) {
    throw new Error("復元対象のゴミ箱項目を取得できませんでした。");
  }

  const trashPath = trashItem.fsPath;
  const metaPath = trashItem.metaPath || getMetaPathForTrashItem(trashPath);

  if (!(await pathExists(trashPath))) {
    throw new Error("ゴミ箱内の対象が見つかりません。");
  }

  if (!(await pathExists(metaPath))) {
    throw new Error("復元用のメタ情報が見つかりません。");
  }

  const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
  const originalPath = String(meta.originalPath || "").trim();

  if (!originalPath) {
    throw new Error("元の場所を特定できません。");
  }

  await ensureDir(path.dirname(originalPath));

  const restorePath = await ensureUniquePath(originalPath);

  await fs.rename(trashPath, restorePath);
  await fs.rm(metaPath, { force: true });

  return {
    restoredPath: restorePath,
    originalPath,
  };
}

module.exports = {
  getTrashDirForSingle,
  getTrashDirForWork,
  moveToTrash,
  listTrashEntries,
  restoreTrashItem,
};
