const {
  buildMergedManuscriptPrintBlocks,
  resolveMergedManuscriptRealPrintMetrics,
} = require("./merged-manuscript-core");

const {
  getVerticalPunctuationLayoutMode,
  isHangingChar,
  getEffectiveCharsPerLine,
  splitTextIntoDisplayLines,
  splitTextIntoMeasureLines,
  getVisibleRenderLines,
  joinDisplayLineTokensToRaw,
  moveLeadingHangingAcrossPageBoundary,
} = require("../preview/vertical-layout-core");

const {
  countTokenChars,
  getRubyTokenMetrics,
  normalizeVerticalPrintMeasureLines,
} = require("./vertical-print-line-utils");

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeLeadingPrintBlocks(blocks) {
  const out = Array.isArray(blocks) ? [...blocks] : [];
  while (out.length > 0 && out[0]?.type === "blank") {
    out.shift();
  }
  return out;
}

function countVisibleRenderLines(lines, layoutOptions = {}) {
  return Math.max(1, getVisibleRenderLines(lines, layoutOptions).length);
}

function estimateHeadingLineCount(text, fontScale, layoutOptions = {}) {
  const baseCharsPerLine = getEffectiveCharsPerLine(layoutOptions);
  const headingCharsPerLine = Math.max(
    1,
    Math.floor(baseCharsPerLine / fontScale),
  );

  const headingOptions = {
    ...layoutOptions,
    charsPerLine: headingCharsPerLine,
  };

  const lines = splitTextIntoMeasureLines(String(text || ""), headingOptions);
  return countVisibleRenderLines(lines, headingOptions);
}

function getHeadingBlankConfig(block) {
  if (
    block?.type !== "heading1" &&
    block?.type !== "heading2" &&
    block?.type !== "heading3"
  ) {
    return { before: 0, after: 0 };
  }

  if (block.type === "heading1") {
    return { before: 0, after: 1 };
  }

  if (block.type === "heading2") {
    return { before: 1, after: 1 };
  }

  return { before: 1, after: 1 };
}

function makeBlankPageItems(count = 0) {
  return Array.from({ length: Math.max(0, Number(count || 0)) }, () => ({
    type: "blank",
  }));
}

function buildHeadingPageItems(block) {
  const blanks = getHeadingBlankConfig(block);
  return [
    ...makeBlankPageItems(blanks.before),
    block,
    ...makeBlankPageItems(blanks.after),
  ];
}

function collapseLeadingBlankItems(items, currentPageItems = []) {
  const list = Array.isArray(items) ? [...items] : [];
  const current = Array.isArray(currentPageItems) ? currentPageItems : [];

  while (
    list.length > 0 &&
    list[0]?.type === "blank" &&
    current.length > 0 &&
    current[current.length - 1]?.type === "blank"
  ) {
    list.shift();
  }

  return list;
}

function estimatePrintBlockLineCount(block, layoutOptions = {}) {
  if (block?.type === "blank") {
    return 1;
  }

  if (block?.type === "heading1") {
    return estimateHeadingLineCount(block?.text || "", 1.25, layoutOptions);
  }

  if (block?.type === "heading2") {
    return estimateHeadingLineCount(block?.text || "", 1.12, layoutOptions);
  }

  if (block?.type === "heading3") {
    return estimateHeadingLineCount(block?.text || "", 1.06, layoutOptions);
  }

  const measureLines = normalizeVerticalPrintMeasureLines(
    block?.text || "",
    layoutOptions,
  );

  return countVisibleRenderLines(measureLines, layoutOptions);
}

function endsWithTerminalHanging(renderLines, layoutOptions = {}) {
  const punctuationLayoutMode =
    String(layoutOptions.punctuationLayoutMode || "") ||
    getVerticalPunctuationLayoutMode();

  const visibleLines = (Array.isArray(renderLines) ? renderLines : []).filter(
    (line) => Array.isArray(line?.tokens) && line.tokens.length > 0,
  );

  if (!visibleLines.length) return false;

  const lastLine = visibleLines[visibleLines.length - 1];
  const lastTokens = lastLine.tokens;
  const lastToken = lastTokens[lastTokens.length - 1];
  const ch = String(lastToken?.displayText || "")[0] || "";

  return !!lastToken?.hanging && isHangingChar(ch, punctuationLayoutMode);
}

function pageHasTerminalHangingBonus(items) {
  const visibleItems = (Array.isArray(items) ? items : []).filter(
    (item) => item && item.type !== "blank",
  );

  if (!visibleItems.length) return false;

  const lastItem = visibleItems[visibleItems.length - 1];
  const renderLines = Array.isArray(lastItem?.renderLines)
    ? lastItem.renderLines
    : null;

  if (!renderLines || !renderLines.length) return false;

  const visibleLines = renderLines.filter(
    (line) => Array.isArray(line?.tokens) && line.tokens.length > 0,
  );
  if (!visibleLines.length) return false;

  const lastLine = visibleLines[visibleLines.length - 1];
  const tokens = lastLine.tokens;
  const lastToken = tokens[tokens.length - 1];
  const ch = String(lastToken?.displayText || "")[0] || "";

  const hasTerminalHanging = !!lastToken?.hanging && /[）〉》」』】]/.test(ch);

  const measureLineCount = Number(lastItem?.measureLineCount || 0);
  const renderLineCount = Number(lastItem?.renderLineCount || 0);

  return hasTerminalHanging && measureLineCount > renderLineCount;
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

function getTrailingWideRubyInfo(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];

  for (let i = list.length - 1, distance = 0; i >= 0; i -= 1, distance += 1) {
    const token = list[i];
    if (!token || token.hanging) continue;
    if (token.type === "newline") continue;

    if (isWideRubyToken(token)) {
      const baseLen = countTokenChars(token.displayText || "");
      const rubyLen = countTokenChars(token.rubyText || "");
      return {
        token,
        index: i,
        distanceFromTail: distance,
        overflowChars: Math.max(0, rubyLen - baseLen),
      };
    }
  }

  return null;
}

