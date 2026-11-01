const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const {
  renderMergedManuscriptTxt,
  renderMergedManuscriptMd,
  resolveMergedManuscriptRoot,
  collectMergedManuscriptFiles,
  ensureMergedManuscriptFiles,
  buildMergedManuscriptData,
  getMergedManuscriptJoinMode,
  buildMergedManuscriptBaseName,
  getMergedManuscriptFileVariantSuffix,
  resolveMergedManuscriptHtmlOptions,
} = require("./merged-manuscript-core");

const {
  renderMergedManuscriptBrowserHtml,
} = require("./merged-manuscript-browser-html");

const {
  renderMergedManuscriptWordHtml,
} = require("./merged-manuscript-word-html");

const {
  openMergedManuscriptBrowserPanel,
  revealMergedManuscriptBrowserPanel,
} = require("./merged-manuscript-browser-panel");
const { getWorkNameForStats } = require("./manuscript-export");
const { captureManuscriptSource, assertManuscriptSource, groupManuscriptFilesByChapter,
  buildChapterOutputNames, assertChapterExportDirectory, inspectChapterOutputs, writeChapterOutputs } = require("./merged-manuscript-chapters");

const { ensureNamedExportDir } = require("./export-utils");

const {
  renderMergedManuscriptBrowserRealPrintHtml,
} = require("./merged-manuscript-browser-realprint-html");

const {
  normalizeRealPrintSizeKey, normalizeRealPrintColumnMode, getRealPrintStateKey, normalizeSimpleLayoutKey,
  readMergedManuscriptBrowserPanelState, writeMergedManuscriptBrowserPanelState,
} = require("./merged-manuscript-panel-settings");

function renderMergedManuscriptHtml(mergedData, options = {}) {
  const target = String(options.htmlTarget || "browser");
  const exportMode = String(options.exportMode || "simple")
    .trim()
    .toLowerCase();

  if (target === "word") {
    return renderMergedManuscriptWordHtml(mergedData, options);
  }

  if (target === "browser" && exportMode === "real") {
    return renderMergedManuscriptBrowserRealPrintHtml(mergedData, options);
  }

  return renderMergedManuscriptBrowserHtml(mergedData, options);
}

function renderMergedManuscriptByFormat(format, mergedData, options = {}) {
  if (format === "html") {
    return renderMergedManuscriptHtml(mergedData, options);
  }
  if (format === "md") {
    return renderMergedManuscriptMd(mergedData, options);
  }

  return renderMergedManuscriptTxt(mergedData, options);
}

async function pickMergedManuscriptExportPreset() {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "テキスト (.txt)",
        description: "アプリその他読み込み向け",
        value: {
          format: "txt",
          htmlTarget: "browser",
          htmlDirection: "horizontal",
          htmlPrintLayoutMode: "single",
        },
      },
      {
        label: "Markdown (.md)",
        description: "見出し保持向け",
        value: {
          format: "md",
          htmlTarget: "browser",
          htmlDirection: "horizontal",
          htmlPrintLayoutMode: "single",
        },
      },
      {
        label: "Word用 HTML",
        description: "見出し・ルビを保持しWordで開く（空行は省略）",
        value: {
          format: "html",
          htmlTarget: "word",
          htmlDirection: "horizontal",
          htmlPrintLayoutMode: "single",
        },
      },
      {
        label: "ブラウザ：横書き HTML",
        description: "PDF保存 / 印刷など",
        value: {
          format: "html",
          htmlTarget: "browser",
          htmlDirection: "horizontal",
          htmlPrintLayoutMode: "single",
        },
      },
      {
        label: "ブラウザ：縦書き HTML",
        description: "PDF保存 / 印刷など",
        value: {
          format: "html",
          htmlTarget: "browser",
          htmlDirection: "vertical",
          htmlPrintLayoutMode: "single",
        },
      },
    ],
    {
      title: "もじごと: 結合原稿の書き出し形式を選択",
      ignoreFocusOut: true,
    },
  );

  return picked?.value || null;
}

