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
} = require("./writing-memo-resolver");

function findManuscriptRootFromPath(filePath) {
  let current = path.dirname(String(filePath || ""));

  while (current && current !== path.dirname(current)) {
    const base = path.basename(current).toLowerCase();
    if (base === "manuscript" || base === "原稿") {
      return current;
    }
    current = path.dirname(current);
  }

  return "";
}

async function updateWritingMemoFilePathForRenameOrMove(
  item,
  oldPath,
  newPath,
) {
  const writingMemoFilePath = resolveWritingMemoStorePathFromTreeItem(item);
  if (!writingMemoFilePath) return false;

  const manuscriptRoot = findManuscriptRootFromPath(oldPath);
  if (!manuscriptRoot) return false;

  const oldRel = toMemoRelativePath(manuscriptRoot, oldPath);
  const newRel = toMemoRelativePath(manuscriptRoot, newPath);

  if (!oldRel || !newRel || oldRel === newRel) return false;

  const data = await readWritingMemos(writingMemoFilePath);
  const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

  let changed = false;

  const nextMemos = memos.map((memo) => {
    if (String(memo?.filePath || "") !== oldRel) {
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

  const manuscriptRoot = findManuscriptRootFromPath(oldFolderPath);
  if (!manuscriptRoot) return false;

  const oldRelPrefix = toMemoRelativePath(manuscriptRoot, oldFolderPath);
  const newRelPrefix = toMemoRelativePath(manuscriptRoot, newFolderPath);

  if (!oldRelPrefix || !newRelPrefix || oldRelPrefix === newRelPrefix) {
    return false;
  }

  const oldPrefix = `${oldRelPrefix}/`;

  const data = await readWritingMemos(writingMemoFilePath);
  const memos = Array.isArray(data?.memos) ? [...data.memos] : [];

  let changed = false;

  const nextMemos = memos.map((memo) => {
    const currentPath = String(memo?.filePath || "");
    if (!currentPath || !currentPath.startsWith(oldPrefix)) {
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

        if (currentPath === oldRel) {
          changed = true;
          return {
            ...memo,
            filePath: newRel,
            fileName: path.basename(newRel),
            updatedAt: new Date().toISOString(),
          };
        }

        if (currentPath.startsWith(`${oldRel}/`)) {
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

module.exports = {
  findManuscriptRootFromPath,
  updateWritingMemoFilePathForRenameOrMove,
  updateWritingMemoPathsForFolderRename,
  updateWritingMemoPathsForRenameEvent,
};
