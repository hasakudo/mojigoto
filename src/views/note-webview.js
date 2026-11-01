const vscode = require("vscode");
const { registerRestorableWebview, withRestoredWebviews, webviewFileKey } = require("./shared/restored-webviews");
const path = require("path");
const { getNonce } = require("../core/path-utils");
const { isNoteMemoAutoSyncEnabled } = require("../data/memo-auto-sync");
const { updateWebviewSaveSetting } = require("../data/webview-save-settings");
const fsp = require("fs/promises");
const openNotePanels = new Map();
const openNotePanelsByPath = new Map();
let activeNotePanel = null;
const { isSingleMode } = require("../core/mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
} = require("../core/mojigoto-paths");
const {
  getCurrentWorkDisplayName,
  getCurrentWorkTitleFromSettings,
  getWorkSettingsForDirectory,
} = require("../work/work-settings");
const { notifyConceptMemoUpdated } = require("./concept-memo-webview");
const {
  createConceptMemoFromNoteItem,
  updateConceptMemoSourceStatus,
  updateConceptMemoSourceAutoSync,
  markConceptMemosMissingByNotePath,
} = require("../data/concept-memo-store");
const {
  saveUserTemplate,
  saveUserGroupTemplate,
  listUserTemplates,
  deleteUserTemplateById,
} = require("../data/user-note-templates");
const {
  readNoteFile,
  saveNoteFile,
  searchNotesByType,
  resolveRelatedNoteTarget,
} = require("../data/note-store");
const { noteMemoPayload, syncFingerprint } = require("../data/concept-sync");
const { normalizeImportedItemMemo } = require("../import/note-markdown-import");
const { getTemplateItems } = require("../data/note-templates");
const { exportTreeItem } = require("../export/export-service");
const { setWebviewPanelThemeIcon } = require("./shared/webview-panel-icon");
const { MOJIGOTO_ICONS } = require("../ui/mojigoto-icons");
const {
  buildAddressBookExport,
} = require("../data/address-book-store");
const { openAddressBook } = require("./address-book-webview");
const { createAddressBookSession } = require("./address-book-session");
const { resolveExportDirForTarget } = require("../export/export-utils");
const {
  createStructuredBackup,
  openStructuredBackupHistory,
} = require("../backup/structured-data-backup");

const { NoteDisplayManager } = require("./note-display-webview");
const { getNoteWebviewHtml, getPanelTitle, getWebviewUiSettings, css } = require("./note-webview/editor-view");

const { insertEntriesAfterItem, replaceItemBody, insertItemAtPosition, insertGroupAtPosition } = require("./note-webview/item-operations");
const { createNoteImageActions } = require("./note-webview/image-actions");
const { createNoteMessageHandler } = require("./note-webview/host-actions");

const noteDisplays = new NoteDisplayManager({
  vscode, css, getNonce, attachImages:attachNoteImageWebviewUris, getAssetsRoot:getNoteAssetsRoot,
  readNote:async source => { await fsp.access(source.filePath); return readNoteFile(source.filePath, source.type); },
  openEditor:source => openNoteWebview(source.context, source.treeProvider, {
    filePath:source.filePath, type:source.type, workDir:source.workDir, workName:source.workName,
    workTitle:source.workTitle, viewColumn:source.editorColumn || vscode.ViewColumn.One,
    skipEditorScrollRestore:true,
  }),
});

async function pickTemplateScope(workDir) {
  if (isSingleMode() || !workDir) {
    return "work";
  }

  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "この作品に保存",
        description: "現在の作品だけで使用します",
        scope: "work",
      },
      {
        label: "全体で保存",
        description: "ほかの作品からも使用できます",
        scope: "global",
      },
    ],
    {
      title: "もじごと: テンプレートの保存範囲",
      placeHolder: "テンプレートを使用できる範囲を選んでください",
      ignoreFocusOut: true,
    },
  );
  return picked?.scope || "";
}

function resolveWorkTitle(panel, context) {
  return (
    String(panel.__mojigotoWorkTitle || "").trim() ||
    String(getCurrentWorkTitleFromSettings(context) || "").trim() ||
    String(getCurrentWorkDisplayName(context) || "").trim()
  );
}