function shouldPushTailForWideRuby(line, layoutOptions = {}) {
  const charsPerLine = getEffectiveCharsPerLine(layoutOptions);
  const lineWidth = getLineMeasureWidth(line);

  if (!lineHasWideRubyToken(line)) return false;

  const overflowScore = getLineWideRubyOverflowScore(line);

  // 2文字に5文字、3文字に7文字など。
  // 親文字数に対してルビが明確に長い場合だけ、満行付近で送る。
  if (lineHasRubyLengthPushTarget(line) && lineWidth >= charsPerLine - 1) {
    return true;
  }

  // それ以外でも、行幅として本当に苦しい場合は送る
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

    // 長いルビの読みやすさ確保で末尾を送った行。
    // 後段の「空いた分を詰める」処理で戻さない。
    current.noRefillAfterWideRuby = true;

    // 追い出しで空いた分を、残った長いルビ語の字間へ少し戻す。
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
  }));

  let changed = true;
  let guard = 0;

  while (changed && guard < 20) {
    changed = false;
    guard += 1;

    // 1. 行頭に残った句読点を前行へぶら下げる
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

    // 2. ぶら下げで空いた行を、後続行から自然に詰め直す
    for (let i = 0; i < out.length - 1; i += 1) {
      const current = out[i];
      const next = out[i + 1];

      if (!current || !next) continue;
      if (current.hardBreak) continue;
      if (current.noRefillAfterWideRuby) continue;
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

function splitParagraphBlockForPrint(
  block,
  remainingLines,
  layoutOptions = {},
) {
  const measureLines = normalizeVerticalPrintMeasureLines(
    block?.text || "",
    layoutOptions,
  );

  if (countVisibleRenderLines(measureLines, layoutOptions) <= remainingLines) {
    const renderLines = getVisibleRenderLines(measureLines, layoutOptions);
    return {
      head: {
        ...block,
        text: block.text,
        renderLines,
        measureLineCount: measureLines.length,
        renderLineCount: renderLines.length,
      },
      tail: null,
    };
  }

  let headCount = 1;

  while (headCount < measureLines.length) {
    const candidate = measureLines.slice(0, headCount);
    const visibleCount = countVisibleRenderLines(candidate, layoutOptions);

    if (visibleCount >= remainingLines) {
      break;
    }

    headCount += 1;
  }

  let headLines = measureLines.slice(0, headCount);
  let tailLines = measureLines.slice(headCount);

  {
    const moved = moveLeadingHangingAcrossPageBoundary(
      headLines,
      tailLines,
      layoutOptions,
    );
    headLines = moved.headLines;
    tailLines = moved.tailLines;
  }

  let headRenderLines = getVisibleRenderLines(headLines, layoutOptions);

  while (
    tailLines.length > 0 &&
    headRenderLines.length < remainingLines &&
    endsWithTerminalHanging(headRenderLines, layoutOptions)
  ) {
    headCount += 1;
    headLines = measureLines.slice(0, headCount);
    tailLines = measureLines.slice(headCount);

    {
      const moved = moveLeadingHangingAcrossPageBoundary(
        headLines,
        tailLines,
        layoutOptions,
      );
      headLines = moved.headLines;
      tailLines = moved.tailLines;
    }

    headRenderLines = getVisibleRenderLines(headLines, layoutOptions);
  }

  const tailRenderLines = getVisibleRenderLines(tailLines, layoutOptions);

  return {
    head: {
      ...block,
      text: joinDisplayLineTokensToRaw(headLines),
      renderLines: headRenderLines,
      measureLineCount: headLines.length,
      renderLineCount: headRenderLines.length,
    },
    tail: tailLines.length
      ? {
          ...block,
          text: joinDisplayLineTokensToRaw(tailLines),
          renderLines: tailRenderLines,
          measureLineCount: tailLines.length,
          renderLineCount: tailRenderLines.length,
          continued: true,
        }
      : null,
  };
}

function hasRenderableLines(item) {
  return Array.isArray(item?.renderLines) && item.renderLines.length > 0;
}

function countNonEmptyDisplayLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter(
    (line) => Array.isArray(line?.tokens) && line.tokens.length > 0,
  ).length;
}

function normalizeRealPrintItemBoundaryHanging(pages, layoutOptions = {}) {
  const segments = [];

  for (const page of Array.isArray(pages) ? pages : []) {
    for (const item of Array.isArray(page?.items) ? page.items : []) {
      if (!hasRenderableLines(item)) continue;
      segments.push(item);
    }
  }

  for (let i = 1; i < segments.length; i += 1) {
    const prevItem = segments[i - 1];
    const currentItem = segments[i];

    const prevLines = Array.isArray(prevItem.renderLines)
      ? prevItem.renderLines
      : [];
    const currentLines = Array.isArray(currentItem.renderLines)
      ? currentItem.renderLines
      : [];

    if (!prevLines.length || !currentLines.length) continue;

    const moved = moveLeadingHangingAcrossPageBoundary(
      prevLines,
      currentLines,
      layoutOptions,
    );

    prevItem.renderLines = moved.headLines;
    currentItem.renderLines = moved.tailLines;

    prevItem.text = joinDisplayLineTokensToRaw(moved.headLines);
    currentItem.text = joinDisplayLineTokensToRaw(moved.tailLines);

    prevItem.renderLineCount = countNonEmptyDisplayLines(moved.headLines);
    currentItem.renderLineCount = countNonEmptyDisplayLines(moved.tailLines);

    prevItem.measureLineCount = prevItem.renderLineCount;
    currentItem.measureLineCount = currentItem.renderLineCount;
  }

  return pages;
}

function buildRealPrintPages(mergedData, layoutOptions = {}, options = {}) {
  const rawBlocks = buildMergedManuscriptPrintBlocks(mergedData, options);
  const blocks = normalizeLeadingPrintBlocks(rawBlocks);
  const linesPerColumn = Math.max(
    1,
    Number(layoutOptions.linesPerColumn || layoutOptions.linesPerPage || 16),
  );
  const pageColumnCount = Math.max(
    1,
    Number(layoutOptions.pageColumnCount || 1),
  );
  const linesPerPage = Math.max(
    1,
    Number(layoutOptions.linesPerPageTotal || linesPerColumn * pageColumnCount),
  );

  const pages = [];
  let currentPageItems = [];
  let usedLines = 0;
  let currentHeading1Title = "";

  function getCurrentPageLineLimit() {
    if (pageHasTerminalHangingBonus(currentPageItems)) {
      return linesPerPage + 1;
    }
    return linesPerPage;
  }

  function pushNewPage() {
    if (!currentPageItems.length) return;
    pages.push({
      pageNumber: pages.length + 1,
      heading1Title: currentHeading1Title,
      items: currentPageItems,
    });
    currentPageItems = [];
    usedLines = 0;
  }

  function pushItem(item, itemLines) {
    if (!item) return;

    const lastItem =
      currentPageItems.length > 0
        ? currentPageItems[currentPageItems.length - 1]
        : null;

    if (item.type === "blank" && lastItem?.type === "blank") {
      return;
    }

    currentPageItems.push(item);
    usedLines += itemLines;
  }

  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i];
    if (!block) continue;

    if (block.forcePageBreakBefore && currentPageItems.length) {
      const currentPageLineLimit = getCurrentPageLineLimit();
      const hasRemaining = usedLines < currentPageLineLimit;
      const hasVisibleItems = currentPageItems.some(
        (item) => item.type !== "blank",
      );

      if (hasVisibleItems && hasRemaining) {
        pushNewPage();
      }
    }

    let guard = 0;
    while (block && guard < 1000) {
      guard += 1;

      const blockLines = estimatePrintBlockLineCount(block, layoutOptions);
      const currentPageLineLimit = getCurrentPageLineLimit();
      const remainingLines = currentPageLineLimit - usedLines;

      if (
        (block.type === "heading2" || block.type === "heading3") &&
        currentPageItems.length &&
        remainingLines <= 1
      ) {
        pushNewPage();
        continue;
      }

      if (
        block.type === "heading1" ||
        block.type === "heading2" ||
        block.type === "heading3"
      ) {
        const nextHeading1Title =
          block.type === "heading1" ? String(block?.text || "").trim() : "";

        let headingItems = buildHeadingPageItems(block);
        headingItems = collapseLeadingBlankItems(
          headingItems,
          currentPageItems,
        );

        const headingLines = headingItems.reduce(
          (sum, item) => sum + estimatePrintBlockLineCount(item, layoutOptions),
          0,
        );

        if (headingLines > remainingLines && currentPageItems.length) {
          pushNewPage();
          continue;
        }

        // 見出し1が実際にこのページへ載る段階で、ヘッダー用の見出し名を更新する。
        // ここより前で更新すると、見出しが次ページ送りになったときに
        // 前ページのヘッダーが次章名になってしまう。
        if (nextHeading1Title) {
          currentHeading1Title = nextHeading1Title;
        }

        for (const item of headingItems) {
          const itemLines = estimatePrintBlockLineCount(item, layoutOptions);
          pushItem(item, itemLines);
        }

        block = null;
        continue;
      }

      if (blockLines <= remainingLines) {
        if (block.type === "paragraph") {
          const measureLines = normalizeVerticalPrintMeasureLines(
            block.text || "",
            layoutOptions,
          );
          const renderLines = getVisibleRenderLines(
            measureLines,
            layoutOptions,
          );

          pushItem(
            {
              ...block,
              renderLines,
              measureLineCount: measureLines.length,
              renderLineCount: renderLines.length,
            },
            renderLines.length,
          );
        } else {
          pushItem(block, blockLines);
        }

        block = null;
        continue;
      }

      if (block.type !== "paragraph") {
        if (currentPageItems.length) {
          pushNewPage();
          continue;
        }

        pushItem(block, Math.min(blockLines, linesPerPage));
        block = null;
        continue;
      }

      if (remainingLines <= 0) {
        pushNewPage();
        continue;
      }

      const { head, tail } = splitParagraphBlockForPrint(
        block,
        Math.max(1, remainingLines),
        layoutOptions,
      );

      if (head && String(head.text || "").length > 0) {
        const headVisibleLines = Array.isArray(head.renderLines)
          ? head.renderLines.length
          : estimatePrintBlockLineCount(head, layoutOptions);

        pushItem(head, Math.min(headVisibleLines, remainingLines));
      }

      if (tail && String(tail.text || "").length > 0) {
        const currentPageLineLimit = getCurrentPageLineLimit();
        const afterPushRemaining = currentPageLineLimit - usedLines;

        const shouldKeepOnSamePage =
          afterPushRemaining > 0 &&
          Array.isArray(head?.renderLines) &&
          endsWithTerminalHanging(head.renderLines, layoutOptions);

        if (!shouldKeepOnSamePage) {
          pushNewPage();
        }

        block = tail;
        continue;
      }

      block = null;
    }

    if (
      block?.type === "blank" &&
      pageHasTerminalHangingBonus(currentPageItems)
    ) {
      block = null;
    }
  }

  pushNewPage();

  if (!pages.length) {
    pages.push({
      pageNumber: 1,
      heading1Title: currentHeading1Title,
      items: [],
    });
  }

  normalizeRealPrintItemBoundaryHanging(pages, layoutOptions);

  return pages;
}

