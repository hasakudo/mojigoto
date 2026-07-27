function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countRubyChars(text) {
  return Array.from(String(text || "")).length;
}

function renderDisplayTokenHtml(token, renderOptions = {}) {
  if (!token) return "";

  const ch = String(token.displayText || "");
  const hangingClass = token.hanging ? " mjm-hanging" : "";
  const punctuationClass =
    token.hanging && /[！？!?]/.test(ch) ? " mjm-hanging-emphasis" : "";

  if (token.type === "ruby") {
    const typographyAdjustmentsDisabled =
      token.typographyAdjustmentsDisabled === true;
    const rubyLen = countRubyChars(token.rubyText || "");
    const baseLen = countRubyChars(token.displayText || "");
    const lineTrack = Math.max(0, Number(renderOptions.lineTrackEm || 0));
    const rubyKindClass = rubyLen <= 4 ? " mjm-ruby-short" : " mjm-ruby-long";
    const pushedClass = token.rubyTailPushed ? " mjm-ruby-tail-pushed" : "";

    const metrics = getRubyTokenMetrics(token);

    const pushedTrackBonus = token.rubyTailPushed ? 0.14 : 0;
    const pushedPadBonus = token.rubyTailPushed ? 0.08 : 0;

    const rubyPad = typographyAdjustmentsDisabled
      ? 0
      : Math.min(0.22, metrics.outerPadEm + pushedPadBonus);
    const rubyTrack = typographyAdjustmentsDisabled
      ? 0
      : Math.min(0.24, metrics.innerTrackEm + pushedTrackBonus);

    const unscaledBaseAdvanceEm =
      baseLen +
      rubyPad * 2 +
      (rubyTrack + lineTrack) * Math.max(0, baseLen - 1);

    // ON時はショート／ロングとも親文字の送り幅を約11.8%縮める。
    const baseAdvanceEm = typographyAdjustmentsDisabled
      ? unscaledBaseAdvanceEm
      : unscaledBaseAdvanceEm * 0.882;

    const adjustedRubyAdvanceEm = Math.max(
      unscaledBaseAdvanceEm,
      metrics.rubyVisualWidth,
      baseLen,
    );

    // ショートルビはON時の最終占有幅そのものを半分にする。
    const rubyAdvanceEm = typographyAdjustmentsDisabled
      ? baseAdvanceEm
      : rubyLen <= 4
        ? adjustedRubyAdvanceEm * 0.5
        : adjustedRubyAdvanceEm;

    return `<ruby class="mjm-ruby${rubyKindClass}${pushedClass}${hangingClass}" style="--rubyBaseLen:${baseLen}; --rubyBaseAdvance:${baseAdvanceEm.toFixed(
      3,
    )}em; --rubyAdvance:${rubyAdvanceEm.toFixed(
      3,
    )}em; --rubyPad:${rubyPad.toFixed(
      3,
    )}em; --rubyTrack:${rubyTrack.toFixed(
      3,
    )}em; --rubyLineTrack:${lineTrack.toFixed(3)}em;"><rb>${escapeHtml(
      token.displayText,
    )}</rb><rt>${escapeHtml(token.rubyText || "")}</rt></ruby>`;
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

function lineHasHangingEmphasisToken(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];

  return tokens.some((token) => {
    if (!token?.hanging) return false;

    const ch = String(token.displayText || "")[0] || "";
    return /[！？!?]/.test(ch);
  });
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
  const lineTrackEm = line?.pushoutTailPushed
    ? 0.055
    : lineHasHangingEmphasisToken(line)
      ? 0.012
      : 0.03;

  return `<div class="mjm-line${rubyClass}${hangingEmphasisClass}${pushoutTailClass}">${tokens
    .map((token) => renderDisplayTokenHtml(token, { lineTrackEm }))
    .join("")}</div>`;
}

function tokenizeMojigotoDisplayUnits(text) {
  const input = String(text || "");
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === "\n") {
      tokens.push({
        type: "newline",
        raw: "\n",
        displayText: "\n",
        displayWidth: 0,
      });
      i += 1;
      continue;
    }

    if (input.startsWith("《《", i)) {
      const end = input.indexOf("》》", i + 2);
      if (end !== -1) {
        const body = input.slice(i + 2, end);
        const boutenChars = Array.from(body);

        // 傍点語句を一つの inline-block にすると、複数文字が一字幅へ
        // 押し込まれる。文字単位のトークンにして、通常文字と同じ単位で
        // 行分割・字送りできるようにする。raw を分配するため、行の再構成時も
        // 元の《《...》》記法を失わない。
        if (boutenChars.length === 0) {
          tokens.push({
            type: "bouten",
            raw: input.slice(i, end + 2),
            displayText: "",
            displayWidth: 0,
          });
        } else {
          boutenChars.forEach((boutenChar, index) => {
            const isFirst = index === 0;
            const isLast = index === boutenChars.length - 1;
            tokens.push({
              type: "bouten",
              raw: `${isFirst ? "《《" : ""}${boutenChar}${
                isLast ? "》》" : ""
              }`,
              displayText: boutenChar,
              displayWidth: 1,
            });
          });
        }
        i = end + 2;
        continue;
      }
    }

    if (ch === "|" || ch === "｜") {
      const rubyStart = i + 1;
      const rubyMark = input.indexOf("《", rubyStart);
      const rubyEnd = rubyMark !== -1 ? input.indexOf("》", rubyMark + 1) : -1;

      if (rubyMark !== -1 && rubyEnd !== -1) {
        const base = input.slice(rubyStart, rubyMark);
        const ruby = input.slice(rubyMark + 1, rubyEnd);

        tokens.push({
          type: "ruby",
          raw: input.slice(i, rubyEnd + 1),
          displayText: base,
          rubyText: ruby,
          displayWidth: [...base].length,
        });
        i = rubyEnd + 1;
        continue;
      }
    }

    const rubyMark = input.indexOf("《", i);
    const rubyEnd = rubyMark !== -1 ? input.indexOf("》", rubyMark + 1) : -1;
    const isDoubleAngleRubyLike =
      rubyMark !== -1 && input.startsWith("《《", rubyMark);

    if (rubyMark === i + 1 && rubyEnd !== -1 && !isDoubleAngleRubyLike) {
      const base = input[i];
      const ruby = input.slice(rubyMark + 1, rubyEnd);

      tokens.push({
        type: "ruby",
        raw: input.slice(i, rubyEnd + 1),
        displayText: base,
        rubyText: ruby,
        displayWidth: [...base].length,
      });
      i = rubyEnd + 1;
      continue;
    }

    tokens.push({
      type: "char",
      raw: ch,
      displayText: ch,
      displayWidth: 1,
    });
    i += 1;
  }

  return tokens;
}

