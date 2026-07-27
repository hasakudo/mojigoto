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
} = require("./merged-manuscript-browser-panel");

const { ensureNamedExportDir } = require("./export-utils");

const {
  renderMergedManuscriptBrowserRealPrintHtml,
} = require("./merged-manuscript-browser-realprint-html");

const MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY =
  "mojigoto.mergedManuscriptBrowserPanelState";

function normalizeRealPrintSizeKey(value) {
  const v = String(value || "b6")
    .trim()
    .toLowerCase();

  if (
    v === "a5" ||
    v === "a6" ||
    v === "b6" ||
    v === "shiroku" ||
    v === "shinsho"
  ) {
    return v;
  }

  return "b6";
}

function isRealPrintTwoColumnSize(value) {
  const key = normalizeRealPrintSizeKey(value);
  return key === "a5" || key === "shinsho";
}

function normalizeRealPrintColumnMode(value, pageSize = "b6") {
  const mode = String(value || "single")
    .trim()
    .toLowerCase();

  if (mode === "two" && isRealPrintTwoColumnSize(pageSize)) {
    return "two";
  }

  return "single";
}

function getRealPrintStateKey(pageSize = "b6", columnMode = "single") {
  const sizeKey = normalizeRealPrintSizeKey(pageSize);
  const mode = normalizeRealPrintColumnMode(columnMode, sizeKey);
  return `${sizeKey}:${mode}`;
}

function normalizeSimpleLayoutKey(value) {
  return String(value || "single") === "2up" ? "2up" : "single";
}

function buildSimplePanelState(state = {}) {
  return {
    htmlPrintLayoutMode: normalizeSimpleLayoutKey(state?.htmlPrintLayoutMode),

    htmlPrintOrientation:
      String(state?.htmlPrintOrientation || "portrait") === "landscape"
        ? "landscape"
        : "portrait",

    showPageNumbers: state?.showPageNumbers === true,

    printFontSizePt:
      Number(state?.printFontSizePt || 0) ||
      Math.round(Number(state?.printFontSizePx || 0) * 0.75 * 10) / 10,

    printFontSizePx:
      Number(state?.printFontSizePx || 0) ||
      Math.round(Number(state?.printFontSizePt || 0) / 0.75),

    printLineHeight: Number(state?.printLineHeight || 0),
    printMarginMm: Number(state?.printMarginMm || 0),
    printBodyPaddingPx: Number(state?.printBodyPaddingPx || 0),

    charsPerLine: Number(state?.charsPerLine || 0),
    linesPerPage: Number(state?.linesPerPage || 0),

    punctuationLayoutMode:
      String(state?.punctuationLayoutMode || "hanging") === "pushout"
        ? "pushout"
        : "hanging",
    useTypographyAdjustments: state?.useTypographyAdjustments !== false,
  };
}