function renderDisplayTokenHtml(token, layoutOptions = {}) {
  if (!token) return "";

  const ch = String(token.displayText || "");
  const hangingClass = token.hanging ? " mjm-hanging" : "";
  const punctuationClass =
    token.hanging && /[！？!?]/.test(ch) ? " mjm-hanging-emphasis" : "";

  if (token.type === "ruby") {
    const rubyMetrics = getRubyTokenMetrics(token);
    const useRubyTypographyAdjustments =
      layoutOptions?.useTypographyAdjustments !== false;

    const pushedTrackBonus = token.rubyTailPushed ? 0.25 : 0;
    const pushedPadBonus = token.rubyTailPushed ? 0.18 : 0;

    const rubyPadBase = Math.min(
      0.22,
      rubyMetrics.outerPadEm + pushedPadBonus,
    );
    const rubyPad = rubyPadBase * 0.5;

    const rubyTrack =
      Math.min(0.25, rubyMetrics.innerTrackEm + pushedTrackBonus) * 0.5;

    const rubyTrackStyle = useRubyTypographyAdjustments
      ? ` --mjm-ruby-track:${rubyTrack.toFixed(3)}em;`
      : "";

    return `<span class="mjm-ruby${hangingClass}${punctuationClass}" style="--mjm-ruby-pad:${rubyPad.toFixed(
      3,
    )}em;${rubyTrackStyle}"><span class="mjm-ruby-base">${escapeHtml(
      token.displayText,
    )}</span><span class="mjm-ruby-text">${escapeHtml(
      token.rubyText || "",
    )}</span></span>`;
  }

  if (token.type === "bouten") {
    return `<span class="mjm-bouten${hangingClass}${punctuationClass}"><span class="mjm-bouten-base">${escapeHtml(
      token.displayText,
    )}</span></span>`;
  }

  return `<span class="mjm-token${hangingClass}${punctuationClass}">${escapeHtml(
    token.displayText || "",
  )}</span>`;
}

