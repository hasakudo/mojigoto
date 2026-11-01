import { confirmedBackupTime, rememberBackupTime } from "./automatic-backup-window.mjs";
import { backupIndexEntry, createBackupId, createBackupSnapshot, hashBackupContent } from "./backup-format.mjs";

// Backup creation and automatic intervals; storage and the current editor target are supplied.
export function createBackupCreation({
  state, workCatalogOwner, currentBackupTarget, manuscriptBackupTarget, backupSessionStorage,
  beginPerformanceMeasurement, measureBackupStep, loadManuscriptBackupStorage, readWebBackupIndex,
  planWebBackupPruning, saveWebBackupIndex, deletePrunedWebBackups, notify,
}) {
  function automaticBackupWindowKey(target) {
    if (!state.workRoot?.id || !state.selectedWork?.mojigoto?.id) return "";
    return "mojigoto.web.confirmedAutomaticBackup.v1." + JSON.stringify([
      workCatalogOwner(), state.cloudKind, state.workRoot.id, state.workRoot.parentReference?.driveId || "",
      state.selectedWork.mojigoto.id, state.selectedWork.mojigoto.parentReference?.driveId || "",
      target.targetType, target.relativePath,
    ]);
  }

  async function createWebManuscriptBackup(reason = "manual", contentOverride = null, targetOverride = null) {
    const target = structuredClone(targetOverride || currentBackupTarget());
    if (!target?.item || !target.relativePath) throw new Error("バックアップするデータを開いてください。");
    const relativePath = target.relativePath;
    const content = contentOverride === null ? target.content : String(contentOverride);
    const provider = state.provider;
    const mojigoto = state.selectedWork?.mojigoto;
    const intervalMs = state.manuscriptBackupIntervalMinutes * 60 * 1000;
    const confirmationKey = automaticBackupWindowKey(target);
    const confirmationStorage = backupSessionStorage();
    const finish = beginPerformanceMeasurement("バックアップ・処理全体", { targetType: target.targetType, reason });
    let result = "failed", indexEntries = null, removedEntries = 0;
    try {
      if (reason === "automatic" && !intervalMs) { result = "disabled"; return { entry: null, duplicate: true, disabled: true }; }
      const confirmedAt = reason === "automatic" ? confirmedBackupTime(confirmationStorage, confirmationKey, intervalMs) : 0;
      if (confirmedAt) {
        result = "confirmed-interval";
        return { entry: null, duplicate: true, interval: true, confirmedAt };
      }
      const storage = await loadManuscriptBackupStorage({ create: true, mojigoto, provider });
      const index = await readWebBackupIndex(storage);
      indexEntries = index.snapshots.length;
      if (reason === "automatic") {
        const latest = index.snapshots
          .filter((entry) => entry.targetType === target.targetType && entry.relativePath === relativePath && entry.reason === "automatic")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
        if (latest && Date.now() - Date.parse(latest.createdAt) < intervalMs) {
          rememberBackupTime(confirmationStorage, confirmationKey, latest.createdAt);
          result = "interval";
          return { entry: latest, duplicate: true, interval: true };
        }
      }
      const contentHash = await measureBackupStep("バックアップ・内容ハッシュ", () => hashBackupContent(content), { characters: content.length });
      if (reason === "manual" || reason === "automatic") {
        const duplicate = index.snapshots.find((entry) => entry.targetType === target.targetType && entry.relativePath === relativePath && entry.contentHash === contentHash);
        if (duplicate) { result = "duplicate"; return { entry: duplicate, duplicate: true }; }
      }
      const createdAt = new Date().toISOString();
      const id = createBackupId(createdAt);
      const snapshot = createBackupSnapshot({
        id,
        targetType: target.targetType,
        relativePath,
        fileName: target.fileName,
        createdAt,
        source: "web",
        reason,
        content,
        contentHash,
      });
      await measureBackupStep("バックアップ・本文保存", () => storage.provider.createTextFile(storage.snapshotsFolder, `${id}.json`, `${JSON.stringify(snapshot, null, 2)}\n`), { characters: content.length });
      const entry = backupIndexEntry(snapshot);
      index.snapshots.unshift(entry);
      index.updatedAt = createdAt;
      const plan = planWebBackupPruning(index);
      removedEntries = plan.removed.length;
      await saveWebBackupIndex(storage, plan.index);
      await deletePrunedWebBackups(storage, plan.removed).catch((error) => {
        console.warn("[mojigoto] old backup cleanup failed", error);
      });
      if (state.provider === provider && state.selectedWork?.mojigoto === mojigoto) state.manuscriptBackupStorage = storage;
      if (reason === "automatic") rememberBackupTime(confirmationStorage, confirmationKey, entry.createdAt);
      result = "created";
      return { entry, duplicate: false };
    } finally {
      finish({ result, indexEntries, removedEntries });
    }
  }

  async function maybeCreateWebAutomaticBackup(content, target = manuscriptBackupTarget(content)) {
    if (!target?.item || !state.selectedWork?.mojigoto) return;
    const intervalMs = state.manuscriptBackupIntervalMinutes * 60 * 1000;
    if (!intervalMs) return;
    const key = `${state.selectedWork.mojigoto.id}:${target.targetType}:${target.relativePath}`;
    const lastAttempt = state.manuscriptAutomaticBackups.get(key) || 0;
    if (Date.now() - lastAttempt < intervalMs) return;
    state.manuscriptAutomaticBackups.set(key, Date.now());
    try {
      const result = await createWebManuscriptBackup("automatic", content, target);
      const confirmedAt = result?.confirmedAt || Date.parse(result?.entry?.createdAt || "");
      if (result?.interval && Number.isFinite(confirmedAt) && confirmedAt > 0 && confirmedAt <= Date.now()) {
        // A check does not restart the configured interval.
        state.manuscriptAutomaticBackups.set(key, confirmedAt);
      }
    } catch (error) {
      state.manuscriptAutomaticBackups.delete(key);
      console.warn("[mojigoto] automatic manuscript backup failed", error);
      notify(`本文は保存しましたが、自動バックアップを作成できませんでした。\n${error.message || String(error)}`, true);
    }
  }
  return { automaticBackupWindowKey, createWebManuscriptBackup, maybeCreateWebAutomaticBackup };
}
