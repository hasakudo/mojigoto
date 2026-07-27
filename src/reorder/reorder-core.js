const vscode = require('vscode');
const fsp = require('fs/promises');
const path = require('path');

const TEXT_EXTS = new Set(['.txt', '.md']);

function resolveReorderRoot() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();
  const workRoot = String(cfg.get("workRoot", "") || "").trim();

  // いま実際に使っている設定を最優先
  if (manuscriptRoot) {
    return manuscriptRoot;
  }

  // workRoot が manuscript を直接指している場合
  if (workRoot) {
    const normalized = workRoot.replace(/[\\\/]+$/, "");
    if (path.basename(normalized).toLowerCase() === "manuscript") {
      return normalized;
    }

    // workRoot が _WORK を指している想定
    if (path.basename(normalized).toLowerCase() === "_work") {
      return path.join(normalized, "manuscript");
    }

    // それ以外は従来より安全側に倒す
    const workManuscript = path.join(normalized, "manuscript");
    const multiManuscript = path.join(normalized, "_WORK", "manuscript");

    return workManuscript || multiManuscript;
  }

  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) return "";

  const root = wf.uri.fsPath;

  // Single の既定を優先
  return path.join(root, "manuscript");
}

function splitNameExt(filename) {
  const ext = path.extname(filename);
  if (!ext) return { stem: filename, ext: '' };
  return { stem: filename.slice(0, -ext.length), ext };
}

function stripOrderPrefix(name) {
  return String(name || '').replace(/^\s*\d+[._\- ]+/, '').trimStart();
}

function padOrder(n, digits) {
  return String(n).padStart(digits, '0');
}

function calcDigits(count, startIndex = 1) {
  const maxNum = Math.max(startIndex + Math.max(count, 1) - 1, 0);
  return Math.max(2, String(maxNum).length);
}

function isTextFile(name) {
  return TEXT_EXTS.has(path.extname(name).toLowerCase());
}

function sortEntriesByDisplayName(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

async function listRootEntries(rootDir) {
  const names = await fsp.readdir(rootDir, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const ent of names) {
    if (ent.name.startsWith('.')) continue;
    const fullPath = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      folders.push({ id: fullPath, name: ent.name, path: fullPath, kind: 'folder' });
      continue;
    }
    if (ent.isFile() && isTextFile(ent.name)) {
      files.push({ id: fullPath, name: ent.name, path: fullPath, kind: 'file' });
    }
  }

  return {
    folders: sortEntriesByDisplayName(folders),
    files: sortEntriesByDisplayName(files),
  };
}

async function listFilesInFolder(folderPath) {
  const names = await fsp.readdir(folderPath, { withFileTypes: true });
  const files = [];
  for (const ent of names) {
    if (!ent.isFile() || ent.name.startsWith('.')) continue;
    if (!isTextFile(ent.name)) continue;
    const fullPath = path.join(folderPath, ent.name);
    files.push({ id: fullPath, name: ent.name, path: fullPath, kind: 'file' });
  }
  return sortEntriesByDisplayName(files);
}

async function buildFolderViewModel(rootDir) {
  const { folders, files } = await listRootEntries(rootDir);
  const folderModels = await Promise.all(folders.map(async (it) => {
    const children = await listFilesInFolder(it.path).catch(() => []);
    return {
      id: it.id,
      name: it.name,
      cleanName: stripOrderPrefix(it.name),
      path: it.path,
      kind: 'folder',
      count: children.length,
    };
  }));

  const rootFilesCount = files.length;
  return [
    {
      id: rootDir,
      name: 'manuscript',
      cleanName: 'manuscript',
      path: rootDir,
      kind: 'root',
      count: rootFilesCount,
    },
    ...folderModels,
  ];
}

