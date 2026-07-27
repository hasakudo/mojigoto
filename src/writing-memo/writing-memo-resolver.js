const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { isSingleMode } = require("../core/mojigoto-context");
const {
  listWorkDirectories,
  getWorkManuscriptRoot,
  getWritingMemosPathForWork,
  getWritingMemosPathForSingle,
} = require("../core/mojigoto-paths");

function normalizeFsPath(fsPath) {
  return path.normalize(String(fsPath || ""));
}

function isSameOrChildPath(targetPath, basePath) {
  const normalizedTarget = normalizeFsPath(targetPath);
  const normalizedBase = normalizeFsPath(basePath);

  if (!normalizedTarget || !normalizedBase) {
    return false;
  }

  return (
    normalizedTarget === normalizedBase ||
    normalizedTarget.startsWith(`${normalizedBase}${path.sep}`)
  );
}

function toMemoRelativePath(manuscriptRoot, targetPath) {
  const rel = path.relative(manuscriptRoot, targetPath);
  if (!rel || rel.startsWith("..")) return "";
  return rel.replace(/\\/g, "/");
}

function getConfiguredManuscriptRoot() {
  return String(
    vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") ||
      "",
  ).trim();
}

function getCurrentWorkNameFromContext(context) {
  return String(
    context?.globalState?.get("mojigoto.currentWorkName", "") || "",
  ).trim();
}

function resolveCurrentWork(context) {
  const currentWorkName = getCurrentWorkNameFromContext(context);
  if (!currentWorkName) return null;

  return (
    listWorkDirectories().find(
      (item) => String(item?.name || "").trim() === currentWorkName,
    ) || null
  );
}

function resolveWritingMemoStorePathForManuscriptRoot(context, manuscriptRoot) {
  const normalizedRoot = normalizeFsPath(manuscriptRoot);
  if (!normalizedRoot) return "";

  const configuredRoot = normalizeFsPath(getConfiguredManuscriptRoot());

  if (isSingleMode()) {
    if (configuredRoot && normalizedRoot === configuredRoot) {
      return getWritingMemosPathForSingle();
    }
    return "";
  }

  if (configuredRoot && normalizedRoot === configuredRoot) {
    const currentWork = resolveCurrentWork(context);
    return currentWork?.fsPath
      ? getWritingMemosPathForWork(currentWork.fsPath)
      : "";
  }

  for (const work of listWorkDirectories()) {
    if (!work?.fsPath) continue;

    const workManuscriptRoot = normalizeFsPath(
      getWorkManuscriptRoot(work.fsPath),
    );

    if (workManuscriptRoot && workManuscriptRoot === normalizedRoot) {
      return getWritingMemosPathForWork(work.fsPath);
    }
  }

  return "";
}

function resolveWritingMemoStorePathFromTreeItem(item) {
  if (isSingleMode()) {
    return getWritingMemosPathForSingle();
  }

  if (item?.workDir) {
    return getWritingMemosPathForWork(item.workDir);
  }

  return "";
}

function normalizeSlashes(value = "") {
  return String(value || "").replace(/\\/g, "/");
}

function stripLeadingSerialFromName(name = "") {
  return String(name || "")
    .replace(/^[\s　]*(?:[0-9０-９]+[\s　._＿\-－―ー]+)+/, "")
    .trim();
}

function normalizeWritingMemoFileKey(filePath = "") {
  const rel = normalizeSlashes(filePath).trim();
  if (!rel) return "";

  const parts = rel
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return "";

  const normalizedParts = parts.map((part, index) => {
    const isFileName = index === parts.length - 1;

    if (!isFileName) {
      return stripLeadingSerialFromName(part).toLowerCase();
    }

    const ext = path.posix.extname(part).toLowerCase();
    const base = path.posix.basename(part, path.posix.extname(part));
    return `${stripLeadingSerialFromName(base).toLowerCase()}${ext}`;
  });

  return normalizedParts.join("/");
}

