const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { getWorkNameForStats } = require("./manuscript-export");

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listTextFilesRecursive(dir, exts = [".txt", ".md"]) {
  const out = [];
  const extSet = new Set(exts.map((x) => String(x).toLowerCase()));
  const stack = [dir];

  while (stack.length) {
    const cur = stack.pop();
    let ents = [];
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of ents) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (extSet.has(ext)) out.push(full);
      }
    }
  }

  return out;
}

function splitLeadingNumberBase(name) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  const m = stem.match(/^\s*(\d+)([._\-\s　]+)?(.*)$/);
  if (!m) return { num: null, rest: stem.trim(), ext };
  return {
    num: Number(m[1]),
    rest: String(m[3] || "").trim() || stem.trim(),
    ext,
  };
}

function compareFilesByLeadingNumber(a, b) {
  const aa = splitLeadingNumberBase(path.basename(a));
  const bb = splitLeadingNumberBase(path.basename(b));
  const aHas = Number.isFinite(aa.num);
  const bHas = Number.isFinite(bb.num);

  if (aHas && bHas && aa.num !== bb.num) return aa.num - bb.num;
  if (aHas !== bHas) return aHas ? -1 : 1;

  const byDir = path.dirname(a).localeCompare(path.dirname(b), "ja");
  if (byDir !== 0) return byDir;

  return path.basename(a).localeCompare(path.basename(b), "ja", {
    numeric: true,
  });
}

function getFirstMeaningfulLine(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  for (const raw of lines) {
    const line = String(raw || "")
      .replace(/^\uFEFF/, "")
      .trim();
    if (!line) continue;
    return line;
  }

  return "";
}

function startsWithMarkdownHeading(text) {
  const first = getFirstMeaningfulLine(text);
  return /^#{1,6}(?:\s|$)/.test(first);
}

function resolveMergedManuscriptRoot() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();

  if (!manuscriptRoot) {
    throw new Error("manuscriptRoot が未設定です。");
  }

  if (
    !fs.existsSync(manuscriptRoot) ||
    !fs.statSync(manuscriptRoot).isDirectory()
  ) {
    throw new Error("manuscriptRoot が見つかりません。");
  }

  return manuscriptRoot;
}

function collectMergedManuscriptFiles(manuscriptRoot, exts = [".txt", ".md"]) {
  return listTextFilesRecursive(manuscriptRoot, exts).sort(
    compareFilesByLeadingNumber,
  );
}

function ensureMergedManuscriptFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("対象ファイル（.txt/.md）が見つかりません。");
  }
}

function toMergedRelativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function buildMergedManuscriptEntry(rootDir, filePath) {
  const content = String(safeRead(filePath) || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  return {
    filePath,
    relativePath: toMergedRelativePath(rootDir, filePath),
    fileName: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase(),
    content,
    startsWithHeading: startsWithMarkdownHeading(content),
  };
}

function buildMergedManuscriptData(context, manuscriptRoot, files) {
  return {
    manuscriptRoot,
    workName: getWorkNameForStats(context),
    entries: files.map((filePath) =>
      buildMergedManuscriptEntry(manuscriptRoot, filePath),
    ),
  };
}

function getMergedManuscriptJoinMode() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const value = String(
    cfg.get("mergedManuscriptJoinMode", "headingAware") || "",
  ).trim();

  if (value === "single") return "single";
  if (value === "double") return "double";
  return "headingAware";
}

function getMergedManuscriptSeparator(prevEntry, nextEntry, options = {}) {
  const mode = String(options.joinMode || "headingAware");

  if (mode === "single") {
    return "\n";
  }

  if (mode === "double") {
    return "\n\n";
  }

  return nextEntry?.startsWithHeading ? "\n" : "\n\n";
}

function trimMergedEntryForJoin(text, side = "both") {
  let out = String(text || "");

  if (side === "start" || side === "both") {
    out = out.replace(/^\n+/g, "");
  }
  if (side === "end" || side === "both") {
    out = out.replace(/\n+$/g, "");
  }

  return out;
}

