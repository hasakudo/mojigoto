import { normalizeGenres, normalizeWorkSettings } from "./work-settings.mjs";
import { OneDriveConflictError } from "../storage/onedrive-provider.mjs?v=1.0.1";

// Own settings persistence; the app supplies rendering, navigation and shared state.
export function createWorkSettingsPersistence({
  state, elements, cancelAutoSave, scheduleAutoSave, setWorkSettingsStatus,
  renderWorkSettings, startExternalMonitor, persistWorkCatalog, renderWorksList,
  notify, cloudLabel,
}) {
  async function ensureWorkSettingsFile() {
    if (!state.selectedWork?.mojigoto) throw new Error("作品の .mojigoto フォルダが見つかりません。");
    if (state.selectedWork.settingsFile?.id) return state.selectedWork.settingsFile;
    let children = await state.provider.listChildren(state.selectedWork.mojigoto.id);
    let item = children.find((entry) => entry?.file && entry.name === "work.json")
      || children.find((entry) => entry?.file && entry.name === "singleWork.json");
    if (!item) {
      // drive.file listings omit unauthorized files; absence is not proof that creation is safe.
      if (state.cloudKind === "googleDrive") {
        throw new Error([
          "作品設定ファイルを確認できません。",
          "Google Driveの設定ページで追加許可を行ってください。",
          "選択する項目：作品フォルダ・.mojigoto・work.json（Singleの場合はsingleWork.json）",
          "",
          "Single→Multi移行後は、Driveの同期完了を待ってから追加許可を行い、作品一覧を再読み込みしてください。",
          "重複を防ぐため、設定ファイルは新規作成していません。",
        ].join("\n"));
      }
      const settings = normalizeWorkSettings({}, state.selectedWork.name);
      settings.updatedAt = new Date().toISOString();
      item = await state.provider.createTextFile(
        state.selectedWork.mojigoto,
        "work.json",
        `${JSON.stringify(settings, null, 2)}\n`,
      );
      children = [...children, item];
    }
    state.selectedWork.mojigotoChildren = children;
    state.selectedWork.settingsFile = item;
    return item;
  }

  async function loadWorkSettings(item) {
    const raw = await state.provider.readText(item);
    state.currentSettings = {
      item,
      data: normalizeWorkSettings(JSON.parse(raw), state.selectedWork.name),
      raw,
    };
    state.dirty = false;
    state.externalConflict = false;
    state.workSettingsDocuments.set(String(state.selectedWork.id || ""), {
      value: state.currentSettings,
      loadedAt: Date.now(),
    });
    renderWorkSettings();
    setWorkSettingsStatus("保存済み");
    startExternalMonitor();
  }

  async function reloadWorkSettings(item = state.currentSettings?.item) {
    if (!item) return;
    await loadWorkSettings(item);
  }

  async function saveCurrentWorkSettings({ automatic = false } = {}) {
    cancelAutoSave();
    if (!state.currentSettings || state.saving || !state.dirty) return;
    if (state.externalConflict) {
      setWorkSettingsStatus("外部更新あり", "error");
      if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
      return;
    }
    state.saving = true;
    elements.saveWorkSettingsButton.disabled = true;
    setWorkSettingsStatus(automatic ? "自動保存中…" : "保存中…", "saving");
    const draftSnapshot = structuredClone(state.currentSettings.data);
    const snapshot = structuredClone(draftSnapshot);
    snapshot.title = String(snapshot.title || "").trim() || state.selectedWork.name;
    snapshot.genre = normalizeGenres(snapshot.genres).join(", ");
    snapshot.genres = normalizeGenres(snapshot.genres);
    snapshot.targetChars = Math.max(0, Number(snapshot.targetChars || 0) || 0);
    snapshot.updatedAt = new Date().toISOString();
    try {
      const content = `${JSON.stringify(snapshot, null, 2)}\n`;
      const saved = await state.provider.writeText(state.currentSettings.item, content, state.currentSettings.item.eTag);
      const liveData = state.currentSettings.data;
      const changedWhileSaving = JSON.stringify(liveData) !== JSON.stringify(draftSnapshot);
      state.currentSettings = {
        item: { ...state.currentSettings.item, ...saved },
        data: changedWhileSaving ? liveData : snapshot,
        raw: content,
      };
      state.selectedWork.settingsFile = state.currentSettings.item;
      state.selectedWork.contentUpdatedAt = state.currentSettings.item.lastModifiedDateTime || snapshot.updatedAt || state.selectedWork.contentUpdatedAt;
      state.workSettingsDocuments.set(String(state.selectedWork.id || ""), {
        value: state.currentSettings,
        loadedAt: Date.now(),
      });
      state.selectedWork.title = snapshot.title;
      state.selectedWork.status = snapshot.status;
      persistWorkCatalog(state.workRoot, state.works);
      renderWorksList();
      state.dirty = changedWhileSaving;
      renderWorkSettings();
      setWorkSettingsStatus(changedWhileSaving ? "未保存" : "保存済み", changedWhileSaving ? "dirty" : "");
      if (!automatic) notify(`作品設定を${cloudLabel()}へ保存しました。`);
    } catch (error) {
      if (error instanceof OneDriveConflictError || error?.code === "conflict") {
        state.externalConflict = true;
        setWorkSettingsStatus("競合あり", "error");
        if (!elements.conflictDialog.open) elements.conflictDialog.showModal();
      } else {
        setWorkSettingsStatus("保存失敗", "error");
        notify(error.message || "作品設定を保存できませんでした。", true);
      }
    } finally {
      state.saving = false;
      elements.saveWorkSettingsButton.disabled = !state.dirty;
      if (state.dirty) scheduleAutoSave();
    }
  }
  return { ensureWorkSettingsFile, loadWorkSettings, reloadWorkSettings, saveCurrentWorkSettings };
}