function isSameWritingMemoFilePath(a = "", b = "") {
  const left = normalizeSlashes(a).trim();
  const right = normalizeSlashes(b).trim();

  if (!left || !right) return false;
  if (left === right) return true;

  return (
    normalizeWritingMemoFileKey(left) === normalizeWritingMemoFileKey(right)
  );
}

function collectWritingMemoTextFiles(rootDir = "") {
  const root = String(rootDir || "").trim();
  if (!root || !fs.existsSync(root)) return [];

  const results = [];

  function walk(dir) {
    let entries = [];

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry?.name) continue;

      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".mojigoto"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  walk(root);
  return results;
}

function getWritingMemoResolverRoots(context, options = {}) {
  const roots = [];
  const configuredManuscriptRoot = getConfiguredManuscriptRoot();
  const writingMemoFilePath = String(options?.writingMemoFilePath || "").trim();

  if (isSingleMode()) {
    if (configuredManuscriptRoot) {
      roots.push(configuredManuscriptRoot);
    }
    return roots;
  }

  if (writingMemoFilePath) {
    for (const work of listWorkDirectories()) {
      if (!work?.fsPath) continue;

      const memoPath = getWritingMemosPathForWork(work.fsPath);
      if (path.normalize(memoPath) !== path.normalize(writingMemoFilePath)) {
        continue;
      }

      const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
      if (manuscriptRoot) {
        roots.push(manuscriptRoot);
      }
    }
  }

  if (configuredManuscriptRoot) {
    roots.push(configuredManuscriptRoot);
  }

  const currentWork = resolveCurrentWork(context);
  if (currentWork?.fsPath) {
    const currentRoot = getWorkManuscriptRoot(currentWork.fsPath);
    if (currentRoot) {
      roots.push(currentRoot);
    }
  }

  for (const work of listWorkDirectories()) {
    if (!work?.fsPath) continue;

    const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
    if (manuscriptRoot) {
      roots.push(manuscriptRoot);
    }
  }

  return [...new Set(roots.map((root) => path.normalize(root)))];
}

function findWritingMemoFileByLoosePath(rootDir, storedFilePath, excerpt = "") {
  const targetKey = normalizeWritingMemoFileKey(storedFilePath);
  if (!rootDir || !targetKey) return "";

  const files = collectWritingMemoTextFiles(rootDir);

  const candidates = files.filter((file) => {
    const rel = normalizeSlashes(path.relative(rootDir, file));
    return normalizeWritingMemoFileKey(rel) === targetKey;
  });

  if (!candidates.length) return "";
  if (candidates.length === 1) return candidates[0];

  const needle = String(excerpt || "").trim();
  if (needle) {
    const matched = candidates.find((file) => {
      try {
        return fs.readFileSync(file, "utf8").includes(needle);
      } catch {
        return false;
      }
    });

    if (matched) return matched;
  }

  return candidates[0];
}

function resolveWritingMemoAbsolutePath(context, relativeFilePath) {
  const rel = String(relativeFilePath || "").trim();
  if (!rel) return "";

  const candidates = [];
  const configuredManuscriptRoot = getConfiguredManuscriptRoot();

  if (configuredManuscriptRoot) {
    candidates.push(configuredManuscriptRoot);
  }

  if (!isSingleMode()) {
    const currentWork = resolveCurrentWork(context);
    const workManuscriptRoot = currentWork?.fsPath
      ? getWorkManuscriptRoot(currentWork.fsPath)
      : "";

    if (workManuscriptRoot) {
      candidates.push(workManuscriptRoot);
    }
  }

  for (const root of candidates) {
    const absPath = path.join(root, rel);
    if (fs.existsSync(absPath)) {
      return absPath;
    }
  }

  if (candidates.length > 0) {
    return path.join(candidates[0], rel);
  }

  return "";
}