function lineHasRubyToken(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  return tokens.some((token) => token?.type === "ruby");
}

function renderDisplayLineHtml(line, layoutOptions = {}) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  if (!tokens.length) return "";

  const rubyClass = lineHasRubyToken(line) ? " mjm-line-has-ruby" : "";
  const pushoutTailClass = line?.pushoutTailPushed
    ? " mjm-line-tail-pushed"
    : "";

  return `<div class="mjm-line${rubyClass}${pushoutTailClass}">${tokens
    .map((token) => renderDisplayTokenHtml(token, layoutOptions))
    .join("")}</div>`;
}

function renderHeadingLinesHtml(
  text,
  className,
  fontScale,
  layoutOptions = {},
) {
  const baseCharsPerLine = getEffectiveCharsPerLine(layoutOptions);
  const headingCharsPerLine = Math.max(
    1,
    Math.floor(baseCharsPerLine / fontScale),
  );

  const headingOptions = {
    ...layoutOptions,
    charsPerLine: headingCharsPerLine,
  };

  const lines = splitTextIntoDisplayLines(String(text || ""), headingOptions);

  return `<div class="${className}">${lines
    .map((line) => renderDisplayLineHtml(line, layoutOptions))
    .filter(Boolean)
    .join("")}</div>`;
}

function renderRealPrintPageItemHtml(item, layoutOptions = {}) {
  if (item?.type === "blank") {
    return `<div class="mjm-blank"></div>`;
  }

  if (item?.type === "heading1") {
    return renderHeadingLinesHtml(
      String(item?.text || ""),
      "mjm-h1 mjm-pageTitle",
      1.25,
      layoutOptions,
    );
  }

  if (item?.type === "heading2") {
    return renderHeadingLinesHtml(
      String(item?.text || ""),
      "mjm-h2",
      1.12,
      layoutOptions,
    );
  }

  if (item?.type === "heading3") {
    return renderHeadingLinesHtml(
      String(item?.text || ""),
      "mjm-h3",
      1.06,
      layoutOptions,
    );
  }

  const lines = Array.isArray(item?.renderLines)
    ? item.renderLines
    : splitTextIntoDisplayLines(String(item?.text || ""), layoutOptions);

  const lineHtml = lines
    .map((line) => renderDisplayLineHtml(line, layoutOptions))
    .filter(Boolean)
    .join("");

  return `<div class="mjm-p${item?.continued ? " mjm-p-continued" : ""}">${lineHtml}</div>`;
}

function countRubyBearingLinesInPageItems(items) {
  const list = Array.isArray(items) ? items : [];
  let count = 0;

  for (const item of list) {
    const lines = Array.isArray(item?.renderLines) ? item.renderLines : [];
    for (const line of lines) {
      const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
      if (tokens.some((token) => token?.type === "ruby")) {
        count += 1;
      }
    }
  }

  return count;
}

function estimateRealPrintRubySlackMm(page, metrics) {
  const rubyLineCount = countRubyBearingLinesInPageItems(page?.items || []);
  if (rubyLineCount <= 0) return 0;

  const fontSizeMm = Number(metrics?.font?.sizeMm || 0);
  if (!(fontSizeMm > 0)) return 0;

  return Math.min(
    Math.round(rubyLineCount * fontSizeMm * 0.18 * 100) / 100,
    Math.round(fontSizeMm * 1.6 * 100) / 100,
  );
}

function normalizeRealPrintStartPageSide(value) {
  return String(value || "odd") === "even" ? "even" : "odd";
}

function getRealPrintPhysicalPageNumber(
  pageNumber,
  options = {},
  metrics = {},
) {
  const startPageSide = normalizeRealPrintStartPageSide(
    options.realPrintStartPageSide || metrics?.trimSize?.startPageSide || "odd",
  );

  const contentPageNumber = Math.max(1, Number(pageNumber || 1));

  // 1ページ目を偶数扱いにする場合、
  // 内容上の1ページ目を物理ページ2として扱う。
  return startPageSide === "even" ? contentPageNumber + 1 : contentPageNumber;
}

function normalizeRealPrintBleedMode(value) {
  return String(value || "all") === "nonSpine" ? "nonSpine" : "all";
}

function isRealPrintBookOptionsEnabled(options = {}) {
  return options.realPrintBookOptionsEnabled === true;
}

function normalizeRealPrintHeading1Mode(value) {
  return String(value || "all") === "evenOnly" ? "evenOnly" : "all";
}

function normalizeRealPrintHeaderOrder(value) {
  return String(value || "numberTitle") === "titleNumber"
    ? "titleNumber"
    : "numberTitle";
}

function normalizeRealPrintHeaderPosition(value) {
  return String(value || "bottom") === "top" ? "top" : "bottom";
}

function getRealPrintDisplayPageNumber(pageNumber, options = {}) {
  const start = Math.max(1, Number(options.realPrintPageNumberStart || 1));
  const contentPageNumber = Math.max(1, Number(pageNumber || 1));

  return start + contentPageNumber - 1;
}

function shouldShowRealPrintHeading1OnPage(page, side, options = {}) {
  if (!isRealPrintBookOptionsEnabled(options)) return false;
  if (options.realPrintShowHeading1 !== true) return false;

  const title = String(page?.heading1Title || "").trim();
  if (!title) return false;

  const mode = normalizeRealPrintHeading1Mode(options.realPrintHeading1Mode);
  if (mode === "evenOnly" && side.isOdd) return false;

  return true;
}

