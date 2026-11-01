// Local selection grants browser read access only. Every uploaded Drive item is
// created by this app so that drive.file covers the imported project.
const TECHNICAL_FOLDERS = new Set([".git", "_work", "node_modules", ".local-config"]);
const IMPORT_MARKER = "mojigoto-import-source.json";
const WORK_FOLDERS = new Set(["manuscript", "原稿", ".mojigoto"]);

export function googleDriveImportFolderName(rootName, now = new Date(), suffix = "") {
  const compact = now.toISOString().slice(2, 16).replace(/[-:T]/g, "");
  const stamp = `${compact.slice(0, 6)}-${compact.slice(6)}`;
  const unique = suffix || globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 6) || Math.random().toString(36).slice(2, 8);
  return `${rootName}（取込 ${stamp}-${unique}）`;
}

export function planGoogleDriveImport(files, { excludedFolders = [] } = {}) {
  const allEntries = Array.from(files || []).map((file) => {
    const parts = String(file.webkitRelativePath || "").split("/");
    if (parts.length < 2 || parts.some((part) => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) {
      throw new Error("作品フォルダ全体を選択してください。ファイルのパスを確認できませんでした。");
    }
    return { file, parts, path: parts.join("/") };
  });
  if (!allEntries.length) throw new Error("ファイルが入った作品フォルダを選択してください。");
  const rootName = allEntries[0].parts[0];
  if (allEntries.some((entry) => entry.parts[0] !== rootName)) throw new Error("一度に1つの作品フォルダを選択してください。");
  if (new Set(allEntries.map((entry) => entry.path)).size !== allEntries.length) throw new Error("同じパスのファイルが重複しています。");
  const filePaths = new Set(allEntries.map((entry) => entry.parts.slice(1).join("/")));
  for (const entry of allEntries) {
    for (let i = 2; i < entry.parts.length; i++) {
      if (filePaths.has(entry.parts.slice(1, i).join("/"))) throw new Error("ファイルとフォルダの名前が衝突しています。");
    }
  }
  const eligible = allEntries.filter((entry) => !entry.parts.slice(1, -1).some((part) => TECHNICAL_FOLDERS.has(part.toLowerCase()))
    && !/^\.env(?:\.|$)/i.test(entry.parts.at(-1))
    && !(entry.parts.length === 3 && entry.parts[1] === ".vscode" && entry.parts[2] === IMPORT_MARKER));
  const topFolders = [...new Set(eligible.filter((entry) => entry.parts.length > 2).map((entry) => entry.parts[1]))];
  const optionalFolders = topFolders.filter((folder) => folder !== ".vscode" && !eligible.some((entry) => entry.parts[1] === folder
    && entry.parts.slice(1, -1).some((part) => WORK_FOLDERS.has(part))));
  if (excludedFolders.some((folder) => !optionalFolders.includes(folder))) throw new Error("原稿・作品データ・VS Code設定を含むフォルダは取り込みから除外できません。");
  const entries = eligible.filter((entry) => !excludedFolders.includes(entry.parts[1]));
  if (!entries.some((entry) => entry.parts.slice(1, -1).some((part) => ["manuscript", "原稿", ".mojigoto"].includes(part)))) {
    throw new Error("原稿フォルダまたは .mojigoto を含む作品フォルダを選択してください。");
  }
  return { rootName, entries, optionalFolders, skippedCount: allEntries.length - entries.length,
    bytes: entries.reduce((sum, entry) => sum + Number(entry.file.size || 0), 0) };
}

export async function importGoogleDriveProject(provider, plan, { onProgress = () => {}, signal, rootName = googleDriveImportFolderName(plan.rootName) } = {}) {
  rootName = String(rootName || "").trim();
  if (!rootName || [".", ".."].includes(rootName) || /[\\/:*?"<>|\x00-\x1f]/.test(rootName) || /[. ]$/.test(rootName)) throw new Error("取り込み先のフォルダ名を確認してください。PCでも使える名前を指定してください。");
  const checkCanceled = () => { if (signal?.aborted) throw new Error("取り込みを中断しました。"); };
  checkCanceled();
  // Never merge into the source project or delete a failed upload automatically.
  const root = await provider.createFolder({ id: "root" }, rootName, { reuseExisting: false });
  const folders = new Map([["", root]]);
  let completed = 0;
  try {
    for (const entry of plan.entries) {
      checkCanceled();
      const parts = entry.parts.slice(1);
      let parent = root;
      for (let i = 0; i < parts.length - 1; i++) {
        checkCanceled();
        const path = parts.slice(0, i + 1).join("/");
        if (!folders.has(path)) folders.set(path, await provider.createFolder(parent, parts[i]));
        parent = folders.get(path);
      }
      checkCanceled();
      await provider.createBinaryFile(parent, parts.at(-1), entry.file);
      onProgress({ completed: ++completed, total: plan.entries.length, path: entry.path, root });
    }
    checkCanceled();
    if (folders.has(".vscode")) {
      // Portable provenance, not local absolute paths. The extension repairs only
      // known mojigoto path settings inside the original project when it opens.
      const marker = new Blob([JSON.stringify({ kind: "mojigoto-drive-import", version: 1,
        sourceRootName: plan.rootName, importedRootName: rootName }, null, 2)], { type: "application/json" });
      await provider.createBinaryFile(folders.get(".vscode"), IMPORT_MARKER, marker);
    }
    checkCanceled();
    return root;
  } catch (cause) {
    const error = new Error(`取り込みは ${completed}/${plan.entries.length} 件で停止しました。Driveの「${root.name}」に途中までのデータが残っています。元の作品は変更していません。再実行すると別のフォルダを作成します。`, { cause });
    error.importRoot = root;
    throw error;
  }
}
