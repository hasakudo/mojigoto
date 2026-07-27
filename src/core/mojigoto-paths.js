const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const {
  isSingleMode,
  getWorkspaceRoot,
  getWorkRoot,
  getManuscriptCandidates,
} = require("./mojigoto-context");

function safeReadDir(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function getMojigotoDirForSingle() {
  const ws = getWorkspaceRoot();
  return ws ? path.join(ws, ".mojigoto") : "";
}

function getMojigotoDirForWork(workDir) {
  return workDir ? path.join(workDir, ".mojigoto") : "";
}

function getSettingsPathForSingle() {
  const dir = getMojigotoDirForSingle();
  return dir ? path.join(dir, "singleWork.json") : "";
}

function getSettingsPathForWork(workDir) {
  const dir = getMojigotoDirForWork(workDir);
  return dir ? path.join(dir, "work.json") : "";
}

function getUserWorkExcludeNames() {
  try {
    const cfg = vscode.workspace.getConfiguration("mojigoto");
    const raw = cfg.get("workExclude", []);
    if (!Array.isArray(raw)) return [];

    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function buildWorkExcludeSet() {
  const fixed = [
    ".mojigoto",
    ".vscode",
    ".git",
    "node_modules",
    "_WORK",
    "docs",
    "Doc",
    "Doc(s)",
    "dist",
    "tmp",
    "temp",
    "tools",
    "CSS",
    "publish",
  ];

  const user = getUserWorkExcludeNames();

  return new Set(
    [...fixed, ...user].map((name) =>
      String(name || "")
        .trim()
        .toLowerCase(),
    ),
  );
}

function listWorkDirectories() {
  if (isSingleMode()) return [];

  const workRoot = getWorkRoot();
  if (!workRoot || !fs.existsSync(workRoot)) return [];

  const exclude = buildWorkExcludeSet();

  return safeReadDir(workRoot)
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !entry.name.startsWith("."))
    .filter(
      (entry) =>
        !exclude.has(
          String(entry.name || "")
            .trim()
            .toLowerCase(),
        ),
    )
    .map((entry) => {
      const fsPath = path.join(workRoot, entry.name);
      const settingsPath = path.join(fsPath, ".mojigoto", "work.json");
      const settings = readJsonFileSafe(settingsPath);

      return {
        name: entry.name,
        title: String(settings?.title || "").trim() || entry.name,
        fsPath,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "ja", { numeric: true }));
}

function listManuscriptChildren(manuscriptRoot) {
  return safeReadDir(manuscriptRoot)
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .filter((entry) => {
      if (entry.isDirectory()) return true;
      const ext = path.extname(entry.name).toLowerCase();
      return ext === ".txt" || ext === ".md";
    })
    .map((entry) => ({
      name: entry.name,
      fsPath: path.join(manuscriptRoot, entry.name),
      type: entry.isDirectory() ? "dir" : "file",
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "ja", {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

function getWorkManuscriptRoot(workDir) {
  if (!workDir) return "";
  return (
    resolveExistingManuscriptDir(workDir) ||
    path.join(workDir, getPreferredManuscriptDirName())
  );
}

function resolveExistingManuscriptDir(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return "";

  const candidates = getManuscriptCandidates();

  for (const name of candidates) {
    const full = path.join(baseDir, name);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        return full;
      }
    } catch {
      // noop
    }
  }

  return "";
}

function getPreferredManuscriptDirName() {
  const candidates = getManuscriptCandidates();
  return candidates[0] || "manuscript";
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getNotesDirForWork(workDir, type) {
  const base = getMojigotoDirForWork(workDir);
  if (!base) return "";
  return path.join(base, type === "plot" ? "plots" : "references");
}

function getNotesDirForSingle(type) {
  const base = getMojigotoDirForSingle();
  if (!base) return "";
  return path.join(base, type === "plot" ? "plots" : "references");
}

function getConceptMemosPathForWork(workDir) {
  const base = getMojigotoDirForWork(workDir);
  if (!base) return "";
  return path.join(base, "concept-memos.json");
}

function getConceptMemosPathForSingle() {
  const base = getMojigotoDirForSingle();
  if (!base) return "";
  return path.join(base, "concept-memos.json");
}

function getWritingMemosPathForWork(workDir) {
  const base = getMojigotoDirForWork(workDir);
  if (!base) return "";
  return path.join(base, "writing-memos.json");
}

function getWritingMemosPathForSingle() {
  const base = getMojigotoDirForSingle();
  if (!base) return "";
  return path.join(base, "writing-memos.json");
}

function resolveActualWorkDir(workDir) {
  const value = String(workDir || "").trim();
  if (!value) return "";

  try {
    const normalized = path.normalize(value);
    const base = path.basename(normalized).toLowerCase();

    // すでに実作品 dir
    if (base !== "_work") {
      return normalized;
    }

    // .../<WORK>/_WORK -> .../<WORK>
    return path.dirname(normalized);
  } catch {
    return String(workDir || "").trim();
  }
}

function resolveActualNotePath(notePath, workDir, noteType = "plot") {
  const rawPath = String(notePath || "").trim();
  if (!rawPath) return "";

  try {
    if (fs.existsSync(rawPath)) {
      return rawPath;
    }
  } catch {}

  const actualWorkDir = resolveActualWorkDir(workDir);
  if (!actualWorkDir) {
    return rawPath;
  }

  const fileName = path.basename(rawPath);
  const notesDir = getNotesDirForWork(actualWorkDir, noteType);
  if (!notesDir) {
    return rawPath;
  }

  const candidate = path.join(notesDir, fileName);

  try {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  } catch {}

  return candidate;
}

function resolveTargetWorkContext(input = {}) {
  const rawWorkDir = String(input?.workDir || "").trim();
  const actualWorkDir = resolveActualWorkDir(rawWorkDir);

  const resolvedWorkDir = String(actualWorkDir || rawWorkDir || "").trim();
  const resolvedWorkName =
    (resolvedWorkDir ? path.basename(resolvedWorkDir) : "") ||
    String(input?.workName || "").trim();

  let resolvedWorkTitle = "";

  if (resolvedWorkDir) {
    const settingsPath = getSettingsPathForWork(resolvedWorkDir);
    const settings = readJsonFileSafe(settingsPath);
    resolvedWorkTitle = String(settings?.title || "").trim();
  }

  if (!resolvedWorkTitle) {
    resolvedWorkTitle = String(input?.workTitle || "").trim();
  }

  const displayName = String(
    resolvedWorkTitle || resolvedWorkName || "",
  ).trim();

  return {
    workDir: resolvedWorkDir,
    workName: resolvedWorkName,
    workTitle: resolvedWorkTitle,
    displayName,
  };
}

module.exports = {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
  getSettingsPathForSingle,
  getSettingsPathForWork,
  listWorkDirectories,
  listManuscriptChildren,
  getWorkManuscriptRoot,
  resolveExistingManuscriptDir,
  getPreferredManuscriptDirName,
  readJsonFileSafe,
  getNotesDirForWork,
  getNotesDirForSingle,
  getConceptMemosPathForWork,
  getConceptMemosPathForSingle,
  getWritingMemosPathForWork,
  getWritingMemosPathForSingle,
  resolveActualWorkDir,
  resolveActualNotePath,
  resolveTargetWorkContext,
};