function renderRealPrintPageMarkHtml(page, side, options = {}) {
  if (!isRealPrintBookOptionsEnabled(options)) return "";

  const showNumber = options.realPrintShowPageNumber === true;
  const showHeading = shouldShowRealPrintHeading1OnPage(page, side, options);

  if (!showNumber && !showHeading) return "";

  const order = normalizeRealPrintHeaderOrder(options.realPrintHeaderOrder);
  const position = normalizeRealPrintHeaderPosition(
    options.realPrintHeaderPosition,
  );

  const numberText = String(
    getRealPrintDisplayPageNumber(page?.pageNumber || 1, options),
  );

  const headingText = String(page?.heading1Title || "").trim();

  const numberHtml = showNumber
    ? `<span class="realPrintPageMarkNumber">${escapeHtml(numberText)}</span>`
    : "";

  const headingHtml = showHeading
    ? `<span class="realPrintPageMarkHeading">${escapeHtml(headingText)}</span>`
    : "";

  const parts =
    order === "titleNumber"
      ? [headingHtml, numberHtml]
      : [numberHtml, headingHtml];

  const html = parts.filter(Boolean).join("");

  if (!html) return "";

  return `<div class="realPrintPageMark is-${position}">
    <span class="realPrintPageMarkInner">${html}</span>
  </div>`;
}

function getRealPrintPageSideConfig(pageNumber, metrics = {}, options = {}) {
  const physicalPageNumber = getRealPrintPhysicalPageNumber(
    pageNumber,
    options,
    metrics,
  );

  const isOdd = physicalPageNumber % 2 === 1;

  const bleedMm = Math.max(
    0,
    Number(options.realPrintBleedMm || metrics?.trimSize?.bleedMm || 0),
  );

  const bleedMode = normalizeRealPrintBleedMode(
    options.realPrintBleedMode || metrics?.trimSize?.bleedMode || "all",
  );

  const mirrorMargins = options.realPrintMirrorMargins !== false;

  const topMm = Number(metrics?.margins?.topMm || 0);
  const bottomMm = Number(metrics?.margins?.bottomMm || 0);

  const foreEdgeMm = Number(metrics?.margins?.rightMm || 0);
  const spineMm = Number(metrics?.margins?.leftMm || 0);

  const rightMarginMm = mirrorMargins
    ? isOdd
      ? foreEdgeMm
      : spineMm
    : foreEdgeMm;

  const leftMarginMm = mirrorMargins ? (isOdd ? spineMm : foreEdgeMm) : spineMm;

  let rightBleedMm = bleedMm;
  let leftBleedMm = bleedMm;

  if (bleedMode === "nonSpine") {
    if (mirrorMargins) {
      // 右綴じ縦書き前提:
      // 奇数ページ: 左がノド
      // 偶数ページ: 右がノド
      if (isOdd) {
        rightBleedMm = bleedMm;
        leftBleedMm = 0;
      } else {
        rightBleedMm = 0;
        leftBleedMm = bleedMm;
      }
    } else {
      // 左右入れ替えを使わない場合は、左をノド扱いにする
      rightBleedMm = bleedMm;
      leftBleedMm = 0;
    }
  }

  const fontSizeMm = Number(metrics?.font?.sizeMm || 0);

  const rubySafetyMm =
    fontSizeMm > 0 ? Math.round(fontSizeMm * 0.72 * 100) / 100 : 1.8;

  const effectiveRubySafetyMm = Math.min(
    rubySafetyMm,
    Math.max(0, rightMarginMm),
  );

  const contentWidthMm = Number(metrics?.contentBox?.widthMm || 1);

  return {
    isOdd,
    physicalPageNumber,
    sideClass: isOdd ? "is-odd" : "is-even",

    pageMarkTopMm: bleedMm + Math.max(1.5, topMm * 0.35),
    pageMarkBottomMm: bleedMm + Math.max(1.5, bottomMm * 0.35),

    // ページ番号・見出しは本文面の横範囲内に収める
    pageMarkLeftMm: leftMarginMm + leftBleedMm,
    pageMarkRightMm: rightMarginMm + rightBleedMm,

    topBleedMm: bleedMm,
    bottomBleedMm: bleedMm,
    rightBleedMm,
    leftBleedMm,

    bodyTopMm: topMm + bleedMm,
    bodyBottomMm: bottomMm + bleedMm,
    bodyRightMm:
      Math.max(0, rightMarginMm - effectiveRubySafetyMm) + rightBleedMm,
    bodyLeftMm: leftMarginMm + leftBleedMm,

    trimTopMm: bleedMm,
    trimBottomMm: bleedMm,
    trimRightMm: rightBleedMm,
    trimLeftMm: leftBleedMm,

    rubySafetyMm: effectiveRubySafetyMm,
    bodyBlockSizeMm: Math.max(1, contentWidthMm + effectiveRubySafetyMm),
  };
}

function buildRealPrintPageStyleVars(pageNumber, metrics = {}, options = {}) {
  const side = getRealPrintPageSideConfig(pageNumber, metrics, options);

  return [
    `--page-physical-number:${side.physicalPageNumber}`,
    `--page-mark-top:${side.pageMarkTopMm}mm`,
    `--page-mark-bottom:${side.pageMarkBottomMm}mm`,
    `--page-mark-left:${side.pageMarkLeftMm}mm`,
    `--page-mark-right:${side.pageMarkRightMm}mm`,
    `--page-body-top:${side.bodyTopMm}mm`,
    `--page-body-right:${side.bodyRightMm}mm`,
    `--page-body-bottom:${side.bodyBottomMm}mm`,
    `--page-body-left:${side.bodyLeftMm}mm`,
    `--page-ruby-safety:${side.rubySafetyMm}mm`,
    `--page-body-block-size:${side.bodyBlockSizeMm}mm`,
    `--page-trim-top:${side.trimTopMm}mm`,
    `--page-trim-right:${side.trimRightMm}mm`,
    `--page-trim-bottom:${side.trimBottomMm}mm`,
    `--page-trim-left:${side.trimLeftMm}mm`,
  ].join(";");
}

function getRealPrintItemLineCount(item, layoutOptions = {}) {
  if (!item) return 0;

  if (item.type === "blank") return 1;

  if (Array.isArray(item.renderLines)) {
    return item.renderLines.length;
  }

  return estimatePrintBlockLineCount(item, layoutOptions);
}

function cloneRealPrintItemWithRenderLines(item, renderLines, extra = {}) {
  return {
    ...item,
    ...extra,
    renderLines: Array.isArray(renderLines) ? renderLines : [],
    renderLineCount: Array.isArray(renderLines) ? renderLines.length : 0,
    measureLineCount: Array.isArray(renderLines) ? renderLines.length : 0,
    text: Array.isArray(renderLines)
      ? joinDisplayLineTokensToRaw(renderLines)
      : String(item?.text || ""),
  };
}

