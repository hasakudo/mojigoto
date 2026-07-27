const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const { nowJstParts, parseJstDateKeyToMs } = require("../stats/stats-utils");
const { sanitizeFolderName } = require("../core/path-utils");

const {
  getSettingsPathForSingle,
} = require("../core/mojigoto-paths");

function sanitizeId(s) {
  return (
    String(s || "")
      .trim()
      .replace(/[\\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "unknown"
  );
}

function inferWorkNameFromManuscriptRoot() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mr = String(cfg.get("manuscriptRoot", "") || "").trim();
  if (!mr) return "";

  try {
    const real = fs.realpathSync(mr);
    const parent = path.dirname(real);
    const baseParent = path.basename(parent).toLowerCase();

    // .../<WORK>/_WORK/manuscript
    if (baseParent === "_work") {
      const workDir = path.dirname(parent);
      return path.basename(workDir);
    }

    // .../<WORK>/manuscript
    return path.basename(parent);
  } catch {
    return "";
  }
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

function writeJsonFileSafe(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

function getCurrentWorkSettingsPath(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "single") || "single");

  if (mode === "single") {
    return getSettingsPathForSingle();
  }

  const workRoot = String(cfg.get("workRoot", "") || "").trim();
  if (!workRoot) return "";

  const currentWorkName =
    String(
      context.globalState.get("mojigoto.currentWorkName", "") || "",
    ).trim() || inferWorkNameFromManuscriptRoot();

  if (!currentWorkName) return "";

  return path.join(workRoot, currentWorkName, ".mojigoto", "work.json");
}

function getCurrentWorkSettings(context) {
  const filePath = getCurrentWorkSettingsPath(context);
  const data = readJsonFileSafe(filePath) || {};

  return {
    schemaVersion: 1,
    folderName: "",
    title: "",
    genre: "",
    targetChars: 0,
    deadline: "",
    summary: "",
    memo: "",
    updatedAt: "",
    ...data,
  };
}

function saveCurrentWorkSettingsPartial(context, patch) {
  const filePath = getCurrentWorkSettingsPath(context);
  if (!filePath) return false;

  const current = getCurrentWorkSettings(context);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  return writeJsonFileSafe(filePath, next);
}

function getCurrentWorkTitleFromSettings(context) {
  const s = getCurrentWorkSettings(context);
  return String(s.title || "").trim();
}

function getSingleWorkFolderName(context) {
  const settings = getCurrentWorkSettings(context);

  const folderName = String(settings?.folderName || "").trim();
  if (folderName) return sanitizeFolderName(folderName);

  const wf = vscode.workspace.workspaceFolders?.[0];
  const workspaceName = String(wf?.name || "").trim();
  if (workspaceName) return sanitizeFolderName(workspaceName);

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mr = String(cfg.get("manuscriptRoot", "") || "").trim();
  if (mr) {
    const parentName = String(path.basename(path.dirname(mr)) || "").trim();
    if (parentName) return sanitizeFolderName(parentName);
  }

  return "single-unknown";
}

function getMultiWorkFolderName(context) {
  const currentName = String(
    context.globalState.get("mojigoto.currentWorkName", "") || "",
  ).trim();
  if (currentName) return sanitizeFolderName(currentName);

  const settings = getCurrentWorkSettings(context);

  const folderName = String(settings?.folderName || "").trim();
  if (folderName) return sanitizeFolderName(folderName);

  const inferred = String(inferWorkNameFromManuscriptRoot() || "").trim();
  if (inferred) return sanitizeFolderName(inferred);

  return "multi-unknown";
}

function getCurrentWorkFolderName(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "single") || "single");

  if (mode === "multi") {
    return getMultiWorkFolderName(context);
  }
  return getSingleWorkFolderName(context);
}

function getSingleWorkDisplayName(context) {
  const settings = getCurrentWorkSettings(context);
  const title = String(settings?.title || "").trim();
  if (title) return title;

  const folderName = String(settings?.folderName || "").trim();
  if (folderName) return folderName;

  const wf = vscode.workspace.workspaceFolders?.[0];
  const workspaceName = String(wf?.name || "").trim();
  if (workspaceName) return workspaceName;

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mr = String(cfg.get("manuscriptRoot", "") || "").trim();
  if (mr) {
    const parentName = String(path.basename(path.dirname(mr)) || "").trim();
    if (parentName) return parentName;
  }

  return "single-unknown";
}