function getVerticalPunctuationLayoutMode(value = "hanging") {
  const mode = String(value || "").trim();
  return mode === "pushout" ? "pushout" : "hanging";
}

function useTypographyAdjustments(layoutOptions = {}) {
  return layoutOptions?.useTypographyAdjustments !== false;
}

function cloneLinesWithoutTypographyAdjustments(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    tokens: (Array.isArray(line?.tokens) ? line.tokens : []).map((token) => ({
      ...token,
      typographyAdjustmentsDisabled: true,
    })),
    hardBreak: !!line?.hardBreak,
  }));
}

function isHangingChar(ch, layoutMode = "hanging") {
  const value = String(ch || "");

  if (layoutMode === "pushout") {
    return /[、。，．）］｝〉》」』】！？!?]/.test(value);
  }

  return /[、。，．]/.test(value);
}

function isPushOutLeadingChar(ch, layoutMode = "hanging") {
  const value = String(ch || "");

  if (layoutMode === "pushout") {
    return false;
  }

  return /[」』】）］｝〉》！？!?]/.test(value);
}

function getEffectiveCharsPerLine(layoutOptions = {}) {
  const charsPerLine = Number(layoutOptions.charsPerLine || 42);
  return Math.max(1, charsPerLine);
}

function splitTextIntoLinesCore(
  text,
  layoutOptions = {},
  { applyHanging = true } = {},
) {
  const charsPerLine = getEffectiveCharsPerLine(layoutOptions);
  const punctuationLayoutMode = getVerticalPunctuationLayoutMode(
    layoutOptions.punctuationLayoutMode || "hanging",
  );
  const shouldAdjustTypography = useTypographyAdjustments(layoutOptions);
  const tokens = tokenizeMojigotoDisplayUnits(text);

  const lines = [];
  let current = [];
  let width = 0;

  function tokenMeasureWidthOf(token) {
    if (applyHanging && token?.hanging) return 0;
    return Number(token?.displayWidth || 0);
  }

  function tokenFirstChar(token) {
    return String(token?.displayText || "")[0] || "";
  }

  function pushCurrentLine(hardBreak = false) {
    lines.push({
      tokens: current,
      hardBreak,
    });
    current = [];
    width = 0;
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "newline") {
      pushCurrentLine(true);
      continue;
    }

    const w = tokenMeasureWidthOf(token);

    if (current.length === 0) {
      current.push({ ...token });
      width += w;
      continue;
    }

    if (width + w <= charsPerLine) {
      current.push({ ...token });
      width += w;
      continue;
    }

    const ch = tokenFirstChar(token);

    if (
      shouldAdjustTypography &&
      applyHanging &&
      isHangingChar(ch, punctuationLayoutMode)
    ) {
      current.push({ ...token, hanging: true });
      pushCurrentLine(false);
      continue;
    }

    if (
      shouldAdjustTypography &&
      isPushOutLeadingChar(ch, punctuationLayoutMode) &&
      current.length > 0 &&
      !current[current.length - 1]?.hanging
    ) {
      const movedToken = current.pop();
      width -= tokenMeasureWidthOf(movedToken);

      pushCurrentLine(false);

      current.push({ ...movedToken });
      width += tokenMeasureWidthOf(movedToken);

      current.push({ ...token });
      width += tokenMeasureWidthOf(token);
      continue;
    }

    pushCurrentLine(false);
    current.push({ ...token });
    width += tokenMeasureWidthOf(token);
  }

  if (current.length > 0 || lines.length === 0) {
    pushCurrentLine(false);
  }

  if (shouldAdjustTypography && applyHanging) {
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1];
      const curr = lines[i];

      if (!prev || !curr) continue;
      if (prev.hardBreak) continue;

      const currTokens = Array.isArray(curr?.tokens) ? curr.tokens : [];
      if (!currTokens.length) continue;

      const hasOnlyHangingTokens = currTokens.every((token) =>
        isHangingChar(
          String(token?.displayText || "")[0] || "",
          punctuationLayoutMode,
        ),
      );

      if (!hasOnlyHangingTokens) continue;

      for (const token of currTokens) {
        prev.tokens.push({ ...token, hanging: true });
      }

      curr.tokens = [];
    }
  }

  const normalized = [];

  for (const line of lines) {
    const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
    if (tokens.length > 0 || line?.hardBreak) {
      normalized.push({
        tokens: [...tokens],
        hardBreak: !!line?.hardBreak,
      });
    }
  }

  return normalized.length ? normalized : [{ tokens: [], hardBreak: false }];
}