async function pickMergedManuscriptSaveUri(
  context,
  manuscriptRoot,
  options = {},
) {
  const ext = String(options.ext || "txt");

  const exportDir = await ensureNamedExportDir(context, "原稿書き出し");
  if (!exportDir) {
    return null;
  }

  const defaultDirUri = vscode.Uri.file(exportDir);
  const defaultUri = vscode.Uri.joinPath(
    defaultDirUri,
    buildMergedManuscriptBaseName(context, ext, new Date(), options),
  );

  let filters = { Text: ["txt"] };
  if (ext === "md") {
    filters = { Markdown: ["md"] };
  } else if (ext === "html") {
    filters = { HTML: ["html", "htm"] };
  }

  return vscode.window.showSaveDialog({
    defaultUri,
    saveLabel: "書き出す",
    filters,
  });
}

function writeMergedManuscriptFile(outPath, content) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
}

async function pickMergedManuscriptScope(context) {
  const manuscriptRoot = resolveMergedManuscriptRoot();
  const files = collectMergedManuscriptFiles(manuscriptRoot, [".txt", ".md"]);
  ensureMergedManuscriptFiles(files);
  const source = captureManuscriptSource(manuscriptRoot, getWorkNameForStats(context));
  const picked = await vscode.window.showQuickPick([
    {label:"全体を1ファイルにまとめる", description:"Viewの原稿をすべて結合", unit:"all"},
    {label:"章ごとに別ファイルで書き出す", description:"章を選択し、1章につき1ファイルを作成", unit:"chapters"},
  ], {title:"もじごと: 原稿の書き出し単位", ignoreFocusOut:true});
  if (!picked) return null;
  if (picked.unit === "all") return {...source, exportUnit:"all", exportScopeDescription:""};
  const chapters = groupManuscriptFilesByChapter(manuscriptRoot, files);
  const selected = await vscode.window.showQuickPick(chapters.map(chapter => ({
    label:chapter.title, description:`${chapter.files.length}ファイル`, picked:true, chapterId:chapter.id,
  })), {title:"もじごと: 書き出す章を選択", canPickMany:true, ignoreFocusOut:true,
    placeHolder:"選択した章ごとに1ファイルを作成します。子フォルダの原稿も含みます。"});
  if (!selected?.length) return null;
  const ids = new Set(selected.map(item => item.chapterId));
  const ordered = chapters.filter(chapter => ids.has(chapter.id));
  return {...source, exportUnit:"chapters", chapterIds:ordered.map(chapter => chapter.id),
    previewChapters:ordered.map(chapter => ({id:chapter.id, title:chapter.title})),
    exportScopeDescription:`章ごとに${ordered.length}ファイルを書き出します。プレビューでは確認する章を切り替えられます。`};
}