function splitParagraphItemByLines(item, lineCount, layoutOptions = {}) {
  const renderLines = Array.isArray(item?.renderLines) ? item.renderLines : [];

  if (!renderLines.length) {
    return {
      head: item,
      tail: null,
    };
  }

  const safeLineCount = Math.max(
    0,
    Math.min(renderLines.length, Number(lineCount || 0)),
  );

  if (safeLineCount <= 0) {
    return {
      head: null,
      tail: item,
    };
  }

  if (safeLineCount >= renderLines.length) {
    return {
      head: item,
      tail: null,
    };
  }

  let headLines = renderLines.slice(0, safeLineCount);
  let tailLines = renderLines.slice(safeLineCount);

  {
    const moved = moveLeadingHangingAcrossPageBoundary(
      headLines,
      tailLines,
      layoutOptions,
    );

    headLines = moved.headLines;
    tailLines = moved.tailLines;
  }

  return {
    head: cloneRealPrintItemWithRenderLines(item, headLines),
    tail: cloneRealPrintItemWithRenderLines(item, tailLines, {
      continued: true,
    }),
  };
}

function splitRealPrintPageItemsIntoSections(
  items,
  linesPerSection,
  layoutOptions = {},
) {
  const topItems = [];
  const bottomItems = [];

  const columns = [topItems, bottomItems];
  const limit = Math.max(
    1,
    Number(linesPerSection || layoutOptions.linesPerPage || 16),
  );

  let columnIndex = 0;
  let usedLines = 0;

  function pushToCurrentColumn(item, itemLines) {
    if (!item) return;

    const current = columns[columnIndex];
    const last = current[current.length - 1];

    if (item.type === "blank" && last?.type === "blank") {
      return;
    }

    current.push(item);
    usedLines += Math.max(0, Number(itemLines || 0));
  }

  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;

    let restItem = item;
    let guard = 0;

    while (restItem && guard < 20) {
      guard += 1;

      const itemLines = getRealPrintItemLineCount(restItem, layoutOptions);
      const remaining = limit - usedLines;

      if (itemLines <= remaining || columnIndex >= columns.length - 1) {
        pushToCurrentColumn(restItem, itemLines);
        restItem = null;
        continue;
      }

      if (remaining <= 0) {
        columnIndex += 1;
        usedLines = 0;
        continue;
      }

      if (
        restItem.type === "paragraph" &&
        Array.isArray(restItem.renderLines)
      ) {
        const { head, tail } = splitParagraphItemByLines(
          restItem,
          remaining,
          layoutOptions,
        );

        if (head) {
          pushToCurrentColumn(
            head,
            getRealPrintItemLineCount(head, layoutOptions),
          );
        }

        columnIndex += 1;
        usedLines = 0;
        restItem = tail;
        continue;
      }

      // 見出しや空行は途中分割せず、次段へ送る
      columnIndex += 1;
      usedLines = 0;
    }
  }

  return {
    topItems,
    bottomItems,
  };
}

function renderRealPrintColumnHtml(items, layoutOptions = {}, className = "") {
  const itemHtml = (Array.isArray(items) ? items : [])
    .map((item) => renderRealPrintPageItemHtml(item, layoutOptions))
    .join("\n");

  return `<div class="realPrintColumn${className ? ` ${className}` : ""}">${itemHtml}</div>`;
}

function renderRealPrintPagesHtml(
  pages,
  layoutOptions = {},
  metrics = {},
  options = {},
) {
  const columnCount = Math.max(1, Number(metrics?.column?.count || 1));
  const linesPerColumn = Math.max(
    1,
    Number(
      metrics?.column?.linesPerColumn ||
        metrics?.target?.linesPerColumn ||
        layoutOptions.linesPerPage ||
        16,
    ),
  );

  return `
<div class="realPrintPages">
${pages
  .map((page) => {
    const pageNumber = Number(page?.pageNumber || 1);
    const side = getRealPrintPageSideConfig(pageNumber, metrics, options);
    const styleVars = buildRealPrintPageStyleVars(pageNumber, metrics, options);

    const pageMarkHtml = renderRealPrintPageMarkHtml(page, side, options);

    if (columnCount === 2) {
      const sections = splitRealPrintPageItemsIntoSections(
        page.items,
        linesPerColumn,
        layoutOptions,
      );

      return `
  <section class="realPrintPage ${side.sideClass} is-two-column-page" style="${styleVars}">
    ${pageMarkHtml}
    <div class="realPrintBody is-two-column">
      ${renderRealPrintColumnHtml(sections.topItems, layoutOptions, "is-top-section")}
      ${renderRealPrintColumnHtml(sections.bottomItems, layoutOptions, "is-bottom-section")}
    </div>
  </section>`;
    }

    return `
  <section class="realPrintPage ${side.sideClass}" style="${styleVars}">
    ${pageMarkHtml}
    <div class="realPrintBody is-single-column">
      ${renderRealPrintColumnHtml(page.items, layoutOptions, "is-single-column")}
    </div>
  </section>`;
  })
  .join("\n")}
</div>`.trim();
}

