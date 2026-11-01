const path = require("path");

// Follow work-folder renames without owning command or filesystem event registration.
function createWorkFolderRename({ vscode, fs, fsp, ensureDir, isMultiMode,
  getWorkRoot, getManuscriptCandidates, isDirectory, selectManuscriptRoot,
  setCurrentWorkName, refreshExplorer }) {
  function readJsonFileSafe(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  
  async function writeJsonFileSafe(filePath, data) {
    try {
      await ensureDir(path.dirname(filePath));
      await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      return true;
    } catch {
      return false;
    }
  }
  
  function getDirectChildWorkName(workRoot, targetPath) {
    const root = path.resolve(String(workRoot || ""));
    const full = path.resolve(String(targetPath || ""));
  
    if (!root || !full) return "";
  
    const parent = path.dirname(full);
    if (parent !== root) return "";
  
    const name = path.basename(full);
    if (!name || name === "_WORK") return "";
  
    return name;
  }
  
  async function resolveWorkManuscriptDir(workDir, manuNames) {
    for (const m of manuNames) {
      const p = path.join(workDir, m);
      if (await isDirectory(p)) return p;
    }
    return path.join(workDir, manuNames[0] || "manuscript");
  }
  
  async function updateWorkJsonFolderName(workDir, folderName) {
    const settingsPath = path.join(workDir, ".mojigoto", "work.json");
    const current = readJsonFileSafe(settingsPath) || {};
  
    const next = {
      ...current,
      schemaVersion: Number(current.schemaVersion || 1) || 1,
      folderName: String(folderName || "").trim(),
      title: String(current.title || "").trim(),
      penName: String(current.penName || "").trim(),
      genre: String(current.genre || "").trim(),
      targetChars: Number(current.targetChars || 0) || 0,
      deadline: String(current.deadline || "").trim(),
      summary: String(current.summary || "").trim(),
      memo: String(current.memo || "").trim(),
      exportOptions:
        current.exportOptions && typeof current.exportOptions === "object"
          ? { ...current.exportOptions }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
  
    return await writeJsonFileSafe(settingsPath, next);
  }
  
  async function handleRenamedWorkFolders(context, renameEvent, deps = {}) {
    const { onAfterRename = async () => {} } = deps;
  
    if (!isMultiMode()) return false;
  
    const workRoot = getWorkRoot();
    if (!workRoot || !fs.existsSync(workRoot)) return false;
  
    const manuNames = getManuscriptCandidates();
    const currentWorkName = String(
      context.globalState.get("mojigoto.currentWorkName", "") || "",
    ).trim();
  
    let changed = false;
  
    for (const file of renameEvent?.files || []) {
      const oldPath = file?.oldUri?.fsPath || "";
      const newPath = file?.newUri?.fsPath || "";
      if (!oldPath || !newPath) continue;
  
      const oldName = getDirectChildWorkName(workRoot, oldPath);
      const newName = getDirectChildWorkName(workRoot, newPath);
  
      // workRoot直下の作品フォルダ rename だけ対象
      if (!oldName || !newName) continue;
      if (oldName === newName) continue;
  
      const newWorkDir = path.join(workRoot, newName);
      if (!(await isDirectory(newWorkDir))) continue;
  
      // work.json の folderName を追従
      await updateWorkJsonFolderName(newWorkDir, newName);
  
      // 現在作品なら currentWorkName と junction も追従
      if (currentWorkName && currentWorkName === oldName) {
        const workDir = path.join(workRoot, "_WORK");
        const linkPath = path.join(workDir, "manuscript");
        const manuPath = await resolveWorkManuscriptDir(newWorkDir, manuNames);
  
        await ensureDir(workDir);
        await selectManuscriptRoot(linkPath, manuPath);
        await setCurrentWorkName(context, newName);
      }
  
      changed = true;
    }
  
    if (!changed) return false;
  
    await refreshExplorer();
  
    try {
      await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
    } catch {}
  
    try {
      await vscode.commands.executeCommand("mojigoto.refreshStats");
    } catch {}
  
    try {
      await vscode.commands.executeCommand("mojigoto.refreshWorkStatus");
    } catch {}
  
    await onAfterRename();
  
    return true;
  }
  
  
  return { handleRenamedWorkFolders };
}

module.exports = { createWorkFolderRename };