function readMergedManuscriptBrowserPanelState(context) {
  try {
    const value = context?.workspaceState?.get(
      MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY,
      null,
    );
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function writeMergedManuscriptBrowserPanelState(context, state) {
  if (!context?.workspaceState) return;

  const pageSizeKey = normalizeRealPrintSizeKey(state?.realPrintPageSize);

  const columnMode = normalizeRealPrintColumnMode(
    state?.realPrintColumnMode,
    pageSizeKey,
  );
  const realStateKey = getRealPrintStateKey(pageSizeKey, columnMode);

  const prev = readMergedManuscriptBrowserPanelState(context) || {
    simple: {},
    realBySize: {},
  };

  const nextState = {
    exportMode:
      String(state?.exportMode || "simple")
        .trim()
        .toLowerCase() === "real"
        ? "real"
        : "simple",

    realPrintPageSize: pageSizeKey,
    realPrintColumnMode: columnMode,
    useTypographyAdjustments: state?.useTypographyAdjustments !== false,
    punctuationLayoutMode:
      state?.punctuationLayoutMode === "pushout" ? "pushout" : "hanging",

    simple: {
      ...(prev.simple && typeof prev.simple === "object" ? prev.simple : {}),

      currentLayoutMode: normalizeSimpleLayoutKey(state?.htmlPrintLayoutMode),

      byLayout: {
        ...(prev.simple &&
        prev.simple.byLayout &&
        typeof prev.simple.byLayout === "object"
          ? prev.simple.byLayout
          : {}),

        [normalizeSimpleLayoutKey(state?.htmlPrintLayoutMode)]:
          buildSimplePanelState(state),
      },
    },

    realBySize: {
      ...(prev.realBySize || {}),
      [realStateKey]: {
        realPrintPageSize: pageSizeKey,
        realPrintColumnMode: columnMode,
        realPrintColumnGapMm: Number(state?.realPrintColumnGapMm || 0),
        realPrintFontSizePt: Number(state?.realPrintFontSizePt || 0),
        realPrintBleedMm: Number(state?.realPrintBleedMm || 0),

        realPrintBleedMode:
          String(state?.realPrintBleedMode || "all") === "nonSpine"
            ? "nonSpine"
            : "all",

        realPrintMirrorMargins: state?.realPrintMirrorMargins !== false,

        realPrintStartPageSide:
          String(state?.realPrintStartPageSide || "odd") === "even"
            ? "even"
            : "odd",

        realPrintBookOptionsEnabled:
          state?.realPrintBookOptionsEnabled === true,

        realPrintShowPageNumber: state?.realPrintShowPageNumber === true,

        realPrintPageNumberStart: Number(state?.realPrintPageNumberStart || 1),

        realPrintShowHeading1: state?.realPrintShowHeading1 === true,

        realPrintHeading1Mode:
          String(state?.realPrintHeading1Mode || "all") === "evenOnly"
            ? "evenOnly"
            : "all",

        realPrintHeaderOrder:
          String(state?.realPrintHeaderOrder || "numberTitle") === "titleNumber"
            ? "titleNumber"
            : "numberTitle",

        realPrintHeaderPosition:
          String(state?.realPrintHeaderPosition || "bottom") === "top"
            ? "top"
            : "bottom",

        realPrintMarginTopMm: Number(state?.realPrintMarginTopMm || 0),
        realPrintMarginBottomMm: Number(state?.realPrintMarginBottomMm || 0),
        realPrintMarginRightMm: Number(state?.realPrintMarginRightMm || 0),
        realPrintMarginLeftMm: Number(state?.realPrintMarginLeftMm || 0),
        realPrintCharsPerLine: Number(state?.realPrintCharsPerLine || 0),
        realPrintLinesPerPage: Number(state?.realPrintLinesPerPage || 0),
      },
    },
  };

  await context.workspaceState.update(
    MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY,
    nextState,
  );
}

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
        description: "見出し・ルビを保持しWordで開く",
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

async function collectMergedManuscriptExportOptions(context) {
  const preset = await pickMergedManuscriptExportPreset();
  if (!preset) return null;

  const options = {
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

  const manuscriptRoot = resolveMergedManuscriptRoot();
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

        const typeLabel = getMergedManuscriptTypeLabel(result);

        void (async () => {
          try {
            const action = await vscode.window.showInformationMessage(
              `もじごと: 結合ファイル（${typeLabel}）を書き出しました → ${path.basename(result.outPath)}`,
              "フォルダを開く",
              "ファイルを開く",
            );

            if (action === "ファイルを開く") {
              await vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.file(result.outPath),
              );
              return;
            }

            if (action === "フォルダを開く") {
              await vscode.commands.executeCommand(
                "revealFileInOS",
                vscode.Uri.file(result.outPath),
              );
            }
          } catch (error) {
            console.error(
              "mojigoto: failed to handle export notification action",
              error,
            );
          }
        })();

        return {
          message: "HTMLを書き出しました。",
        };
      },

      onPreview: async (panelOptions) => {
        const finalOptions = {
          ...options,
          ...basePanelState,
          ...panelOptions,
          format: "html",
          htmlTarget: "browser",
          htmlDirection: "vertical",
          htmlPageSize: "auto",
          htmlOrientation: "auto",
          exportMode: "real",
        };

        const result = await buildMergedManuscriptPreviewHtml(
          context,
          finalOptions,
        );

        return {
          html: result.html,
          message: "現在の実寸優先設定で本文プレビューを表示しています。",
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

async function buildMergedManuscriptPreviewHtml(context, options = {}) {
  const manuscriptRoot = resolveMergedManuscriptRoot();
  const files = collectMergedManuscriptFiles(manuscriptRoot, [".txt", ".md"]);
  ensureMergedManuscriptFiles(files);

  const mergedData = buildMergedManuscriptData(context, manuscriptRoot, files);

  const finalOptions = {
    ...options,
    format: "html",
    htmlTarget: "browser",
    htmlDirection: "vertical",
    htmlPageSize: "auto",
    htmlOrientation: "auto",
    exportMode: "real",
  };

  const html = renderMergedManuscriptByFormat("html", mergedData, finalOptions);

  return {
    html,
    pageCount: Array.isArray(mergedData?.files) ? mergedData.files.length : 0,
  };
}

async function runMergedManuscriptExport(context, options = {}) {
  const format = String(options.format || "txt");

  const manuscriptRoot = resolveMergedManuscriptRoot();
  const files = collectMergedManuscriptFiles(manuscriptRoot, [".txt", ".md"]);
  ensureMergedManuscriptFiles(files);

  const mergedData = buildMergedManuscriptData(context, manuscriptRoot, files);
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

  writeMergedManuscriptFile(saveUri.fsPath, content);

  return {
    cancelled: false,
    outPath: saveUri.fsPath,
    mergedData,
    format,
    htmlTarget: String(options.htmlTarget || "browser"),
  };
}

async function exportMergedManuscript(context) {
  try {
    const options = await collectMergedManuscriptExportOptions(context);
    if (!options) return;

    const result = await runMergedManuscriptExport(context, options);
    if (!result || result.cancelled) return;

    const typeLabel = getMergedManuscriptTypeLabel(result);

    const action = await vscode.window.showInformationMessage(
      `もじごと: 結合ファイル（${typeLabel}）を書き出しました → ${path.basename(result.outPath)}`,
      "フォルダを開く",
      "ファイルを開く",
    );

    if (action === "ファイルを開く") {
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(result.outPath),
      );
    } else if (action === "フォルダを開く") {
      await vscode.commands.executeCommand(
        "revealFileInOS",
        vscode.Uri.file(result.outPath),
      );
    }
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