function getRealPrintPageStyle(metrics, options = {}) {
  const trimWidthMm = Number(metrics?.trimSize?.widthMm || 128);
  const trimHeightMm = Number(metrics?.trimSize?.heightMm || 182);

  const bleedMm = Math.max(
    0,
    Number(options.realPrintBleedMm || metrics?.trimSize?.bleedMm || 0),
  );

  const bleedMode = normalizeRealPrintBleedMode(
    options.realPrintBleedMode || metrics?.trimSize?.bleedMode || "all",
  );

  const outputWidthMm =
    bleedMode === "nonSpine"
      ? Math.round((trimWidthMm + bleedMm) * 100) / 100
      : Math.round((trimWidthMm + bleedMm * 2) * 100) / 100;

  const outputHeightMm = Math.round((trimHeightMm + bleedMm * 2) * 100) / 100;

  const topMm = Number(metrics?.margins?.topMm || 0);
  const bottomMm = Number(metrics?.margins?.bottomMm || 0);
  const rightMm = Number(metrics?.margins?.rightMm || 0);
  const leftMm = Number(metrics?.margins?.leftMm || 0);

  const contentWidthMm = Number(metrics?.contentBox?.widthMm || 1);
  const contentHeightMm = Number(metrics?.contentBox?.heightMm || 1);

  const columnCount = Math.max(1, Number(metrics?.column?.count || 1));
  const columnGapMm = Math.max(0, Number(metrics?.column?.gapMm || 0));
  const columnWidthMm = Math.max(
    1,
    Number(metrics?.column?.widthMm || contentWidthMm),
  );

  const columnHeightMm =
    columnCount === 2
      ? Math.max(
          1,
          Number(
            metrics?.column?.heightMm || (contentHeightMm - columnGapMm) / 2,
          ),
        )
      : contentHeightMm;

  const fontSizePt = Number(metrics?.font?.sizePt || 9);
  const charsPerLine = Number(metrics?.target?.charsPerLine || 42);
  const linesPerColumn = Math.max(
    1,
    Number(
      metrics?.column?.linesPerColumn ||
        metrics?.target?.linesPerColumn ||
        metrics?.target?.linesPerPage ||
        16,
    ),
  );

  const fontSizeMm = Number(metrics?.font?.sizeMm || 0);
  const charSpacingMm = Number(metrics?.estimated?.charSpacingMm || 0);
  const linePitchMm = Number(metrics?.estimated?.linePitchMm || 0);

  const lineBlockSizeMm =
    linePitchMm > 0
      ? Math.round(linePitchMm * 1000) / 1000
      : Math.round((columnWidthMm / Math.max(1, linesPerColumn)) * 1000) / 1000;

  const lineInlineSizeMm =
    columnHeightMm > 0 ? Math.round(columnHeightMm * 1000) / 1000 : 1;

  const rubySafetyMm =
    fontSizeMm > 0 ? Math.round(fontSizeMm * 0.72 * 100) / 100 : 1.8;

  const effectiveRubySafetyMm = Math.min(rubySafetyMm, Math.max(0, rightMm));

  const realBodyRightMm = Math.max(0, rightMm - effectiveRubySafetyMm);

  const bodyBlockSizeMm = Math.max(1, contentWidthMm + effectiveRubySafetyMm);

  const realColumnBlockSizeMm = Math.max(1, columnWidthMm);
  const realColumnInlineSizeMm = Math.max(1, columnHeightMm);

  const cssCharSpacingMm = (() => {
    const value = Number(charSpacingMm);
    if (!Number.isFinite(value)) return 0;

    const safetyMm = 0.015;

    return Math.max(0, Math.round((value - safetyMm) * 1000) / 1000);
  })();

  const computedLineHeight =
    fontSizeMm > 0 && linePitchMm > 0
      ? Math.round((linePitchMm / fontSizeMm) * 1000) / 1000
      : 1;

  const fontFamily = String(options.fontFamily || "").trim() || "serif";

  const screenPaddingPx = 12;

  function mmToPtCss(mm) {
    const n = Number(mm);
    if (!Number.isFinite(n) || n <= 0) return "0pt";
    return `${Math.round(((n * 72) / 25.4) * 1000) / 1000}pt`;
  }

  const outputWidthPt = mmToPtCss(outputWidthMm);
  const outputHeightPt = mmToPtCss(outputHeightMm);

  return `
@page {
  size: ${outputWidthPt} ${outputHeightPt};
  margin: 0;
}

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #222;
}

body {
  font-family: ${JSON.stringify(fontFamily)};
}

.realPrintDocument {
  margin: 0;
  padding: 0;
}

.realPrintPages {
  display: block;
}

.realPrintPage {
  position: relative;
  width: ${outputWidthPt};
  height: ${outputHeightPt};
  box-sizing: border-box;
  overflow: hidden;
  background: #fff;
  break-after: page;
  page-break-after: always;
}

.realPrintPage:last-child {
  break-after: auto;
  page-break-after: auto;
}

.realPrintPageMark {
  position: absolute;
  left: var(--page-mark-left);
  right: var(--page-mark-right);
  z-index: 2;
  box-sizing: border-box;

  font-size: ${Math.max(6, Math.round(fontSizePt * 0.72 * 100) / 100)}pt;
  line-height: 1;
  color: #333;

  writing-mode: horizontal-tb;
  text-orientation: mixed;
  white-space: nowrap;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

.realPrintPageMark.is-top {
  top: var(--page-mark-top);
}

.realPrintPageMark.is-bottom {
  bottom: var(--page-mark-bottom);
}

.realPrintPage.is-odd .realPrintPageMark {
  text-align: right;
}

.realPrintPage.is-even .realPrintPageMark {
  text-align: left;
}

.realPrintPageMarkInner {
  display: inline-flex;
  gap: 0.9em;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  vertical-align: top;
}

.realPrintPage.is-odd .realPrintPageMarkInner {
  justify-content: flex-end;
}

.realPrintPage.is-even .realPrintPageMarkInner {
  justify-content: flex-start;
}

.realPrintPageMarkHeading {
  display: inline-block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.realPrintPageMarkNumber {
  display: inline-block;
  min-width: 1.4em;
}

.realPrintBody {
  position: absolute;
  top: var(--page-body-top);
  right: var(--page-body-right);
  bottom: var(--page-body-bottom);
  left: var(--page-body-left);

  box-sizing: border-box;
  overflow: visible;

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: ${columnCount === 2 ? columnGapMm : 0}mm;

  writing-mode: horizontal-tb;
  text-orientation: mixed;

  font-size: ${fontSizePt}pt;
  line-height: 1;
  letter-spacing: ${cssCharSpacingMm}mm;
  --mjm-line-track: ${cssCharSpacingMm}mm;

  padding-right: var(--page-ruby-safety);

  --real-line-inline-size: ${lineInlineSizeMm}mm;
  --real-line-block-size: ${lineBlockSizeMm}mm;
  --real-column-width: ${realColumnBlockSizeMm}mm;
  --real-column-height: ${realColumnInlineSizeMm}mm;
  --real-column-gap: ${columnGapMm}mm;
}

.realPrintColumn {
  box-sizing: border-box;
  overflow: visible;

  writing-mode: vertical-rl;
  text-orientation: mixed;
  white-space: nowrap;

  width: var(--real-column-width);
  height: var(--real-column-height);
  flex: 0 0 var(--real-column-height);
  min-width: 0;
  min-height: 0;
}

.realPrintBody.is-single-column {
  gap: 0;
}

.realPrintBody.is-two-column {
  gap: var(--real-column-gap);
}

.mjm-line {
  display: block;
  box-sizing: border-box;
  inline-size: var(--real-line-inline-size);
  block-size: var(--real-line-block-size);
  line-height: 1;
  white-space: nowrap;
  overflow: visible;
  --mjm-active-line-track: var(--mjm-line-track, 0em);
  letter-spacing: var(--mjm-active-line-track);
}

.mjm-line-tail-pushed {
  --mjm-active-line-track: calc(${cssCharSpacingMm}mm + 0.1mm);
}

.mjm-line-has-ruby {
  margin-left: 0;
}

.mjm-token {
  display: inline;
}

.mjm-hanging {
  display: inline-block;
  transform: translateY(-0.05em) scaleY(0.92);
  transform-origin: center center;
  font-size: 92%;
}

.mjm-ruby {
  display: inline-block;
  position: relative;
  line-height: 1;
  white-space: nowrap;
  vertical-align: top;

  /* 外側の余白は少なめ */
  letter-spacing: var(--mjm-active-line-track, 0em);
  padding-inline-start: var(--mjm-ruby-pad, 0em);
  padding-inline-end: var(--mjm-ruby-pad, 0em);

  /* 下のはみ出しを少し抑える */
  margin-bottom: -0.18em;
}

.mjm-ruby-base {
  display: inline-block;

  /* ルビ付き文字列だけ少し字間を入れる */
  letter-spacing: calc(
    var(--mjm-ruby-track, 0em) + var(--mjm-active-line-track, 0em)
  );
}

.mjm-ruby-text {
  position: absolute;
  z-index: 1;

  /*
    縦書きでは block-start 側がルビ側。
    ここを調整すると、ルビが本文に近づいたり離れたりします。
  */
  inset-block-start: -1.1em;

  /*
    inline 方向、つまり縦方向の中央寄せ。
  */
  inset-inline-start: 47%;
  transform: translateY(-50%);

  font-size: 0.55em;
  line-height: 1;
  letter-spacing: -0.03em;
  white-space: nowrap;
  pointer-events: none;
}

.mjm-bouten {
  /* 本文は通常の一字位置に置き、ゴマだけを行外へ配置する。 */
  position: relative;
  display: inline;
  line-height: inherit;
  overflow: visible;
  text-emphasis: none;
  -webkit-text-emphasis: none;
}

.mjm-bouten-base {
  display: inline;
  line-height: inherit;
}

.mjm-bouten::after {
  content: "﹅";
  position: absolute;
  z-index: 1;
  inset-block-start: -0.52em;
  inset-inline-start: 50%;
  transform: translateY(-50%);
  font-size: 0.36em;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  pointer-events: none;
}

.mjm-p,
.mjm-h1,
.mjm-h2,
.mjm-h3 {
  margin: 0;
  padding: 0;
}

.mjm-p-continued {
  margin-block-start: 0;
}

.mjm-h1 .mjm-line {
  block-size: calc(var(--real-line-block-size) * 1.15);
}

.mjm-h2 .mjm-line {
  block-size: calc(var(--real-line-block-size) * 1.08);
}

.mjm-h3 .mjm-line {
  block-size: calc(var(--real-line-block-size) * 1.04);
}

.mjm-h1,
.mjm-h2 {
  font-weight: 700;
}

.mjm-h1 { font-size: 1.38em; }
.mjm-h2 { font-size: 1.18em; }
.mjm-h3 { font-size: 1.08em; }

.mjm-h2,
.mjm-h3 {
  text-indent: 1em;
}

.mjm-blank {
  inline-size: var(--real-line-inline-size);
  block-size: var(--real-line-block-size);
}

@media screen {
  body {
    background: #ececec;
    padding: ${screenPaddingPx}px;
  }

  .realPrintDocument {
    display: grid;
    gap: 24px;
    justify-content: center;
  }

  .realPrintPage {
    border: 1px solid #d0d0d0;
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  }

  .realPrintPage::after {
    content: "";
    position: absolute;
    top: var(--page-trim-top);
    right: var(--page-trim-right);
    bottom: var(--page-trim-bottom);
    left: var(--page-trim-left);
    border: ${bleedMm > 0 ? "1px dashed rgba(180, 80, 80, 0.45)" : "0"};
    pointer-events: none;
    box-sizing: border-box;
  }
}

@media print {
  .realPrintPage::after {
    display: none;
  }

  html, body {
    background: #fff;
  }

  .realPrintPage {
    border: none;
    box-shadow: none;
  }
}
`.trim();
}