async function closeNoteWebviewByPath(filePath) {
  if (!filePath) return false;

  const normalizedFilePath = path.normalize(filePath);
  const panel = openNotePanelsByPath.get(normalizedFilePath);
  const displaysClosed = noteDisplays.closeByPath(filePath);

  if (!panel) {
    return displaysClosed > 0;
  }

  try {
    panel.dispose();
    return true;
  } catch {
    return false;
  }
}

function isSameOrChildPanelPath(candidatePath, folderPath) {
  if (!candidatePath || !folderPath) return false;
  const relative = path.relative(path.resolve(folderPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function closeNoteWebviewsUnderFolder(folderPath) {
  const panels = new Set(openNotePanelsByPath.values());
  let closed = noteDisplays.closeUnderFolder(folderPath);
  for (const panel of panels) {
    const candidatePath = String(
      panel?.__mojigotoWorkDir || panel?.__mojigotoFilePath || "",
    ).trim();
    if (!isSameOrChildPanelPath(candidatePath, folderPath)) continue;
    panel.dispose();
    closed += 1;
  }
  return closed;
}

async function notifyNoteUpdated(filePath) {
  if (!filePath) return false;

  const normalizedFilePath = path.normalize(filePath);
  const panel = openNotePanelsByPath.get(normalizedFilePath);
  if (!panel) {
    return false;
  }

  const fallbackType = panel.__mojigotoNoteType || "plot";
  const latestNote = await readNoteFile(filePath, fallbackType);

  const nextNote = {
    ...latestNote,
    filePath,
    type: fallbackType,
    noteType: fallbackType,
    workDir: panel.__mojigotoWorkDir || "",
    workName: panel.__mojigotoWorkName || "",
    workTitle: panel.__mojigotoWorkTitle || "",
  };

  const currentWorkDir = panel.__mojigotoWorkDir || "";
  const noteForWebview = attachNoteImageWebviewUris(
    nextNote,
    panel,
    currentWorkDir,
  );

  panel.__mojigotoNoteData = noteForWebview;
  panel.title = getPanelTitle(noteForWebview);

  panel.webview.postMessage({
    type: "noteReloaded",
    payload: noteForWebview,
  });

  return true;
}

function notifyWebMarkdownWarning(filePath, message) {
  const panel = openNotePanelsByPath.get(path.normalize(filePath));
  try { return Promise.resolve(panel?.webview.postMessage({ type: "error", message })).catch(() => false); } catch {}
}

function getPreferredNoteViewColumn() {
  return (
    vscode.window.activeTextEditor?.viewColumn ||
    vscode.window.activeNotebookEditor?.viewColumn ||
    vscode.ViewColumn.Active
  );
}

function buildNoteBootState(note, options = {}) {
  const {
    filePath = "",
    type = "plot",
    workDir = "",
    workName = "",
    workTitle = "",
  } = options;

  return {
    ...note,
    filePath,
    type,
    noteType: type,
    workDir,
    workName,
    workTitle,
    noteMemoAutoSyncDefault: vscode.workspace
      .getConfiguration("mojigoto")
      .get("noteMemoAutoSyncEnabled", false) === true,
  };
}

function safeAssetName(value, fallback = "note") {
  const text = String(value || "").trim() || fallback;
  return text
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function getNoteAssetsRoot(workDir = "") {
  return isSingleMode()
    ? getMojigotoDirForSingle()
    : getMojigotoDirForWork(workDir);
}

function getNoteImageRelativeDir(noteFilePath, groupId) {
  const noteBaseName = safeAssetName(
    path.basename(
      String(noteFilePath || "note"),
      path.extname(String(noteFilePath || "")),
    ),
    "note",
  );

  const safeGroupId = safeAssetName(groupId, "group");

  return path.join("note-images", noteBaseName, safeGroupId);
}

function attachNoteImageWebviewUris(noteData, panel, workDir = "", assetsRootOverride = "") {
  const assetsRoot = assetsRootOverride || getNoteAssetsRoot(workDir);
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];

  return {
    ...noteData,
    groups: groups.map((group) => {
      const images = Array.isArray(group?.images) ? group.images : [];

      return {
        ...group,
        images: images.map((image) => {
          const relativePath = String(image?.relativePath || "").trim();
          if (!relativePath) {
            return {
              ...image,
              webviewUri: "",
            };
          }

          const absolutePath = path.join(assetsRoot, relativePath);

          return {
            ...image,
            webviewUri: panel.webview
              .asWebviewUri(vscode.Uri.file(absolutePath))
              .toString(),
          };
        }),
      };
    }),
  };
}

function attachNotePanel(context, treeProvider, panel, options) {
  const {
    filePath,
    type,
    workDir = "",
    workName = "",
    workTitle = "",
    note: initialNote,
    skipEditorScrollRestore = false,
  } = options;
  let note = initialNote;

  setWebviewPanelThemeIcon(
    panel,
    String(type || note?.type || "plot") === "plot"
      ? MOJIGOTO_ICONS.plot
      : MOJIGOTO_ICONS.reference,
  );

  const normalizedFilePath = path.normalize(filePath);

  panel.__mojigotoNoteType = type;
  panel.__mojigotoWorkDir = workDir;
  panel.__mojigotoWorkName = workName;
  panel.__mojigotoWorkTitle = workTitle;
  panel.__mojigotoFilePath = filePath;
  panel.__mojigotoNoteData = note;
  panel.__mojigotoRestoredAt = Date.now();

  openNotePanelsByPath.set(normalizedFilePath, panel);
  openNotePanels.set(filePath, panel);

  activeNotePanel = panel;

  panel.onDidChangeViewState(
    (event) => {
      if (event.webviewPanel.active) {
        activeNotePanel = panel;
      }
    },
    null,
    context.subscriptions,
  );

  const currentWorkDirForAssets = resolveWorkDirForCurrentNote();
  const assetsRootForPanel = getNoteAssetsRoot(currentWorkDirForAssets);

  panel.webview.options = {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.file(assetsRootForPanel)],
  };

  panel.title = getPanelTitle(note);
  const noteForWebview = attachNoteImageWebviewUris(
    note,
    panel,
    currentWorkDirForAssets,
  );

  panel.__mojigotoNoteData = noteForWebview;
  noteDisplays.attach(panel, {context, treeProvider, filePath, type, workDir:currentWorkDirForAssets, assetsRoot:assetsRootForPanel, workName, workTitle, note:noteForWebview});
  panel.webview.html = getNoteWebviewHtml(noteForWebview, panel.webview, {skipEditorScrollRestore});
  let noteAutoSaveTimer = null;
  const addressBookSession = createAddressBookSession(panel, currentWorkDirForAssets, {
    confirmReload: async () => await vscode.window.showWarningMessage(
      "呼び名一覧の未保存の入力を破棄して、最新の内容を読み直しますか？必要な入力は先にコピーしてください。",
      { modal: true }, "破棄して読み直す",
    ) === "破棄して読み直す",
  });

  const settingsDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      event.affectsConfiguration("mojigoto.webviewFontScalePercent") ||
      event.affectsConfiguration("mojigoto.noteMemoAutoSyncEnabled") ||
      event.affectsConfiguration("mojigoto.webviewAutoSaveEnabled") ||
      event.affectsConfiguration("mojigoto.webviewAutoSaveDelaySeconds")
    ) {
      panel.webview.postMessage({
        type: "webviewUiSettingsChanged",
        payload: getWebviewUiSettings(),
      });
    }
    if (
      event.affectsConfiguration("mojigoto.webviewAutoSaveEnabled") &&
      !getWebviewUiSettings().autoSaveEnabled
    ) {
      if (noteAutoSaveTimer) clearTimeout(noteAutoSaveTimer);
      noteAutoSaveTimer = null;
    }
  });

  function resolveWorkDirForCurrentNote() {
    if (workDir) return workDir;

    if (!filePath) return "";
    return path.dirname(path.dirname(path.dirname(filePath)));
  }

  function resolveLatestWorkTitle() {
    const currentWorkDir = resolveWorkDirForCurrentNote();
    const settings = getWorkSettingsForDirectory(currentWorkDir);
    return (
      String(settings?.title || "").trim() ||
      String(settings?.folderName || "").trim() ||
      String(panel.__mojigotoWorkTitle || "").trim() ||
      String(panel.__mojigotoWorkName || "").trim() ||
      (currentWorkDir ? path.basename(currentWorkDir) : "")
    );
  }

  const { handleUploadGroupImage, handleDeleteGroupImage, handleRenameGroupImage } = createNoteImageActions({
    vscode,
    path,
    fsp,
    panel,
    filePath,
    type,
    workDir,
    workName,
    workTitle,
    treeProvider,
    resolveWorkDirForCurrentNote,
    getNoteAssetsRoot,
    getNoteImageRelativeDir,
    saveNoteFile,
    buildNoteBootState,
    attachNoteImageWebviewUris,
    getPanelTitle,
    session: { get note() { return note; } },
  });

  let isCloseConfirmOpen = false;
  let noteSaveQueue = Promise.resolve();
  const ownNoteRevisions = new Set();

  async function syncAutoConceptMemosAfterNoteSave(savedNote, previousNote) {
    const groups = (Array.isArray(savedNote?.groups) ? savedNote.groups : []).map(
      (group) => ({
        ...group,
        items: (Array.isArray(group?.items) ? group.items : []).map((item) => ({
          ...item,
          ...(item?.memo && typeof item.memo === "object"
            ? { memo: { ...item.memo } }
            : {}),
        })),
      }),
    );
    const conceptMemoFilePath = resolveConceptMemoFilePath(
      resolveWorkDirForCurrentNote(),
    );
    const updates = [];
    const errors = [];

    for (const group of groups) {
      for (const item of Array.isArray(group?.items) ? group.items : []) {
        const memo = item?.memo;
        if (
          String(item?.kind || "entry") !== "entry" ||
          !memo ||
          !isNoteMemoAutoSyncEnabled(
            memo,
            vscode.workspace
              .getConfiguration("mojigoto")
              .get("noteMemoAutoSyncEnabled", false) === true,
          )
        ) {
          continue;
        }

        const sourceUpdatedAt = String(memo.updatedAt || "");
        const linkedIds = Array.isArray(memo.linkedConceptMemoIds)
          ? memo.linkedConceptMemoIds.map((id) => String(id || "").trim()).filter(Boolean)
          : [];
        const hasBody = Boolean(String(memo.body || "").trim());

        if (!hasBody && linkedIds.length === 0) continue;
        if (
          linkedIds.length > 0 &&
          String(memo.conceptMemoSyncFingerprint || "") === syncFingerprint(noteMemoPayload(memo))
        ) {
          continue;
        }

        try {
          const memoSyncFingerprint = syncFingerprint(noteMemoPayload(memo));
          const synced = await createConceptMemoFromNoteItem(
            conceptMemoFilePath,
            {
              notePath: String(filePath || ""),
              noteType: String(savedNote?.type || type || "plot"),
              noteTitle: String(savedNote?.title || ""),
              groupId: String(group?.id || ""),
              groupTitle: String(group?.title || ""),
              itemId: String(item?.id || ""),
              heading: String(item?.heading || ""),
              memoBody: String(memo.body || ""),
              memoType: String(memo.type || "text"),
              memoTags: Array.isArray(memo.tags) ? memo.tags : [],
              autoSyncToConceptMemo: true,
              syncFingerprint: memoSyncFingerprint,
              baseSyncFingerprint: String(memo.conceptMemoSyncFingerprint || ""),
              requireSyncBaseline: linkedIds.length > 0,
              linkedConceptMemoIds: linkedIds,
            },
          );
          const conceptMemoId = String(synced?.memo?.id || "").trim();
          const nextLinkedIds = conceptMemoId && !linkedIds.includes(conceptMemoId)
            ? [...linkedIds, conceptMemoId]
            : linkedIds;

          item.memo = {
            ...memo,
            linkedConceptMemoIds: nextLinkedIds,
            conceptMemoSyncedAt: sourceUpdatedAt,
            conceptMemoSyncFingerprint: memoSyncFingerprint,
          };
          updates.push({
            groupId: String(group?.id || ""),
            itemId: String(item?.id || ""),
            conceptMemoId,
            linkedConceptMemoIds: nextLinkedIds,
            conceptMemoSyncedAt: sourceUpdatedAt,
            conceptMemoSyncFingerprint: memoSyncFingerprint,
          });
        } catch (error) {
          errors.push(error?.message || String(error));
        }
      }
    }

    let finalNote = savedNote;
    if (updates.length) {
      try {
        finalNote = await saveNoteFile(filePath, {
          ...savedNote,
          groups,
          type,
        });
      } catch (error) {
        errors.push(`ノート本体と構想メモは保存しましたが、ノート側の同期情報を保存できませんでした: ${error.message || String(error)}`);
        updates.length = 0;
      }
      await notifyConceptMemoUpdated(conceptMemoFilePath);
    }

    const sourceNames = (value) => JSON.stringify([value?.title || "", (value?.groups || []).map((group) =>
      [group.id, group.title || "", (group.items || []).map((item) => [item.id, item.heading || ""])])]);
    if (sourceNames(previousNote) !== sourceNames(savedNote)) {
      try {
        await notifyConceptMemoUpdated(conceptMemoFilePath, { sourceNamesOnly: true });
      } catch (error) {
        errors.push(`出典名の表示を更新できませんでした: ${error.message || String(error)}`);
      }
    }

    return {
      note: finalNote,
      updates,
      errors,
    };
  }

  async function persistNoteMessage(message, notifyWebview = true) {
    const revision = Number(message?.revision || 0);
    const savePayload = message?.payload || {};
    noteSaveQueue = noteSaveQueue
      .catch(() => undefined)
      .then(async () => {
        const incomingRevision = savePayload.storageRevision || note.storageRevision;
        let groups = savePayload.groups;
        if (ownNoteRevisions.has(incomingRevision) && Array.isArray(groups)) {
          const latestItems = new Map((note.groups || []).map((group) => [group.id,
            new Map((group.items || []).map((item) => [item.id, item])),
          ]));
          groups = groups.map((group) => ({ ...group, items: (group.items || []).map((item) => {
            const latest = latestItems.get(group.id)?.get(item.id);
            if (!item.memo || !latest?.memo) return item;
            return { ...item, memo: { ...item.memo,
              conceptMemoSyncFingerprint: latest.memo.conceptMemoSyncFingerprint,
              conceptMemoSyncedAt: latest.memo.conceptMemoSyncedAt,
            } };
          }) }));
        }
        const saved = await saveNoteFile(filePath, {
          ...note,
          ...savePayload,
          ...(Array.isArray(groups) ? { groups } : {}),
          type,
          storageRevision: ownNoteRevisions.has(incomingRevision) ? note.storageRevision : incomingRevision,
        });
        const previousNote = note;
        note = { ...note, ...saved };
        ownNoteRevisions.add(incomingRevision);
        ownNoteRevisions.add(saved.storageRevision);
        const result = await syncAutoConceptMemosAfterNoteSave(saved, previousNote);
        note = { ...note, ...result.note };
        ownNoteRevisions.add(result.note.storageRevision);
        return result;
      });
    const saveResult = await noteSaveQueue;
    const saved = saveResult.note;
    const backupIntervalMinutes = Number(vscode.workspace.getConfiguration("mojigoto").get("backupIntervalMinutes", 0));
    await createStructuredBackup({
      filePath,
      targetType: "note",
      reason: "automatic",
      intervalMinutes: backupIntervalMinutes,
      content: `${JSON.stringify(saved, null, 2)}\n`,
    }).catch((error) => console.warn("[mojigoto] automatic note backup failed", error));
    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });
    panel.__mojigotoNoteData = nextNote;
    if (notifyWebview) {
      panel.webview.postMessage({
        type: "noteSaved",
        revision,
        storageRevision: saved.storageRevision,
        autoConceptSyncUpdates: saveResult.updates,
      });
      if (saveResult.errors.length) {
        panel.webview.postMessage({
          type: "error",
          message: `構想メモへの自動反映に失敗しました: ${saveResult.errors[0]}`,
        });
      }
    }
    treeProvider?.refresh();
    return saveResult;
  }

  panel.webview.onDidReceiveMessage(
    createNoteMessageHandler({
      vscode,
      path,
      fsp,
      context,
      treeProvider,
      panel,
      filePath,
      type,
      workDir,
      workName,
      workTitle,
      noteDisplays,
      withRestoredWebviews,
      getPanelTitle,
      updateWebviewSaveSetting,
      getWebviewUiSettings,
      persistNoteMessage,
      readNoteFile,
      saveNoteFile,
      resolveLatestWorkTitle,
      buildNoteBootState,
      resolveWorkDirForCurrentNote,
      attachNoteImageWebviewUris,
      openStructuredBackupHistory,
      openAddressBook,
      currentWorkDirForAssets,
      addressBookSession,
      resolveWorkTitle,
      safeAssetName,
      resolveExportDirForTarget,
      buildAddressBookExport,
      searchNotesByType,
      resolveRelatedNoteTarget,
      openNoteWebview,
      markConceptMemosMissingByNotePath,
      resolveConceptMemoFilePath,
      notifyConceptMemoUpdated,
      getTemplateItems,
      pickTemplateScope,
      saveUserTemplate,
      saveUserGroupTemplate,
      listUserTemplates,
      deleteUserTemplateById,
      handleUploadGroupImage,
      handleDeleteGroupImage,
      handleRenameGroupImage,
      createConceptMemoFromNoteItem,
      exportTreeItem,
      insertEntriesAfterItem,
      replaceItemBody,
      insertItemAtPosition,
      insertGroupAtPosition,
      normalizeImportedItemMemo,
      updateConceptMemoSourceStatus,
      updateConceptMemoSourceAutoSync,
      setTimeout,
      clearTimeout,
      session: {
        get note() { return note; },
        get noteSaveQueue() { return noteSaveQueue; },
        get noteAutoSaveTimer() { return noteAutoSaveTimer; },
        set noteAutoSaveTimer(value) { noteAutoSaveTimer = value; },
        get isCloseConfirmOpen() { return isCloseConfirmOpen; },
        set isCloseConfirmOpen(value) { isCloseConfirmOpen = value; },
      },
    }),
    null,
    context.subscriptions,
  );

  panel.onDidDispose(
    () => {
      panel.__mojigotoDisposed = true;
      // Forget the editor even if notifying a display tab fails during disposal.
      if (activeNotePanel === panel) {
        activeNotePanel = null;
      }

      if (openNotePanels.get(filePath) === panel) {
        openNotePanels.delete(filePath);
      }

      if (openNotePanelsByPath.get(normalizedFilePath) === panel) openNotePanelsByPath.delete(normalizedFilePath);
      try { noteDisplays.detach(panel); }
      finally { settingsDisposable.dispose(); }
    },
    null,
    context.subscriptions,
  );
}

