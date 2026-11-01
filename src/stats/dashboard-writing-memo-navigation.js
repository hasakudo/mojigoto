// Navigation and link repair for Dashboard writing memos.
// Panel state transitions and lifetime remain owned by stats-panel.
function createDashboardWritingMemoNavigation({
  vscode, context, fs, path, normalizeComparablePath,
  getConfiguredManuscriptRoot, isSameOrChildPath, isSingleMode,
  getWorkName, listWorkDirectories, getWorkManuscriptRoot,
  toMemoRelativePath, getWritingMemosPathForSingle, getWritingMemosPathForWork,
  readWritingMemos, writeWritingMemos, resolveWritingMemoAbsolutePathFlexible,
  setRelinkTarget, setJumpTarget, refresh, postToPanel,
  triggerWritingMemoDecorationRefresh,
}) {
  function findWritingMemoRangeByExcerpt(doc, excerpt = "", fallback = {}) {
    const needle = String(excerpt || "").trim();
    if (!doc || !needle) return null;

    const fullText = doc.getText();

    const storedLine = Math.max(0, Number(fallback?.startLine || 0));
    const storedCharacter = Math.max(0, Number(fallback?.startCharacter || 0));

    let storedOffset = 0;
    try {
      storedOffset = doc.offsetAt(
        new vscode.Position(storedLine, storedCharacter),
      );
    } catch {
      storedOffset = 0;
    }

    const indexes = [];
    let from = 0;

    while (from <= fullText.length) {
      const index = fullText.indexOf(needle, from);
      if (index < 0) break;

      indexes.push(index);
      from = index + Math.max(1, needle.length);
    }

    if (!indexes.length) return null;

    const bestIndex = indexes.sort(
      (a, b) => Math.abs(a - storedOffset) - Math.abs(b - storedOffset),
    )[0];

    const start = doc.positionAt(bestIndex);
    const end = doc.positionAt(bestIndex + needle.length);

    return new vscode.Range(start, end);
  }

  function resolveManualWritingMemoTarget(targetFilePath) {
    const filePath = String(targetFilePath || "").trim();
    if (!filePath) return null;

    const configuredRoot = getConfiguredManuscriptRoot();

    if (configuredRoot && isSameOrChildPath(filePath, configuredRoot)) {
      if (isSingleMode()) {
        return {
          filePath,
          relativeFilePath: toMemoRelativePath(configuredRoot, filePath),
          writingMemoFilePath: getWritingMemosPathForSingle(),
          targetLocation: "",
        };
      }

      const currentWorkName = String(getWorkName(context) || "").trim();
      const currentWork = listWorkDirectories().find(
        (item) => String(item?.name || "").trim() === currentWorkName,
      );

      if (currentWork?.fsPath) {
        return {
          filePath,
          relativeFilePath: toMemoRelativePath(configuredRoot, filePath),
          writingMemoFilePath: getWritingMemosPathForWork(currentWork.fsPath),
          targetLocation: "view",
        };
      }
    }

    if (!isSingleMode()) {
      for (const work of listWorkDirectories()) {
        if (!work?.fsPath) continue;
        const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
        if (!manuscriptRoot || !isSameOrChildPath(filePath, manuscriptRoot)) {
          continue;
        }

        return {
          filePath,
          relativeFilePath: toMemoRelativePath(manuscriptRoot, filePath),
          writingMemoFilePath: getWritingMemosPathForWork(work.fsPath),
          targetLocation: "work",
        };
      }
    }

    return null;
  }

  async function handleWritingMemoRelink(msg) {
    const sourceMemoFilePath = String(
      msg?.writingMemoFilePath || "",
    ).trim();
    const memoId = String(msg?.memoId || "").trim();

    if (!sourceMemoFilePath || !memoId) {
      vscode.window.showWarningMessage(
        "もじごと: 修復する執筆メモを取得できませんでした。",
      );
      return;
    }

    const sourceData = await readWritingMemos(sourceMemoFilePath);
    const sourceMemos = Array.isArray(sourceData?.memos)
      ? [...sourceData.memos]
      : [];
    const sourceIndex = sourceMemos.findIndex(
      (memo) => String(memo?.id || "") === memoId,
    );

    if (sourceIndex < 0) {
      vscode.window.showWarningMessage(
        "もじごと: 修復する執筆メモが見つかりませんでした。",
      );
      return;
    }

    const sourceMemo = sourceMemos[sourceIndex];
    const suggestedPath = String(msg?.absoluteFilePath || "").trim();
    const configuredRoot = getConfiguredManuscriptRoot();
    const currentWorkName = String(getWorkName(context) || "").trim();
    const currentWork = !isSingleMode()
      ? listWorkDirectories().find(
          (item) => String(item?.name || "").trim() === currentWorkName,
        )
      : null;
    const currentWorkMemoPath = currentWork?.fsPath
      ? getWritingMemosPathForWork(currentWork.fsPath)
      : "";
    const isCurrentViewMemo = Boolean(
      configuredRoot &&
        currentWorkMemoPath &&
        normalizeComparablePath(currentWorkMemoPath) ===
          normalizeComparablePath(sourceMemoFilePath),
    );
    const defaultPath = isCurrentViewMemo
      ? configuredRoot
      : suggestedPath && fs.existsSync(suggestedPath)
        ? path.dirname(suggestedPath)
        : configuredRoot;

    const selected = await vscode.window.showOpenDialog({
      title: "執筆メモの連携先を選択",
      openLabel: "この原稿へ付け替える",
      defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        "原稿ファイル": ["txt", "md"],
      },
    });

    const selectedPath = selected?.[0]?.fsPath || "";
    if (!selectedPath) return;

    const target = resolveManualWritingMemoTarget(selectedPath);
    if (
      !target?.relativeFilePath ||
      !target?.writingMemoFilePath
    ) {
      vscode.window.showWarningMessage(
        "もじごと: 設定されている原稿フォルダ内の .txt / .md ファイルを選択してください。",
      );
      return;
    }

    const locationLabel = target.targetLocation === "view"
      ? "View側"
      : target.targetLocation === "work"
        ? "作品元側"
        : "原稿";
    const confirmed = await vscode.window.showWarningMessage(
      `この執筆メモを「${target.relativeFilePath}」（${locationLabel}）へ付け替えますか？`,
      { modal: true },
      "付け替える",
    );
    if (confirmed !== "付け替える") return;

    let excerptRange = null;
    try {
      const targetDocument = await vscode.workspace.openTextDocument(
        target.filePath,
      );
      excerptRange = findWritingMemoRangeByExcerpt(
        targetDocument,
        sourceMemo?.excerpt || "",
        sourceMemo,
      );
    } catch {}

    const updatedMemo = {
      ...sourceMemo,
      filePath: target.relativeFilePath,
      fileName: path.basename(target.relativeFilePath),
      targetLocation: target.targetLocation,
      ...(excerptRange
        ? {
            startLine: excerptRange.start.line,
            startCharacter: excerptRange.start.character,
            endLine: excerptRange.end.line,
            endCharacter: excerptRange.end.character,
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    if (
      normalizeComparablePath(sourceMemoFilePath) ===
      normalizeComparablePath(target.writingMemoFilePath)
    ) {
      sourceMemos[sourceIndex] = updatedMemo;
      await writeWritingMemos(sourceMemoFilePath, {
        ...sourceData,
        memos: sourceMemos,
      });
    } else {
      const targetData = await readWritingMemos(target.writingMemoFilePath);
      const targetMemos = Array.isArray(targetData?.memos)
        ? targetData.memos.filter(
            (memo) => String(memo?.id || "") !== memoId,
          )
        : [];

      // 保存先を先に書き、途中で失敗してもメモが失われない順序にする。
      await writeWritingMemos(target.writingMemoFilePath, {
        ...targetData,
        memos: [updatedMemo, ...targetMemos],
      });
      await writeWritingMemos(sourceMemoFilePath, {
        ...sourceData,
        memos: sourceMemos.filter(
          (memo) => String(memo?.id || "") !== memoId,
        ),
      });
    }

    setRelinkTarget(target.filePath);
    await refresh();
    await triggerWritingMemoDecorationRefresh();

    vscode.window.showInformationMessage(
      excerptRange
        ? "もじごと: 執筆メモの連携先を修復しました。"
        : "もじごと: 連携先を修復しました。元の抜粋が見つからないため、位置は以前の情報を保持しています。",
    );
  }

  async function handleWritingMemoJump(msg) {
    try {
      const absPath = resolveWritingMemoAbsolutePathFlexible(
        context,
        msg.filePath,
        {
          absoluteFilePath: msg.absoluteFilePath,
          writingMemoFilePath: msg.writingMemoFilePath,
          excerpt: msg.excerpt,
          targetLocation: msg.targetLocation,
        },
      );

      if (!absPath) {
        vscode.window.showWarningMessage(
          "もじごと: 執筆メモの対象ファイルを見つけられませんでした。",
        );
        return;
      }

      const doc = await vscode.workspace.openTextDocument(absPath);

      const storedStart = new vscode.Position(
        Number(msg.startLine || 0),
        Number(msg.startCharacter || 0),
      );
      const storedEnd = new vscode.Position(
        Number(msg.endLine || 0),
        Number(msg.endCharacter || 0),
      );

      const excerptRange = findWritingMemoRangeByExcerpt(doc, msg.excerpt, {
        startLine: msg.startLine,
        startCharacter: msg.startCharacter,
      });
      const range = excerptRange || new vscode.Range(storedStart, storedEnd);

      const start = range.start;
      const end = range.end;

      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false,
      });

      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      setJumpTarget(absPath, msg);

      await refresh();

      await postToPanel({
        type: "openWritingMemoTab",
        memoId: String(msg.memoId || ""),
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `もじごと: 執筆メモの箇所へ移動できませんでした: ${error.message || String(error)}`,
      );
    }
  }

  return { handleWritingMemoRelink, handleWritingMemoJump };
}

module.exports = { createDashboardWritingMemoNavigation };
