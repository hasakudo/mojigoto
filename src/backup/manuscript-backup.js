const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const { enqueueBackupOperation, writeJsonAtomic } = require("./backup-storage");
const { readBackupSettings } = require("./backup-settings");
const { storageRevision, writeRawFile } = require("../data/structured-file-write");
const { getManuscriptCandidates, getResolvedManuscriptRoot, getWorkspaceRoot } = require("../core/mojigoto-context");
const {
  BACKUP_FOLDER,
  BACKUP_INDEX_FILE,
  BACKUP_SNAPSHOT_FOLDER,
  backupIndexEntry,
  createBackupId,
  createBackupSnapshot,
  emptyBackupIndex,
  hashBackupContent,
  normalizeBackupIndex,
  normalizeBackupPath,
  planBackupRetention,
  rebuildBackupIndex,
} = require("./backup-format");
const {
  registerBackupContentProvider,
  createBackupContentUri,
  releaseBackupContentUri,
} = require("./backup-content-provider");

const automaticBackupSuppression = new Set();

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function realPathSafe(targetPath) {
  try { return fs.realpathSync(targetPath); } catch { return path.resolve(targetPath); }
}

function findMojigotoRoot(filePath) {
  let cursor = path.dirname(filePath);
  const stop = path.parse(cursor).root;
  while (cursor && cursor !== stop) {
    if (fs.existsSync(path.join(cursor, ".mojigoto"))) return cursor;
    cursor = path.dirname(cursor);
  }
  const workspace = getWorkspaceRoot();
  return workspace && fs.existsSync(path.join(workspace, ".mojigoto")) ? workspace : "";
}

function resolveBackupContext(document = vscode.window.activeTextEditor?.document) {
  if (!document || document.uri.scheme !== "file") throw new Error("バックアップする原稿ファイルを開いてください。");
  const filePath = document.uri.fsPath;
  if (!/[.](txt|md)$/i.test(filePath)) throw new Error("原稿の .txt または .md ファイルを開いてください。");
  const physicalFilePath = realPathSafe(filePath);
  const configuredManuscriptRootValue = getResolvedManuscriptRoot();
  const configuredManuscriptRoot = configuredManuscriptRootValue
    ? realPathSafe(configuredManuscriptRootValue)
    : "";
  const workDir = findMojigotoRoot(physicalFilePath);
  if (!workDir) throw new Error("この原稿に対応する .mojigoto フォルダを確認できませんでした。");
  const workManuscriptRoot = getManuscriptCandidates()
    .map((name) => path.join(workDir, name))
    .find((candidate) => isInside(candidate, physicalFilePath));
  const manuscriptRoot = configuredManuscriptRoot && isInside(configuredManuscriptRoot, physicalFilePath)
    ? configuredManuscriptRoot
    : workManuscriptRoot || path.dirname(physicalFilePath);
  const relativePath = normalizeBackupPath(path.relative(manuscriptRoot, physicalFilePath));
  if (!relativePath || relativePath.startsWith("..")) throw new Error("原稿フォルダ内のファイルを開いてください。");
  const backupRoot = path.join(workDir, ".mojigoto", BACKUP_FOLDER);
  const legacyWorkDir = findMojigotoRoot(filePath);
  const legacyBackupRoot = legacyWorkDir && realPathSafe(legacyWorkDir) !== realPathSafe(workDir)
    ? path.join(legacyWorkDir, ".mojigoto", BACKUP_FOLDER)
    : "";
  return {
    document,
    filePath,
    relativePath,
    fileName: path.basename(filePath),
    backupRoot,
    snapshotsRoot: path.join(backupRoot, BACKUP_SNAPSHOT_FOLDER),
    indexPath: path.join(backupRoot, BACKUP_INDEX_FILE),
    legacyBackupRoot,
  };
}

async function readBackupIndex(context) {
  await migrateLegacyBackups(context);
  let index;
  try {
    const raw = await fs.promises.readFile(context.indexPath, "utf8");
    context.indexRevision = storageRevision(raw);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.snapshots)) {
      throw new Error("invalid backup index");
    }
    index = normalizeBackupIndex(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.message !== "invalid backup index" && !(error instanceof SyntaxError)) throw error;
    index = await rebuildBackupIndexFromSnapshots(context);
  }
  return migrateMovedManuscriptHistory(context, index);
}