function resolveConceptMemoFilePath(workDir = "") {
  const mojigotoDir = isSingleMode()
    ? getMojigotoDirForSingle()
    : getMojigotoDirForWork(workDir);

  return path.join(mojigotoDir, "concept-memos.json");
}

async function openNoteWebview(context, treeProvider, options) {
  return withRestoredWebviews(vscode, "mojigoto.noteEditor", () => openNoteWebviewReady(context, treeProvider, options));
}

async function openNoteWebviewReady(context, treeProvider, options) {
  const {
    filePath,
    type,
    workDir = "",
    workName = "",
    workTitle = "",
    focusGroupId = "",
    focusItemId = "",
    openItemMemo = false,
    viewColumn,
    skipEditorScrollRestore = false,
  } = options;

  const postFocusMessage = (panel) => {
    if (!panel || !focusItemId) return;

    setTimeout(() => {
      panel.webview.postMessage({
        type: openItemMemo ? "openNoteItemMemo" : "focusNoteItem",
        payload: {
          groupId: String(focusGroupId || ""),
          itemId: String(focusItemId || ""),
        },
      });
    }, 80);
  };

  const existing = openNotePanels.get(filePath) || [...openNotePanels.values()].find(panel => webviewFileKey(panel.__mojigotoFilePath) === webviewFileKey(filePath));
  if (existing) {
    try {
      if (existing.__mojigotoDisposed) throw new Error("Webview is disposed");
      existing.reveal(viewColumn, false);
      postFocusMessage(existing);
      return existing;
    } catch (error) {
      if (!/webview.*disposed/i.test(String(error))) throw error;
      if (openNotePanels.get(filePath) === existing) openNotePanels.delete(filePath);
      if (openNotePanelsByPath.get(path.normalize(filePath)) === existing) openNotePanelsByPath.delete(path.normalize(filePath));
      noteDisplays.detach(existing);
    }
  }

  const rawNote = await readNoteFile(filePath, type);

  const resolvedWorkTitle =
    String(workTitle || "").trim() ||
    String(workName || "").trim() ||
    (workDir ? path.basename(workDir) : "") ||
    String(getCurrentWorkTitleFromSettings(context) || "").trim() ||
    String(getCurrentWorkDisplayName(context) || "").trim();

  const note = buildNoteBootState(rawNote, {
    filePath,
    type,
    workDir,
    workName,
    workTitle: resolvedWorkTitle,
  });

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.noteEditor",
    getPanelTitle(note),
    viewColumn || getPreferredNoteViewColumn(),
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  attachNotePanel(context, treeProvider, panel, {
    filePath,
    type,
    workDir,
    workName,
    workTitle: resolvedWorkTitle,
    note,
    skipEditorScrollRestore,
  });

  postFocusMessage(panel);

  return panel;
}

