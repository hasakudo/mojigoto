const vscode = require("vscode");

const {
  renderMergedManuscriptTxt,
  buildMergedManuscriptPrintBlocks,
  resolveMergedManuscriptHtmlOptions,
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

function convertMojigotoInlineToHtml(text) {
  let value = String(text || "");
  const tokens = [];

  function keep(html) {
    const key = `__MOJIGOTO_INLINE_${tokens.length}__`;
    tokens.push({ key, html });
    return key;
  }

  value = value.replace(/《《(.*?)》》/g, (_, body) => {
    return keep(`<span class="mjm-bouten">${escapeHtml(body)}</span>`);
  });

  value = value.replace(
    /(?:\||｜)([^《\n]+?)《([^》\n]+?)》/g,
    (_, base, ruby) => {
      return keep(
        `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`,
      );
    },
  );

  value = value.replace(
    /([一-龠々〆ヵヶぁ-んァ-ヴーA-Za-z0-9]+)《([^》\n]+?)》/g,
    (_, base, ruby) => {
      return keep(
        `<ruby>${escapeHtml(base)}<rt>${escapeHtml(ruby)}</rt></ruby>`,
      );
    },
  );

  value = escapeHtml(value);

  for (const token of tokens) {
    value = value.replace(token.key, token.html);
  }

  return value;
}

function renderMergedHtmlParagraph(lines) {
  const text = Array.isArray(lines) ? lines.join("\n") : "";
  if (!text.trim()) return "";
  return `<p class="mjm-p">${convertMojigotoInlineToHtml(text)}</p>`;
}

function renderMergedHtmlHeadingLine(line) {
  const raw = String(line || "");

  if (/^###\s+/.test(raw)) {
    const text = raw.replace(/^###\s+/, "");
    return `<div class="mjm-gap-before mjm-gap-after"><h3 class="mjm-h3">${convertMojigotoInlineToHtml(text)}</h3></div>`;
  }

  if (/^##\s+/.test(raw)) {
    const text = raw.replace(/^##\s+/, "");
    return `<div class="mjm-gap-before mjm-gap-after"><h2 class="mjm-h2">${convertMojigotoInlineToHtml(text)}</h2></div>`;
  }

  if (/^#\s+/.test(raw)) {
    const text = raw.replace(/^#\s+/, "");
    return `<h1 class="mjm-h1 mjm-page-break-before">${convertMojigotoInlineToHtml(text)}</h1>`;
  }

  return "";
}

function renderMergedManuscriptHtmlBody(mergedData, options = {}) {
  const bodyText = renderMergedManuscriptTxt(mergedData, options);
  const lines = String(bodyText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const out = [];
  let paragraphBuffer = [];

  function flushParagraph() {
    if (!paragraphBuffer.length) return;
    const html = renderMergedHtmlParagraph(paragraphBuffer);
    if (html) out.push(html);
    paragraphBuffer = [];
  }

  for (const line of lines) {
    const raw = String(line || "");

    if (!raw.trim()) {
      flushParagraph();
      out.push(`<div class="mjm-blank"></div>`);
      continue;
    }

    if (/^#{1,3}\s+/.test(raw)) {
      flushParagraph();
      const headingHtml = renderMergedHtmlHeadingLine(raw);
      if (headingHtml) out.push(headingHtml);
      continue;
    }

    paragraphBuffer.push(raw);
  }

  flushParagraph();

  return out.join("\n");
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

function estimatePrintBlockLineCount(block, layoutOptions = {}) {
  if (block?.type === "blank") {
    return 1;
  }

  if (block?.type === "heading1") {
    return estimateHeadingLineCount(block?.text || "", 1.4, layoutOptions);
  }

  if (block?.type === "heading2") {
    return estimateHeadingLineCount(block?.text || "", 1.2, layoutOptions);
  }

  if (block?.type === "heading3") {
    return estimateHeadingLineCount(block?.text || "", 1.1, layoutOptions);
  }

  const measureLines = normalizeVerticalPrintMeasureLines(
    block?.text || "",
    layoutOptions,
  );

  return countVisibleRenderLines(measureLines, layoutOptions);
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
          renderLines: getVisibleRenderLines(tailLines, layoutOptions),
          measureLineCount: tailLines.length,
          renderLineCount: getVisibleRenderLines(tailLines, layoutOptions)
            .length,
          continued: true,
        }
      : null,
  };
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

function hasRenderableLines(item) {
  return Array.isArray(item?.renderLines) && item.renderLines.length > 0;
}

function countNonEmptyDisplayLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter(
    (line) => Array.isArray(line?.tokens) && line.tokens.length > 0,
  ).length;
}

function normalizePrintItemBoundaryHanging(pages, layoutOptions = {}) {
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

function buildMergedManuscriptPrintPages(
  mergedData,
  htmlOptions = {},
  options = {},
) {
  const rawBlocks = buildMergedManuscriptPrintBlocks(mergedData, options);
  const blocks = normalizeLeadingPrintBlocks(rawBlocks);
  const linesPerPage = Number(htmlOptions.linesPerPage || 16);

  const pages = [];
  let currentPageItems = [];
  let usedLines = 0;

  function getCurrentPageLineLimit(linesPerPage, currentPageItems) {
    if (pageHasTerminalHangingBonus(currentPageItems)) {
      return linesPerPage + 1;
    }
    return linesPerPage;
  }

  function pushNewPage() {
    if (!currentPageItems.length) return;
    pages.push({
      pageNumber: pages.length + 1,
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
      const currentPageLineLimit = getCurrentPageLineLimit(
        linesPerPage,
        currentPageItems,
      );

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
      guard++;

      const blockLines = estimatePrintBlockLineCount(block, htmlOptions);
      const currentPageLineLimit = getCurrentPageLineLimit(
        linesPerPage,
        currentPageItems,
      );
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
        let headingItems = buildHeadingPageItems(block);
        headingItems = collapseLeadingBlankItems(
          headingItems,
          currentPageItems,
        );

        const headingLines = headingItems.reduce(
          (sum, item) => sum + estimatePrintBlockLineCount(item, htmlOptions),
          0,
        );

        if (headingLines > remainingLines && currentPageItems.length) {
          pushNewPage();
          continue;
        }

        for (const item of headingItems) {
          const itemLines = estimatePrintBlockLineCount(item, htmlOptions);
          pushItem(item, itemLines);
        }

        block = null;
        continue;
      }

      if (blockLines <= remainingLines) {
        if (block.type === "paragraph") {
          const measureLines = normalizeVerticalPrintMeasureLines(
            block.text || "",
            htmlOptions,
          );
          const renderLines = getVisibleRenderLines(measureLines, htmlOptions);

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
        htmlOptions,
      );

      if (head && String(head.text || "").length > 0) {
        const headVisibleLines = Array.isArray(head.renderLines)
          ? head.renderLines.length
          : estimatePrintBlockLineCount(head, htmlOptions);

        pushItem(head, Math.min(headVisibleLines, remainingLines));
      }

      if (tail && String(tail.text || "").length > 0) {
        const currentPageLineLimit = getCurrentPageLineLimit(
          linesPerPage,
          currentPageItems,
        );
        const afterPushRemaining = currentPageLineLimit - usedLines;

        const shouldKeepOnSamePage =
          afterPushRemaining > 0 &&
          Array.isArray(head?.renderLines) &&
          endsWithTerminalHanging(head.renderLines);

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
      continue;
    }
  }

  pushNewPage();

  if (!pages.length) {
    pages.push({
      pageNumber: 1,
      items: [],
    });
  }

  normalizePrintItemBoundaryHanging(pages, htmlOptions);

  return pages;
}

function buildPrintSheetsFromPages(pages, options = {}) {
  const list = Array.isArray(pages) ? pages : [];
  const mode = String(options.printLayoutMode || "single");

  if (mode !== "2up") {
    return list.map((page) => ({
      sheetNumber: page.pageNumber,
      pages: [page],
    }));
  }

  const sheets = [];
  for (let i = 0; i < list.length; i += 2) {
    const first = list[i] || null;
    const second = list[i + 1] || null;

    // DOM順はそのままにして、CSS の direction: rtl で右→左配置する
    const sheetPages = [first, second].filter(Boolean);

    sheets.push({
      sheetNumber: sheets.length + 1,
      pages: sheetPages,
    });
  }

  return sheets;
}

function renderDisplayTokenHtml(token) {
  if (!token) return "";

  const ch = String(token.displayText || "");
  const hangingClass = token.hanging ? " mjm-hanging" : "";
  const punctuationClass =
    token.hanging && /[！？!?]/.test(ch) ? " mjm-hanging-emphasis" : "";

  if (token.type === "ruby") {
    const rubyMetrics = getRubyTokenMetrics(token);
    const typographyAdjustmentsDisabled =
      token.typographyAdjustmentsDisabled === true;

    const pushedTrackBonus = token.rubyTailPushed ? 0.14 : 0;
    const pushedPadBonus = token.rubyTailPushed ? 0.08 : 0;

    const rubyPad = typographyAdjustmentsDisabled
      ? 0
      : Math.min(0.22, rubyMetrics.outerPadEm + pushedPadBonus);

    const rubyTrack = typographyAdjustmentsDisabled
      ? 0
      : Math.min(0.24, rubyMetrics.innerTrackEm + pushedTrackBonus);

    return `<span class="mjm-ruby${hangingClass}${punctuationClass}" style="--mjm-ruby-pad:${rubyPad.toFixed(
      3,
    )}em; --mjm-ruby-track:${rubyTrack.toFixed(
      3,
    )}em;"><span class="mjm-ruby-base">${escapeHtml(
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

function renderDisplayLineHtml(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  if (!tokens.length) return "";

  const rubyClass = lineHasRubyToken(line) ? " mjm-line-has-ruby" : "";
  const hangingEmphasisClass = lineHasHangingEmphasisToken(line)
    ? " mjm-line-has-hanging-emphasis"
    : "";
  const pushoutTailClass = line?.pushoutTailPushed
    ? " mjm-line-tail-pushed"
    : "";

  return `<div class="mjm-line${rubyClass}${hangingEmphasisClass}${pushoutTailClass}">${tokens
    .map((token) => renderDisplayTokenHtml(token))
    .join("")}</div>`;
}

function lineHasHangingEmphasisToken(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];

  return tokens.some((token) => {
    if (!token?.hanging) return false;

    const ch = String(token.displayText || "")[0] || "";
    return /[！？!?]/.test(ch);
  });
}

function lineHasRubyToken(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  return tokens.some((token) => token?.type === "ruby");
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
    .map((line) => renderDisplayLineHtml(line))
    .filter(Boolean)
    .join("")}</div>`;
}

function renderPrintPageItemHtml(item, layoutOptions = {}) {
  if (item?.type === "blank") {
    return `<div class="mjm-blank"></div>`;
  }

  if (item?.type === "heading1") {
    return renderHeadingLinesHtml(
      String(item?.text || ""),
      "mjm-h1 mjm-pageTitle",
      1.4,
      layoutOptions,
    );
  }

  if (item?.type === "heading2") {
    return renderHeadingLinesHtml(
      String(item?.text || ""),
      "mjm-h2",
      1.2,
      layoutOptions,
    );
  }

  if (item?.type === "heading3") {
    return renderHeadingLinesHtml(
      String(item?.text || ""),
      "mjm-h3",
      1.1,
      layoutOptions,
    );
  }

  const lines = Array.isArray(item?.renderLines)
    ? item.renderLines
    : splitTextIntoDisplayLines(String(item?.text || ""), layoutOptions);

  const lineHtml = lines
    .map((line) => renderDisplayLineHtml(line))
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

function estimatePageRubySlackPx(page, layoutOptions = {}) {
  const rubyLineCount = countRubyBearingLinesInPageItems(page?.items || []);
  if (rubyLineCount <= 0) return 0;

  const fontSizePx = Number(
    layoutOptions?.printFontSizePx || layoutOptions?.fontSizePx || 14,
  );

  return Math.min(
    Math.ceil(rubyLineCount * fontSizePx * 0.28),
    Math.ceil(fontSizePx * 3.0),
  );
}

function renderMergedManuscriptPrintPagesHtml(pages, layoutOptions = {}) {
  const printLayoutMode = String(layoutOptions.printLayoutMode || "single");
  const sheets = buildPrintSheetsFromPages(pages, {
    printLayoutMode,
  });

  function renderPageNumberHtml(page) {
    const pageNumber = Number(page?.pageNumber || 0);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) return "";
    return `<div class="printPageNumber" aria-label="page ${pageNumber}">${pageNumber}</div>`;
  }

  if (printLayoutMode === "2up") {
    return `
<div class="printSheets printSheets-2up">
${sheets
  .map(
    (sheet) => `
  <section class="printSheet printSheet-2up">
    ${sheet.pages
      .map(
        (page) => `
    <section class="printPage">
      <div class="printPageBody" style="--page-ruby-slack-px:${estimatePageRubySlackPx(page, layoutOptions)}px;">
        ${page.items
          .map((item) => renderPrintPageItemHtml(item, layoutOptions))
          .join("\n")}
        ${renderPageNumberHtml(page)}
      </div>
    </section>`,
      )
      .join("\n")}
  </section>`,
  )
  .join("\n")}
</div>`.trim();
  }

return `
<div class="printPages">
${pages
  .map((page) => {
    const rubySlackPx = estimatePageRubySlackPx(page, layoutOptions);

    return `
  <section class="printPage">
    <div class="printPageBody" style="--page-ruby-slack-px:${rubySlackPx}px;">
      ${page.items.map((item) => renderPrintPageItemHtml(item, layoutOptions)).join("\n")}
      ${renderPageNumberHtml(page)}
    </div>
  </section>`;
  })
  .join("\n")}
</div>`.trim();
}

function getMergedManuscriptBrowserHtmlStyle(options = {}) {
  const direction = String(options.direction || "horizontal");
  const isVertical = direction === "vertical";

  const fontFamily = String(options.fontFamily || "serif");

  const charsPerLine = Number(options.charsPerLine || 42);
  const linesPerPage = Number(options.linesPerPage || 16);

  const previewFontSizePx = Number(options.fontSizePx || 17);
  const previewLineHeight = Number(options.lineHeight || 1.8);
  const previewScreenLineHeight = Math.max(previewLineHeight + 0.08, 1.92);

  const previewBodyPaddingPx = Number(options.bodyPaddingPx || 24);
  const previewScreenBodyPaddingPx = previewBodyPaddingPx + 6;
  const previewPageMarginMm = Number(options.pageMarginMm || 6);

  const printFontSizePx = Number(options.printFontSizePx || previewFontSizePx);
  const printLineHeight = Number(options.printLineHeight || previewLineHeight);
  const printBodyPaddingPx = Number(options.printBodyPaddingPx ?? 0);
  const printMarginMm = Number(options.printMarginMm ?? 0);

  const htmlPrintOrientation =
    String(options.htmlPrintOrientation || "portrait") === "landscape"
      ? "landscape"
      : "portrait";

  const normalPrintPageSizeCss =
    htmlPrintOrientation === "landscape" ? "A4 landscape" : "A4 portrait";

  const normalPrintPaperWidthMm =
    htmlPrintOrientation === "landscape" ? 297 : 210;

  const normalPrintPaperHeightMm =
    htmlPrintOrientation === "landscape" ? 210 : 297;

  const normalPrintContentBlockMm = Math.max(
    1,
    normalPrintPaperWidthMm - printMarginMm * 2,
  );

  const normalPrintContentInlineMm = Math.max(
    1,
    normalPrintPaperHeightMm - printMarginMm * 2,
  );

  const isTwoUpPrint = String(options.printLayoutMode || "single") === "2up";

  const fallbackPrintPageSizeCss = isTwoUpPrint
    ? "A4 landscape"
    : normalPrintPageSizeCss;

  const fallbackPrintMarginCss = isTwoUpPrint
    ? "8mm 6mm 8mm 10mm"
    : `${printMarginMm}mm`;

  const previewEffectiveLineHeight = Math.max(previewScreenLineHeight, 1.68);

  const printEffectiveLineHeight = Math.max(printLineHeight, 1.62);

  const previewLetterSpacingEm = 0.03;
  const printLetterSpacingEm = 0.035;

  const previewCharStep = Math.round(previewFontSizePx * 1.05);
  const previewLineStep = Math.round(
    previewFontSizePx * previewEffectiveLineHeight,
  );

  const printCharStep = Math.round(printFontSizePx * 1.05);
  const printLineStep = Math.round(printFontSizePx * printEffectiveLineHeight);

  const previewLineStepEm = Math.max(1, previewScreenLineHeight);
  const printLineStepEm = Math.max(1, printLineHeight);

  const inlineWidthScale = 0.955;

  const previewPageNumberRightPx = options.showPageNumbers ? 0 : 0;
  const previewPageNumberBottomPx = options.showPageNumbers ? 2 : 0;

  const printPageNumberRightPx = options.showPageNumbers ? 0 : 0;
  const printPageNumberBottomPx = options.showPageNumbers ? 2 : 0;

  const previewPageNumberFontPx = options.showPageNumbers
    ? Math.max(8, Math.round(previewFontSizePx * 0.62))
    : 0;

  const printPageNumberFontPx = options.showPageNumbers
    ? Math.max(7, Math.round(printFontSizePx * 0.6))
    : 0;

  const previewPageNumberReserveRightPx = options.showPageNumbers
    ? Math.max(24, Math.ceil(previewFontSizePx * 1.25))
    : 0;

  const previewPageNumberReserveBottomPx = options.showPageNumbers
    ? Math.max(30, Math.ceil(previewFontSizePx * 1.55))
    : 0;

  const printPageNumberReserveRightPx = options.showPageNumbers
    ? Math.max(22, Math.ceil(printFontSizePx * 1.25))
    : 0;

  const printPageNumberReserveBottomPx = options.showPageNumbers
    ? Math.max(28, Math.ceil(printFontSizePx * 1.55))
    : 0;
  const pageNumberFooter2upPx = options.showPageNumbers
    ? Math.max(10, Math.ceil(printFontSizePx * 0.9))
    : 0;

  // 2面付けは A4 横の短辺（210mm）から上下余白を除いた高さへ
  // 1ページを収める。通常印刷と同じ文字サイズを無条件で使うと、
  // 行分割は42文字のままでも末尾だけがクリップされるため、利用可能な
  // inline方向の長さから、字間を含む42文字が収まる上限を求める。
  const cssPixelsPerMm = 96 / 25.4;
  const twoUpPageInlineMm = 210 - 16;
  const twoUpInlinePaddingPx = 28 + pageNumberFooter2upPx;
  const twoUpAvailableTextInlinePx = Math.max(
    1,
    twoUpPageInlineMm * cssPixelsPerMm - twoUpInlinePaddingPx,
  );
  const twoUpLineAdvanceEm = Math.max(
    1,
    charsPerLine + Math.max(0, charsPerLine - 1) * printLetterSpacingEm + 0.5,
  );
  const twoUpPrintFontSizePx = Math.min(
    printFontSizePx,
    Math.floor((twoUpAvailableTextInlinePx / twoUpLineAdvanceEm) * 1000) /
      1000,
  );

  const previewLeftSafetyPx = Math.max(6, Math.ceil(previewFontSizePx * 0.42));

  const printLeftSafetyPx = Math.max(4, Math.ceil(printFontSizePx * 0.32));

  const previewPaddingTopPx = previewScreenBodyPaddingPx;
  const previewPaddingRightPx =
    previewScreenBodyPaddingPx + previewPageNumberReserveRightPx;
  const previewPaddingBottomPx =
    previewScreenBodyPaddingPx + previewPageNumberReserveBottomPx;
  const previewPaddingLeftPx =
    previewScreenBodyPaddingPx +
    Math.round(previewFontSizePx * 0.95) +
    previewLeftSafetyPx;

  const previewInlineSafetyPx = Math.max(
    18,
    Math.ceil(previewFontSizePx * 2.4),
  );

  const previewFitScale = (() => {
    const rawHeight =
      Math.round(previewCharStep * charsPerLine * inlineWidthScale) +
      previewPaddingTopPx +
      previewPaddingBottomPx +
      previewInlineSafetyPx;

    const targetHeight = 920;

    if (rawHeight <= targetHeight) return 1;

    return Math.max(0.82, Math.round((targetHeight / rawHeight) * 1000) / 1000);
  })();

  const previewPageInlineSizePx = Math.max(
    320,
    Math.round(previewCharStep * charsPerLine * inlineWidthScale) +
      previewPaddingTopPx +
      previewPaddingBottomPx +
      previewInlineSafetyPx,
  );

  const previewPageBlockSizePx = Math.max(
    220,
    Math.round(previewLineStep * linesPerPage) +
      previewScreenBodyPaddingPx * 2 +
      previewLeftSafetyPx,
  );

  const printInlineSlackPx = Math.ceil(printFontSizePx * 1.2);

  /*
  通常印刷の内部安全幅。
  ユーザー入力には出さず、左端欠け・見出し・ルビのために固定で確保する。
  ここをページごとに変動させると、見出し/ルビの有無で印字範囲が揺れる。
*/
  const printFixedLeftSafetyPx = Math.max(
    10,
    Math.ceil(printFontSizePx * 1.05),
  );

  const printRubyRightSafetyPx = Math.max(
    12,
    Math.ceil(printFontSizePx * 0.95),
  );

  const printPageNumberRightSafetyPx = options.showPageNumbers
    ? Math.max(10, Math.ceil(printFontSizePx * 0.65))
    : 0;

  const printPaddingTopPx = printBodyPaddingPx;

  const printPaddingRightPx =
    printBodyPaddingPx + printRubyRightSafetyPx + printPageNumberRightSafetyPx;

  const printPaddingBottomPx =
    printBodyPaddingPx + printPageNumberReserveBottomPx;

  const printPaddingLeftPx = printBodyPaddingPx + printFixedLeftSafetyPx;

  /*
  縦書きでは inline-size が縦方向、block-size が横方向。
  padding を border-box 内に含める前提で、ページ全体サイズを作る。
*/
  const printTextInlineSizePx = Math.round(
    printCharStep * charsPerLine * inlineWidthScale,
  );

  const printTextBlockSizePx = Math.round(printLineStep * linesPerPage);

  const printPageInlineSizePx = Math.max(
    1,
    printTextInlineSizePx +
      printPaddingTopPx +
      printPaddingBottomPx +
      printInlineSlackPx,
  );

  const printPageBlockSizePx = Math.max(
    1,
    printTextBlockSizePx + printPaddingRightPx + printPaddingLeftPx,
  );

  const printPunctuationSlackPx = Math.max(
    2,
    Math.ceil(printFontSizePx * 0.18),
  );

  return `
@page {
  margin: ${previewPageMarginMm}mm;
}

body {
  margin: 0;
  padding: 32px;
  font-family: "${fontFamily}";
  font-size: ${previewFontSizePx}px;
  line-height: ${previewScreenLineHeight};
  color: #222;
  background: #ececec;
}

.exportDocument {
  margin: 0 auto;
  max-width: 1800px;
}

.exportTitle {
  margin: 0 0 15px;
  font-size: 1.6rem;
  line-height: 1.4;
}

${
  isVertical
    ? `
.printPages {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 28px 20px;
  direction: rtl;
}

.printSheets-2up {
  display: block;
}

.printSheet-2up {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: flex-start;
  gap: 22px;
  direction: rtl;
  margin: 0 auto 28px;
  padding: 6px 0;
  inline-size: fit-content;
  break-after: page;
  page-break-after: always;
}

.printSheet-2up:last-child {
  break-after: auto;
  page-break-after: auto;
}

.printPage {
  direction: ltr;
  flex: 0 0 auto;
  padding: 2px;
  break-after: auto;
  page-break-after: auto;
}

.printPageBody {
  position: relative;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #cfcfcf;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  font-size: ${previewFontSizePx}px;
  --mjm-line-step: ${previewLineStepEm}em;
  --mjm-line-track: ${previewLetterSpacingEm}em;

  padding-top: ${previewPaddingTopPx}px;
  padding-right: ${previewPaddingRightPx}px;
  padding-bottom: ${previewPaddingBottomPx}px;
  padding-left: ${previewPaddingLeftPx}px;

  writing-mode: vertical-rl;
  letter-spacing: ${previewLetterSpacingEm}em;
  line-height: ${previewEffectiveLineHeight};
  text-orientation: mixed;
  inline-size: min(100%, ${previewPageInlineSizePx}px);
  block-size: calc(${previewPageBlockSizePx}px + var(--page-ruby-slack-px, 0px));
  overflow: hidden;
  margin-inline-start: auto;
}

.mjm-h1,
.mjm-h2,
.mjm-h3 {
  margin: 0;
}

.mjm-h1 .mjm-line,
.mjm-h2 .mjm-line,
.mjm-h3 .mjm-line {
  display: block;
  position: relative;
  white-space: nowrap;
  line-height: 1;
  block-size: var(--mjm-line-step, 1.8em);
  overflow: visible;
}

.mjm-h2 .mjm-line,
.mjm-h3 .mjm-line {
  text-indent: 1em;
}

.mjm-h1 .mjm-token,
.mjm-h2 .mjm-token,
.mjm-h3 .mjm-token {
  display: inline;
}

.mjm-line {
  display: block;
  position: relative;
  white-space: nowrap;
  line-height: 1;
  block-size: var(--mjm-line-step, 1.8em);
  overflow: visible;
  --mjm-active-line-track: var(--mjm-line-track, 0em);
  letter-spacing: var(--mjm-active-line-track);
}

.mjm-line-has-hanging-emphasis {
  --mjm-active-line-track: 0.012em;
}

.mjm-line-has-hanging-emphasis {
  --mjm-active-line-track: 0.012em;
}

.mjm-line-tail-pushed {
  --mjm-active-line-track: 0.055em;
}

.mjm-line-has-ruby {
  margin-left: 0;
}

.mjm-line-has-ruby {
  margin-left: 0;
}

.mjm-token,
.mjm-ruby,
.mjm-ruby-base,
.mjm-ruby-text,
.mjm-bouten {
  line-height: 1;
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
  white-space: nowrap;
  vertical-align: top;
  letter-spacing: var(--mjm-active-line-track, 0em);
  padding-inline-start: var(--mjm-ruby-pad, 0em);
  padding-inline-end: var(--mjm-ruby-pad, 0em);
  margin-bottom: -0.16em;
}

.mjm-ruby-base {
  display: inline-block;
  letter-spacing: calc(
    var(--mjm-ruby-track, 0em) + var(--mjm-active-line-track, 0em)
  );
}

.mjm-ruby-text {
  position: absolute;
  z-index: 1;
  inset-block-start: -1.02em;
  inset-inline-start: 47%;
  transform: translateY(-50%);
  font-size: 0.55em;
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

.mjm-gap-before,
.mjm-gap-after {
  margin: 0;
}

.printPageNumber {
  position: absolute;
  right: ${previewPageNumberRightPx}px;
  bottom: ${previewPageNumberBottomPx}px;
  min-width: 1.6em;
  text-align: center;
  line-height: 1;
  font-size: ${previewPageNumberFontPx}px;
  color: #666;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.02em;
  display: ${options.showPageNumbers ? "block" : "none"};
}

.printSheet-2up .printPageNumber {
  right: 8px;
  bottom: 6px;
  font-size: 0.66em;
}

@media screen {
  .printPageBody {
    zoom: ${previewFitScale};
  }

  .printSheet-2up .printPageBody {
    zoom: ${previewFitScale};
  }
}

@media print {
  @page {
    size: ${fallbackPrintPageSizeCss};
    margin: ${fallbackPrintMarginCss};
  }

  @page normalPrintPage {
    size: ${normalPrintPageSizeCss};
    margin: ${printMarginMm}mm;
  }

  body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-size: ${printFontSizePx}px;
    line-height: ${printLineHeight};
  }

  .printPages {
    display: block;
    direction: ltr;
  }

  .printPages .printPageNumber {
    right: ${printPageNumberRightPx}px;
    bottom: ${printPageNumberBottomPx}px;
    min-width: 1.6em;
    text-align: center;
    line-height: 1;
    font-size: ${printPageNumberFontPx}px;
    color: #555;
  }

  .printPage {
    break-after: page;
    page-break-after: always;
    direction: ltr;
  }

  .printPages .printPage {
    page: normalPrintPage;

    width: ${normalPrintContentBlockMm}mm;
    height: ${normalPrintContentInlineMm}mm;

    overflow: hidden;
    margin: 0 auto;
  }

  .printPage:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .printPageBody {
    position: relative;
    box-sizing: border-box;
    border: none !important;
    box-shadow: none !important;
    background: #fff;
    overflow: hidden;
    margin: 0 auto;

    font-size: ${printFontSizePx}px;
    --mjm-line-step: ${printLineStepEm}em;
    --mjm-line-track: ${printLetterSpacingEm}em;

    letter-spacing: ${printLetterSpacingEm}em;
    line-height: ${printEffectiveLineHeight};

    padding-top: ${printPaddingTopPx}px;
    padding-right: ${printPaddingRightPx}px;
    padding-bottom: ${printPaddingBottomPx}px;
    padding-left: ${printPaddingLeftPx}px;

    inline-size: ${normalPrintContentInlineMm}mm;
    block-size: ${normalPrintContentBlockMm}mm;
  }

  .printSheets-2up {
    display: block;
    margin: 0;
    padding: 0;
  }

  @page sheet2up {
    size: A4 landscape;
    margin: 8mm 6mm 8mm 10mm;
  }

  .printSheet-2up {
    page: sheet2up;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 14px;
    direction: rtl;

    margin: 0 !important;
    padding: 0 !important;
    inline-size: fit-content;
    overflow: hidden;

    break-before: auto;
    page-break-before: auto;
  }

  .printSheet-2up:not(:last-child) {
    break-after: page;
    page-break-after: always;
  }

  .printSheet-2up:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .printSheet-2up .printPage {
    direction: ltr;
    padding: 0 !important;
    margin: 0 !important;

    width: auto !important;
    height: auto !important;
    overflow: visible !important;

    break-before: auto !important;
    page-break-before: auto !important;
    break-after: auto !important;
    page-break-after: auto !important;
  }

  .printSheet-2up .printPageNumber {
    right: -2px;
    bottom: 0;
    min-width: 1.4em;
    text-align: center;
    font-size: 0.6em;
    color: #444;
  }

  .printSheet-2up .printPageBody {
    position: relative;
    box-sizing: border-box;
    border: none !important;
    box-shadow: none !important;
    margin: 0;
    overflow: hidden;

    font-size: ${twoUpPrintFontSizePx}px;
    --mjm-line-step: ${printLineStepEm}em;
    --mjm-line-track: ${printLetterSpacingEm}em;

    letter-spacing: ${printLetterSpacingEm}em;
    line-height: ${printEffectiveLineHeight};

    padding-top: 14px;
    padding-right: 14px;
    padding-bottom: ${14 + pageNumberFooter2upPx}px;
    padding-left: ${14 + Math.round(printFontSizePx * 0.7)}px;

    inline-size: calc(210mm - 16mm);
    block-size: calc((297mm - 16mm - 10mm) / 2);
  }
}
`
    : `
.flowBody {
  max-width: 750px;
  margin: 0 auto;
  writing-mode: horizontal-tb;
}

.mjm-gap-before {
  margin-block-start: 1em;
}

.mjm-gap-after {
  margin-block-end: 1em;
}

@media print {
  @page {
    margin: 12mm;
  }

  .mjm-page-break-before {
    break-before: page;
    page-break-before: always;
  }

  .flowBody > .mjm-page-break-before:first-child {
    break-before: auto;
    page-break-before: auto;
  }

  .mjm-h1 {
    margin-block-start: 0;
    margin-block-end: 0;
  }
}
`
}

.mjm-p {
  margin: 0;
  white-space: pre-wrap;
}

.mjm-p-continued {
  margin-block-start: 0;
}

.mjm-h1,
.mjm-h2,
.mjm-h3 {
  font-weight: 700;
}

.mjm-h1 { font-size: 1.38em; }
.mjm-h2 { font-size: 1.18em; }
.mjm-h3 { font-size: 1.08em; }

.mjm-blank {
  block-size: 1.35em;
}

.flowBody .mjm-bouten {
  text-emphasis: filled sesame;
  -webkit-text-emphasis: filled sesame;
}

@media print {
  body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
  }

  .exportDocument {
    margin: 0;
  }

  .printPage {
    padding: 0 !important;
  }
}

@media screen and (max-width: 1100px) {
  body {
    padding: 20px;
  }

  .printPages {
    gap: 20px 16px;
  }

  .printPageBody {
    box-shadow: none;
  }

  .printSheet-2up {
    gap: 16px;
  }
}
`.trim();
}

function renderMergedManuscriptBrowserHtml(mergedData, options = {}) {
  const title = String(mergedData?.workName || "作品");
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const configPunctuationLayoutMode = String(
    cfg.get("verticalPunctuationLayout", "hanging") || "hanging",
  ).trim();
  const configUseTypographyAdjustments =
    cfg.get("useTypographyAdjustments", true) !== false;

  const optionPunctuationLayoutMode = String(
    options.punctuationLayoutMode || "",
  ).trim();

  const punctuationLayoutMode =
    optionPunctuationLayoutMode === "pushout"
      ? "pushout"
      : optionPunctuationLayoutMode === "hanging"
        ? "hanging"
        : configPunctuationLayoutMode === "pushout"
          ? "pushout"
          : "hanging";
  const useTypographyAdjustments =
    typeof options.useTypographyAdjustments === "boolean"
      ? options.useTypographyAdjustments
      : configUseTypographyAdjustments;

  const resolvedHtmlOptions = resolveMergedManuscriptHtmlOptions(
    mergedData,
    options,
  );

  const htmlOptions = {
    ...resolvedHtmlOptions,

    // パネル側の簡易印刷設定は resolveMergedManuscriptHtmlOptions 側で
    // 落ちる可能性があるため、ここで明示的に戻す。
    htmlPrintLayoutMode:
      String(
        options.htmlPrintLayoutMode ||
          resolvedHtmlOptions.htmlPrintLayoutMode ||
          "single",
      ) === "2up"
        ? "2up"
        : "single",

    htmlPrintOrientation:
      String(
        options.htmlPrintOrientation ||
          resolvedHtmlOptions.htmlPrintOrientation ||
          "portrait",
      ) === "landscape"
        ? "landscape"
        : "portrait",

    showPageNumbers: options.showPageNumbers === true,

    printFontSizePx: Number(
      options.printFontSizePx || resolvedHtmlOptions.printFontSizePx,
    ),
    printLineHeight: Number(
      options.printLineHeight || resolvedHtmlOptions.printLineHeight,
    ),
    printMarginMm: Number(
      options.printMarginMm ?? resolvedHtmlOptions.printMarginMm ?? 0,
    ),
    printBodyPaddingPx: Number(
      options.printBodyPaddingPx ?? resolvedHtmlOptions.printBodyPaddingPx ?? 0,
    ),

    punctuationLayoutMode,
    useTypographyAdjustments,
  };

  let bodyHtml = "";
  if (htmlOptions.direction === "vertical") {
    const pages = buildMergedManuscriptPrintPages(
      mergedData,
      htmlOptions,
      options,
    );
    bodyHtml = renderMergedManuscriptPrintPagesHtml(pages, htmlOptions);
  } else {
    bodyHtml = `<div class="flowBody">${renderMergedManuscriptHtmlBody(mergedData, options)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${getMergedManuscriptBrowserHtmlStyle(htmlOptions)}
</style>
</head>
<body>
<main class="exportDocument">
  ${bodyHtml}
</main>
</body>
</html>`;
}

module.exports = {
  renderMergedManuscriptBrowserHtml,
};
