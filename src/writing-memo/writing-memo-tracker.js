const path = require("path");
const vscode = require("vscode");
const { isSingleMode } = require("../core/mojigoto-context");
const {
  listWorkDirectories,
  getWorkManuscriptRoot,
} = require("../core/mojigoto-paths");
const { readWritingMemos, writeWritingMemos } = require("./writing-memo-store");
const {
  normalizeFsPath,
  isSameOrChildPath,
  toMemoRelativePath,
  getConfiguredManuscriptRoot,
  resolveWritingMemoStorePathForManuscriptRoot,
  resolveWritingMemoStorePathFromTreeItem,
  resolveWritingMemoAbsolutePathFlexible,
} = require("./writing-memo-resolver");

const reconciliationTasks = new Map();

function normalizeComparablePath(value) {
  const normalized = normalizeFsPath(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSameAbsolutePath(left, right) {
  const a = normalizeComparablePath(left);
  const b = normalizeComparablePath(right);
  return Boolean(a && b && a === b);
}

function normalizeMemoPath(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSameMemoPath(left, right) {
  const a = normalizeMemoPath(left);
  const b = normalizeMemoPath(right);
  return Boolean(a && b && a === b);
}

function findManuscriptRootFromPath(filePath) {
  let current = path.dirname(String(filePath || ""));

  let outermostMatch = "";

  while (current && current !== path.dirname(current)) {
    const base = path.basename(current).toLowerCase();
    if (base === "manuscript" || base === "原稿") {
      // manuscript/原稿 のように候補名が入れ子になっていても、
      // 内側の章フォルダではなく外側の作品原稿ルートを採用する。
      outermostMatch = current;
    }
    current = path.dirname(current);
  }

  return outermostMatch;
}

function resolveManuscriptRootForTreeItem(item, ...targetPaths) {
  const candidates = [];
  let cursor = item || null;

  while (cursor) {
    if (cursor.kind === "manuscriptRoot" && cursor.fsPath) {
      candidates.push(cursor.fsPath);
    }
    cursor = cursor.parent || null;
  }

  const configuredRoot = getConfiguredManuscriptRoot();
  if (configuredRoot) {
    candidates.push(configuredRoot);
  }

  if (item?.workDir) {
    const workRoot = getWorkManuscriptRoot(item.workDir);
    if (workRoot) {
      candidates.push(workRoot);
    }
  }

  for (const targetPath of targetPaths) {
    const inferredRoot = findManuscriptRootFromPath(targetPath);
    if (inferredRoot) {
      candidates.push(inferredRoot);
    }
  }

  const uniqueCandidates = [
    ...new Set(candidates.map((root) => normalizeFsPath(root)).filter(Boolean)),
  ];

  return (
    uniqueCandidates.find((root) =>
      targetPaths.some((targetPath) => isSameOrChildPath(targetPath, root)),
    ) || ""
  );
}

async function updateWritingMemoFilePathForRenameOrMove(
  item,
  oldPath,
  newPath,
) {
  const writingMemoFilePath = resolveWritingMemoStorePathFromTreeItem(item);
  if (!writingMemoFilePath) return false;

  const manuscriptRoot = resolveManuscriptRootForTreeItem(
    item,
    oldPath,
    newPath,
  );
  if (!manuscriptRoot) return false;

  const oldRel = toMemoRelativePath(manuscriptRoot, oldPath);
  const newRel = toMemoRelativePath(manuscriptRoot, newPath);

  if (!oldRel || !newRel || oldRel === newRel) return false;

  const data = await readWritingMemos(writingMemoFilePath);
  const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

  let changed = false;

  const nextMemos = memos.map((memo) => {
    if (!isSameMemoPath(memo?.filePath, oldRel)) {
      return memo;
    }

    changed = true;
    return {
      ...memo,
      filePath: newRel,
      fileName: path.basename(newRel),
      updatedAt: new Date().toISOString(),
    };
  });

  if (!changed) return false;

  await writeWritingMemos(writingMemoFilePath, {
    ...data,
    memos: nextMemos,
  });

  return true;
}

async function updateWritingMemoPathsForFolderRename(
  item,
  oldFolderPath,
  newFolderPath,
) {
  const writingMemoFilePath = resolveWritingMemoStorePathFromTreeItem(item);
  if (!writingMemoFilePath) return false;

  const manuscriptRoot = resolveManuscriptRootForTreeItem(
    item,
    oldFolderPath,
    newFolderPath,
  );
  if (!manuscriptRoot) return false;

  const oldRelPrefix = toMemoRelativePath(manuscriptRoot, oldFolderPath);
  const newRelPrefix = toMemoRelativePath(manuscriptRoot, newFolderPath);

  if (!oldRelPrefix || !newRelPrefix || oldRelPrefix === newRelPrefix) {
    return false;
  }

  const oldPrefix = `${normalizeMemoPath(oldRelPrefix)}/`;

  const data = await readWritingMemos(writingMemoFilePath);
  const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

  let changed = false;

  const nextMemos = memos.map((memo) => {
    const currentPath = String(memo?.filePath || "").replace(/\\/g, "/");
    if (!currentPath || !normalizeMemoPath(currentPath).startsWith(oldPrefix)) {
      return memo;
    }

    const nextPath = `${newRelPrefix}/${currentPath.slice(oldPrefix.length)}`;

    changed = true;
    return {
      ...memo,
      filePath: nextPath,
      fileName: path.basename(nextPath),
      updatedAt: new Date().toISOString(),
    };
  });

  if (!changed) return false;

  await writeWritingMemos(writingMemoFilePath, {
    ...data,
    memos: nextMemos,
  });

  return true;
}

function collectCandidateManuscriptRoots() {
  const roots = [];
  const configuredRoot = getConfiguredManuscriptRoot();

  if (configuredRoot) {
    roots.push(configuredRoot);
  }

  if (!isSingleMode()) {
    for (const work of listWorkDirectories()) {
      if (!work?.fsPath) continue;
      const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
      if (manuscriptRoot) {
        roots.push(manuscriptRoot);
      }
    }
  }

  return [
    ...new Set(roots.map((root) => normalizeFsPath(root)).filter(Boolean)),
  ];
}

async function updateWritingMemoPathsForRenameEvent(context, event) {
  if (!event?.files?.length) return false;

  let changedAny = false;
  const candidateRoots = collectCandidateManuscriptRoots();

  for (const file of event.files) {
    const oldPath = file?.oldUri?.fsPath || "";
    const newPath = file?.newUri?.fsPath || "";
    if (!oldPath || !newPath) continue;

    for (const normalizedRoot of candidateRoots) {
      const oldUnderRoot = isSameOrChildPath(oldPath, normalizedRoot);
      const newUnderRoot = isSameOrChildPath(newPath, normalizedRoot);

      if (!oldUnderRoot && !newUnderRoot) {
        continue;
      }

      const writingMemoFilePath = resolveWritingMemoStorePathForManuscriptRoot(
        context,
        normalizedRoot,
      );
      if (!writingMemoFilePath) {
        continue;
      }

      const data = await readWritingMemos(writingMemoFilePath);
      const memos = Array.isArray(data?.memos) ? [...data.memos] : [];
      if (!memos.length) {
        continue;
      }

      const oldRel = oldUnderRoot
        ? toMemoRelativePath(normalizedRoot, oldPath)
        : "";
      const newRel = newUnderRoot
        ? toMemoRelativePath(normalizedRoot, newPath)
        : "";

      if (!oldRel || !newRel) {
        continue;
      }

      let changed = false;

      const nextMemos = memos.map((memo) => {
        const currentPath = String(memo?.filePath || "");
        if (!currentPath) return memo;

        if (isSameMemoPath(currentPath, oldRel)) {
          changed = true;
          return {
            ...memo,
            filePath: newRel,
            fileName: path.basename(newRel),
            updatedAt: new Date().toISOString(),
          };
        }

        const normalizedCurrentPath = normalizeMemoPath(currentPath);
        const normalizedOldPrefix = `${normalizeMemoPath(oldRel)}/`;
        if (normalizedCurrentPath.startsWith(normalizedOldPrefix)) {
          const nextPath = `${newRel}/${currentPath.slice(oldRel.length + 1)}`;
          changed = true;
          return {
            ...memo,
            filePath: nextPath,
            fileName: path.basename(nextPath),
            updatedAt: new Date().toISOString(),
          };
        }

        return memo;
      });

      if (!changed) {
        continue;
      }

      await writeWritingMemos(writingMemoFilePath, {
        ...data,
        memos: nextMemos,
      });

      changedAny = true;
    }
  }

  return changedAny;
}

async function reconcileWritingMemoPathsForTarget(context, target = {}) {
  const writingMemoFilePath = String(target?.writingMemoFilePath || "").trim();
  const relativeFilePath = String(target?.relativeFilePath || "").trim();
  const absoluteFilePath = String(target?.absoluteFilePath || "").trim();

  if (!writingMemoFilePath || !relativeFilePath || !absoluteFilePath) {
    return false;
  }

  const taskKey = normalizeComparablePath(writingMemoFilePath);
  const previous = reconciliationTasks.get(taskKey) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      const data = await readWritingMemos(writingMemoFilePath);
      const memos = Array.isArray(data?.memos) ? data.memos : [];
      let changed = false;

      const nextMemos = memos.map((memo) => {
        const currentPath = String(memo?.filePath || "").trim();
        if (!currentPath || isSameMemoPath(currentPath, relativeFilePath)) {
          return memo;
        }

        const resolvedPath = resolveWritingMemoAbsolutePathFlexible(
          context,
          currentPath,
          {
            writingMemoFilePath,
            excerpt: memo?.excerpt || "",
            targetLocation: memo?.targetLocation || "",
          },
        );

        if (!isSameAbsolutePath(resolvedPath, absoluteFilePath)) {
          return memo;
        }

        changed = true;
        return {
          ...memo,
          filePath: relativeFilePath.replace(/\\/g, "/"),
          fileName: path.basename(relativeFilePath),
          updatedAt: new Date().toISOString(),
        };
      });

      if (!changed) return false;

      await writeWritingMemos(writingMemoFilePath, {
        ...data,
        memos: nextMemos,
      });
      return true;
    });

  reconciliationTasks.set(taskKey, task);

  try {
    return await task;
  } finally {
    if (reconciliationTasks.get(taskKey) === task) {
      reconciliationTasks.delete(taskKey);
    }
  }
}

module.exports = {
  findManuscriptRootFromPath,
  resolveManuscriptRootForTreeItem,
  updateWritingMemoFilePathForRenameOrMove,
  updateWritingMemoPathsForFolderRename,
  updateWritingMemoPathsForRenameEvent,
  reconcileWritingMemoPathsForTarget,
};