function getMultiWorkDisplayName(context) {
  const settings = getCurrentWorkSettings(context);
  const title = String(settings?.title || "").trim();
  if (title) return title;

  const currentName = String(
    context.globalState.get("mojigoto.currentWorkName", "") || "",
  ).trim();
  if (currentName) return currentName;

  const folderName = String(settings?.folderName || "").trim();
  if (folderName) return folderName;

  const inferred = String(inferWorkNameFromManuscriptRoot() || "").trim();
  if (inferred) return inferred;

  return "multi-unknown";
}

function getCurrentWorkDisplayName(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "single") || "single");

  if (mode === "multi") {
    return getMultiWorkDisplayName(context);
  }
  return getSingleWorkDisplayName(context);
}

function getWorkName(context) {
  return getCurrentWorkFolderName(context);
}

// 章・総数の前回値を保存して差分を出す
function diffKeyForWork(context, kind, id) {
  const wid = getWorkId(context);
  return `mojigoto.diff.${wid}.${kind}.${id}`;
}

// 「この瞬間にアクティブな作品」を一意に識別するID
function getWorkId(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "single") || "single");

  const folderName = getCurrentWorkFolderName(context);

  if (mode === "multi") {
    return folderName ? "m__" + sanitizeId(folderName) : "m__unknown";
  }

  return folderName ? "s__" + sanitizeId(folderName) : "s__unknown";
}

function keyWorkGoals() {
  return "mojigoto.workGoals";
}

function keyWorkDeadlines() {
  return "mojigoto.workDeadlines";
}

function getCurrentWorkGoal(context, deps = {}) {
  const { gsGet = () => ({}) } = deps;

  const s = getCurrentWorkSettings(context);
  const fileGoal = Number(s?.targetChars ?? 0) || 0;
  if (fileGoal > 0) return fileGoal;

  const map = gsGet(context, keyWorkGoals(), {});
  const wid = getWorkId(context);
  const workGoal = Number(map?.[wid] ?? 0) || 0;
  if (workGoal > 0) return workGoal;

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  return Number(cfg.get("totalGoal", 0)) || 0;
}

async function setCurrentWorkGoal(context, value, deps = {}) {
  const { gsGet = () => ({}), gsSet = async () => {} } = deps;

  const normalized = Math.max(0, Number(value) || 0);

  const savedToFile = saveCurrentWorkSettingsPartial(context, {
    targetChars: normalized,
  });

  const map = gsGet(context, keyWorkGoals(), {});
  const wid = getWorkId(context);
  map[wid] = normalized;
  await gsSet(context, keyWorkGoals(), map);

  return savedToFile;
}

function getCurrentWorkDeadline(context, deps = {}) {
  const { gsGet = () => ({}) } = deps;

  const s = getCurrentWorkSettings(context);
  const fileDeadline = String(s?.deadline || "").trim();
  if (fileDeadline) return fileDeadline;

  const map = gsGet(context, keyWorkDeadlines(), {});
  const wid = getWorkId(context);
  return String(map?.[wid] || "").trim();
}

async function setCurrentWorkDeadline(context, dateStr, deps = {}) {
  const { gsGet = () => ({}), gsSet = async () => {} } = deps;

  const normalized = String(dateStr || "").trim();

  const savedToFile = saveCurrentWorkSettingsPartial(context, {
    deadline: normalized,
  });

  const map = gsGet(context, keyWorkDeadlines(), {});
  const wid = getWorkId(context);
  map[wid] = normalized;
  await gsSet(context, keyWorkDeadlines(), map);

  return savedToFile;
}

function getDaysLeftText(dateStr) {
  if (!dateStr) return "-";

  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "-";

  const now = new Date();
  const { dateJst } = nowJstParts(now);

  const todayMs = parseJstDateKeyToMs(dateJst);
  const targetMs = parseJstDateKeyToMs(dateStr);

  if (!Number.isFinite(todayMs) || !Number.isFinite(targetMs)) return "-";

  const diffDays = Math.floor((targetMs - todayMs) / 86400000);

  if (diffDays > 0) return `あと${diffDays}日`;
  if (diffDays === 0) return "今日";
  return `${Math.abs(diffDays)}日経過`;
}

module.exports = {
  getWorkName,
  getCurrentWorkDisplayName,
  getCurrentWorkFolderName,
  getSingleWorkDisplayName,
  getMultiWorkDisplayName,
  getSingleWorkFolderName,
  getMultiWorkFolderName,
  diffKeyForWork,
  getWorkId,
  inferWorkNameFromManuscriptRoot,
  getCurrentWorkSettingsPath,
  getCurrentWorkSettings,
  saveCurrentWorkSettingsPartial,
  getCurrentWorkTitleFromSettings,
  getCurrentWorkGoal,
  setCurrentWorkGoal,
  getCurrentWorkDeadline,
  setCurrentWorkDeadline,
  getDaysLeftText,
};
