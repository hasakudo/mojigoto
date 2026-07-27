const {
  getVerticalPunctuationLayoutMode,
  isHangingChar,
  isPushOutLeadingChar,
  getEffectiveCharsPerLine,
  splitTextIntoMeasureLines,
} = require("../preview/vertical-layout-core");

function countTokenChars(text) {
  return Array.from(String(text || "")).length;
}

function getRubyTokenMetrics(token) {
  const baseLen = countTokenChars(token?.displayText || "");
  const rubyLen = countTokenChars(token?.rubyText || "");

  if (!token || token.type !== "ruby" || baseLen <= 0 || rubyLen <= 0) {
    return {
      baseLen,
      rubyLen,
      rubyVisualWidth: Number(token?.displayWidth || baseLen || 0),
      visualOverflow: 0,
      outerPadEm: 0,
      innerTrackEm: 0,
      shouldPushByRubyLength: false,
    };
  }

  const rubyVisualWidth = rubyLen * 0.5;
  const visualOverflow = Math.max(0, rubyVisualWidth - baseLen);

  // 灰色2文字+ルビ5文字、青灰色3文字+ルビ7文字から送る。
  const shouldPushByRubyLength = rubyLen >= baseLen * 2 + 1;

  const rubyRatio = rubyLen / baseLen;

  const outerPadEm = 0.15;

  const innerTrackEm = (() => {
    if (rubyRatio <= 2) return 0.05;
    if (rubyRatio >= 3) return 0.2;

    const t = rubyRatio - 2;
    return Math.round((0.05 + t * 0.15) * 1000) / 1000;
  })();

  return {
    baseLen,
    rubyLen,
    rubyVisualWidth,
    visualOverflow,
    outerPadEm,
    innerTrackEm,
    shouldPushByRubyLength,
  };
}

function getRubyVisualMeasureWidth(token) {
  if (!token || token.type !== "ruby") {
    return Number(token?.displayWidth || 0);
  }

  const metrics = getRubyTokenMetrics(token);

  const baseVisualWidth =
    metrics.baseLen +
    metrics.outerPadEm * 2 +
    metrics.innerTrackEm * Math.max(0, metrics.baseLen - 1);

  return Math.max(
    Number(token.displayWidth || metrics.baseLen),
    metrics.rubyVisualWidth,
    baseVisualWidth,
  );
}

function isWideRubyToken(token) {
  if (!token || token.type !== "ruby") return false;

  const baseLen = countTokenChars(token.displayText || "");
  const rubyLen = countTokenChars(token.rubyText || "");

  return rubyLen > baseLen;
}

function lineHasWideRubyToken(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  return tokens.some((token) => isWideRubyToken(token));
}

function lineHasRubyLengthPushTarget(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];

  return tokens.some((token) => {
    if (!token || token.type !== "ruby") return false;
    return getRubyTokenMetrics(token).shouldPushByRubyLength;
  });
}

function getLineMeasureWidth(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  return tokens.reduce((sum, token) => {
    if (token?.hanging) return sum;
    return sum + getRubyVisualMeasureWidth(token);
  }, 0);
}

function getLineWideRubyOverflowScore(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  let score = 0;

  for (const token of tokens) {
    if (!isWideRubyToken(token)) continue;

    const baseLen = countTokenChars(token.displayText || "");
    const rubyLen = countTokenChars(token.rubyText || "");
    score += Math.max(0, rubyLen - baseLen);
  }

  return score;
}

function getLastMovableToken(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const token = list[i];
    if (!token) continue;
    if (token.hanging) continue;
    if (token.type === "newline") continue;
    return { token, index: i };
  }

  return null;
}

function shouldPushTailForWideRuby(line, layoutOptions = {}) {
  const charsPerLine = getEffectiveCharsPerLine(layoutOptions);
  const lineWidth = getLineMeasureWidth(line);

  if (!lineHasWideRubyToken(line)) return false;

  const overflowScore = getLineWideRubyOverflowScore(line);

  if (lineHasRubyLengthPushTarget(line) && lineWidth >= charsPerLine - 1) {
    return true;
  }

  if (overflowScore >= 3 && lineWidth >= charsPerLine) {
    return true;
  }

  return false;
}

function normalizeWideRubyLineEnds(lines, layoutOptions = {}) {
  const out = (Array.isArray(lines) ? lines : []).map((line) => ({
    tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
    hardBreak: !!line?.hardBreak,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
  }));

  for (let i = 0; i < out.length; i += 1) {
    const current = out[i];
    if (!current || current.hardBreak) continue;
    if (!Array.isArray(current.tokens) || !current.tokens.length) continue;

    if (!shouldPushTailForWideRuby(current, layoutOptions)) continue;

    const moved = getLastMovableToken(current.tokens);
    if (!moved) continue;

    current.tokens.splice(moved.index, 1);
    current.noRefillAfterWideRuby = true;

    for (let j = 0; j < current.tokens.length; j += 1) {
      const token = current.tokens[j];
      if (!token || token.type !== "ruby") continue;

      const metrics = getRubyTokenMetrics(token);
      if (!metrics.shouldPushByRubyLength) continue;

      current.tokens[j] = {
        ...token,
        rubyTailPushed: true,
      };
    }

    if (!out[i + 1]) {
      out.push({
        tokens: [],
        hardBreak: false,
        noRefillAfterWideRuby: false,
      });
    }

    out[i + 1].tokens.unshift(moved.token);
  }

  return out;
}

