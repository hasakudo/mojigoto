const vscode = require("vscode");

function normalizeLineEndings(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

/**
 * 行頭の見出し記号だけを除去
 * # 見出し   -> 見出し
 * ## 見出し  -> 見出し
 * ### 見出し -> 見出し
 */
function stripHeadingMarkers(text) {
  return String(text || "").replace(/^(#{1,3})\s+/gm, "");
}

/**
 * ルビを整形除去する
 * - |漢字《よみ》  -> 漢字
 * - ｜漢字《よみ》 -> 漢字
 * - 漢字《よみ》   -> 漢字
 * - あ《《強調》》お -> あお
 */
function stripRubyForCount(text) {
  let s = String(text || "");

  // ① 二重山括弧は「中身を残して括弧だけ外す」
  // あ《《いうえ》》お。 -> あいうえお。
  s = s.replace(/《《(.*?)》》/g, "$1");

  // ② 通常ルビの読み部分は除去
  // |漢字《よみ》 -> |漢字
  // 漢字《よみ》 -> 漢字
  s = s.replace(/《[^》\n]*》/g, "");

  // ③ ルビ開始記号を除去
  s = s.replace(/[|｜]/g, "");

  return s;
}

function stripHalfWidthSpaces(text) {
  return String(text || "").replace(/[ \t]/g, "");
}

function stripFullWidthSpaces(text) {
  return String(text || "").replace(/\u3000/g, "");
}

function stripAllSpaces(text) {
  return stripFullWidthSpaces(stripHalfWidthSpaces(text));
}

function stripNewlines(text) {
  return String(text || "").replace(/\n/g, "");
}

function preprocessStructuredText(text) {
  let s = normalizeLineEndings(text);
  s = stripHeadingMarkers(s);
  s = stripRubyForCount(s);
  return s;
}

/**
 * countMode:
 * - default: ルビ/見出し記号/空白/改行を含まない
 * - withFullWidthSpaces: ルビ/見出し記号を含まず、全角空白を含む
 * - withNewlines: ルビ/見出し記号/空白を含まず、改行を含む
 * - withSpacesAndNewlines: ルビ/見出し記号を含まず、空白/改行を含む
 * - allInclusive: ルビ/見出し記号/空白/改行を含む（全文そのまま）
 * - allExceptNewlines: ルビ/見出し記号/空白を含む（改行だけ除く）
 */
function countTextByMode(text, mode = "default") {
  const normalized = normalizeLineEndings(text);

  switch (String(mode || "default")) {
    case "allInclusive":
      return normalized.length;

    case "allExceptNewlines": {
      // 改行だけ除外。その他はそのまま含む
      const s = stripNewlines(normalized);
      return s.length;
    }

    case "withFullWidthSpaces": {
      let s = preprocessStructuredText(normalized);
      s = stripHalfWidthSpaces(s);
      s = stripNewlines(s);
      return s.length;
    }

    case "withNewlines": {
      let s = preprocessStructuredText(normalized);
      s = stripAllSpaces(s);
      return s.length;
    }

    case "withSpacesAndNewlines": {
      const s = preprocessStructuredText(normalized);
      return s.length;
    }

    case "default":
    default: {
      let s = preprocessStructuredText(normalized);
      s = stripAllSpaces(s);
      s = stripNewlines(s);
      return s.length;
    }
  }
}

function getCountMode() {
  try {
    return String(
      vscode.workspace
        .getConfiguration("mojigoto")
        .get("countMode", "default") || "default",
    );
  } catch {
    return "default";
  }
}

function getCountModeLabel(mode = getCountMode()) {
  switch (String(mode || "default")) {
    case "withFullWidthSpaces":
      return "ルビ/見出し記号を含まず、全角空白を含む";
    case "withNewlines":
      return "ルビ/見出し記号/空白を含まず、改行を含む";
    case "withSpacesAndNewlines":
      return "ルビ/見出し記号を含まず、空白/改行を含む";
    case "allInclusive":
      return "ルビ/見出し記号/空白/改行、すべてを含む";
    case "allExceptNewlines":
      return "ルビ/見出し記号/空白を含み、改行を除く";
    case "default":
    default:
      return "ルビ/見出し記号/空白/改行を含まない";
  }
}

function countLikeCountChars(text) {
  return countTextByMode(text, getCountMode());
}

module.exports = {
  normalizeLineEndings,
  stripHeadingMarkers,
  stripRubyForCount,
  stripHalfWidthSpaces,
  stripFullWidthSpaces,
  stripAllSpaces,
  stripNewlines,
  preprocessStructuredText,
  countTextByMode,
  getCountMode,
  getCountModeLabel,
  countLikeCountChars,
};
