// 書き出し設定の補正。VS Codeの状態保存・画面生成には依存しない。
function toPositiveNumber(
  value,
  fallback,
  min = 0,
  max = Number.POSITIVE_INFINITY,
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pxToPt(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 0.75 * 10) / 10;
}

function ptToPx(pt) {
  const n = Number(pt);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / 0.75);
}

function normalizePanelState(initialState = {}) {
  const punctuation = String(initialState.punctuationLayoutMode || "hanging")
    .trim()
    .toLowerCase();

  return {
    format: "html",
    exportScopeDescription:String(initialState.exportScopeDescription || ""),
    previewChapters:Array.isArray(initialState.previewChapters)
      ? initialState.previewChapters.map(chapter => ({id:String(chapter.id), title:String(chapter.title)})) : [],
    htmlTarget: "browser",
    htmlDirection: "vertical",
    htmlShowTitle: false,
    htmlPageSize: "auto",
    htmlOrientation: "auto",

    htmlPrintLayoutMode:
      String(initialState.htmlPrintLayoutMode || "single") === "2up"
        ? "2up"
        : "single",

    htmlPrintOrientation:
      String(initialState.htmlPrintOrientation || "portrait") === "landscape"
        ? "landscape"
        : "portrait",

    showPageNumbers: initialState.showPageNumbers === true,

    printFontSizePt: (() => {
      const savedPt = Number(initialState.printFontSizePt);
      if (Number.isFinite(savedPt) && savedPt > 0) {
        return toPositiveNumber(savedPt, pxToPt(14.5), 6, 40);
      }

      return toPositiveNumber(
        pxToPt(initialState.printFontSizePx),
        pxToPt(14.5),
        6,
        40,
      );
    })(),

    printFontSizePx: (() => {
      const savedPt = Number(initialState.printFontSizePt);
      if (Number.isFinite(savedPt) && savedPt > 0) {
        return ptToPx(savedPt);
      }

      return toPositiveNumber(initialState.printFontSizePx, 14.5, 8, 40);
    })(),

    printLineHeight: toPositiveNumber(
      initialState.printLineHeight,
      1.72,
      1.4,
      3,
    ),
    printMarginMm: toPositiveNumber(initialState.printMarginMm, 0, 0, 60),
    printBodyPaddingPx: 0,

    charsPerLine: toPositiveNumber(initialState.charsPerLine, 42, 1, 200),
    linesPerPage: toPositiveNumber(initialState.linesPerPage, 16, 1, 200),
    fontFamily: String(initialState.fontFamily || "serif").trim() || "serif",
    punctuationLayoutMode: punctuation === "pushout" ? "pushout" : "hanging",
    useTypographyAdjustments: initialState.useTypographyAdjustments !== false,
    pageSizeLabel: String(initialState.pageLabel || "auto"),

    exportMode:
      String(initialState.exportMode || "simple")
        .trim()
        .toLowerCase() === "real"
        ? "real"
        : "simple",

    realPrintPageSize: (() => {
      const v = String(initialState.realPrintPageSize || "b6")
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
    })(),

    realPrintColumnMode: (() => {
      const size = String(initialState.realPrintPageSize || "b6")
        .trim()
        .toLowerCase();

      const mode = String(initialState.realPrintColumnMode || "single")
        .trim()
        .toLowerCase();

      if (mode === "two" && (size === "a5" || size === "shinsho")) {
        return "two";
      }

      return "single";
    })(),

    realPrintColumnGapMm: toPositiveNumber(
      initialState.realPrintColumnGapMm,
      0,
      0,
      30,
    ),

    realPrintFontSizePt: toPositiveNumber(
      initialState.realPrintFontSizePt,
      9,
      1,
      40,
    ),

    realPrintBleedMm: toPositiveNumber(initialState.realPrintBleedMm, 0, 0, 20),

    realPrintBleedMode:
      String(initialState.realPrintBleedMode || "all") === "nonSpine"
        ? "nonSpine"
        : "all",

    realPrintMirrorMargins: initialState.realPrintMirrorMargins !== false,

    realPrintStartPageSide:
      String(initialState.realPrintStartPageSide || "odd") === "even"
        ? "even"
        : "odd",

    realPrintBookOptionsEnabled:
      initialState.realPrintBookOptionsEnabled === true,

    realPrintShowPageNumber: initialState.realPrintShowPageNumber === true,

    realPrintPageNumberStart: toPositiveNumber(
      initialState.realPrintPageNumberStart,
      1,
      1,
      9999,
    ),

    realPrintShowHeading1: initialState.realPrintShowHeading1 === true,

    realPrintHeading1Mode:
      String(initialState.realPrintHeading1Mode || "all") === "evenOnly"
        ? "evenOnly"
        : "all",

    realPrintHeaderOrder:
      String(initialState.realPrintHeaderOrder || "numberTitle") ===
      "titleNumber"
        ? "titleNumber"
        : "numberTitle",

    realPrintHeaderPosition:
      String(initialState.realPrintHeaderPosition || "bottom") === "top"
        ? "top"
        : "bottom",

    realPrintMarginTopMm: toPositiveNumber(
      initialState.realPrintMarginTopMm,
      22,
      0,
      100,
    ),
    realPrintMarginBottomMm: toPositiveNumber(
      initialState.realPrintMarginBottomMm,
      18,
      0,
      100,
    ),
    realPrintMarginRightMm: toPositiveNumber(
      initialState.realPrintMarginRightMm,
      18,
      0,
      100,
    ),
    realPrintMarginLeftMm: toPositiveNumber(
      initialState.realPrintMarginLeftMm,
      14,
      0,
      100,
    ),

    realPrintCharsPerLine: toPositiveNumber(
      initialState.realPrintCharsPerLine,
      42,
      1,
      200,
    ),
    realPrintLinesPerPage: toPositiveNumber(
      initialState.realPrintLinesPerPage,
      16,
      1,
      200,
    ),

    realPrintMetrics:
      initialState.realPrintMetrics &&
      typeof initialState.realPrintMetrics === "object"
        ? initialState.realPrintMetrics
        : null,

    realPrintSavedBySize:
      initialState.realPrintSavedBySize &&
      typeof initialState.realPrintSavedBySize === "object"
        ? initialState.realPrintSavedBySize
        : {},

    simpleSavedByLayout:
      initialState.simpleSavedByLayout &&
      typeof initialState.simpleSavedByLayout === "object"
        ? initialState.simpleSavedByLayout
        : {},
  };
}

module.exports = { normalizePanelState, pxToPt };
