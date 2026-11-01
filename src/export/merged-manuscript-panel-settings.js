// 原稿書き出し設定の保存。画面操作中と書き出し時の更新規則は区別する。
// 判型・版組のキーと、書き出し時に保存する現在の設定。
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

// 画面操作中は受け取った保存マップをマージする。書き出し時の保存とは統合しない。
function normalizePersistedPanelState(value = {}) {
  const exportMode =
    String(value.exportMode || "simple")
      .trim()
      .toLowerCase() === "real"
      ? "real"
      : "simple";

  const realPrintPageSize = (() => {
    const v = String(value.realPrintPageSize || "b6")
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
  })();

  const realPrintColumnMode = (() => {
    const mode = String(value.realPrintColumnMode || "single")
      .trim()
      .toLowerCase();

    if (
      mode === "two" &&
      (realPrintPageSize === "a5" || realPrintPageSize === "shinsho")
    ) {
      return "two";
    }

    return "single";
  })();

  return {
    exportMode,
    realPrintPageSize,
    realPrintColumnMode,
    useTypographyAdjustments: value.useTypographyAdjustments !== false,
    punctuationLayoutMode:
      value.punctuationLayoutMode === "pushout" ? "pushout" : "hanging",
  };
}

async function updatePersistedPanelUiState(context, nextState = {}) {
  if (!context?.workspaceState) return;

  const prev = context.workspaceState.get(MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY) || {};

  const normalized = normalizePersistedPanelState(nextState);

  const next = {
    ...(prev && typeof prev === "object" ? prev : {}),
    exportMode: normalized.exportMode,
    realPrintPageSize: normalized.realPrintPageSize,
    realPrintColumnMode: normalized.realPrintColumnMode,
    useTypographyAdjustments: normalized.useTypographyAdjustments,
    punctuationLayoutMode: normalized.punctuationLayoutMode,
  };

  if (
    nextState.simpleSavedByLayout &&
    typeof nextState.simpleSavedByLayout === "object"
  ) {
    next.simple = {
      ...(next.simple && typeof next.simple === "object" ? next.simple : {}),
      currentLayoutMode:
        String(
          nextState.htmlPrintLayoutMode ||
            next.simple?.currentLayoutMode ||
            "single",
        ) === "2up"
          ? "2up"
          : "single",
      byLayout: {
        ...(next.simple?.byLayout && typeof next.simple.byLayout === "object"
          ? next.simple.byLayout
          : {}),
        ...nextState.simpleSavedByLayout,
      },
    };
  }

  if (
    nextState.realPrintSavedBySize &&
    typeof nextState.realPrintSavedBySize === "object"
  ) {
    next.realBySize = {
      ...(next.realBySize && typeof next.realBySize === "object"
        ? next.realBySize
        : {}),
      ...nextState.realPrintSavedBySize,
    };
  }

  await context.workspaceState.update(MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY, next);
}

module.exports = {
  MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY,
  normalizeRealPrintSizeKey, normalizeRealPrintColumnMode, getRealPrintStateKey, normalizeSimpleLayoutKey,
  readMergedManuscriptBrowserPanelState, writeMergedManuscriptBrowserPanelState,
  normalizePersistedPanelState, updatePersistedPanelUiState,
};