async function collectMergedManuscriptExportOptions(context) {
  const selection = await pickMergedManuscriptScope(context);
  if (!selection) return null;
  const preset = await pickMergedManuscriptExportPreset();
  if (!preset) return null;

  const options = {
    ...selection,
    format: String(preset.format || "txt"),
    joinMode: getMergedManuscriptJoinMode(),
    htmlTarget: String(preset.htmlTarget || "browser"),
    htmlDirection: String(preset.htmlDirection || "horizontal"),
    htmlShowTitle: false,
    htmlPrintLayoutMode: String(preset.htmlPrintLayoutMode || "single"),
    htmlPageSize: "auto",
    htmlOrientation: "auto",
  };

  const isVerticalBrowserHtml =
    options.format === "html" &&
    options.htmlTarget === "browser" &&
    options.htmlDirection === "vertical";

  if (!isVerticalBrowserHtml) {
    return options;
  }

  const manuscriptRoot = selection.manuscriptRoot;
  const resolvedHtmlOptions = resolveMergedManuscriptHtmlOptions(
    { manuscriptRoot },
    options,
  );

  const punctuationLayoutMode = String(
    vscode.workspace
      .getConfiguration("mojigoto")
      .get("verticalPunctuationLayout", "hanging") || "hanging",
  ).trim();
  const useTypographyAdjustments =
    vscode.workspace
      .getConfiguration("mojigoto")
      .get("useTypographyAdjustments", true) !== false;

  const savedPanelState = readMergedManuscriptBrowserPanelState(context) || {};
  const panelUseTypographyAdjustments =
    typeof savedPanelState.useTypographyAdjustments === "boolean"
      ? savedPanelState.useTypographyAdjustments
      : useTypographyAdjustments;
  const panelPunctuationLayoutMode =
    savedPanelState.punctuationLayoutMode === "pushout"
      ? "pushout"
      : savedPanelState.punctuationLayoutMode === "hanging"
        ? "hanging"
        : punctuationLayoutMode === "pushout"
          ? "pushout"
          : "hanging";
  const savedSimpleRoot =
    savedPanelState.simple && typeof savedPanelState.simple === "object"
      ? savedPanelState.simple
      : {};

  const currentSimpleLayoutKey = normalizeSimpleLayoutKey(
    savedSimpleRoot.currentLayoutMode || "single",
  );

  const savedSimpleByLayout =
    savedSimpleRoot.byLayout && typeof savedSimpleRoot.byLayout === "object"
      ? savedSimpleRoot.byLayout
      : {};

  const savedSimpleState =
    savedSimpleByLayout[currentSimpleLayoutKey] &&
    typeof savedSimpleByLayout[currentSimpleLayoutKey] === "object"
      ? savedSimpleByLayout[currentSimpleLayoutKey]
      : {};

  const currentRealSizeKey = normalizeRealPrintSizeKey(
    savedPanelState.realPrintPageSize || "b6",
  );

  const currentRealColumnMode = normalizeRealPrintColumnMode(
    savedPanelState.realPrintColumnMode || "single",
    currentRealSizeKey,
  );

  const currentRealStateKey = getRealPrintStateKey(
    currentRealSizeKey,
    currentRealColumnMode,
  );

  const savedRealState =
    savedPanelState.realBySize &&
    savedPanelState.realBySize[currentRealStateKey] &&
    typeof savedPanelState.realBySize[currentRealStateKey] === "object"
      ? savedPanelState.realBySize[currentRealStateKey]
      : {};

  const basePanelState = {
    ...options,
    ...resolvedHtmlOptions,
    punctuationLayoutMode: panelPunctuationLayoutMode,
    useTypographyAdjustments: panelUseTypographyAdjustments,

    simpleSavedByLayout:
      savedSimpleByLayout && typeof savedSimpleByLayout === "object"
        ? savedSimpleByLayout
        : {},

    realPrintSavedBySize:
      savedPanelState.realBySize &&
      typeof savedPanelState.realBySize === "object"
        ? savedPanelState.realBySize
        : {},
  };

  await openMergedManuscriptBrowserPanel(
    context,
    {
      ...basePanelState,
      ...savedSimpleState,
      ...savedRealState,
      resetState: basePanelState,
    },
    {
      onSubmit: async (panelOptions) => {
        await writeMergedManuscriptBrowserPanelState(context, panelOptions);

        const finalOptions = {
          ...options,
          ...basePanelState,
          ...panelOptions,
          ...selection,
          printPreview: false,
          format: "html",
          htmlTarget: "browser",
          htmlDirection: "vertical",
          htmlPageSize: "auto",
          htmlOrientation: "auto",
        };

        const result = await runMergedManuscriptExport(context, finalOptions);
        if (!result || result.cancelled) {
          return {
            message: "書き出しをキャンセルしました。",
          };
        }

        void (async () => {
          try {
            await notifyMergedManuscriptExport(result);
          } catch (error) {
            console.error(
              "mojigoto: failed to handle export notification action",
              error,
            );
          }
        })();

        return {
          message: result.exportUnit === "chapters" ? `${result.outPaths.length}章のHTMLを書き出しました。` : "HTMLを書き出しました。",
        };
      },

      onPreview: async (panelOptions) => {
        const finalOptions = {
          ...options,
          ...basePanelState,
          ...panelOptions,
          ...selection,
          format: "html",
          htmlTarget: "browser",
          htmlDirection: "vertical",
          htmlPageSize: "auto",
          htmlOrientation: "auto",
        };

        const result = await buildMergedManuscriptPreviewHtml(
          context,
          finalOptions,
        );

        return {
          html: result.html,
          message: `${result.chapterTitle ? `「${result.chapterTitle}」 / ` : ""}${finalOptions.exportMode === "real" ? "実寸優先" : finalOptions.htmlPrintLayoutMode === "2up" ? "A4横・二面" : finalOptions.htmlPrintOrientation === "landscape" ? "A4横" : "A4縦"}の現在の設定で表示しています。`,
        };
      },
    },
  );

  return null;
}

