function createNoteImageActions(environment) {
  const { session,
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
  } = environment;

  async function handleUploadGroupImage(message) {
    const payload = message?.payload || {};
    const latest = {
      ...session.note,
      ...payload.note,
      type,
    };
    const groups = Array.isArray(latest.groups) ? [...latest.groups] : [];
    let groupId = String(payload?.groupId || "").trim();

    if (!groupId) {
      const target = await vscode.window.showQuickPick(
        groups.map((group, index) => ({
          label: String(group?.title || "").trim() || `大分類 ${index + 1}`,
          description: `画像 ${Array.isArray(group?.images) ? group.images.length : 0}件`,
          groupId: String(group?.id || ""),
        })),
        {
          title: "画像を追加する大分類を選択",
          placeHolder: "画像の保存先",
          ignoreFocusOut: true,
        },
      );
      if (!target) return;
      groupId = target.groupId;
    }

    if (!groupId) {
      panel.webview.postMessage({
        type: "error",
        message: "画像を追加できる大分類がありません。",
      });
      return;
    }

    const picked = await vscode.window.showOpenDialog({
      title: "ノートに追加する画像を選択",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        Images: ["png", "jpg", "jpeg", "webp", "gif"],
      },
    });

    const sourceUri = picked?.[0];
    if (!sourceUri?.fsPath) {
      return;
    }

    const sourcePath = sourceUri.fsPath;
    const ext = path.extname(sourcePath).toLowerCase() || ".png";

    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    if (!allowed.has(ext)) {
      panel.webview.postMessage({
        type: "error",
        message: "対応している画像形式は png / jpg / jpeg / webp / gif です。",
      });
      return;
    }

    const groupIndex = groups.findIndex(
      (group) => String(group?.id || "") === groupId,
    );

    if (groupIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "画像を追加する大分類が見つかりませんでした。",
      });
      return;
    }

    const imageId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${imageId}${ext}`;

    const currentWorkDir = resolveWorkDirForCurrentNote();
    const assetsRoot = getNoteAssetsRoot(currentWorkDir);
    const relativeDir = getNoteImageRelativeDir(filePath, groupId);
    const relativePath = path.join(relativeDir, fileName).replace(/\\/g, "/");

    const destDir = path.join(assetsRoot, relativeDir);
    const destPath = path.join(destDir, fileName);

    await fsp.mkdir(destDir, { recursive: true });
    await fsp.copyFile(sourcePath, destPath);

    const defaultName = path.basename(sourcePath, path.extname(sourcePath));

    const nextGroup = {
      ...groups[groupIndex],
      images: [
        ...(Array.isArray(groups[groupIndex]?.images)
          ? groups[groupIndex].images
          : []),
        {
          id: imageId,
          name: defaultName,
          fileName,
          relativePath,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    groups[groupIndex] = nextGroup;

    const saved = await saveNoteFile(filePath, {
      ...latest,
      groups,
      type,
    });

    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });

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

    panel.webview.postMessage({
      type: "info",
      message: "画像を追加しました。",
    });

    treeProvider?.refresh();
  }

  async function handleDeleteGroupImage(message) {
    const payload = message?.payload || {};
    const groupId = String(payload?.groupId || "").trim();
    const imageId = String(payload?.imageId || "").trim();

    if (!groupId || !imageId) {
      panel.webview.postMessage({
        type: "error",
        message: "削除する画像を取得できませんでした。",
      });
      return;
    }

    const latest = {
      ...session.note,
      ...payload.note,
      type,
    };

    const groups = Array.isArray(latest.groups) ? [...latest.groups] : [];
    const groupIndex = groups.findIndex(
      (group) => String(group?.id || "") === groupId,
    );

    if (groupIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "画像を削除する大分類が見つかりませんでした。",
      });
      return;
    }

    const currentGroup = groups[groupIndex] || {};
    const images = Array.isArray(currentGroup.images)
      ? currentGroup.images
      : [];

    const targetImage = images.find(
      (image) => String(image?.id || "") === imageId,
    );

    if (!targetImage) {
      panel.webview.postMessage({
        type: "error",
        message: "削除する画像が見つかりませんでした。",
      });
      return;
    }

    const picked = await vscode.window.showWarningMessage(
      `画像「${String(targetImage.name || targetImage.fileName || "画像")}」を削除しますか？`,
      { modal: true },
      "削除する",
    );

    if (picked !== "削除する") {
      panel.webview.postMessage({
        type: "info",
        message: "画像削除をキャンセルしました。",
      });
      return;
    }

    const nextImages = images.filter(
      (image) => String(image?.id || "") !== imageId,
    );

    groups[groupIndex] = {
      ...currentGroup,
      images: nextImages,
    };

    const currentWorkDir = resolveWorkDirForCurrentNote();
    const assetsRoot = getNoteAssetsRoot(currentWorkDir);
    const relativePath = String(targetImage.relativePath || "").trim();

    const saved = await saveNoteFile(filePath, {
      ...latest,
      groups,
      type,
    });

    if (relativePath) {
      try { await require("../../data/note-image-references").removeUnreferencedImage(assetsRoot, filePath, saved.groups, relativePath); }
      catch (error) { console.warn("[mojigoto] image retained because references could not be verified:", error); }
    }

    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });

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

    panel.webview.postMessage({
      type: "info",
      message: "画像を削除しました。",
    });

    treeProvider?.refresh();
  }

  async function handleRenameGroupImage(message) {
    const payload = message?.payload || {};
    const groupId = String(payload?.groupId || "").trim();
    const imageId = String(payload?.imageId || "").trim();
    const currentName = String(payload?.currentName || "").trim();

    if (!groupId || !imageId) {
      panel.webview.postMessage({
        type: "error",
        message: "名前を変更する画像を取得できませんでした。",
      });
      return;
    }

    const latest = {
      ...session.note,
      ...payload.note,
      type,
    };

    const groups = Array.isArray(latest.groups) ? [...latest.groups] : [];
    const groupIndex = groups.findIndex(
      (group) => String(group?.id || "") === groupId,
    );

    if (groupIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "画像名を変更する大分類が見つかりませんでした。",
      });
      return;
    }

    const currentGroup = groups[groupIndex] || {};
    const images = Array.isArray(currentGroup.images)
      ? currentGroup.images
      : [];

    const imageIndex = images.findIndex(
      (image) => String(image?.id || "") === imageId,
    );

    if (imageIndex < 0) {
      panel.webview.postMessage({
        type: "error",
        message: "名前を変更する画像が見つかりませんでした。",
      });
      return;
    }

    const targetImage = images[imageIndex] || {};
    const defaultName =
      currentName ||
      String(targetImage.name || targetImage.fileName || "画像").trim();

    const nextName = await vscode.window.showInputBox({
      title: "もじごと: 画像名を変更",
      prompt: "画像の表示名を入力してください",
      value: defaultName,
      ignoreFocusOut: true,
    });

    if (nextName === undefined) {
      panel.webview.postMessage({
        type: "info",
        message: "画像名の変更をキャンセルしました。",
      });
      return;
    }

    const trimmedName = String(nextName || "").trim();

    if (!trimmedName) {
      panel.webview.postMessage({
        type: "error",
        message: "画像名は空にできません。",
      });
      return;
    }

    const nextImages = [...images];
    nextImages[imageIndex] = {
      ...targetImage,
      name: trimmedName,
    };

    groups[groupIndex] = {
      ...currentGroup,
      images: nextImages,
    };

    const saved = await saveNoteFile(filePath, {
      ...latest,
      groups,
      type,
    });

    const nextNote = buildNoteBootState(saved, {
      filePath,
      type,
      workDir,
      workName,
      workTitle,
    });

    const currentWorkDir = resolveWorkDirForCurrentNote();
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

    panel.webview.postMessage({
      type: "info",
      message: "画像名を変更しました。",
    });

    treeProvider?.refresh();
  }

  return { handleUploadGroupImage, handleDeleteGroupImage, handleRenameGroupImage };
}

module.exports = { createNoteImageActions };
