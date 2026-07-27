const vscode = require("vscode");

function isTargetDocument(doc) {
  if (!doc || !doc.uri || doc.uri.scheme !== "file") return false;
  const fsPath = String(doc.uri.fsPath || "").toLowerCase();
  return fsPath.endsWith(".txt") || fsPath.endsWith(".md");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDefaultHighlightGroups() {
  return [
    {
      name: "weakWords",
      label: "頻出語",
      enabled: true,
      words: ["こと", "もの"],
      style: {
        backgroundColor: "rgba(255,220,120,.35)",
      },
    },
    {
      name: "demonstratives",
      label: "指示語（こそあど）",
      enabled: true,
      words: ["この", "その", "あの", "どの"],
      style: {
        backgroundColor: "rgba(255,180,120,.35)",
      },
    },
    {
      name: "conjunction",
      label: "接続詞",
      enabled: true,
      words: ["しかし", "そして", "だが"],
      style: {
        backgroundColor: "rgba(120,200,255,.35)",
      },
    },
    {
      name: "kinsokuHead",
      label: "行頭禁則",
      enabled: true,
      regex: "^[、。，．）」』]",
      style: {
        backgroundColor: "rgba(255,80,80,.25)",
      },
    },
    {
      name: "kinsokuTail",
      label: "行末禁則",
      enabled: true,
      regex: "[（「『]$",
      style: {
        backgroundColor: "rgba(255,80,80,.25)",
      },
    },
    {
      name: "ellipsisError",
      label: "三点リーダー崩れ",
      enabled: true,
      type: "lineRule",
      rule: "oddEllipsis",
      style: {
        backgroundColor: "rgba(255,120,120,.30)",
      },
    },
    {
      name: "dashError",
      label: "ダッシュ崩れ",
      enabled: true,
      type: "lineRule",
      rule: "oddDash",
      style: {
        backgroundColor: "rgba(255,120,120,.30)",
      },
    },
    {
      name: "trailingSpace",
      label: "行末スペース",
      enabled: true,
      regex: "[ 　]+$",
      style: {
        backgroundColor: "rgba(255,120,120,.20)",
      },
    },
    {
      name: "paragraphIndentMissing",
      label: "段落先頭スペースなし",
      enabled: true,
      type: "lineRule",
      rule: "missingIndent",
      excludeStartsWith: ["#", "「", "『", "（"],
      style: {
        backgroundColor: "rgba(255,120,120,.20)",
        border: "1px solid rgba(255,120,120,.45)",
      },
    },
    {
      name: "missingPeriod",
      label: "行末「。」なし",
      enabled: true,
      type: "lineRule",
      rule: "missingPeriod",
      excludeStartsWith: ["#", "「", "『", "（"],
      excludeEndsWith: ["―", "…", "？", "！"],
      style: {
        backgroundColor: "rgba(255,150,150,.22)",
        border: "1px solid rgba(255,120,120,.35)",
      },
    },
    {
      name: "doublePeriod",
      label: "連続。。",
      enabled: true,
      regex: "。{2,}",
      style: {
        backgroundColor: "rgba(255,140,140,.30)",
      },
    },
    {
      name: "doubleComma",
      label: "連続、、",
      enabled: true,
      regex: "、{2,}",
      style: {
        backgroundColor: "rgba(255,140,140,.30)",
      },
    },
    {
      name: "Markers",
      label: "記号",
      enabled: true,
      countable: false,
      regex: "[｜|《》]",
      style: {
        color: "rgba(153, 137, 137, 0.85)",
        fontWeight: "bold",
      },
    },
    {
      name: "heading",
      label: "見出し",
      enabled: false,
      countable: false,
      regex: "^(###|##|#)(?=\\s|$)",
      style: {
        color: "rgba(218, 191, 191, 0.85)",
        fontWeight: "bold",
      },
    },
    {
      name: "halfPunctuation",
      label: "半角!?",
      enabled: false,
      regex: "[!?]",
      style: {
        backgroundColor: "rgba(255,180,120,.25)",
      },
    },
    {
      name: "punctuationMixedWidth",
      label: "!?全半角混在",
      enabled: false,
      regex: "(?:[!?][！？]|[！？][!?])+",
      style: {
        backgroundColor: "rgba(255,140,120,.28)",
      },
    },
    {
      name: "multiPunctuation",
      label: "連続！？",
      enabled: false,
      regex: "[!?！？]{2,}",
      style: {
        backgroundColor: "rgba(255,160,120,.25)",
      },
    },
  ];
}

function readHighlightGroups() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const groups = cfg.get("highlightGroups", null);

  if (!Array.isArray(groups) || groups.length === 0) {
    return getDefaultHighlightGroups();
  }

  return groups.map((g, index) => ({
    name: String(g?.name || `group_${index}`),
    label: String(g?.label || g?.name || `Group ${index + 1}`),
    enabled: g?.enabled !== false,
    countable: g?.countable !== false,

    type: String(g?.type || ""),
    rule: String(g?.rule || ""),

    words: Array.isArray(g?.words) ? g.words.map(String).filter(Boolean) : [],
    regex: g?.regex ? String(g.regex) : "",

    excludeStartsWith: Array.isArray(g?.excludeStartsWith)
      ? g.excludeStartsWith.map(String).filter(Boolean)
      : [],
    excludeEndsWith: Array.isArray(g?.excludeEndsWith)
      ? g.excludeEndsWith.map(String).filter(Boolean)
      : [],

    style: typeof g?.style === "object" && g?.style ? g.style : {},
  }));
}