function countDisplayChars(text) {
  return Array.from(String(text || "")).length;
}

function getRubyTokenMetrics(token) {
  const baseLen = countDisplayChars(token?.displayText || "");
  const rubyLen = countDisplayChars(token?.rubyText || "");

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

  // 書き出し側と同じ基準：
  // 2文字+5文字、3文字+7文字あたりから末尾送り対象にする。
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

  const baseLen = countDisplayChars(token.displayText || "");
  const rubyLen = countDisplayChars(token.rubyText || "");

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

function getLineMeasureWidth(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  return getLineTokenMeasureWidth(tokens);
}

function getLineWideRubyOverflowScore(line) {
  const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
  let score = 0;

  for (const token of tokens) {
    if (!isWideRubyToken(token)) continue;

    const baseLen = countDisplayChars(token.displayText || "");
    const rubyLen = countDisplayChars(token.rubyText || "");
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

  // 追い込みではなく、ぶら下げ時だけ
  // 「閉じ括弧・感嘆符などが行頭に来る」ことを回避する。
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

    // 閉じ括弧・感嘆符の前へ、前行末の1文字を送る。
    current.tokens.unshift(movedToken);

    // この行は、空いたぶんを後続から詰め直さない。
    // 代わりに字間を広げて余白を均す。
    prev.noRefillAfterPushOut = true;
    prev.pushoutTailPushed = true;
  }

  return out;
}

function normalizeFinalPushOutLeadingLineStarts(lines, layoutOptions = {}) {
  const punctuationLayoutMode = getVerticalPunctuationLayoutMode(
    layoutOptions.punctuationLayoutMode || "hanging",
  );

  // ぶら下げ設定の時だけ：
  // 」』）！？ が最終的に行頭へ来た場合、
  // 前行末の1文字と一緒に次行へ送る。
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

    const prevTokens = Array.isArray(prev.tokens) ? prev.tokens : [];
    const currentTokens = Array.isArray(current.tokens) ? current.tokens : [];

    if (!prevTokens.length || !currentTokens.length) continue;

    const firstChar = getTokenFirstChar(currentTokens[0]);

    if (!isPushOutLeadingChar(firstChar, punctuationLayoutMode)) {
      continue;
    }

    const moved = getLastMovableToken(prevTokens);
    if (!moved) continue;

    const [movedToken] = prevTokens.splice(moved.index, 1);

    currentTokens.unshift(movedToken);

    prev.noRefillAfterPushOut = true;
    prev.pushoutTailPushed = true;
  }

  return out.filter((line) => {
    if (line.hardBreak) return true;
    return Array.isArray(line.tokens) && line.tokens.length > 0;
  });
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

    // 行頭に残った句読点・閉じ記号を前行へぶら下げる
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

    // 空いたぶんを後続行から詰め直す
    // ただし長いルビで末尾送りした行は、無理に再充填しない。
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

function normalizePreviewDisplayLines(lines, layoutOptions = {}) {
  if (!useTypographyAdjustments(layoutOptions)) {
    return cloneLinesWithoutTypographyAdjustments(lines)
      .filter((line) => line.hardBreak || line.tokens.length > 0);
  }

  const rubyNormalizedLines = normalizeWideRubyLineEnds(lines, layoutOptions);

  const pushOutNormalizedLines = normalizePushOutLeadingLineStarts(
    rubyNormalizedLines,
    layoutOptions,
  );

  return normalizeLeadingHangingLineStarts(
    pushOutNormalizedLines,
    layoutOptions,
  );
}

function splitTextIntoDisplayLines(text, layoutOptions = {}) {
  const baseLines = splitTextIntoLinesCore(text, layoutOptions, {
    applyHanging: false,
  });

  const normalizedLines = normalizePreviewDisplayLines(
    baseLines,
    layoutOptions,
  );

  return getVisibleRenderLines(normalizedLines, layoutOptions);
}

function splitTextIntoMeasureLines(text, layoutOptions = {}) {
  return splitTextIntoLinesCore(text, layoutOptions, {
    applyHanging: false,
  });
}

function applyHangingWithinFixedLines(lines, layoutOptions = {}) {
  const punctuationLayoutMode = getVerticalPunctuationLayoutMode(
    layoutOptions.punctuationLayoutMode || "hanging",
  );
  const charsPerLine = getEffectiveCharsPerLine(layoutOptions);

  const out = (Array.isArray(lines) ? lines : []).map((line) => ({
    tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
    hardBreak: !!line?.hardBreak,
    reflowCredit: 0,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
    noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
    pushoutTailPushed: !!line?.pushoutTailPushed,
  }));

  function tokenFirstChar(token) {
    return String(token?.displayText || "")[0] || "";
  }

  function tokenWidth(token) {
    if (token?.hanging) return 0;
    return Number(token?.displayWidth || 0);
  }

  function lineWidth(line) {
    const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
    return tokens.reduce((sum, token) => sum + tokenWidth(token), 0);
  }

  // 1. 先頭句読点のぶら下げを前行へ移し、次行に reflowCredit を記録
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const curr = out[i];

    if (!prev || !curr) continue;
    if (prev.hardBreak) continue;
    if (!curr.tokens.length) continue;

    const currTokens = curr.tokens;
    const leadingHangingCount = currTokens.findIndex(
      (token) => !isHangingChar(tokenFirstChar(token), punctuationLayoutMode),
    );

    const moveCount =
      leadingHangingCount === -1 ? currTokens.length : leadingHangingCount;

    if (moveCount <= 0) continue;

    let movedWidth = 0;
    for (let j = 0; j < moveCount; j++) {
      const token = currTokens[j];
      movedWidth += Number(token?.displayWidth || 0);
      prev.tokens.push({ ...token, hanging: true });
    }

    curr.tokens = currTokens.slice(moveCount);
    curr.reflowCredit += movedWidth;
  }

  // 2. 段落内で文が続く場合だけ、空いたぶんを後続行から詰める
  for (let i = 0; i < out.length - 1; i++) {
    const current = out[i];
    if (!current) continue;
    if (current.hardBreak) continue;

    let remainingCredit = Number(current.reflowCredit || 0);
    if (remainingCredit <= 0) continue;

    while (remainingCredit > 0) {
      const next = out[i + 1];
      if (!next || !Array.isArray(next.tokens) || !next.tokens.length) break;

      const nextFirst = next.tokens[0];
      const nextWidth = Number(nextFirst?.displayWidth || 0);
      if (nextWidth <= 0) break;

      const currentWidth = lineWidth(current);
      if (currentWidth + nextWidth > charsPerLine) break;

      current.tokens.push({ ...nextFirst });
      next.tokens.shift();

      remainingCredit -= nextWidth;
      next.reflowCredit += nextWidth;

      if (!next.tokens.length && !next.hardBreak) {
        out.splice(i + 1, 1);
      }
    }

    current.reflowCredit = 0;
  }

  return out.map((line) => ({
    tokens: Array.isArray(line?.tokens) ? line.tokens : [],
    hardBreak: !!line?.hardBreak,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
    noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
    pushoutTailPushed: !!line?.pushoutTailPushed,
  }));
}