function createNoteSerializer(context, treeProvider) {
  return registerRestorableWebview(vscode, "mojigoto.noteEditor", {
    async deserializeWebviewPanel(webviewPanel, webviewState) {
      try {
        const state = webviewState || {};
        const filePath = String(state?.filePath || "").trim();
        const type =
          String(state?.type || state?.noteType || "plot").trim() || "plot";
        const workDir = String(state?.workDir || "").trim();
        const workName = String(state?.workName || "").trim();
        const workTitle = String(state?.workTitle || "").trim();
        const resolvedWorkTitle =
          workTitle ||
          workName ||
          (workDir ? path.basename(workDir) : "") ||
          String(getCurrentWorkTitleFromSettings(context) || "").trim() ||
          String(getCurrentWorkDisplayName(context) || "").trim();

        if (!filePath) {
          webviewPanel.webview.options = {
            enableScripts: true,
            retainContextWhenHidden: true,
          };

          webviewPanel.title = "ノート復元エラー";
          webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="ja">
            <body style="font-family:sans-serif;padding:16px;">
              <p>ノートの復元に必要な状態が見つかりませんでした。</p>
              <p>filePath が保存されていないため、このタブは自動復元できません。</p>
            </body>
            </html>
          `;
          return;
        }

        const rawNote = await readNoteFile(filePath, type);
        const note = buildNoteBootState(rawNote, {
          filePath,
          type,
          workDir,
          workName,
          workTitle: resolvedWorkTitle,
        });

        attachNotePanel(context, treeProvider, webviewPanel, {
          filePath,
          type,
          workDir,
          workName,
          workTitle: resolvedWorkTitle,
          note,
        });
      } catch (error) {
        console.error("[mojigoto] note deserialize failed:", error);

        try {
          webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html lang="ja">
            <body style="font-family:sans-serif;padding:16px;">
              <p>ノートの復元に失敗しました。</p>
              <pre style="white-space:pre-wrap;">${escapeHtml(String(error?.message || error || ""))}</pre>
            </body>
            </html>
          `;
        } catch {}

        // すぐ dispose すると原因が見えなくなるので、ここでは閉じない
      }
    },
  });
}

function createNoteDisplaySerializer(context, treeProvider) {
  return noteDisplays.registerSerializer(context, treeProvider);
}

function registerNoteWebviewCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mojigoto.noteEditor.closeFromShortcut",
      async () => {
        if (activeNotePanel) {
          activeNotePanel.webview.postMessage({
            type: "shortcutCloseNote",
          });
          return;
        }

        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
        );
      },
    ),
  );
}

module.exports = {
  getNoteWebviewHtml,
  openNoteWebview,
  closeNoteWebviewByPath,
  closeNoteWebviewsUnderFolder,
  notifyNoteUpdated,
  notifyWebMarkdownWarning,
  createNoteSerializer,
  createNoteDisplaySerializer,
  registerNoteWebviewCommands,
};