function makeDecorationOptions(style = {}) {
  const out = {};

  if (style.backgroundColor) out.backgroundColor = style.backgroundColor;
  if (style.color) out.color = style.color;
  if (style.border) out.border = style.border;
  if (style.fontStyle) out.fontStyle = style.fontStyle;
  if (style.fontWeight) out.fontWeight = style.fontWeight;
  if (style.textDecoration) out.textDecoration = style.textDecoration;

  return out;
}

function findWordRanges(doc, words) {
  const ranges = [];
  const text = doc.getText();

  for (const word of words || []) {
    if (!word) continue;

    const pattern = new RegExp(escapeRegExp(word), "g");
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const start = doc.positionAt(match.index);
      const end = doc.positionAt(match.index + match[0].length);
      ranges.push(new vscode.Range(start, end));

      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
    }
  }

  return ranges;
}

function findRegexRangesByLine(doc, regexSource) {
  const ranges = [];
  if (!regexSource) return ranges;

  let regex;
  try {
    regex = new RegExp(regexSource, "gu");
  } catch {
    return ranges;
  }

  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const line = doc.lineAt(lineIndex);
    const text = line.text;

    regex.lastIndex = 0;

    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = new vscode.Position(lineIndex, match.index);
      const end = new vscode.Position(lineIndex, match.index + match[0].length);
      ranges.push(new vscode.Range(start, end));

      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return ranges;
}

function findMissingIndentRanges(doc, group) {
  const ranges = [];
  const excludeStartsWith = Array.isArray(group?.excludeStartsWith)
    ? group.excludeStartsWith
    : [];

  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const line = doc.lineAt(lineIndex);
    const text = String(line.text || "");

    // 空行は除外
    if (!text.trim()) continue;

    // 除外プレフィックス
    let excluded = false;
    for (const prefix of excludeStartsWith) {
      if (prefix && text.startsWith(prefix)) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    // 先頭が全角スペースならOK
    if (text.startsWith("　")) {
      continue;
    }

    // 行頭1文字目をハイライト
    const start = new vscode.Position(lineIndex, 0);
    const endChar = text.length > 0 ? 1 : 0;
    const end = new vscode.Position(lineIndex, endChar);

    ranges.push(new vscode.Range(start, end));
  }

  return ranges;
}

function findOddRepeatRanges(doc, char) {
  const ranges = [];

  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const line = doc.lineAt(lineIndex);
    const text = String(line.text || "");
    if (!text) continue;

    let i = 0;
    while (i < text.length) {
      if (text[i] !== char) {
        i++;
        continue;
      }

      const startIndex = i;
      while (i < text.length && text[i] === char) {
        i++;
      }
      const len = i - startIndex;

      // 2つ単位が正常なので、奇数個を異常扱い
      if (len % 2 === 1) {
        const start = new vscode.Position(lineIndex, startIndex);
        const end = new vscode.Position(lineIndex, startIndex + len);
        ranges.push(new vscode.Range(start, end));
      }
    }
  }

  return ranges;
}

function findMissingPeriodRanges(doc, group) {
  const ranges = [];
  const excludeStartsWith = Array.isArray(group?.excludeStartsWith)
    ? group.excludeStartsWith
    : [];
  const excludeEndsWith = Array.isArray(group?.excludeEndsWith)
    ? group.excludeEndsWith
    : ["―"];

  for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
    const line = doc.lineAt(lineIndex);
    const text = String(line.text || "");

    // 空行は除外
    if (!text.trim()) continue;

    // 行頭除外
    let excludedByStart = false;
    for (const prefix of excludeStartsWith) {
      if (prefix && text.startsWith(prefix)) {
        excludedByStart = true;
        break;
      }
    }
    if (excludedByStart) continue;

    // 行末除外
    let excludedByEnd = false;
    for (const suffix of excludeEndsWith) {
      if (suffix && text.endsWith(suffix)) {
        excludedByEnd = true;
        break;
      }
    }
    if (excludedByEnd) continue;

    // 句点で終わっていればOK
    if (text.endsWith("。")) continue;

    // 行末1文字をハイライト
    const endChar = text.length;
    const startChar = Math.max(0, endChar - 1);

    const start = new vscode.Position(lineIndex, startChar);
    const end = new vscode.Position(lineIndex, endChar);

    ranges.push(new vscode.Range(start, end));
  }

  return ranges;
}

function collectHighlightMatches(doc, groups) {
  const result = [];

  for (const group of groups) {
    if (!group || group.enabled === false) continue;

    let ranges = [];

    if (group.type === "lineRule") {
      if (group.rule === "missingIndent") {
        ranges = findMissingIndentRanges(doc, group);
      } else if (group.rule === "oddEllipsis") {
        ranges = findOddRepeatRanges(doc, "…");
      } else if (group.rule === "oddDash") {
        ranges = findOddRepeatRanges(doc, "―");
      } else if (group.rule === "missingPeriod") {
        ranges = findMissingPeriodRanges(doc, group);
      }
    } else {
      if (Array.isArray(group.words) && group.words.length > 0) {
        ranges = ranges.concat(findWordRanges(doc, group.words));
      }

      if (group.regex) {
        ranges = ranges.concat(findRegexRangesByLine(doc, group.regex));
      }
    }

    result.push({
      name: group.name,
      label: group.label,
      style: group.style || {},
      ranges,
      count: ranges.length,
    });
  }

  return result;
}

module.exports = {
  isTargetDocument,
  readHighlightGroups,
  makeDecorationOptions,
  collectHighlightMatches,
};