function getVisibleRenderLines(lines, layoutOptions = {}) {
  if (!useTypographyAdjustments(layoutOptions)) {
    return cloneLinesWithoutTypographyAdjustments(lines)
      .filter((line) => line.tokens.length > 0);
  }

  const renderLines = applyHangingWithinFixedLines(lines, layoutOptions);

  const finalLines = normalizeFinalPushOutLeadingLineStarts(
    renderLines,
    layoutOptions,
  );

  return finalLines.filter((line) => {
    const tokens = Array.isArray(line?.tokens) ? line.tokens : [];
    return tokens.length > 0;
  });
}

function joinDisplayLineTokensToRaw(lines) {
  let out = "";

  for (const line of lines) {
    const lineTokens = Array.isArray(line?.tokens) ? line.tokens : [];
    out += lineTokens.map((token) => token.raw || "").join("");

    if (line?.hardBreak) {
      out += "\n";
    }
  }

  return out;
}

function moveLeadingHangingAcrossPageBoundary(
  headLines,
  tailLines,
  layoutOptions = {},
) {
  const punctuationLayoutMode = getVerticalPunctuationLayoutMode(
    layoutOptions.punctuationLayoutMode || "hanging",
  );

  const head = (Array.isArray(headLines) ? headLines : []).map((line) => ({
    tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
    hardBreak: !!line?.hardBreak,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
    noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
    pushoutTailPushed: !!line?.pushoutTailPushed,
  }));

  const tail = (Array.isArray(tailLines) ? tailLines : []).map((line) => ({
    tokens: Array.isArray(line?.tokens) ? [...line.tokens] : [],
    hardBreak: !!line?.hardBreak,
    noRefillAfterWideRuby: !!line?.noRefillAfterWideRuby,
    noRefillAfterPushOut: !!line?.noRefillAfterPushOut,
    pushoutTailPushed: !!line?.pushoutTailPushed,
  }));

  if (!useTypographyAdjustments(layoutOptions)) {
    return { headLines: head, tailLines: tail };
  }

  if (!head.length || !tail.length) {
    return { headLines: head, tailLines: tail };
  }

  function getLastNonEmptyLine(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (Array.isArray(line?.tokens) && line.tokens.length > 0) {
        return line;
      }
    }
    return null;
  }

  function getFirstNonEmptyLine(lines) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (Array.isArray(line?.tokens) && line.tokens.length > 0) {
        return line;
      }
    }
    return null;
  }

  function getLastMovableTokenIndex(tokens) {
    const list = Array.isArray(tokens) ? tokens : [];

    for (let i = list.length - 1; i >= 0; i -= 1) {
      const token = list[i];
      if (!token) continue;
      if (token.hanging) continue;
      if (token.type === "newline") continue;
      return i;
    }

    return -1;
  }

  const lastHead = getLastNonEmptyLine(head);
  const firstTail = getFirstNonEmptyLine(tail);

  if (!lastHead || !firstTail) {
    return { headLines: head, tailLines: tail };
  }

  if (lastHead.hardBreak) {
    return { headLines: head, tailLines: tail };
  }

  const firstTailTokens = Array.isArray(firstTail.tokens)
    ? firstTail.tokens
    : [];

  if (!firstTailTokens.length) {
    return { headLines: head, tailLines: tail };
  }

  const firstChar = String(firstTailTokens[0]?.displayText || "")[0] || "";

  // ぶら下げ設定時：
  // 」』）！？ などが次ページ・次段・次段落の行頭に来る場合は、
  // 前側の行末1文字を一緒に次へ送る。
  if (isPushOutLeadingChar(firstChar, punctuationLayoutMode)) {
    const moveIndex = getLastMovableTokenIndex(lastHead.tokens);

    if (moveIndex < 0) {
      return { headLines: head, tailLines: tail };
    }

    const [movedToken] = lastHead.tokens.splice(moveIndex, 1);
    firstTail.tokens.unshift(movedToken);

    lastHead.noRefillAfterPushOut = true;
    lastHead.pushoutTailPushed = true;

    return { headLines: head, tailLines: tail };
  }

  // 通常の句読点 、。 は従来どおり前側へぶら下げる。
  let moveCount = 0;

  while (moveCount < firstTailTokens.length) {
    const ch = String(firstTailTokens[moveCount]?.displayText || "")[0] || "";

    if (!isHangingChar(ch, punctuationLayoutMode)) break;
    if (isPushOutLeadingChar(ch, punctuationLayoutMode)) break;

    moveCount += 1;
  }

  if (moveCount <= 0) {
    return { headLines: head, tailLines: tail };
  }

  for (let i = 0; i < moveCount; i += 1) {
    lastHead.tokens.push({
      ...firstTailTokens[i],
      hanging: true,
    });
  }

  firstTail.tokens = firstTailTokens.slice(moveCount);

  return { headLines: head, tailLines: tail };
}

module.exports = {
  renderDisplayTokenHtml,
  renderDisplayLineHtml,
  tokenizeMojigotoDisplayUnits,
  getVerticalPunctuationLayoutMode,
  useTypographyAdjustments,
  isHangingChar,
  isPushOutLeadingChar,
  getEffectiveCharsPerLine,
  splitTextIntoLinesCore,
  splitTextIntoDisplayLines,
  splitTextIntoMeasureLines,
  applyHangingWithinFixedLines,
  getVisibleRenderLines,
  joinDisplayLineTokensToRaw,
  moveLeadingHangingAcrossPageBoundary,

  countDisplayChars,
  getRubyTokenMetrics,
  getRubyVisualMeasureWidth,
  normalizeWideRubyLineEnds,
  normalizePushOutLeadingLineStarts,
  normalizeFinalPushOutLeadingLineStarts,
  normalizeLeadingHangingLineStarts,
  normalizePreviewDisplayLines,
};