function findMovedBackupSourcePath(index, context) {
  const currentHash = hashBackupContent(context.document.getText());
  const matchingPaths = new Set(index.snapshots
    .filter((entry) => entry.targetType === "manuscript"
      && entry.relativePath !== context.relativePath
      && entry.fileName === context.fileName
      && entry.contentHash === currentHash)
    .map((entry) => normalizeBackupPath(entry.relativePath))
    .filter(Boolean));
  return matchingPaths.size === 1 ? [...matchingPaths][0] : "";
}

async function rewriteBackupPaths(context, index, sourcePath, destinationPath) {
  const normalizedSource = normalizeBackupPath(sourcePath);
  const normalizedDestination = normalizeBackupPath(destinationPath);
  const sourcePrefix = `${normalizedSource}/`;
  const targets = index.snapshots.filter((entry) => entry.targetType === "manuscript"
    && (entry.relativePath === normalizedSource || entry.relativePath.startsWith(sourcePrefix)));
  if (!normalizedSource || !normalizedDestination || !targets.length) return 0;

  let migrated = 0;
  for (const entry of targets) {
    const suffix = entry.relativePath.slice(normalizedSource.length);
    const nextRelativePath = `${normalizedDestination}${suffix}`;
    const snapshotFile = path.basename(String(entry.snapshotFile || ""));
    if (!snapshotFile) continue;
    const snapshotPath = path.join(context.snapshotsRoot, snapshotFile);
    let snapshot, raw;
    try { raw = await fs.promises.readFile(snapshotPath, "utf8"); snapshot = JSON.parse(raw); }
    catch (error) { if (error?.code === "ENOENT" || error instanceof SyntaxError) continue; throw error; }
    if (snapshot?.targetType !== "manuscript" || normalizeBackupPath(snapshot.relativePath) !== entry.relativePath) continue;
    snapshot.relativePath = nextRelativePath;
    snapshot.fileName = path.basename(nextRelativePath);
    await writeJsonAtomic(snapshotPath, snapshot, storageRevision(raw));
    entry.relativePath = nextRelativePath;
    entry.fileName = snapshot.fileName;
    migrated += 1;
  }
  if (migrated) {
    index.updatedAt = new Date().toISOString();
    context.indexRevision = await writeJsonAtomic(context.indexPath, index, context.indexRevision);
  }
  return migrated;
}

async function migrateMovedManuscriptHistory(context, index) {
  const sourcePath = findMovedBackupSourcePath(index, context);
  if (!sourcePath) return index;
  await rewriteBackupPaths(context, index, sourcePath, context.relativePath);
  return index;
}