function renderMergedManuscriptTxt(mergedData, options = {}) {
  const entries = Array.isArray(mergedData?.entries) ? mergedData.entries : [];
  if (!entries.length) return "";

  let out = "";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const content = String(entry?.content || "");

    if (!out) {
      out = content;
      continue;
    }

    out = trimMergedEntryForJoin(out, "end");
    out += getMergedManuscriptSeparator(entries[i - 1], entry, options);
    out += trimMergedEntryForJoin(content, "start");
  }

  return out;
}

function renderMergedManuscriptMd(mergedData, options = {}) {
  return renderMergedManuscriptTxt(mergedData, options);
}

function buildMergedManuscriptBlocks(mergedData, options = {}) {
  const bodyText = renderMergedManuscriptTxt(mergedData, options);
  const lines = String(bodyText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const blocks = [];
  let paragraphBuffer = [];

  function flushParagraph() {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join("\n");
    if (text.replace(/[ \t　\r\n]/g, "") !== "") {
      blocks.push({
        type: "paragraph",
        text,
      });
    }
    paragraphBuffer = [];
  }

  function pushBlank() {
    const last = blocks[blocks.length - 1];
    if (last?.type !== "blank") {
      blocks.push({ type: "blank" });
    }
  }

  for (const line of lines) {
    const raw = String(line || "");

    if (!raw.trim()) {
      flushParagraph();
      pushBlank();
      continue;
    }

    if (/^###\s+/.test(raw)) {
      flushParagraph();
      pushBlank();
      blocks.push({
        type: "heading3",
        text: raw.replace(/^###\s+/, ""),
      });
      pushBlank();
      continue;
    }

    if (/^##\s+/.test(raw)) {
      flushParagraph();
      pushBlank();
      blocks.push({
        type: "heading2",
        text: raw.replace(/^##\s+/, ""),
      });
      pushBlank();
      continue;
    }

    if (/^#\s+/.test(raw)) {
      flushParagraph();

      const last = blocks[blocks.length - 1];
      if (last?.type === "blank") {
        blocks.pop();
      }

      blocks.push({
        type: "heading1",
        text: raw.replace(/^#\s+/, ""),
        forcePageBreakBefore: true,
      });
      continue;
    }

    paragraphBuffer.push(raw);
  }

  flushParagraph();

  return blocks;
}

function buildMergedManuscriptPrintBlocks(mergedData, options = {}) {
  return buildMergedManuscriptBlocks(mergedData, options);
}

function findMojigotoJsonPath(manuscriptRoot) {
  const candidates = [
    path.join(manuscriptRoot, ".mojigoto.json"),
    path.join(path.dirname(manuscriptRoot), ".mojigoto.json"),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  return "";
}

function safeReadJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const MANUSCRIPT_PAGE_PRESETS = {
  a5: {
    key: "a5",
    label: "A5",
    widthMm: 148,
    heightMm: 210,
    defaultFontSizePx: 17,
    defaultLineHeight: 1.8,
    defaultCharsPerLine: 42,
    defaultLinesPerPage: 16,
    pageMarginMm: 6,
    bodyPaddingPx: 24,
  },
  a6: {
    key: "a6",
    label: "A6",
    widthMm: 105,
    heightMm: 148,
    defaultFontSizePx: 14,
    defaultLineHeight: 1.75,
    defaultCharsPerLine: 30,
    defaultLinesPerPage: 12,
    pageMarginMm: 6,
    bodyPaddingPx: 18,
  },
  b6: {
    key: "b6",
    label: "B6",
    widthMm: 128,
    heightMm: 182,
    defaultFontSizePx: 15.5,
    defaultLineHeight: 1.78,
    defaultCharsPerLine: 36,
    defaultLinesPerPage: 14,
    pageMarginMm: 6,
    bodyPaddingPx: 20,
  },
};

const REAL_PRINT_PAGE_PRESETS = {
  a5: { key: "a5", label: "A5", widthMm: 148, heightMm: 210 },
  a6: { key: "a6", label: "A6", widthMm: 105, heightMm: 148 },
  b6: { key: "b6", label: "B6", widthMm: 128, heightMm: 182 },
  shiroku: { key: "shiroku", label: "四六判", widthMm: 128, heightMm: 188 },
  shinsho: { key: "shinsho", label: "新書判", widthMm: 105, heightMm: 173 },
};

const REAL_PRINT_DEFAULTS_BY_LAYOUT = {
  "a5:single": {
    realPrintPageSize: "a5",
    realPrintColumnMode: "single",
    realPrintColumnGapMm: 0,
    realPrintFontSizePt: 10,
    realPrintMarginTopMm: 30,
    realPrintMarginBottomMm: 30,
    realPrintMarginRightMm: 20,
    realPrintMarginLeftMm: 20,
    realPrintCharsPerLine: 40,
    realPrintLinesPerPage: 17,
  },

  "a5:two": {
    realPrintPageSize: "a5",
    realPrintColumnMode: "two",
    realPrintColumnGapMm: 8.5,
    realPrintFontSizePt: 8,
    realPrintMarginTopMm: 20,
    realPrintMarginBottomMm: 20,
    realPrintMarginRightMm: 18,
    realPrintMarginLeftMm: 18,
    realPrintCharsPerLine: 28,
    realPrintLinesPerPage: 23,
  },

  "b6:single": {
    realPrintPageSize: "b6",
    realPrintColumnMode: "single",
    realPrintColumnGapMm: 0,
    realPrintFontSizePt: 9,
    realPrintMarginTopMm: 19,
    realPrintMarginBottomMm: 19,
    realPrintMarginRightMm: 17,
    realPrintMarginLeftMm: 21,
    realPrintCharsPerLine: 42,
    realPrintLinesPerPage: 16,
  },

  "a6:single": {
    realPrintPageSize: "a6",
    realPrintColumnMode: "single",
    realPrintColumnGapMm: 0,
    realPrintFontSizePt: 8,
    realPrintMarginTopMm: 13,
    realPrintMarginBottomMm: 13,
    realPrintMarginRightMm: 11,
    realPrintMarginLeftMm: 15,
    realPrintCharsPerLine: 40,
    realPrintLinesPerPage: 16,
  },

  "shiroku:single": {
    realPrintPageSize: "shiroku",
    realPrintColumnMode: "single",
    realPrintColumnGapMm: 0,
    realPrintFontSizePt: 10,
    realPrintMarginTopMm: 19,
    realPrintMarginBottomMm: 19,
    realPrintMarginRightMm: 13,
    realPrintMarginLeftMm: 16,
    realPrintCharsPerLine: 40,
    realPrintLinesPerPage: 16,
  },

  "shinsho:single": {
    realPrintPageSize: "shinsho",
    realPrintColumnMode: "single",
    realPrintColumnGapMm: 0,
    realPrintFontSizePt: 8,
    realPrintMarginTopMm: 21,
    realPrintMarginBottomMm: 21,
    realPrintMarginRightMm: 15,
    realPrintMarginLeftMm: 15,
    realPrintCharsPerLine: 42,
    realPrintLinesPerPage: 16,
  },

  "shinsho:two": {
    realPrintPageSize: "shinsho",
    realPrintColumnMode: "two",
    realPrintColumnGapMm: 8.5,
    realPrintFontSizePt: 8,
    realPrintMarginTopMm: 15,
    realPrintMarginBottomMm: 15,
    realPrintMarginRightMm: 12,
    realPrintMarginLeftMm: 15,
    realPrintCharsPerLine: 22,
    realPrintLinesPerPage: 18,
  },
};

function normalizeRealPrintPageSize(value) {
  const key = String(value || "b6")
    .trim()
    .toLowerCase();

  if (
    key === "a5" ||
    key === "a6" ||
    key === "b6" ||
    key === "shiroku" ||
    key === "shinsho"
  ) {
    return key;
  }

  return "b6";
}

function isRealPrintTwoColumnSize(pageSize) {
  const key = normalizeRealPrintPageSize(pageSize);
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

function getRealPrintLayoutKey(pageSize = "b6", columnMode = "single") {
  const sizeKey = normalizeRealPrintPageSize(pageSize);
  const mode = normalizeRealPrintColumnMode(columnMode, sizeKey);
  return `${sizeKey}:${mode}`;
}

function getRealPrintDefaultsForLayout(pageSize = "b6", columnMode = "single") {
  const key = getRealPrintLayoutKey(pageSize, columnMode);
  return {
    ...(REAL_PRINT_DEFAULTS_BY_LAYOUT[key] ||
      REAL_PRINT_DEFAULTS_BY_LAYOUT["b6:single"]),
  };
}

function getMergedManuscriptRealPrintPreset(pageSize = "b6") {
  const key = normalizeRealPrintPageSize(pageSize);
  return REAL_PRINT_PAGE_PRESETS[key] || REAL_PRINT_PAGE_PRESETS.b6;
}

function convertPrintPtToApproxMm(pt) {
  const value = Number(pt);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 0.35 * 100) / 100;
}

function roundMm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function getMergedManuscriptPageSize() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const raw = String(cfg.get("mergedManuscriptPageSize", "a5") || "")
    .trim()
    .toLowerCase();

  if (raw === "a6") return "a6";
  if (raw === "b6") return "b6";
  return "a5";
}

function getMergedManuscriptPagePreset(pageSize = "a5") {
  const key = String(pageSize || "a5")
    .trim()
    .toLowerCase();
  return MANUSCRIPT_PAGE_PRESETS[key] || MANUSCRIPT_PAGE_PRESETS.a5;
}

function resolveMergedManuscriptHtmlMode(options = {}) {
  const mode = String(options.htmlMode || "").trim();

  if (mode === "print-fit") return "print-fit";
  if (mode === "print-page-size") return "print-page-size";
  return "preview";
}

function resolveMergedManuscriptTypography(config = {}, preset, options = {}) {
  const explicitFontSizePx = Number(options?.fontSizePx);
  const explicitLineHeight = Number(options?.lineHeight);
  const explicitCharsPerLine = Number(options?.charsPerLine);
  const explicitLinesPerPage = Number(options?.linesPerPage);

  const configFontSizePx = Number(config?.fontSizePx);
  const configLineHeight = Number(config?.lineHeight);
  const configCharsPerLine = Number(config?.charsPerLine);
  const configLinesPerPage = Number(config?.linesPerPage);

  return {
    fontSizePx:
      Number.isFinite(explicitFontSizePx) && explicitFontSizePx > 0
        ? explicitFontSizePx
        : Number.isFinite(configFontSizePx) && configFontSizePx > 0
          ? configFontSizePx
          : preset.defaultFontSizePx,

    lineHeight:
      Number.isFinite(explicitLineHeight) && explicitLineHeight > 0
        ? explicitLineHeight
        : Number.isFinite(configLineHeight) && configLineHeight > 0
          ? configLineHeight
          : preset.defaultLineHeight,

    charsPerLine:
      Number.isFinite(explicitCharsPerLine) && explicitCharsPerLine > 0
        ? explicitCharsPerLine
        : Number.isFinite(configCharsPerLine) && configCharsPerLine > 0
          ? configCharsPerLine
          : preset.defaultCharsPerLine,

    linesPerPage:
      Number.isFinite(explicitLinesPerPage) && explicitLinesPerPage > 0
        ? explicitLinesPerPage
        : Number.isFinite(configLinesPerPage) && configLinesPerPage > 0
          ? configLinesPerPage
          : preset.defaultLinesPerPage,
  };
}

function resolveMergedManuscriptRealPrintMetrics(options = {}) {
  const pageSizeKey = normalizeRealPrintPageSize(options.realPrintPageSize);
  const columnMode = normalizeRealPrintColumnMode(
    options.realPrintColumnMode,
    pageSizeKey,
  );
  const layoutDefaults = getRealPrintDefaultsForLayout(pageSizeKey, columnMode);

  const preset = getMergedManuscriptRealPrintPreset(pageSizeKey);

  const fontSizePt = Number(
    options.realPrintFontSizePt ?? layoutDefaults.realPrintFontSizePt,
  );
  const topMm = Number(
    options.realPrintMarginTopMm ?? layoutDefaults.realPrintMarginTopMm,
  );
  const bottomMm = Number(
    options.realPrintMarginBottomMm ?? layoutDefaults.realPrintMarginBottomMm,
  );
  const rightMm = Number(
    options.realPrintMarginRightMm ?? layoutDefaults.realPrintMarginRightMm,
  );
  const leftMm = Number(
    options.realPrintMarginLeftMm ?? layoutDefaults.realPrintMarginLeftMm,
  );
  const charsPerLine = Number(
    options.realPrintCharsPerLine ?? layoutDefaults.realPrintCharsPerLine,
  );
  const linesPerPage = Number(
    options.realPrintLinesPerPage ?? layoutDefaults.realPrintLinesPerPage,
  );
  const columnGapMm = Number(
    options.realPrintColumnGapMm ?? layoutDefaults.realPrintColumnGapMm,
  );

  const normalizedFontSizePt =
    Number.isFinite(fontSizePt) && fontSizePt > 0 ? fontSizePt : 9;

  const normalizedTopMm = Number.isFinite(topMm) && topMm >= 0 ? topMm : 0;
  const normalizedBottomMm =
    Number.isFinite(bottomMm) && bottomMm >= 0 ? bottomMm : 0;
  const normalizedRightMm =
    Number.isFinite(rightMm) && rightMm >= 0 ? rightMm : 0;
  const normalizedLeftMm = Number.isFinite(leftMm) && leftMm >= 0 ? leftMm : 0;

  const normalizedCharsPerLine =
    Number.isFinite(charsPerLine) && charsPerLine > 0 ? charsPerLine : 42;

  const normalizedLinesPerPage =
    Number.isFinite(linesPerPage) && linesPerPage > 0 ? linesPerPage : 16;

  const trimWidthMm = Number(preset.widthMm);
  const trimHeightMm = Number(preset.heightMm);

  const contentWidthMm = roundMm(
    trimWidthMm - normalizedLeftMm - normalizedRightMm,
  );
  const contentHeightMm = roundMm(
    trimHeightMm - normalizedTopMm - normalizedBottomMm,
  );

  const fontSizeMm = roundMm(convertPrintPtToApproxMm(normalizedFontSizePt));

  const normalizedColumnGapMm =
    Number.isFinite(columnGapMm) && columnGapMm >= 0 ? columnGapMm : 0;

  const columnCount = columnMode === "two" ? 2 : 1;

  const columnWidthMm = contentWidthMm;

  const columnHeightMm =
    columnCount === 2
      ? roundMm((contentHeightMm - normalizedColumnGapMm) / 2)
      : contentHeightMm;

  const charPitchMm =
    columnHeightMm > 0 ? roundMm(columnHeightMm / normalizedCharsPerLine) : 0;

  const linePitchMm =
    columnWidthMm > 0 ? roundMm(columnWidthMm / normalizedLinesPerPage) : 0;

  const charSpacingMm = roundMm(charPitchMm - fontSizeMm);
  const lineSpacingMm = roundMm(linePitchMm - fontSizeMm);

  const outputCharSpacingMm = Math.max(
    0,
    Math.round((charSpacingMm - 0.02) * 1000) / 1000,
  );

  const messages = [];
  let status = "ok";

  if (contentWidthMm <= 0 || contentHeightMm <= 0) {
    status = "error";
    messages.push("余白が大きすぎて本文面を確保できません。");
  }

  if (charSpacingMm < 0) {
    status = "error";
    messages.push("文字数が多すぎて字間が足りません。");
  }

  if (lineSpacingMm < 0) {
    status = "error";
    messages.push("行数が多すぎて行送りが足りません。");
  }

  if (columnMode === "two" && columnHeightMm <= 0) {
    status = "error";
    messages.push(
      "段間または余白が大きすぎて、二段組みの本文高さを確保できません。",
    );
  }

  if (status !== "error") {
    if (outputCharSpacingMm < 0.05) {
      status = "warning";
      messages.push(
        "出力字間が 0.05mm 未満です。計算上は収まっても、フォントやPDF変換環境によって欠ける場合があります。",
      );
    } else if (outputCharSpacingMm < 0.07) {
      status = "warning";
      messages.push(
        "出力字間が狭めです。計算上は収まりますが、印刷時に欠ける場合は文字数を減らしてください。",
      );
    } else if (outputCharSpacingMm < 0.15) {
      messages.push(
        "出力字間は狭めですが、実寸優先の本文としては使用しやすい範囲です。",
      );
    }

    const lineSpacingRatio =
      fontSizeMm > 0 ? Math.round((lineSpacingMm / fontSizeMm) * 100) / 100 : 0;

    if (lineSpacingMm < 0.5 || lineSpacingRatio < 0.18) {
      status = "warning";
      messages.push(
        "行送りがかなり狭めです。ルビやフォントによって行の左端が欠ける場合があります。",
      );
    }

    if (fontSizeMm > 0 && lineSpacingMm < fontSizeMm * 0.45) {
      messages.push("ルビが多いページでは、行送り不足に見える場合があります。");
    }
  }

  if (!messages.length) {
    messages.push(
      "目標字数・行数で収まる見込みです。ただし、フォントやPDF変換環境によって見え方が変わる場合があります。",
    );
  }

  return {
    mode: "real-print",

    trimSize: {
      key: preset.key,
      label: preset.label,
      widthMm: trimWidthMm,
      heightMm: trimHeightMm,
    },

    margins: {
      topMm: normalizedTopMm,
      bottomMm: normalizedBottomMm,
      rightMm: normalizedRightMm,
      leftMm: normalizedLeftMm,
    },

    contentBox: {
      widthMm: contentWidthMm,
      heightMm: contentHeightMm,
    },

    column: {
      mode: columnMode,
      count: columnCount,
      gapMm: normalizedColumnGapMm,
      widthMm: columnWidthMm,
      heightMm: columnHeightMm,
      linesPerColumn: normalizedLinesPerPage,
      linesPerPageTotal: normalizedLinesPerPage * columnCount,
    },

    font: {
      sizePt: normalizedFontSizePt,
      sizeMm: fontSizeMm,
    },

    target: {
      charsPerLine: normalizedCharsPerLine,
      linesPerPage: normalizedLinesPerPage,
      linesPerColumn: normalizedLinesPerPage,
      linesPerPageTotal: normalizedLinesPerPage * columnCount,
    },

    estimated: {
      charPitchMm,
      linePitchMm,
      charSpacingMm,
      outputCharSpacingMm,
      lineSpacingMm,
    },

    status,
    messages,
  };
}

function resolveMergedManuscriptPrintTypography(
  config = {},
  preset,
  options = {},
) {
  const printFontSizePx = resolveMergedManuscriptPrintFontSizePx(
    config,
    preset,
    options,
  );

  const explicitPrintLineHeight = Number(options.printLineHeight);
  let printLineHeight =
    Number.isFinite(explicitPrintLineHeight) && explicitPrintLineHeight > 0
      ? explicitPrintLineHeight
      : NaN;

  if (!Number.isFinite(printLineHeight)) {
    const configLineHeight = Number(config?.lineHeight);
    if (Number.isFinite(configLineHeight) && configLineHeight > 0) {
      printLineHeight =
        convertPreviewLineAdvanceToPrintLineHeight(configLineHeight);
    }
  }

  if (!Number.isFinite(printLineHeight)) {
    printLineHeight = convertPreviewLineAdvanceToPrintLineHeight(NaN);
  }

  return {
    printFontSizePx,
    printLineHeight,
  };
}

function resolveMergedManuscriptPrintLayout(options = {}) {
  const explicitMarginMm = Number(options.printMarginMm);
  const explicitBodyPaddingPx = Number(options.printBodyPaddingPx);

  return {
    printMarginMm:
      Number.isFinite(explicitMarginMm) && explicitMarginMm >= 0
        ? explicitMarginMm
        : 0,

    printBodyPaddingPx:
      Number.isFinite(explicitBodyPaddingPx) && explicitBodyPaddingPx >= 0
        ? explicitBodyPaddingPx
        : 0,

    showPageNumbers: options.showPageNumbers === true,
  };
}

function resolveMergedManuscriptPrintFontSizePx(
  config = {},
  preset,
  options = {},
) {
  const explicit = Number(options.printFontSizePx);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const jsonPrintFontSizePx = Number(config?.printFontSizePx);
  if (Number.isFinite(jsonPrintFontSizePx) && jsonPrintFontSizePx > 0) {
    return jsonPrintFontSizePx;
  }

  const baseFontSizePx = Number(config?.fontSizePx);
  if (Number.isFinite(baseFontSizePx) && baseFontSizePx > 0) {
    return Math.max(9, Math.round(baseFontSizePx * 0.86 * 100) / 100);
  }

  return Math.max(9, Math.round(preset.defaultFontSizePx * 0.86 * 100) / 100);
}

function convertPreviewLineAdvanceToPrintLineHeight(lineAdvanceEm) {
  const value = Number(lineAdvanceEm);

  if (!Number.isFinite(value) || value <= 0) {
    return 1.72;
  }

  if (value <= 0.95) return 1.62;
  if (value <= 1.0) return 1.68;
  if (value <= 1.05) return 1.72;
  if (value <= 1.1) return 1.76;
  if (value <= 1.15) return 1.8;
  if (value <= 1.2) return 1.84;

  return 1.9;
}

function readMergedManuscriptHtmlConfig(manuscriptRoot) {
  const filePath = findMojigotoJsonPath(manuscriptRoot);
  const json = filePath ? safeReadJsonFile(filePath) : null;

  const charsPerLine = Number(json?.layout?.charsPerLine);
  const linesPerPage = Number(json?.layout?.linesPerPage);
  const fontSizePx = Number(json?.font?.sizePx);

  const lineHeight = Number(
    json?.spacing?.lineAdvanceEm ?? json?.font?.lineHeight,
  );

  const fontFamily = String(json?.font?.family || "").trim();

  return {
    filePath,
    charsPerLine:
      Number.isFinite(charsPerLine) && charsPerLine > 0 ? charsPerLine : NaN,
    linesPerPage:
      Number.isFinite(linesPerPage) && linesPerPage > 0 ? linesPerPage : NaN,
    fontSizePx:
      Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : NaN,
    lineHeight:
      Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : NaN,
    fontFamily: fontFamily || "serif",
  };
}

function resolveMergedManuscriptHtmlOptions(mergedData, options = {}) {
  const manuscriptRoot = String(mergedData?.manuscriptRoot || "");
  const config = readMergedManuscriptHtmlConfig(manuscriptRoot);

  const requestedPageSize = String(
    options.htmlPageSize || getMergedManuscriptPageSize(),
  )
    .trim()
    .toLowerCase();

  const pageSize = requestedPageSize === "auto" ? "auto" : requestedPageSize;
  const preset = getMergedManuscriptPagePreset(
    pageSize === "auto" ? "a5" : pageSize,
  );

  const htmlMode = resolveMergedManuscriptHtmlMode(options);
  const typography = resolveMergedManuscriptTypography(
    config,
    preset,
    options,
  );
  const printTypography = resolveMergedManuscriptPrintTypography(
    config,
    preset,
    options,
  );
  const printLayout = resolveMergedManuscriptPrintLayout(options);

  return {
    direction: String(options.htmlDirection || "horizontal"),
    showTitle: options.htmlShowTitle !== false,
    printLayoutMode: String(options.htmlPrintLayoutMode || "single"),
    orientation: String(options.htmlOrientation || "auto"),

    htmlMode,

    pageSize,
    pageLabel: pageSize === "auto" ? "auto" : preset.label,
    pageWidthMm: preset.widthMm,
    pageHeightMm: preset.heightMm,
    pageMarginMm: preset.pageMarginMm,
    bodyPaddingPx: preset.bodyPaddingPx,

    charsPerLine: typography.charsPerLine,
    linesPerPage: typography.linesPerPage,
    fontSizePx: typography.fontSizePx,
    lineHeight: typography.lineHeight,
    fontFamily: config.fontFamily,

    printFontSizePx: printTypography.printFontSizePx,
    printLineHeight: printTypography.printLineHeight,
    printMarginMm: printLayout.printMarginMm,
    printBodyPaddingPx: printLayout.printBodyPaddingPx,
    showPageNumbers: printLayout.showPageNumbers,

    configPath: config.filePath,
  };
}

function getMergedManuscriptFileVariantSuffix(ext, options = {}) {
  if (String(ext || "") !== "html") return "";

  const target = String(options.htmlTarget || "browser");
  if (target === "word") return "_w";

  const direction = String(options.htmlDirection || "horizontal");
  const printLayoutMode = String(options.htmlPrintLayoutMode || "single");
  const exportMode = String(options.exportMode || "simple")
    .trim()
    .toLowerCase();

  if (direction === "vertical") {
    if (exportMode === "real") {
      const sizeKey = String(options.realPrintPageSize || "b6")
        .trim()
        .toLowerCase();

      if (
        sizeKey === "a5" ||
        sizeKey === "a6" ||
        sizeKey === "b6" ||
        sizeKey === "shiroku" ||
        sizeKey === "shinsho"
      ) {
        const columnMode = normalizeRealPrintColumnMode(
          options.realPrintColumnMode,
          sizeKey,
        );

        return columnMode === "two" ? `_vr_${sizeKey}_2col` : `_vr_${sizeKey}`;
      }

      return "_vr";
    }

    return printLayoutMode === "2up" ? "_v2up" : "_v";
  }

  return "_h";
}

function sanitizeMergedManuscriptFileName(input, fallback = "作品") {
  const s = String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return s || fallback;
}

function buildMergedManuscriptBaseName(
  context,
  ext = "txt",
  date = new Date(),
  options = {},
) {
  const suffix = getMergedManuscriptFileVariantSuffix(ext, options);
  const workName = sanitizeMergedManuscriptFileName(
    getWorkNameForStats(context),
    "作品",
  );

  return `${workName}${suffix}.${ext}`;
}

module.exports = {
  getFirstMeaningfulLine,
  startsWithMarkdownHeading,
  resolveMergedManuscriptRoot,
  collectMergedManuscriptFiles,
  ensureMergedManuscriptFiles,
  buildMergedManuscriptData,
  getMergedManuscriptJoinMode,
  renderMergedManuscriptTxt,
  renderMergedManuscriptMd,
  buildMergedManuscriptBlocks,
  buildMergedManuscriptPrintBlocks,
  resolveMergedManuscriptHtmlOptions,
  buildMergedManuscriptBaseName,
  getMergedManuscriptFileVariantSuffix,
  getMergedManuscriptPageSize,
  getMergedManuscriptPagePreset,
  resolveMergedManuscriptTypography,
  resolveMergedManuscriptHtmlMode,
  resolveMergedManuscriptPrintFontSizePx,
  convertPreviewLineAdvanceToPrintLineHeight,
  resolveMergedManuscriptPrintTypography,
  resolveMergedManuscriptPrintLayout,
  getMergedManuscriptRealPrintPreset,
  convertPrintPtToApproxMm,
  resolveMergedManuscriptRealPrintMetrics,
  normalizeRealPrintPageSize,
  normalizeRealPrintColumnMode,
  isRealPrintTwoColumnSize,
  getRealPrintLayoutKey,
  getRealPrintDefaultsForLayout,
};
