import { BACKUP_FOLDER, BACKUP_INDEX_FILE, BACKUP_SNAPSHOT_FOLDER, emptyBackupIndex, normalizeBackupIndex, rebuildBackupIndex, planBackupRetention, hashBackupContent } from "./backup-format.mjs";

// Cloud backup storage and validation; screen actions and creation policy stay in the app.
export function createBackupStorage({ state, beginPerformanceMeasurement, currentBackupTarget }) {
  async function measureBackupStep(label, operation, details = {}) {
    const finish = beginPerformanceMeasurement(label, details);
    try {
      const result = await operation();
      finish();
      return result;
    } catch (error) {
      finish({ failed: true });
      throw error;
    }
  }

  async function loadManuscriptBackupStorage({ create = false, mojigoto = state.selectedWork?.mojigoto, provider = state.provider } = {}) {
    if (!mojigoto?.id) throw new Error("作品の管理フォルダを確認できませんでした。");
    const mojigotoChildren = await measureBackupStep("バックアップ・管理フォルダ一覧", () => provider.listChildren(mojigoto.id));
    let backupFolder = mojigotoChildren.find((item) => item?.folder && item.name === BACKUP_FOLDER) || null;
    if (!backupFolder && provider.requiresExplicitFileAccess) {
      throw new Error("バックアップ保存先を確認できません。VS Codeでバックアップを作成し、Driveの同期完了後に .mojigoto/backups とその中身を追加許可してください。重複を防ぐため、新規作成していません。");
    }
    if (!backupFolder && create) backupFolder = await measureBackupStep("バックアップ・保存フォルダ作成", () => provider.createFolder(mojigoto, BACKUP_FOLDER));
    if (!backupFolder) return null;
    const backupChildren = await measureBackupStep("バックアップ・保存フォルダ一覧", () => provider.listChildren(backupFolder.id));
    let snapshotsFolder = backupChildren.find((item) => item?.folder && item.name === BACKUP_SNAPSHOT_FOLDER) || null;
    if (!snapshotsFolder && provider.requiresExplicitFileAccess) {
      throw new Error("バックアップの snapshots フォルダを確認できません。Google Driveの設定ページで backups とその中身を追加許可してください。");
    }
    if (!snapshotsFolder && create) snapshotsFolder = await measureBackupStep("バックアップ・履歴フォルダ作成", () => provider.createFolder(backupFolder, BACKUP_SNAPSHOT_FOLDER));
    if (!snapshotsFolder && create) throw new Error("バックアップ保存フォルダを作成できませんでした。");
    // Creating snapshots does not change an existing index entry. Reuse this listing.
    const indexFile = backupChildren.find((item) => item?.file && item.name === BACKUP_INDEX_FILE) || null;
    return { backupFolder, snapshotsFolder, indexFile, provider };
  }

  async function readWebBackupIndex(storage) {
    if (!storage) return emptyBackupIndex();
    try {
      if (!storage.indexFile) throw new Error("missing backup index");
      const parsed = JSON.parse(await measureBackupStep("バックアップ・索引読込", () => storage.provider.readText(storage.indexFile), { bytes: storage.indexFile.size ?? null }));
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.snapshots)) {
        throw new Error("invalid backup index");
      }
      return normalizeBackupIndex(parsed);
    } catch (error) {
      if (storage.provider.requiresExplicitFileAccess) {
        throw new Error("バックアップ索引を読み込めませんでした。Google Driveの追加許可で backups/index.json と snapshots の中身を確認してください。索引が破損・消失している場合は、VS Codeのバックアップ履歴で再構築し、同期後に許可してください。Webでは一部の履歴だけで再構築しません。");
      }
      if (storage.indexFile && !(error instanceof SyntaxError) && error.message !== "invalid backup index") throw error;
      try {
        return await measureBackupStep("バックアップ・索引再構築", () => rebuildWebBackupIndexFromSnapshots(storage));
      } catch (rebuildError) {
        throw new Error(`バックアップ索引を再構築できませんでした: ${rebuildError.message || String(rebuildError)}`);
      }
    }
  }

  async function rebuildWebBackupIndexFromSnapshots(storage) {
    if (storage?.provider.requiresExplicitFileAccess) throw new Error("Google Driveの索引再構築はVS Codeで行ってください。");
    if (!storage?.snapshotsFolder) return emptyBackupIndex();
    const items = (await storage.provider.listChildren(storage.snapshotsFolder.id))
      .filter((item) => item?.file && /[.]json$/i.test(item.name));
    const settled = await Promise.allSettled(items.map(async (item) => {
      const snapshot = JSON.parse(await storage.provider.readText(item));
      return item.name === `${snapshot?.id || ""}.json` ? snapshot : null;
    }));
    const values = settled
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value);
    const failedRead = settled.find((result) => result.status === "rejected" && !(result.reason instanceof SyntaxError));
    if (failedRead) throw failedRead.reason;
    const index = await rebuildBackupIndex(values);
    if (values.length || storage.indexFile) await saveWebBackupIndex(storage, index);
    return index;
  }

  async function saveWebBackupIndex(storage, index) {
    if (!storage.indexFile && storage.provider.requiresExplicitFileAccess) throw new Error("バックアップの index.json を追加許可してください。新規作成していません。");
    const content = `${JSON.stringify(index, null, 2)}\n`;
    const saved = await measureBackupStep("バックアップ・索引保存", () => storage.indexFile
      ? storage.provider.writeText(storage.indexFile, content, storage.indexFile.eTag)
      : storage.provider.createTextFile(storage.backupFolder, BACKUP_INDEX_FILE, content), { entries: index.snapshots.length, characters: content.length });
    storage.indexFile = { ...(storage.indexFile || {}), ...saved };
    return storage.indexFile;
  }

  function planWebBackupPruning(index) {
    const plan = planBackupRetention(index);
    plan.index.updatedAt = new Date().toISOString();
    return plan;
  }

  async function deletePrunedWebBackups(storage, removed) {
    if (!removed.length || !storage.snapshotsFolder) return;
    const items = await measureBackupStep("バックアップ・整理対象一覧", () => storage.provider.listChildren(storage.snapshotsFolder.id), { removed: removed.length });
    const byName = new Map(items.filter((item) => item?.file).map((item) => [item.name, item]));
    await measureBackupStep("バックアップ・古い履歴削除", () => Promise.all(removed.map(async (entry) => {
      const item = byName.get(entry.snapshotFile);
      if (item) await storage.provider.deleteItem(item);
    })), { removed: removed.length });
  }

  async function readWebBackupSnapshot(storage, entry) {
    if (!storage?.snapshotsFolder) throw new Error("バックアップ保存フォルダを確認できませんでした。");
    const items = await storage.provider.listChildren(storage.snapshotsFolder.id);
    const item = items.find((candidate) => candidate?.file && candidate.name === entry.snapshotFile);
    if (!item) throw new Error("選択したバックアップファイルが見つかりませんでした。");
    const snapshot = JSON.parse(await storage.provider.readText(item));
    const target = currentBackupTarget();
    if (snapshot.targetType !== target.targetType || snapshot.relativePath !== target.relativePath) throw new Error("別のデータのバックアップです。");
    if (snapshot.id !== entry.id || typeof snapshot.content !== "string"
      || !snapshot.contentHash || await hashBackupContent(snapshot.content) !== snapshot.contentHash
      || (entry.contentHash && entry.contentHash !== snapshot.contentHash)) {
      throw new Error("バックアップの内容を検証できませんでした。復元は行っていません。");
    }
    if (target.targetType !== "manuscript") {
      const data = JSON.parse(snapshot.content);
      if (!data || typeof data !== "object" || Array.isArray(data)
        || (target.targetType === "conceptMemo" && !Array.isArray(data.memos))) {
        throw new Error("バックアップのデータ形式を確認できませんでした。復元は行っていません。");
      }
    }
    return snapshot;
  }

  async function setWebBackupProtection(storage, index, entry, protectedValue) {
    const nextIndex = structuredClone(index);
    const target = nextIndex.snapshots.find((candidate) => candidate.id === entry.id);
    if (!target) throw new Error("選択したバックアップが見つかりませんでした。");
    target.protected = protectedValue;
    const snapshotItems = await storage.provider.listChildren(storage.snapshotsFolder.id);
    const snapshotItem = snapshotItems.find((item) => item?.file && item.name === target.snapshotFile);
    if (!snapshotItem) throw new Error("保護するバックアップを確認できませんでした。Driveの追加許可と同期状態を確認してください。");
    if (snapshotItem) {
      const snapshot = JSON.parse(await storage.provider.readText(snapshotItem));
      snapshot.protected = protectedValue;
      await storage.provider.writeText(snapshotItem, `${JSON.stringify(snapshot, null, 2)}\n`, snapshotItem.eTag);
    }
    nextIndex.updatedAt = new Date().toISOString();
    await saveWebBackupIndex(storage, nextIndex);
    state.manuscriptBackupStorage = storage;
  }
  return { measureBackupStep, loadManuscriptBackupStorage, readWebBackupIndex, rebuildWebBackupIndexFromSnapshots, saveWebBackupIndex, planWebBackupPruning, deletePrunedWebBackups, readWebBackupSnapshot, setWebBackupProtection };
}