async function rebuildBackupIndexFromSnapshots(context) {
  let original = null;
  try { original = await fs.promises.readFile(context.indexPath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  context.indexRevision = storageRevision(original);
  let names = [];
  try { names = await fs.promises.readdir(context.snapshotsRoot); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const values = [];
  for (const name of names.filter((value) => /[.]json$/i.test(value))) {
    try {
      const snapshot = JSON.parse(await fs.promises.readFile(path.join(context.snapshotsRoot, name), "utf8"));
      if (path.basename(name, path.extname(name)) !== String(snapshot?.id || "")) continue;
      values.push(snapshot);
    } catch {
      // 破損したスナップショットだけを除外し、残りの履歴から索引を復旧する。
    }
  }
  const index = rebuildBackupIndex(values);
  if (values.length || fs.existsSync(context.indexPath)) context.indexRevision = await writeJsonAtomic(context.indexPath, index, context.indexRevision);
  return index;
}

async function readIndexFile(indexPath, context) {
  let raw = null;
  try {
    raw = await fs.promises.readFile(indexPath, "utf8");
    return normalizeBackupIndex(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return emptyBackupIndex();
  } finally {
    if (context) context.indexRevision = storageRevision(raw);
  }
}

async function migrateLegacyBackups(context) {
  if (!context.legacyBackupRoot || realPathSafe(context.legacyBackupRoot) === realPathSafe(context.backupRoot)) return;
  const legacyIndex = await readIndexFile(path.join(context.legacyBackupRoot, BACKUP_INDEX_FILE));
  const candidates = legacyIndex.snapshots.filter((entry) => entry.targetType === "manuscript" && entry.relativePath === context.relativePath);
  if (!candidates.length) return;
  const currentHash = hashBackupContent(context.document.getText());
  if (!candidates.some((entry) => entry.contentHash === currentHash)) return;

  const currentIndex = await readIndexFile(context.indexPath, context);
  const knownIds = new Set(currentIndex.snapshots.map((entry) => entry.id));
  const additions = candidates.filter((entry) => !knownIds.has(entry.id));
  if (!additions.length) return;
  await fs.promises.mkdir(context.snapshotsRoot, { recursive: true });
  for (const entry of additions) {
    const fileName = path.basename(entry.snapshotFile);
    if (!fileName) continue;
    const source = path.join(context.legacyBackupRoot, BACKUP_SNAPSHOT_FOLDER, fileName);
    const destination = path.join(context.snapshotsRoot, fileName);
    try { await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  currentIndex.snapshots.push(...additions);
  currentIndex.snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  currentIndex.updatedAt = new Date().toISOString();
  await writeJsonAtomic(context.indexPath, currentIndex, context.indexRevision);
}

async function migrateManuscriptBackupsForMove(oldPath, newPath) {
  const workDir = findMojigotoRoot(newPath) || findMojigotoRoot(oldPath);
  if (!workDir) return 0;
  const configuredRoot = getResolvedManuscriptRoot();
  const manuscriptRoot = configuredRoot && isInside(configuredRoot, newPath)
    ? configuredRoot
    : getManuscriptCandidates()
      .map((name) => path.join(workDir, name))
      .find((candidate) => isInside(candidate, newPath));
  if (!manuscriptRoot) return 0;
  const sourcePath = normalizeBackupPath(path.relative(manuscriptRoot, oldPath));
  const destinationPath = normalizeBackupPath(path.relative(manuscriptRoot, newPath));
  if (!sourcePath || !destinationPath || sourcePath.startsWith("..") || destinationPath.startsWith("..")) return 0;
  const backupRoot = path.join(workDir, ".mojigoto", BACKUP_FOLDER);
  const context = {
    indexPath: path.join(backupRoot, BACKUP_INDEX_FILE),
    snapshotsRoot: path.join(backupRoot, BACKUP_SNAPSHOT_FOLDER),
  };
  return enqueueBackupOperation(context.indexPath, async () => {
    const index = await readIndexFile(context.indexPath, context);
    return rewriteBackupPaths(context, index, sourcePath, destinationPath);
  });
}


function planManuscriptBackupPruning(index) {
  const plan = planBackupRetention(index, { maxPerFile: readBackupSettings().maxPerFile });
  plan.index.updatedAt = new Date().toISOString();
  return plan;
}

async function deletePrunedManuscriptBackups(context, removed) {
  await Promise.all(removed.map((entry) => fs.promises.unlink(
    path.join(context.snapshotsRoot, path.basename(entry.snapshotFile)),
  ).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  })));
}

async function createManuscriptBackup(document, reason = "manual") {
  const context = resolveBackupContext(document);
  const content = document.getText();
  return enqueueBackupOperation(context.indexPath, () => createManuscriptBackupInQueue(context, content, reason));
}

async function createManuscriptBackupInQueue(context, content, reason) {
  const contentHash = hashBackupContent(content);
  const index = await readBackupIndex(context);
  if (reason === "manual" || reason === "automatic") {
    const duplicate = index.snapshots.find((entry) => entry.targetType === "manuscript" && entry.relativePath === context.relativePath && entry.contentHash === contentHash);
    if (duplicate) return { context, index, entry: duplicate, duplicate: true };
  }

  const createdAt = new Date().toISOString();
  const id = createBackupId(createdAt);
  const snapshot = createBackupSnapshot({
    id,
    relativePath: context.relativePath,
    fileName: context.fileName,
    createdAt,
    source: "vscode",
    reason,
    content,
    contentHash,
  });
  await fs.promises.mkdir(context.snapshotsRoot, { recursive: true });
  await writeJsonAtomic(path.join(context.snapshotsRoot, `${id}.json`), snapshot);
  const entry = backupIndexEntry(snapshot);
  index.snapshots.unshift(entry);
  index.updatedAt = createdAt;
  const plan = planManuscriptBackupPruning(index);
  context.indexRevision = await writeJsonAtomic(context.indexPath, plan.index, context.indexRevision);
  await deletePrunedManuscriptBackups(context, plan.removed).catch((error) => {
    console.warn("[mojigoto] old backup cleanup failed", error);
  });
  return { context, index: plan.index, entry, duplicate: false };
}

async function maybeCreateAutomaticBackup(document) {
  if (!document || automaticBackupSuppression.has(document.uri.toString())) return;
  const configuredMinutes = readBackupSettings().intervalMinutes;
  const intervalMs = configuredMinutes <= 0 ? 0 : Math.max(5, Math.min(1440, configuredMinutes)) * 60 * 1000;
  if (!intervalMs) return;
  let context;
  try { context = resolveBackupContext(document); } catch { return; }
  return enqueueBackupOperation(context.indexPath, async () => {
    const index = await readBackupIndex(context);
    const latest = index.snapshots
      .filter((entry) => entry.targetType === "manuscript" && entry.relativePath === context.relativePath && entry.reason === "automatic")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (latest && Date.now() - Date.parse(latest.createdAt) < intervalMs) return;
    await createManuscriptBackupInQueue(context, document.getText(), "automatic");
  });
}

async function listManuscriptBackups(document) {
  const context = resolveBackupContext(document);
  return enqueueBackupOperation(context.indexPath, async () => {
    const index = await readBackupIndex(context);
    return {
      context,
      entries: index.snapshots
        .filter((entry) => entry.targetType === "manuscript" && entry.relativePath === context.relativePath)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  });
}

async function readSnapshot(context, entry, readState) {
  const fileName = path.basename(String(entry.snapshotFile || ""));
  if (!fileName) throw new Error("バックアップファイルを確認できませんでした。");
  const raw = await fs.promises.readFile(path.join(context.snapshotsRoot, fileName), "utf8");
  const value = JSON.parse(raw);
  if (readState) readState.revision = storageRevision(raw);
  if (value.targetType !== "manuscript" || normalizeBackupPath(value.relativePath) !== context.relativePath) throw new Error("別の原稿のバックアップです。");
  if (value.id !== entry.id || typeof value.content !== "string" || !value.contentHash
    || hashBackupContent(value.content) !== value.contentHash
    || (entry.contentHash && entry.contentHash !== value.contentHash)) throw new Error("バックアップの内容を検証できませんでした。");
  return value;
}

function backupReasonLabel(reason) {
  if (reason === "before-import") return "取込上書き前";
  if (reason === "before-restore") return "復元直前";
  return reason === "automatic" ? "自動" : "手動";
}

async function setSnapshotProtection(context, entry, protectedValue) {
  return enqueueBackupOperation(context.indexPath, async () => {
    const index = await readBackupIndex(context);
    const target = index.snapshots.find((candidate) => candidate.id === entry.id);
    if (!target) throw new Error("選択したバックアップが見つかりませんでした。");
    target.protected = protectedValue;
    const readState = {};
    const snapshot = await readSnapshot(context, target, readState);
    snapshot.protected = protectedValue;
    await writeJsonAtomic(path.join(context.snapshotsRoot, target.snapshotFile), snapshot, readState.revision);
    index.updatedAt = new Date().toISOString();
    context.indexRevision = await writeJsonAtomic(context.indexPath, index, context.indexRevision);
  });
}

async function compareSnapshot(context, entry) {
  const snapshot = await readSnapshot(context, entry);
  const backupUri = createBackupContentUri(snapshot.content, context.fileName);
  await vscode.commands.executeCommand(
    "vscode.diff",
    backupUri,
    context.document.uri,
    `${entry.fileName}（${new Date(entry.createdAt).toLocaleString("ja-JP")}） ↔ 現在`,
  );
  const comparisonTab = vscode.window.tabGroups?.activeTabGroup?.activeTab || null;
  const nextAction = await vscode.window.showInformationMessage(
    `比較中: 左が ${new Date(entry.createdAt).toLocaleString("ja-JP")} のバックアップ、右が現在の原稿です。`,
    "このバックアップを復元",
    "比較を閉じる",
  );
  if (nextAction === "このバックアップを復元" || nextAction === "比較を閉じる") {
    if (comparisonTab && vscode.window.tabGroups?.close) {
      await vscode.window.tabGroups.close(comparisonTab);
    } else {
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }
    releaseBackupContentUri(backupUri);
  }
  return nextAction === "このバックアップを復元" ? "restore" : "close";
}

async function restoreSnapshot(context, entry) {
  const snapshot = await readSnapshot(context, entry);
  const answer = await vscode.window.showWarningMessage(
    `${new Date(entry.createdAt).toLocaleString("ja-JP")} の内容へ復元します。現在の内容は復元直前バックアップとして保存されます。`,
    { modal: true },
    "復元する",
  );
  if (answer !== "復元する") return false;
  const beforeRestoreVersion = context.document.version;
  await createManuscriptBackup(context.document, "before-restore");
  if (context.document.version !== beforeRestoreVersion) throw new Error("復元前の退避中に原稿が更新されました。入力を保持して復元を中止しました。");
  const edit = new vscode.WorkspaceEdit();
  const lastLine = Math.max(0, context.document.lineCount - 1);
  const end = context.document.lineAt(lastLine).range.end;
  edit.replace(context.document.uri, new vscode.Range(new vscode.Position(0, 0), end), String(snapshot.content || ""));
  if (!await vscode.workspace.applyEdit(edit)) throw new Error("原稿へ復元内容を反映できませんでした。");
  const documentKey = context.document.uri.toString();
  automaticBackupSuppression.add(documentKey);
  try {
    if (!await context.document.save()) throw new Error("復元した原稿を保存できませんでした。");
  } finally {
    automaticBackupSuppression.delete(documentKey);
  }
  vscode.window.showInformationMessage("もじごと: バックアップから原稿を復元しました。");
  return true;
}

async function openBackupHistory(document = vscode.window.activeTextEditor?.document) {
  const { context, entries } = await listManuscriptBackups(document);
  if (!entries.length) {
    vscode.window.showInformationMessage("もじごと: この原稿のバックアップはまだありません。");
    return;
  }
  const picked = await vscode.window.showQuickPick(entries.map((entry) => ({
    label: new Date(entry.createdAt).toLocaleString("ja-JP"),
    description: `${entry.protected ? "保護・" : ""}${backupReasonLabel(entry.reason)}・${entry.source === "web" ? "Web" : "VS Code"}・${entry.characters.toLocaleString("ja-JP")}文字`,
    entry,
  })), { placeHolder: "現在開いている原稿ファイルのバックアップを選択してください" });
  if (!picked) return;
  const action = await vscode.window.showQuickPick([
    { label: "現在の内容と比較", value: "compare" },
    { label: "この履歴から復元", value: "restore" },
    { label: picked.entry.protected ? "履歴の保護を解除" : "この履歴を保護", value: "protect" },
  ], { placeHolder: `${picked.label} の操作を選択してください` });
  if (action?.value === "compare") {
    const nextAction = await compareSnapshot(context, picked.entry);
    if (nextAction === "restore") await restoreSnapshot(context, picked.entry);
  }
  if (action?.value === "restore") await restoreSnapshot(context, picked.entry);
  if (action?.value === "protect") {
    await setSnapshotProtection(context, picked.entry, !picked.entry.protected);
    vscode.window.showInformationMessage(`もじごと: バックアップの保護を${picked.entry.protected ? "解除" : "設定"}しました。`);
  }
}

function registerManuscriptBackupCommands(extensionContext) {
  registerBackupContentProvider(extensionContext);
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.createManuscriptBackup", async () => {
      try {
        const result = await createManuscriptBackup(vscode.window.activeTextEditor?.document, "manual");
        vscode.window.showInformationMessage(result.duplicate
          ? "もじごと: 同じ内容のバックアップがすでにあります。"
          : "もじごと: 原稿のバックアップを作成しました。");
      } catch (error) {
        vscode.window.showErrorMessage(`もじごと: バックアップを作成できませんでした: ${error.message || String(error)}`);
      }
    }),
    vscode.commands.registerCommand("mojigoto.openManuscriptBackupHistory", async () => {
      try {
        await openBackupHistory();
      } catch (error) {
        vscode.window.showErrorMessage(`もじごと: バックアップ履歴を開けませんでした: ${error.message || String(error)}`);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      maybeCreateAutomaticBackup(document).catch((error) => {
        console.warn("[mojigoto] automatic manuscript backup failed", error);
      });
    }),
  );
}

module.exports = {
  resolveBackupContext,
  findMovedBackupSourcePath,
  rewriteBackupPaths,
  writeJsonAtomic,
  migrateManuscriptBackupsForMove,
  createManuscriptBackup,
  listManuscriptBackups,
  readSnapshot,
  rebuildBackupIndexFromSnapshots,
  maybeCreateAutomaticBackup,
  registerManuscriptBackupCommands,
};