function getMergedManuscriptTypeLabel(result) {
  if (result?.format === "md") {
    return "Markdown";
  }

  if (result?.format === "html") {
    return result?.htmlTarget === "word" ? "Word向け HTML" : "HTML";
  }

  return "テキスト";
}

function resolveMergedExportData(context, options) {
  const manuscriptRoot = resolveMergedManuscriptRoot();
  if (options.manuscriptIdentity) assertManuscriptSource(options, manuscriptRoot);
  const files = collectMergedManuscriptFiles(manuscriptRoot, [".txt", ".md"]);
  ensureMergedManuscriptFiles(files);
  const allChapters = groupManuscriptFilesByChapter(manuscriptRoot, files);
  let chapters = [];
  if (options.exportUnit === "chapters") {
    if (!Array.isArray(options.chapterIds) || !options.chapterIds.length) throw new Error("書き出す章を選び直してください。");
    const ids = new Set(options.chapterIds);
    chapters = allChapters.filter(chapter => ids.has(chapter.id));
    if (chapters.length !== ids.size) throw new Error("選択した章の原稿が見つかりません。書き出す章を選び直してください。");
  }
  const selectedFiles = chapters.length ? chapters.flatMap(chapter => chapter.files) : files;
  const mergedData = buildMergedManuscriptData(context, manuscriptRoot, selectedFiles, {
    strictRead:chapters.length > 0, workName:options.workName,
  });
  return {manuscriptRoot, mergedData, chapters, allChapters};
}

function chapterMergedData(mergedData, chapter) {
  const files = new Set(chapter.files);
  return {...mergedData, workName:`${mergedData.workName} / ${chapter.title}`,
    entries:mergedData.entries.filter(entry => files.has(entry.filePath))};
}

async function buildMergedManuscriptPreviewHtml(context, options = {}) {
  const {mergedData, chapters} = resolveMergedExportData(context, options);
  const previewChapter = chapters.length
    ? chapters.find(chapter => chapter.id === (options.previewChapterId ?? chapters[0].id))
    : null;
  if (chapters.length && !previewChapter) throw new Error("プレビューする章を書き出し対象から選んでください。");
  const previewData = previewChapter ? chapterMergedData(mergedData, previewChapter) : mergedData;

  const finalOptions = {
    ...options,
    format: "html",
    htmlTarget: "browser",
    htmlDirection: "vertical",
    htmlPageSize: "auto",
    htmlOrientation: "auto",
    printPreview: options.exportMode !== "real",
  };

  const html = renderMergedManuscriptByFormat("html", previewData, finalOptions);

  return {
    html,
    pageCount: previewData.entries.length,
    chapterTitle:previewChapter?.title || "",
  };
}

async function runMergedManuscriptExport(context, options = {}) {
  const format = String(options.format || "txt");
  const {manuscriptRoot, mergedData, chapters, allChapters} = resolveMergedExportData(context, options);
  if (chapters.length) return runChapterManuscriptExport(context, options, mergedData, chapters, allChapters);
  const content = renderMergedManuscriptByFormat(format, mergedData, options);

  const saveUri = await pickMergedManuscriptSaveUri(context, manuscriptRoot, {
    ext: format,
    htmlTarget: options.htmlTarget,
    htmlDirection: options.htmlDirection,
    htmlPrintLayoutMode: options.htmlPrintLayoutMode,
    exportMode: options.exportMode,
    realPrintPageSize: options.realPrintPageSize,
    realPrintColumnMode: options.realPrintColumnMode,
  });
  if (!saveUri) return { cancelled: true };
  if (options.manuscriptIdentity) assertManuscriptSource(options, resolveMergedManuscriptRoot());

  writeMergedManuscriptFile(saveUri.fsPath, content);

  return {
    cancelled: false,
    outPath: saveUri.fsPath,
    mergedData,
    format,
    htmlTarget: String(options.htmlTarget || "browser"),
  };
}