function resolveWritingMemoAbsolutePathFlexible(
  context,
  relativeFilePath,
  options = {},
) {
  const preferredAbsoluteFilePath = String(
    options?.absoluteFilePath || "",
  ).trim();

  if (preferredAbsoluteFilePath && fs.existsSync(preferredAbsoluteFilePath)) {
    return preferredAbsoluteFilePath;
  }

  const exact = resolveWritingMemoAbsolutePath(context, relativeFilePath);
  if (exact && fs.existsSync(exact)) {
    return exact;
  }

  const roots = getWritingMemoResolverRoots(context, options);
  const excerpt = String(options?.excerpt || "");

  for (const root of roots) {
    const found = findWritingMemoFileByLoosePath(
      root,
      relativeFilePath,
      excerpt,
    );
    if (found && fs.existsSync(found)) {
      return found;
    }
  }

  return "";
}

function getTextLineOffsets(text = "") {
  const source = String(text || "");
  const offsets = [0];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (ch === "\r") {
      if (source[i + 1] === "\n") {
        i += 1;
      }
      offsets.push(i + 1);
      continue;
    }

    if (ch === "\n") {
      offsets.push(i + 1);
    }
  }

  return offsets;
}

function getOffsetAtTextPosition(text = "", line = 0, character = 0) {
  const source = String(text || "");
  const offsets = getTextLineOffsets(source);

  const safeLine = Math.max(0, Math.min(Number(line || 0), offsets.length - 1));
  const lineStart = offsets[safeLine];

  const nextLineStart =
    safeLine + 1 < offsets.length ? offsets[safeLine + 1] : source.length;

  const lineEnd = Math.max(lineStart, nextLineStart);
  const safeCharacter = Math.max(0, Number(character || 0));

  return Math.max(lineStart, Math.min(lineStart + safeCharacter, lineEnd));
}

function getTextByStoredWritingMemoRange(text = "", memo = {}) {
  const source = String(text || "");
  if (!source) return "";

  const startOffset = getOffsetAtTextPosition(
    source,
    memo?.startLine,
    memo?.startCharacter,
  );

  const endOffset = getOffsetAtTextPosition(
    source,
    memo?.endLine ?? memo?.startLine,
    memo?.endCharacter ?? memo?.startCharacter,
  );

  if (endOffset <= startOffset) {
    return "";
  }

  return source.slice(startOffset, endOffset).replace(/\s+/g, " ").trim();
}

function resolveWritingMemoExcerptDisplayFromText(text = "", memo = {}) {
  const originalExcerpt = String(memo?.excerpt || "").trim();
  const source = String(text || "");

  if (!source) {
    return {
      excerpt: originalExcerpt,
      originalExcerpt,
      currentExcerpt: "",
      isExcerptMissing: false,
    };
  }

  if (originalExcerpt && source.includes(originalExcerpt)) {
    return {
      excerpt: originalExcerpt,
      originalExcerpt,
      currentExcerpt: originalExcerpt,
      isExcerptMissing: false,
    };
  }

  const currentExcerpt = getTextByStoredWritingMemoRange(source, memo);

  return {
    excerpt: currentExcerpt || originalExcerpt,
    originalExcerpt,
    currentExcerpt,
    isExcerptMissing: Boolean(originalExcerpt),
  };
}

function resolveWritingMemoExcerptDisplayFromFile(absPath = "", memo = {}) {
  const filePath = String(absPath || "").trim();

  if (!filePath || !fs.existsSync(filePath)) {
    return {
      excerpt: String(memo?.excerpt || ""),
      originalExcerpt: String(memo?.excerpt || ""),
      currentExcerpt: "",
      isExcerptMissing: false,
    };
  }

  try {
    const text = fs.readFileSync(filePath, "utf8");
    return resolveWritingMemoExcerptDisplayFromText(text, memo);
  } catch {
    return {
      excerpt: String(memo?.excerpt || ""),
      originalExcerpt: String(memo?.excerpt || ""),
      currentExcerpt: "",
      isExcerptMissing: false,
    };
  }
}