function getTokenFirstChar(token) {
  return String(token?.displayText || "")[0] || "";
}

function normalizePushOutLeadingLineStarts(lines, layoutOptions = {}) {
  const punctuationLayoutMode = getVerticalPunctuationLayoutMode(
    layoutOptions.punctuationLayoutMode || "hanging",
  );

  if (punctuationLayoutMode !== "hanging") {
    return (Array.isArray(lines) ? lines : []).map((line) => ({
      tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
      hardBreak: !!line?.hardBreak,
      noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
      noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
      pushoutTailPushed: !!line?.pushoutTailPushed,
    }));
  }

  const out = (Array.isArray(lines) ? lines : []).map((line) => ({
    tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
    hardBreak: !!line?.hardBreak,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
    noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
    pushoutTailPushed: !!line?.pushoutTailPushed,
  }));

  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1];
    const current = out[i];

    if (!prev || !current) continue;
    if (prev.hardBreak) continue;
    if (!Array.isArray(prev.tokens) || !prev.tokens.length) continue;
    if (!Array.isArray(current.tokens) || !current.tokens.length) continue;

    const firstChar = getTokenFirstChar(current.tokens[0]);

    if (!isPushOutLeadingChar(firstChar, punctuationLayoutMode)) {
      continue;
    }

    const moved = getLastMovableToken(prev.tokens);
    if (!moved) continue;

    const [movedToken] = prev.tokens.splice(moved.index, 1);

    current.tokens.unshift(movedToken);

    prev.noRefillAfterPushOut = true;
    prev.pushoutTailPushed = true;
  }

  return out;
}

function getTokenMeasureWidth(token) {
  if (!token || token.hanging) return 0;
  return getRubyVisualMeasureWidth(token);
}

function getLineTokenMeasureWidth(tokens) {
  return (Array.isArray(tokens) ? tokens : []).reduce(
    (sum, token) => sum + getTokenMeasureWidth(token),
    0,
  );
}

function normalizeLeadingHangingLineStarts(lines, layoutOptions = {}) {
  const punctuationLayoutMode = getVerticalPunctuationLayoutMode(
    layoutOptions.punctuationLayoutMode || "hanging",
  );
  const charsPerLine = getEffectiveCharsPerLine(layoutOptions);

  const out = (Array.isArray(lines) ? lines : []).map((line) => ({
    tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
    hardBreak: !!line?.hardBreak,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
    noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
    pushoutTailPushed: !!line?.pushoutTailPushed,
  }));

  let changed = true;
  let guard = 0;

  while (changed && guard < 20) {
    changed = false;
    guard += 1;

    // 行頭に残った句読点を前行へぶら下げる
    for (let i = 1; i < out.length; i += 1) {
      const prev = out[i - 1];
      const current = out[i];

      if (!prev || !current) continue;
      if (prev.hardBreak) continue;
      if (!Array.isArray(current.tokens) || !current.tokens.length) continue;

      while (current.tokens.length) {
        const first = current.tokens[0];
        const ch = getTokenFirstChar(first);

        if (!isHangingChar(ch, punctuationLayoutMode)) break;

        current.tokens.shift();
        prev.tokens.push({
          ...first,
          hanging: true,
        });
        changed = true;
      }
    }

    // ぶら下げで空いた行を、後続行から自然に詰め直す
    for (let i = 0; i < out.length - 1; i += 1) {
      const current = out[i];
      const next = out[i + 1];

      if (!current || !next) continue;
      if (current.hardBreak) continue;
      if (current.noRefillAfterWideRuby || current.noRefillAfterPushOut) {
        continue;
      }
      if (!Array.isArray(current.tokens) || !Array.isArray(next.tokens)) {
        continue;
      }

      while (next.tokens.length) {
        const currentWidth = getLineTokenMeasureWidth(current.tokens);
        if (currentWidth >= charsPerLine) break;

        const first = next.tokens[0];
        const firstChar = getTokenFirstChar(first);

        if (isHangingChar(firstChar, punctuationLayoutMode)) {
          next.tokens.shift();
          current.tokens.push({
            ...first,
            hanging: true,
          });
          changed = true;
          continue;
        }

        const firstWidth = getTokenMeasureWidth(first);
        if (firstWidth <= 0) break;
        if (currentWidth + firstWidth > charsPerLine) break;

        next.tokens.shift();
        current.tokens.push(first);
        changed = true;
      }
    }
  }

  return out.filter((line) => {
    if (line.hardBreak) return true;
    return Array.isArray(line.tokens) && line.tokens.length > 0;
  });
}

function normalizeVerticalPrintMeasureLines(text, layoutOptions = {}) {
  const measureLines = splitTextIntoMeasureLines(text || "", layoutOptions);

  if (layoutOptions?.useTypographyAdjustments === false) {
    return measureLines;
  }

  const rubyNormalizedLines = normalizeWideRubyLineEnds(
    measureLines,
    layoutOptions,
  );

  const pushOutNormalizedLines = normalizePushOutLeadingLineStarts(
    rubyNormalizedLines,
    layoutOptions,
  );

  return normalizeLeadingHangingLineStarts(
    pushOutNormalizedLines,
    layoutOptions,
  );
}

module.exports = {
  countTokenChars,
  getRubyTokenMetrics,
  getRubyVisualMeasureWidth,
  normalizePushOutLeadingLineStarts,
  normalizeVerticalPrintMeasureLines,
};