async function runChapterManuscriptExport(context, options, mergedData, chapters, allChapters) {
  const format = String(options.format || "txt");
  const names = buildChapterOutputNames(mergedData.workName, allChapters, format, getMergedManuscriptFileVariantSuffix(format, options));
  const namesById = new Map(allChapters.map((chapter, index) => [chapter.id, names[index]]));
  const outputs = chapters.map(chapter => ({title:chapter.title, fileName:namesById.get(chapter.id),
    content:renderMergedManuscriptByFormat(format, chapterMergedData(mergedData, chapter), options)}));
  const exportDir = await ensureNamedExportDir(context, "原稿書き出し");
  if (!exportDir) return {cancelled:true};
  assertManuscriptSource(options, resolveMergedManuscriptRoot());
  const defaultDir = path.join(exportDir, "章ごと");
  fs.mkdirSync(defaultDir, {recursive:true});
  let directory;
  while (!directory) {
    const picked = await vscode.window.showOpenDialog({title:`もじごと: ${outputs.length}章の書き出し先`,
      defaultUri:vscode.Uri.file(defaultDir), canSelectFiles:false, canSelectFolders:true, canSelectMany:false,
      openLabel:"このフォルダに章ごとに書き出す"});
    if (!picked?.[0]) return {cancelled:true};
    assertManuscriptSource(options, resolveMergedManuscriptRoot());
    try { directory = assertChapterExportDirectory(picked[0].fsPath, options.manuscriptRoot); }
    catch (error) { await vscode.window.showWarningMessage(String(error.message || error)); }
  }
  const expected = inspectChapterOutputs(directory, outputs);
  const existing = expected.filter(item => item.version);
  if (existing.length) {
    const answer = await vscode.window.showWarningMessage(`${existing.length}件の同名ファイルを上書きしますか？`,
      {modal:true, detail:existing.map(item => path.basename(item.outPath)).join("\n")}, "上書きする");
    if (answer !== "上書きする") return {cancelled:true};
  }
  const outPaths = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification, title:"もじごと: 章ごとに書き出し中"},
    async progress => writeChapterOutputs(directory, outputs, expected, {
      beforeCommit() { assertManuscriptSource(options, resolveMergedManuscriptRoot());
        assertChapterExportDirectory(directory, options.manuscriptRoot); },
      onProgress(done, total, title) { progress.report({increment:100 / total, message:`${done}/${total} ${title}`}); },
    }));
  return {cancelled:false, exportUnit:"chapters", outPath:outPaths[0], outPaths, outDir:directory,
    format, htmlTarget:String(options.htmlTarget || "browser")};
}

async function notifyMergedManuscriptExport(result) {
  const typeLabel = getMergedManuscriptTypeLabel(result);
  const message = result.exportUnit === "chapters"
    ? `もじごと: ${result.outPaths.length}章を${typeLabel}で書き出しました → ${path.basename(result.outDir)}`
    : `もじごと: 結合ファイル（${typeLabel}）を書き出しました → ${path.basename(result.outPath)}`;
  const actions = ["フォルダを開く"];
  if (!result.outPaths || result.outPaths.length === 1) actions.push("ファイルを開く");
  const action = await vscode.window.showInformationMessage(message, ...actions);
  if (action === "ファイルを開く") await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(result.outPath));
  else if (action === "フォルダを開く") await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(result.outPath));
}

async function exportMergedManuscript(context) {
  try {
    if (revealMergedManuscriptBrowserPanel()) return;
    const options = await collectMergedManuscriptExportOptions(context);
    if (!options) return;

    const result = await runMergedManuscriptExport(context, options);
    if (!result || result.cancelled) return;

    await notifyMergedManuscriptExport(result);
  } catch (e) {
    const message = String(e?.message || e || "");

    if (message.includes("manuscriptRoot が未設定")) {
      vscode.window.showWarningMessage(
        "もじごと: manuscriptRoot が未設定です。",
      );
      return;
    }

    if (message.includes("manuscriptRoot が見つかりません")) {
      vscode.window.showWarningMessage(
        "もじごと: manuscriptRoot が見つかりません。",
      );
      return;
    }

    if (message.includes("対象ファイル")) {
      vscode.window.showInformationMessage(
        "もじごと: 対象ファイル（.txt/.md）が見つかりません。",
      );
      return;
    }

    vscode.window.showErrorMessage(
      `もじごと: 書き出しに失敗しました: ${message}`,
    );
  }
}

module.exports = {
  exportMergedManuscript,
  renderMergedManuscriptByFormat,
};