function resolveWritingMemoTargetForActiveEditor(context, options = {}) {
  const activeFsPath =
    vscode.window.activeTextEditor?.document?.uri?.fsPath || "";
  const fallbackFsPath = String(options?.writingMemoTargetFsPath || "").trim();
  const fsPath = activeFsPath || fallbackFsPath;

  if (!fsPath) {
    return {
      relativeFilePath: "",
      targetPath: "",
      writingMemoFilePath: "",
      absoluteFilePath: "",
      workId: "",
      workTitle: "",
    };
  }

  const lower = fsPath.toLowerCase();
  const isTextTarget = lower.endsWith(".txt") || lower.endsWith(".md");

  if (!isTextTarget) {
    return {
      relativeFilePath: "",
      targetPath: "",
      writingMemoFilePath: "",
      absoluteFilePath: "",
      workId: "",
      workTitle: "",
    };
  }

  const candidates = [];
  const configuredManuscriptRoot = getConfiguredManuscriptRoot();

  if (configuredManuscriptRoot) {
    candidates.push({
      manuscriptRoot: configuredManuscriptRoot,
      writingMemoFilePath: isSingleMode() ? getWritingMemosPathForSingle() : "",
      isView: !isSingleMode(),
      workId: isSingleMode() ? "__single__" : "",
      workTitle: isSingleMode() ? "現在の作品" : "",
    });
  }

  if (!isSingleMode()) {
    for (const work of listWorkDirectories()) {
      if (!work?.fsPath) continue;

      const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
      if (!manuscriptRoot) continue;

      candidates.push({
        manuscriptRoot,
        writingMemoFilePath: getWritingMemosPathForWork(work.fsPath),
        isView: false,
        workId: String(work?.name || "").trim(),
        workTitle: String(work?.title || work?.name || "").trim(),
      });
    }
  }

  for (const candidate of candidates) {
    const rel = path.relative(candidate.manuscriptRoot, fsPath);
    if (!rel || rel.startsWith("..")) continue;

    const relativeFilePath = rel.replace(/\\/g, "/");

    if (candidate.isView && !isSingleMode()) {
      const currentWork = resolveCurrentWork(context);

      return {
        relativeFilePath,
        targetPath: relativeFilePath,
        writingMemoFilePath: currentWork?.fsPath
          ? getWritingMemosPathForWork(currentWork.fsPath)
          : "",
        absoluteFilePath: fsPath,
        workId: String(currentWork?.name || "").trim(),
        workTitle: String(currentWork?.title || currentWork?.name || "").trim(),
      };
    }

    return {
      relativeFilePath,
      targetPath: relativeFilePath,
      writingMemoFilePath: candidate.writingMemoFilePath,
      absoluteFilePath: fsPath,
      workId: String(candidate.workId || "").trim(),
      workTitle: String(candidate.workTitle || "").trim(),
    };
  }

  return {
    relativeFilePath: "",
    targetPath: "",
    writingMemoFilePath: "",
    absoluteFilePath: "",
    workId: "",
    workTitle: "",
  };
}

module.exports = {
  normalizeFsPath,
  isSameOrChildPath,
  toMemoRelativePath,
  getConfiguredManuscriptRoot,
  getCurrentWorkNameFromContext,
  resolveCurrentWork,
  resolveWritingMemoStorePathForManuscriptRoot,
  resolveWritingMemoStorePathFromTreeItem,
  resolveWritingMemoAbsolutePath,
  resolveWritingMemoTargetForActiveEditor,
  normalizeWritingMemoFileKey,
  isSameWritingMemoFilePath,
  resolveWritingMemoAbsolutePathFlexible,
  resolveWritingMemoExcerptDisplayFromText,
  resolveWritingMemoExcerptDisplayFromFile,
};