async function buildFileViewModel(folderPath, startIndex = 1) {
  const files = await listFilesInFolder(folderPath);
  const digits = calcDigits(files.length, startIndex);
  return files.map((file, index) => {
    const { ext } = splitNameExt(file.name);
    const cleanBase = stripOrderPrefix(splitNameExt(file.name).stem);
    const order = startIndex + index;
    return {
      id: file.id,
      originalName: file.name,
      cleanName: cleanBase,
      ext,
      path: file.path,
      previewLabel: `${padOrder(order, digits)}. ${cleanBase}${ext}`,
    };
  });
}

function moveArrayItem(items, fromIndex, toIndex) {
  const arr = [...items];
  if (fromIndex < 0 || fromIndex >= arr.length) return arr;
  const target = Math.max(0, Math.min(arr.length - 1, toIndex));
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(target, 0, item);
  return arr;
}

function rebuildPreviewLabels(items, startIndex = 1) {
  const digits = calcDigits(items.length, startIndex);
  return items.map((item, index) => ({
    ...item,
    previewLabel: `${padOrder(startIndex + index, digits)}. ${item.cleanName}${item.ext}`,
  }));
}

function makeRenamePlan(folderPath, orderedItems, startIndex = 1) {
  const digits = calcDigits(orderedItems.length, startIndex);
  const tempMoves = [];
  const finalMoves = [];

  orderedItems.forEach((item, index) => {
    const newLabel = `${padOrder(startIndex + index, digits)}. ${item.cleanName}${item.ext}`;
    const oldPath = item.path;
    const tempPath = path.join(folderPath, `.__mojigoto_tmp__${Date.now()}_${index}${item.ext}`);
    const newPath = path.join(folderPath, newLabel);
    tempMoves.push({ from: oldPath, to: tempPath });
    finalMoves.push({ from: tempPath, to: newPath });
  });

  return { tempMoves, finalMoves };
}

async function applyRenamePlan(plan) {
  for (const step of plan.tempMoves) {
    if (step.from === step.to) continue;
    await fsp.rename(step.from, step.to);
  }
  for (const step of plan.finalMoves) {
    if (step.from === step.to) continue;
    await fsp.rename(step.from, step.to);
  }
}

async function saveFolderOrder(folderPath, orderedItems, startIndex = 1) {
  const plan = makeRenamePlan(folderPath, orderedItems, startIndex);
  await applyRenamePlan(plan);
  return buildFileViewModel(folderPath, startIndex);
}

async function saveFolderListOrder(rootDir, orderedFolders, startIndex = 1) {
  const entries = Array.isArray(orderedFolders) ? orderedFolders : [];

  const targets = entries.filter((item) => {
    return item && item.kind === "folder" && item.path && item.name;
  });

  if (!targets.length) {
    return await buildFolderViewModel(rootDir);
  }

  const digits = Math.max(
    2,
    String(startIndex + Math.max(targets.length - 1, 0)).length,
  );

  const phase1 = [];
  const stamp = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const oldPath = item.path;
    const dirName = path.basename(oldPath);

    const cleanName = stripOrderPrefix(dirName);
    const nextName = `${String(startIndex + i).padStart(digits, "0")}. ${cleanName}`;
    const newPath = path.join(path.dirname(oldPath), nextName);

    if (oldPath !== newPath) {
      phase1.push({
        oldPath,
        tmpPath: `${oldPath}.mojigoto_tmp_${stamp}_${i}`,
        newPath,
      });
    }
  }

  for (const item of phase1) {
    await fsp.rename(item.oldPath, item.tmpPath);
  }

  for (const item of phase1) {
    await fsp.rename(item.tmpPath, item.newPath);
  }

  return await buildFolderViewModel(rootDir);
}

module.exports = {
  TEXT_EXTS,
  resolveReorderRoot,
  splitNameExt,
  stripOrderPrefix,
  padOrder,
  calcDigits,
  listRootEntries,
  listFilesInFolder,
  buildFolderViewModel,
  buildFileViewModel,
  moveArrayItem,
  rebuildPreviewLabels,
  makeRenamePlan,
  applyRenamePlan,
  saveFolderOrder,
  saveFolderListOrder,
};