function renderMergedManuscriptBrowserRealPrintHtml(mergedData, options = {}) {
  const metrics = resolveMergedManuscriptRealPrintMetrics(options);

  const columnCount = Math.max(1, Number(metrics?.column?.count || 1));
  const linesPerColumn = Math.max(
    1,
    Number(
      metrics?.column?.linesPerColumn ||
        metrics?.target?.linesPerColumn ||
        metrics?.target?.linesPerPage ||
        16,
    ),
  );

  const layoutOptions = {
    charsPerLine: Number(metrics?.target?.charsPerLine || 42),

    // ここは「1段あたり」
    linesPerPage: linesPerColumn,
    linesPerColumn,

    // ここがページ総容量
    linesPerPageTotal: Math.max(
      1,
      Number(
        metrics?.column?.linesPerPageTotal || linesPerColumn * columnCount,
      ),
    ),

    pageColumnCount: columnCount,

    punctuationLayoutMode:
      String(options.punctuationLayoutMode || "hanging") === "pushout"
        ? "pushout"
        : "hanging",
    useTypographyAdjustments: options.useTypographyAdjustments !== false,
  };

  const pages = buildRealPrintPages(mergedData, layoutOptions, options);
  const styleCss = getRealPrintPageStyle(metrics, options);
  const bodyHtml = renderRealPrintPagesHtml(
    pages,
    layoutOptions,
    metrics,
    options,
  );

  const title = String(mergedData?.workName || "").trim() || "作品";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${styleCss}
</style>
</head>
<body>
  <main class="realPrintDocument">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

module.exports = {
  renderMergedManuscriptBrowserRealPrintHtml,
};
