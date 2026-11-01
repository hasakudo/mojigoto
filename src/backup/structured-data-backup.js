const fs = require("fs");
const path = require("path");
const vscode = require("vscode");
const { enqueueBackupOperation, writeJsonAtomic } = require("./backup-storage");
const { readBackupSettings } = require("./backup-settings");
const { storageRevision, writeRawFile } = require("../data/structured-file-write");
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
  normalizeBackupTargetType,
  planBackupRetention,
  rebuildBackupIndex,
} = require("./backup-format");
const { createBackupContentUri, releaseBackupContentUri } = require("./backup-content-provider");


function resolveStructuredBackupContext(filePath, targetType) {
  const resolvedFilePath = path.resolve(String(filePath || ""));
  let cursor = path.dirname(resolvedFilePath);
  while (cursor && path.basename(cursor).toLowerCase() !== ".mojigoto") {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (path.basename(cursor).toLowerCase() !== ".mojigoto") {
    throw new Error("作品の .mojigoto フォルダを確認できませんでした。");
  }
  const relativePath = path.relative(cursor, resolvedFilePath).replace(/\\/g, "/");
  if (!relativePath || relativePath.startsWith("..")) throw new Error("作品内のデータファイルを確認できませんでした。");
  const backupRoot = path.join(cursor, BACKUP_FOLDER);
  return {
    filePath: resolvedFilePath,
    fileName: path.basename(resolvedFilePath),
    targetType: normalizeBackupTargetType(targetType),
    relativePath,
    backupRoot,
    snapshotsRoot: path.join(backupRoot, BACKUP_SNAPSHOT_FOLDER),
    indexPath: path.join(backupRoot, BACKUP_INDEX_FILE),
  };
}


async function rebuildIndex(context) {
  let original = null;
  try { original = await fs.promises.readFile(context.indexPath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  context.indexRevision = storageRevision(original);
  let names = [];
  try { names = await fs.promises.readdir(context.snapshotsRoot); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const snapshots = [];
  for (const name of names.filter((value) => /[.]json$/i.test(value))) {
    try {
      const value = JSON.parse(await fs.promises.readFile(path.join(context.snapshotsRoot, name), "utf8"));
      if (name !== `${value?.id || ""}.json`) continue;
      snapshots.push(value);
    } catch {
      // 壊れたスナップショットだけを除外する。
    }
  }
  const index = rebuildBackupIndex(snapshots);
  if (snapshots.length || fs.existsSync(context.indexPath)) context.indexRevision = await writeJsonAtomic(context.indexPath, index, context.indexRevision);
  return index;
}

async function readIndex(context) {
  try {
    const raw = await fs.promises.readFile(context.indexPath, "utf8");
    context.indexRevision = storageRevision(raw);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.snapshots)) throw new Error("invalid backup index");
    return normalizeBackupIndex(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.message !== "invalid backup index" && !(error instanceof SyntaxError)) throw error;
    return rebuildIndex(context);
  }
}


async function createStructuredBackup(input) {
  const context = resolveStructuredBackupContext(input.filePath, input.targetType);
  return enqueueBackupOperation(context.indexPath, async () => {
    const content = input.content === undefined
      ? await fs.promises.readFile(context.filePath, "utf8")
      : String(input.content);
    const reason = ["automatic", "before-restore", "before-import"].includes(input.reason) ? input.reason : "manual";
    const contentHash = hashBackupContent(content);
    const index = await readIndex(context);
    if (reason === "automatic") {
      const intervalMinutes = Math.max(0, Number(input.intervalMinutes ?? readBackupSettings().intervalMinutes) || 0);
      if (!intervalMinutes) return { context, index, entry: null, duplicate: true, disabled: true };
      const latest = index.snapshots
        .filter((entry) => entry.targetType === context.targetType && entry.relativePath === context.relativePath && entry.reason === "automatic")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (latest && Date.now() - Date.parse(latest.createdAt) < intervalMinutes * 60 * 1000) {
        return { context, index, entry: latest, duplicate: true, interval: true };
      }
    }
    if (!["before-restore", "before-import"].includes(reason)) {
      const duplicate = index.snapshots.find((entry) => entry.targetType === context.targetType
        && entry.relativePath === context.relativePath && entry.contentHash === contentHash);
      if (duplicate) return { context, index, entry: duplicate, duplicate: true };
    }
    const createdAt = new Date().toISOString();
    const id = createBackupId(createdAt);
    const snapshot = createBackupSnapshot({
      id,
      targetType: context.targetType,
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
    index.snapshots.unshift(backupIndexEntry(snapshot));
    index.updatedAt = createdAt;
    const plan = planBackupRetention(index, { maxPerFile: readBackupSettings().maxPerFile });
    plan.index.updatedAt = createdAt;
    context.indexRevision = await writeJsonAtomic(context.indexPath, plan.index, context.indexRevision);
    await Promise.all(plan.removed.map((entry) => fs.promises.unlink(
      path.join(context.snapshotsRoot, path.basename(entry.snapshotFile)),
    ).catch((error) => { if (error?.code !== "ENOENT") throw error; })));
    return { context, index: plan.index, entry: backupIndexEntry(snapshot), duplicate: false };
  });
}

async function listStructuredBackups(filePath, targetType) {
  const context = resolveStructuredBackupContext(filePath, targetType);
  return enqueueBackupOperation(context.indexPath, async () => {
    const index = await readIndex(context);
    return {
      context,
      index,
      entries: index.snapshots
        .filter((entry) => entry.targetType === context.targetType && entry.relativePath === context.relativePath)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  });
}

async function readSnapshot(context, entry, readState) {
  const fileName = path.basename(String(entry?.snapshotFile || ""));
  if (!fileName) throw new Error("バックアップファイルを確認できませんでした。");
  const raw = await fs.promises.readFile(path.join(context.snapshotsRoot, fileName), "utf8");
  const snapshot = JSON.parse(raw);
  if (readState) readState.revision = storageRevision(raw);
  if (normalizeBackupTargetType(snapshot.targetType) !== context.targetType || String(snapshot.relativePath || "").replace(/\\/g, "/") !== context.relativePath) {
    throw new Error("別のデータのバックアップです。");
  }
  if (snapshot.id !== entry.id || typeof snapshot.content !== "string" || !snapshot.contentHash
    || hashBackupContent(snapshot.content) !== snapshot.contentHash
    || (entry.contentHash && entry.contentHash !== snapshot.contentHash)) throw new Error("バックアップの内容を検証できませんでした。");
  const data = JSON.parse(snapshot.content);
  if (!data || typeof data !== "object" || Array.isArray(data)
    || (context.targetType === "conceptMemo" && !Array.isArray(data.memos))) throw new Error("バックアップのデータ形式を確認できませんでした。");
  return snapshot;
}

async function setProtection(context, entry, protectedValue) {
  return enqueueBackupOperation(context.indexPath, async () => {
    const index = await readIndex(context);
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

function reasonLabel(reason) {
  if (reason === "before-import") return "取込上書き前";
  if (reason === "before-restore") return "復元直前";
  return reason === "automatic" ? "自動" : "手動";
}

async function openStructuredBackupHistory({ filePath, targetType, label, onRestored }) {
  let listing = await listStructuredBackups(filePath, targetType);
  const choices = [
    { label: "$(save) 現在の内容をバックアップ", action: "create" },
    ...listing.entries.map((entry) => ({
      label: new Date(entry.createdAt).toLocaleString("ja-JP"),
      description: `${entry.protected ? "保護・" : ""}${reasonLabel(entry.reason)}・${entry.source === "web" ? "Web" : "VS Code"}`,
      entry,
    })),
  ];
  const picked = await vscode.window.showQuickPick(choices, { placeHolder: `${label}のバックアップ履歴` });
  if (!picked) return false;
  if (picked.action === "create") {
    const result = await createStructuredBackup({ filePath, targetType, reason: "manual" });
    vscode.window.showInformationMessage(result.duplicate ? "もじごと: 同じ内容のバックアップがすでにあります。" : `もじごと: ${label}をバックアップしました。`);
    return false;
  }
  const action = await vscode.window.showQuickPick([
    { label: "現在の内容と比較", value: "compare" },
    { label: "この履歴から復元", value: "restore" },
    { label: picked.entry.protected ? "履歴の保護を解除" : "この履歴を保護", value: "protect" },
  ], { placeHolder: `${picked.label} の操作` });
  if (!action) return false;
  if (action.value === "compare") {
    const snapshot = await readSnapshot(listing.context, picked.entry);
    const backupUri = createBackupContentUri(snapshot.content, `${path.basename(filePath, path.extname(filePath))}-backup.json`);
    await vscode.commands.executeCommand("vscode.diff", backupUri, vscode.Uri.file(filePath), `${label}のバックアップ ↔ 現在`);
    const comparisonTab = vscode.window.tabGroups?.activeTabGroup?.activeTab || null;
    const nextAction = await vscode.window.showInformationMessage(
      `比較中: 左が ${picked.label} のバックアップ、右が現在の${label}です。`,
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
    if (nextAction !== "このバックアップを復元") return false;
  }
  if (action.value === "protect") {
    await setProtection(listing.context, picked.entry, !picked.entry.protected);
    vscode.window.showInformationMessage(`もじごと: バックアップの保護を${picked.entry.protected ? "解除" : "設定"}しました。`);
    return false;
  }
  const answer = await vscode.window.showWarningMessage(
    `${picked.label} の内容へ復元します。現在の内容は復元直前バックアップとして保存されます。`,
    { modal: true },
    "復元する",
  );
  if (answer !== "復元する") return false;
  const snapshot = await readSnapshot(listing.context, picked.entry);
  const currentContent = await fs.promises.readFile(filePath, "utf8");
  await createStructuredBackup({ filePath, targetType, reason: "before-restore", content: currentContent });
  await writeRawFile(filePath, snapshot.content, storageRevision(currentContent));
  void require("../export/web-note-markdown").afterNoteSaved(filePath);
  if (onRestored) await onRestored();
  vscode.window.showInformationMessage(`もじごと: ${label}をバックアップから復元しました。`);
  return true;
}

module.exports = {
  createStructuredBackup,
  listStructuredBackups,
  openStructuredBackupHistory,
  resolveStructuredBackupContext,
};
