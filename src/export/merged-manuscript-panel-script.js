const { pxToPt } = require("./merged-manuscript-panel-state");

// Webview内で動作するスクリプト。初期値だけをホストから受け取る。
function getPanelScript(state, resetState) {
  return `
    const vscode = acquireVsCodeApi();

    function savePanelUiState() {
      if (exportModeEl && exportModeEl.value === "real") {
        updateSavedRealPrintStateFromCurrentInputs();
      } else {
        updateSavedSimpleStateFromCurrentInputs();
      }

      const currentRealPrintPageSize = realPrintPageSizeEl
        ? normalizeRealPrintSizeKey(realPrintPageSizeEl.value)
        : "b6";

      const currentRealPrintColumnMode = realPrintColumnModeEl
        ? normalizeRealPrintColumnMode(
            realPrintColumnModeEl.value,
            currentRealPrintPageSize,
          )
        : "single";

      const nextState = {
        exportMode: exportModeEl ? exportModeEl.value : "simple",
        realPrintPageSize: currentRealPrintPageSize,
        realPrintColumnMode: currentRealPrintColumnMode,
        useTypographyAdjustments:
          !useTypographyAdjustmentsEl || useTypographyAdjustmentsEl.checked,
        punctuationLayoutMode:
          punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",

        simpleSavedByLayout,
        realPrintSavedBySize,
      };

      const current = vscode.getState() || {};
      vscode.setState({
        ...current,
        ...nextState,
      });

      vscode.postMessage({
        type: "persistUiState",
        state: nextState,
      });
    }

    function restorePanelUiState() {
      const saved = vscode.getState() || {};

      if (saved.exportMode === "real" || saved.exportMode === "simple") {
        exportModeEl.value = saved.exportMode;
      }
      if (
        useTypographyAdjustmentsEl &&
        typeof saved.useTypographyAdjustments === "boolean"
      ) {
        useTypographyAdjustmentsEl.checked = saved.useTypographyAdjustments;
      }
      if (saved.punctuationLayoutMode) {
        punctuationLayoutModeEl.value =
          saved.punctuationLayoutMode === "pushout" ? "pushout" : "hanging";
      }
    }

    const defaultState = {
      htmlPrintLayoutMode: ${JSON.stringify(resetState.htmlPrintLayoutMode)},
      htmlPrintOrientation: ${JSON.stringify(resetState.htmlPrintOrientation || "portrait")},
      showPageNumbers: ${resetState.showPageNumbers ? "true" : "false"},
      printFontSizePt: ${JSON.stringify(pxToPt(resetState.printFontSizePx))},
      printLineHeight: ${JSON.stringify(resetState.printLineHeight)},
      printMarginMm: ${JSON.stringify(resetState.printMarginMm)},
      printBodyPaddingPx: ${JSON.stringify(resetState.printBodyPaddingPx)},
      charsPerLine: ${JSON.stringify(resetState.charsPerLine)},
      linesPerPage: ${JSON.stringify(resetState.linesPerPage)},
      punctuationLayoutMode: ${JSON.stringify(resetState.punctuationLayoutMode)},
      useTypographyAdjustments: ${resetState.useTypographyAdjustments !== false ? "true" : "false"},

      exportMode: ${JSON.stringify(resetState.exportMode)},
      realPrintPageSize: ${JSON.stringify(resetState.realPrintPageSize)},
      realPrintFontSizePt: ${JSON.stringify(resetState.realPrintFontSizePt)},

      realPrintColumnMode: ${JSON.stringify(resetState.realPrintColumnMode || "single")},
      realPrintColumnGapMm: ${JSON.stringify(resetState.realPrintColumnGapMm || 0)},

      realPrintBleedMm: ${JSON.stringify(resetState.realPrintBleedMm || 0)},
      realPrintBleedMode: ${JSON.stringify(resetState.realPrintBleedMode || "all")},
      realPrintMirrorMargins: ${resetState.realPrintMirrorMargins !== false ? "true" : "false"},
      realPrintStartPageSide: ${JSON.stringify(resetState.realPrintStartPageSide || "odd")},

      realPrintBookOptionsEnabled: ${resetState.realPrintBookOptionsEnabled ? "true" : "false"},
      realPrintShowPageNumber: ${resetState.realPrintShowPageNumber ? "true" : "false"},
      realPrintPageNumberStart: ${JSON.stringify(resetState.realPrintPageNumberStart || 1)},
      realPrintShowHeading1: ${resetState.realPrintShowHeading1 ? "true" : "false"},
      realPrintHeading1Mode: ${JSON.stringify(resetState.realPrintHeading1Mode || "all")},
      realPrintHeaderOrder: ${JSON.stringify(resetState.realPrintHeaderOrder || "numberTitle")},
      realPrintHeaderPosition: ${JSON.stringify(resetState.realPrintHeaderPosition || "bottom")},

      realPrintMarginTopMm: ${JSON.stringify(resetState.realPrintMarginTopMm)},
      realPrintMarginBottomMm: ${JSON.stringify(resetState.realPrintMarginBottomMm)},
      realPrintMarginRightMm: ${JSON.stringify(resetState.realPrintMarginRightMm)},
      realPrintMarginLeftMm: ${JSON.stringify(resetState.realPrintMarginLeftMm)},
      realPrintCharsPerLine: ${JSON.stringify(resetState.realPrintCharsPerLine)},
      realPrintLinesPerPage: ${JSON.stringify(resetState.realPrintLinesPerPage)},
    };

    let realPrintSavedBySize = cleanupRealPrintSavedByLayout(
      ${JSON.stringify(state.realPrintSavedBySize || {})},
    );

    let simpleSavedByLayout =
      ${JSON.stringify(state.simpleSavedByLayout || {})};

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

    const layoutModeEl = document.getElementById("layoutMode");
    const showPageNumbersEl = document.getElementById("showPageNumbers");
    const printFontSizePtEl = document.getElementById("printFontSizePt");
    const printLineHeightEl = document.getElementById("printLineHeight");
    const printMarginMmEl = document.getElementById("printMarginMm");
    const printBodyPaddingPxEl = document.getElementById("printBodyPaddingPx");
    const htmlPrintOrientationEl = document.getElementById("htmlPrintOrientation");

    const errorBoxEl = document.getElementById("errorBox");
    const footerStatusBoxEl = document.getElementById("footerStatusBox");
    const charsPerLineEl = document.getElementById("charsPerLine");
    const linesPerPageEl = document.getElementById("linesPerPage");
    const punctuationLayoutModeEl = document.getElementById("punctuationLayoutMode");
    const useTypographyAdjustmentsEl = document.getElementById("useTypographyAdjustments");
    const currentTypographyAdjustmentsEl = document.getElementById("currentTypographyAdjustments");

    const resetButtonEl = document.getElementById("resetButton");
    const cancelButtonEl = document.getElementById("cancelButton");
    const submitButtonEl = document.getElementById("submitButton");

    const singleOnlyFieldsEl = document.getElementById("singleOnlyFields");
    const singleModeNotesEl = document.getElementById("singleModeNotes");
    const twoUpNoticeBoxEl = document.getElementById("twoUpNoticeBox");

    const currentCharsPerLineEl = document.getElementById("currentCharsPerLine");
    const currentLinesPerPageEl = document.getElementById("currentLinesPerPage");
    const currentFontFamilyEl = document.getElementById("currentFontFamily");
    const currentPunctuationLayoutEl = document.getElementById("currentPunctuationLayout");

    const simplePrintWarningBoxEl = document.getElementById("simplePrintWarningBox");
    const simplePrintWarningMessagesEl = document.getElementById("simplePrintWarningMessages");
    const openSimpleGuideButtonEl = document.getElementById("openSimpleGuideButton");

    const exportModeEl = document.getElementById("exportMode");
    const exportModeHintEl = document.getElementById("exportModeHint");
    const simpleRightPaneEl = document.getElementById("simpleRightPane");
    const simpleLeftPaneEl = document.getElementById("simpleLeftPane");

    const realPrintFieldsEl = document.getElementById("realPrintFields");
    const realPrintPageSizeEl = document.getElementById("realPrintPageSize");

    const realPrintColumnModeEl = document.getElementById("realPrintColumnMode");
    const realPrintColumnGapMmEl = document.getElementById("realPrintColumnGapMm");
    const realPrintColumnGapRowEl = document.getElementById("realPrintColumnGapRow");
    const realPrintColumnModeHintEl = document.getElementById("realPrintColumnModeHint");
    const realPrintLinesPerPageLabelEl = document.getElementById("realPrintLinesPerPageLabel");

    const realPrintBleedMmEl = document.getElementById("realPrintBleedMm");
    const realPrintBleedModeEl = document.getElementById("realPrintBleedMode");
    const realPrintMirrorMarginsEl = document.getElementById("realPrintMirrorMargins");
    const realPrintStartPageSideEl = document.getElementById("realPrintStartPageSide");

    const realPrintBookOptionsEnabledEl = document.getElementById("realPrintBookOptionsEnabled");
    const realPrintBookOptionsFieldsEl = document.getElementById("realPrintBookOptionsFields");

    const realPrintShowPageNumberEl = document.getElementById("realPrintShowPageNumber");
    const realPrintPageNumberStartEl = document.getElementById("realPrintPageNumberStart");
    const realPrintShowHeading1El = document.getElementById("realPrintShowHeading1");
    const realPrintHeading1ModeEl = document.getElementById("realPrintHeading1Mode");
    const realPrintHeaderOrderEl = document.getElementById("realPrintHeaderOrder");
    const realPrintHeaderPositionEl = document.getElementById("realPrintHeaderPosition");

    const realPrintFontSizePtEl = document.getElementById("realPrintFontSizePt");
    const realPrintCharsPerLineEl = document.getElementById("realPrintCharsPerLine");
    const realPrintLinesPerPageEl = document.getElementById("realPrintLinesPerPage");
    const realPrintMarginTopMmEl = document.getElementById("realPrintMarginTopMm");
    const realPrintMarginBottomMmEl = document.getElementById("realPrintMarginBottomMm");
    const realPrintMarginRightMmEl = document.getElementById("realPrintMarginRightMm");
    const realPrintMarginLeftMmEl = document.getElementById("realPrintMarginLeftMm");

    const realPrintMetricsBoxEl = document.getElementById("realPrintMetricsBox");
    const realTrimSizeEl = document.getElementById("realTrimSize");
    const realContentBoxEl = document.getElementById("realContentBox");
    const realFontSizeEl = document.getElementById("realFontSize");
    const realCharSpacingEl = document.getElementById("realCharSpacing");
    const realLineSpacingEl = document.getElementById("realLineSpacing");
    const realStatusEl = document.getElementById("realStatus");
    const realMessagesBoxEl = document.getElementById("realMessagesBox");

    const openRealPreviewButtonEl = document.getElementById("openRealPreviewButton");
    const openSimplePreviewButtonEl = document.getElementById("openSimplePreviewButton");
    const previewChapterSelectEl = document.getElementById("previewChapterSelect");
    const realPreviewTitleEl = document.getElementById("realPreviewTitle");
    const realPreviewOverlayEl = document.getElementById("realPreviewOverlay");
    const closeRealPreviewButtonEl = document.getElementById("closeRealPreviewButton");
    const submitFromPreviewButtonEl = document.getElementById("submitFromPreviewButton");

    const realPreviewMetaEl = document.getElementById("realPreviewMeta");
    const realPreviewSheetEl = document.getElementById("realPreviewSheet");
    const realPreviewContentBoxEl = document.getElementById("realPreviewContentBox");
    const realPreviewColumnsEl = document.getElementById("realPreviewColumns");

    const realPreviewTopLabelEl = document.getElementById("realPreviewTopLabel");
    const realPreviewBottomLabelEl = document.getElementById("realPreviewBottomLabel");
    const realPreviewRightLabelEl = document.getElementById("realPreviewRightLabel");
    const realPreviewLeftLabelEl = document.getElementById("realPreviewLeftLabel");

    const realPreviewFrameEl = document.getElementById("realPreviewFrame");
    const realPreviewLoadingEl = document.getElementById("realPreviewLoading");

    let successTimerId = null;

    let realPreviewRefreshTimerId = null;
    let realPreviewRequestId = 0;

    let isSubmitting = false;
    const submitButtonDefaultText = "HTMLを書き出す";

    function cleanupRealPrintSavedByLayout(savedMap) {
      const out = {};
      const source =
        savedMap && typeof savedMap === "object" ? savedMap : {};

      Object.entries(source).forEach(([key, value]) => {
        if (!key.includes(":")) return;
        if (!value || typeof value !== "object") return;

        const [sizeKeyRaw, columnModeRaw] = key.split(":");
        const sizeKey = normalizeRealPrintSizeKey(sizeKeyRaw);
        const columnMode = normalizeRealPrintColumnMode(columnModeRaw, sizeKey);
        const layoutKey = getRealPrintLayoutKey(sizeKey, columnMode);

        out[layoutKey] = {
          ...value,
          realPrintPageSize: sizeKey,
          realPrintColumnMode: columnMode,
        };
      });

      return out;
    }

    function setSubmitting(nextValue) {
      isSubmitting = !!nextValue;

      submitButtonEl.disabled = isSubmitting;
      cancelButtonEl.disabled = isSubmitting;
      resetButtonEl.disabled = isSubmitting;

      submitButtonEl.textContent = isSubmitting
        ? "保存先を選択中…"
        : submitButtonDefaultText;

      if (isSubmitting) {
        footerStatusBoxEl.textContent = "保存先を選択します。保存ダイアログが開くまでお待ちください。";
        footerStatusBoxEl.classList.remove("is-hidden");
      }

      if (submitFromPreviewButtonEl) {
        submitFromPreviewButtonEl.disabled = isSubmitting;
        submitFromPreviewButtonEl.textContent = isSubmitting
          ? "保存先を選択中…"
          : submitButtonDefaultText;
      }
    }

    function clearSubmitting() {
      setSubmitting(false);
    }

    function showError(message) {
      const text = String(message || "").trim();
      errorBoxEl.textContent = text;
      errorBoxEl.classList.toggle("is-visible", !!text);

      if (text) {
        if (successTimerId) {
          clearTimeout(successTimerId);
          successTimerId = null;
        }
        footerStatusBoxEl.textContent = "";
        footerStatusBoxEl.classList.add("is-hidden");
      }
    }

    function showSuccess(message) {
      const text = String(message || "").trim();

      if (successTimerId) {
        clearTimeout(successTimerId);
        successTimerId = null;
      }

      footerStatusBoxEl.textContent = text;
      footerStatusBoxEl.classList.toggle("is-hidden", !text);

      if (!text) return;

      footerStatusBoxEl.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });

      successTimerId = setTimeout(() => {
        footerStatusBoxEl.textContent = "";
        footerStatusBoxEl.classList.add("is-hidden");
        successTimerId = null;
      }, 3000);
    }

    function readNumber(el, fallback) {
      const n = Number(el.value);
      return Number.isFinite(n) ? n : fallback;
    }

    function pxToPt(px) {
      const n = Number(px);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.round(n * 0.75 * 10) / 10;
    }

    function ptToPx(pt) {
      const n = Number(pt);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.round((n / 0.75) * 100) / 100;
    }

    function roundMm(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.round(n * 100) / 100;
    }

    function convertPrintPtToApproxMm(pt) {
      const value = Number(pt);
      if (!Number.isFinite(value) || value <= 0) return 0;
      return roundMm(value * 0.35);
    }

    function getRealPrintPreset(pageSize) {
      const key = String(pageSize || "b6").trim().toLowerCase();
      return REAL_PRINT_PAGE_PRESETS[key] || REAL_PRINT_PAGE_PRESETS.b6;
    }

    function normalizeRealPrintSizeKey(value) {
      const v = String(value || "b6").trim().toLowerCase();

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
      const mode = String(value || "single").trim().toLowerCase();

      if (mode === "two" && isRealPrintTwoColumnSize(pageSize)) {
        return "two";
      }

      return "single";
    }

    function getRealPrintLayoutKey(pageSize = "b6", columnMode = "single") {
      const sizeKey = normalizeRealPrintSizeKey(pageSize);
      const mode = normalizeRealPrintColumnMode(columnMode, sizeKey);
      return \`\${sizeKey}:\${mode}\`;
    }

    function getRealPrintDefaultsForLayout(pageSize = "b6", columnMode = "single") {
      const key = getRealPrintLayoutKey(pageSize, columnMode);
      return {
        ...(REAL_PRINT_DEFAULTS_BY_LAYOUT[key] ||
          REAL_PRINT_DEFAULTS_BY_LAYOUT["b6:single"]),
      };
    }

    function calculateRealPrintMetricsFromInputs() {
      const preset = getRealPrintPreset(realPrintPageSizeEl.value);

      const columnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        realPrintPageSizeEl.value,
      );
      const columnGapMm =
        columnMode === "two" ? readNumber(realPrintColumnGapMmEl, 0) : 0;
      const columnCount = columnMode === "two" ? 2 : 1;

      const fontSizePt = readNumber(realPrintFontSizePtEl, 9);

      const bookOptionsEnabled = !!realPrintBookOptionsEnabledEl.checked;
      const bleedMm = bookOptionsEnabled ? readNumber(realPrintBleedMmEl, 0) : 0;
      const bleedMode =
        realPrintBleedModeEl.value === "nonSpine" ? "nonSpine" : "all";
      const mirrorMargins = !!realPrintMirrorMarginsEl.checked;
      const startPageSide =
        realPrintStartPageSideEl.value === "even" ? "even" : "odd";

      const topMm = readNumber(realPrintMarginTopMmEl, 22);
      const bottomMm = readNumber(realPrintMarginBottomMmEl, 18);
      const rightMm = readNumber(realPrintMarginRightMmEl, 18);
      const leftMm = readNumber(realPrintMarginLeftMmEl, 14);
      const charsPerLine = readNumber(realPrintCharsPerLineEl, 42);
      const linesPerPage = readNumber(realPrintLinesPerPageEl, 16);

      const contentWidthMm = roundMm(preset.widthMm - leftMm - rightMm);
      const contentHeightMm = roundMm(preset.heightMm - topMm - bottomMm);
      const fontSizeMm = convertPrintPtToApproxMm(fontSizePt);

      const columnWidthMm = contentWidthMm;

      const columnHeightMm =
        columnCount === 2
          ? roundMm((contentHeightMm - columnGapMm) / 2)
          : contentHeightMm;

      const charPitchMm =
        columnHeightMm > 0 ? roundMm(columnHeightMm / charsPerLine) : 0;

      const linePitchMm =
        columnWidthMm > 0 ? roundMm(columnWidthMm / linesPerPage) : 0;

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
        messages.push("字間が 0mm です。文字数によっては欠ける場合があります。");
      }

      if (lineSpacingMm < 0) {
        status = "error";
        messages.push("行数が多すぎて行送りが足りません。");
      }

      if (status !== "error") {
        if (outputCharSpacingMm < 0.05) {
          status = "warning";
          messages.push(
            "出力字間が 0.05mm 未満です。",
          );
        } else if (outputCharSpacingMm < 0.07) {
          status = "warning";
          messages.push(
            "出力字間が狭めです。",
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

        if (columnMode === "two" && columnHeightMm <= 0) {
          status = "error";
          messages.push("段間または余白が大きすぎて、二段組みの本文高さを確保できません。");
        }

        if (fontSizeMm > 0 && lineSpacingMm < fontSizeMm * 0.45) {
          messages.push(
            "ルビが多いページでは、行送り不足に見える場合があります。",
          );
        }
      }

      if (!messages.length) {
        messages.push(
          "目標字数・行数で収まる見込みです。",
        );
      }

      return {
        trimSize: {
          label: preset.label,
          widthMm: preset.widthMm,
          heightMm: preset.heightMm,
          bleedMm,
          bleedMode,
          mirrorMargins,
          startPageSide,
          outputWidthMm: roundMm(
            preset.widthMm + (bleedMode === "nonSpine" ? bleedMm : bleedMm * 2),
          ),
          outputHeightMm: roundMm(preset.heightMm + bleedMm * 2),
        },
        contentBox: {
          widthMm: contentWidthMm,
          heightMm: contentHeightMm,
        },
        column: {
          mode: columnMode,
          count: columnCount,
          gapMm: columnGapMm,
          widthMm: columnWidthMm,
          heightMm: columnHeightMm,
          linesPerColumn: linesPerPage,
          linesPerPageTotal: linesPerPage * columnCount,
        },
        font: {
          sizePt: fontSizePt,
          sizeMm: fontSizeMm,
        },
        estimated: {
          charSpacingMm,
          outputCharSpacingMm,
          lineSpacingMm,
        },
        status,
        messages,
      };
    }

    function applyRealPrintStateToInputs(nextState = {}) {
      const nextSize = normalizeRealPrintSizeKey(
        nextState.realPrintPageSize || realPrintPageSizeEl.value,
      );

      const nextColumnMode = normalizeRealPrintColumnMode(
        nextState.realPrintColumnMode || "single",
        nextSize,
      );

      realPrintPageSizeEl.value = nextSize;
      realPrintColumnModeEl.value = nextColumnMode;

      realPrintColumnGapMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintColumnGapMm))
          ? Number(nextState.realPrintColumnGapMm)
          : getRealPrintDefaultsForLayout(
              nextSize,
              nextColumnMode,
            ).realPrintColumnGapMm,
      );

      realPrintFontSizePtEl.value = String(
        Number.isFinite(Number(nextState.realPrintFontSizePt))
          ? Number(nextState.realPrintFontSizePt)
          : 9,
      );

      realPrintBleedMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintBleedMm))
          ? Number(nextState.realPrintBleedMm)
          : 0,
      );
      realPrintBleedModeEl.value =
        nextState.realPrintBleedMode === "nonSpine" ? "nonSpine" : "all";

      realPrintMirrorMarginsEl.checked = nextState.realPrintMirrorMargins !== false;

      realPrintStartPageSideEl.value =
        nextState.realPrintStartPageSide === "even" ? "even" : "odd";

      realPrintBookOptionsEnabledEl.checked =
        nextState.realPrintBookOptionsEnabled === true;

      realPrintShowPageNumberEl.checked =
        nextState.realPrintShowPageNumber === true;

      realPrintPageNumberStartEl.value = String(
        Number.isFinite(Number(nextState.realPrintPageNumberStart))
          ? Number(nextState.realPrintPageNumberStart)
          : 1,
      );

      realPrintShowHeading1El.checked =
        nextState.realPrintShowHeading1 === true;

      realPrintHeading1ModeEl.value =
        nextState.realPrintHeading1Mode === "evenOnly" ? "evenOnly" : "all";

      realPrintHeaderOrderEl.value =
        nextState.realPrintHeaderOrder === "titleNumber"
          ? "titleNumber"
          : "numberTitle";

      realPrintHeaderPositionEl.value =
        nextState.realPrintHeaderPosition === "top" ? "top" : "bottom";

      updateRealPrintBookOptionsUI();

      realPrintMarginTopMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginTopMm))
          ? Number(nextState.realPrintMarginTopMm)
          : 22,
      );
      realPrintMarginBottomMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginBottomMm))
          ? Number(nextState.realPrintMarginBottomMm)
          : 18,
      );
      realPrintMarginRightMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginRightMm))
          ? Number(nextState.realPrintMarginRightMm)
          : 18,
      );
      realPrintMarginLeftMmEl.value = String(
        Number.isFinite(Number(nextState.realPrintMarginLeftMm))
          ? Number(nextState.realPrintMarginLeftMm)
          : 14,
      );
      realPrintCharsPerLineEl.value = String(
        Number.isFinite(Number(nextState.realPrintCharsPerLine))
          ? Number(nextState.realPrintCharsPerLine)
          : 42,
      );
      realPrintLinesPerPageEl.value = String(
        Number.isFinite(Number(nextState.realPrintLinesPerPage))
          ? Number(nextState.realPrintLinesPerPage)
          : 16,
      );
    }

    function getRealPrintSavedStateByLayout(sizeKey, columnMode) {
      const key = normalizeRealPrintSizeKey(sizeKey);
      const mode = normalizeRealPrintColumnMode(columnMode, key);
      const layoutKey = getRealPrintLayoutKey(key, mode);

      const saved =
        realPrintSavedBySize &&
        typeof realPrintSavedBySize === "object" &&
        realPrintSavedBySize[layoutKey] &&
        typeof realPrintSavedBySize[layoutKey] === "object"
          ? realPrintSavedBySize[layoutKey]
          : null;

      if (saved) {
        return {
          ...saved,
          realPrintPageSize: key,
          realPrintColumnMode: mode,
        };
      }

      return getRealPrintDefaultsForLayout(key, mode);
    }

    function switchRealPrintPresetByLayout(sizeKey, columnMode) {
      const key = normalizeRealPrintSizeKey(sizeKey);
      const mode = normalizeRealPrintColumnMode(columnMode, key);

      const nextState = getRealPrintSavedStateByLayout(key, mode);

      applyRealPrintStateToInputs(nextState);
      updateRealPrintColumnModeUI();
      syncRealPrintMetricsView();
      refreshRealPreviewIfOpen();
    }

    function updateSavedRealPrintStateFromCurrentInputs(
      sizeKeyOverride,
      columnModeOverride,
    ) {
      const sizeKey = normalizeRealPrintSizeKey(
        sizeKeyOverride || realPrintPageSizeEl.value,
      );

      const columnMode = normalizeRealPrintColumnMode(
        columnModeOverride || realPrintColumnModeEl.value,
        sizeKey,
      );

      const layoutKey = getRealPrintLayoutKey(sizeKey, columnMode);

      realPrintSavedBySize = {
        ...(realPrintSavedBySize || {}),
        [layoutKey]: {
          realPrintPageSize: sizeKey,
          realPrintColumnMode: columnMode,
          realPrintColumnGapMm:
            columnMode === "two" ? readNumber(realPrintColumnGapMmEl, 0) : 0,

          realPrintFontSizePt: readNumber(realPrintFontSizePtEl, 9),

          realPrintBleedMm: readNumber(realPrintBleedMmEl, 0),
          realPrintBleedMode:
            realPrintBleedModeEl.value === "nonSpine" ? "nonSpine" : "all",
          realPrintMirrorMargins: !!realPrintMirrorMarginsEl.checked,
          realPrintStartPageSide:
            realPrintStartPageSideEl.value === "even" ? "even" : "odd",

          realPrintBookOptionsEnabled: !!realPrintBookOptionsEnabledEl.checked,
          realPrintShowPageNumber: !!realPrintShowPageNumberEl.checked,
          realPrintPageNumberStart: readNumber(realPrintPageNumberStartEl, 1),
          realPrintShowHeading1: !!realPrintShowHeading1El.checked,
          realPrintHeading1Mode:
            realPrintHeading1ModeEl.value === "evenOnly" ? "evenOnly" : "all",
          realPrintHeaderOrder:
            realPrintHeaderOrderEl.value === "titleNumber"
              ? "titleNumber"
              : "numberTitle",
          realPrintHeaderPosition:
            realPrintHeaderPositionEl.value === "top" ? "top" : "bottom",

          realPrintMarginTopMm: readNumber(realPrintMarginTopMmEl, 22),
          realPrintMarginBottomMm: readNumber(realPrintMarginBottomMmEl, 18),
          realPrintMarginRightMm: readNumber(realPrintMarginRightMmEl, 18),
          realPrintMarginLeftMm: readNumber(realPrintMarginLeftMmEl, 14),
          realPrintCharsPerLine: readNumber(realPrintCharsPerLineEl, 42),
          realPrintLinesPerPage: readNumber(realPrintLinesPerPageEl, 16),
        },
      };
    }

    function normalizeSimpleLayoutKey(value) {
      return String(value || "single") === "2up" ? "2up" : "single";
    }

    function getCurrentSimpleInputState() {
      const printFontSizePt = readNumber(printFontSizePtEl, defaultState.printFontSizePt);

      return {
        htmlPrintLayoutMode: normalizeSimpleLayoutKey(layoutModeEl.value),
        htmlPrintOrientation:
          htmlPrintOrientationEl.value === "landscape" ? "landscape" : "portrait",
        showPageNumbers: !!showPageNumbersEl.checked,
        printFontSizePt,
        printFontSizePx: ptToPx(printFontSizePt),
        printLineHeight: readNumber(printLineHeightEl, defaultState.printLineHeight),
        printMarginMm: readNumber(printMarginMmEl, defaultState.printMarginMm),
        printBodyPaddingPx: readNumber(printBodyPaddingPxEl, defaultState.printBodyPaddingPx),
        charsPerLine: readNumber(charsPerLineEl, defaultState.charsPerLine),
        linesPerPage: readNumber(linesPerPageEl, defaultState.linesPerPage),
        punctuationLayoutMode:
          punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",
      };
    }

    function updateSavedSimpleStateFromCurrentInputs() {
      const key = normalizeSimpleLayoutKey(layoutModeEl.value);

      simpleSavedByLayout = {
        ...(simpleSavedByLayout || {}),
        [key]: getCurrentSimpleInputState(),
      };
    }

    function applySimpleStateToInputs(nextState = {}) {
      layoutModeEl.value = normalizeSimpleLayoutKey(
        nextState.htmlPrintLayoutMode || layoutModeEl.value,
      );

      htmlPrintOrientationEl.value =
        nextState.htmlPrintOrientation === "landscape" ? "landscape" : "portrait";

      showPageNumbersEl.checked = nextState.showPageNumbers === true;

      printFontSizePtEl.value = String(
        Number.isFinite(Number(nextState.printFontSizePt))
          ? Number(nextState.printFontSizePt)
          : defaultState.printFontSizePt,
      );

      printLineHeightEl.value = String(
        Number.isFinite(Number(nextState.printLineHeight))
          ? Number(nextState.printLineHeight)
          : defaultState.printLineHeight,
      );

      printMarginMmEl.value = String(
        Number.isFinite(Number(nextState.printMarginMm))
          ? Number(nextState.printMarginMm)
          : defaultState.printMarginMm,
      );

      printBodyPaddingPxEl.value = String(
        Number.isFinite(Number(nextState.printBodyPaddingPx))
          ? Number(nextState.printBodyPaddingPx)
          : defaultState.printBodyPaddingPx,
      );

      charsPerLineEl.value = String(
        Number.isFinite(Number(nextState.charsPerLine))
          ? Number(nextState.charsPerLine)
          : defaultState.charsPerLine,
      );

      linesPerPageEl.value = String(
        Number.isFinite(Number(nextState.linesPerPage))
          ? Number(nextState.linesPerPage)
          : defaultState.linesPerPage,
      );

      punctuationLayoutModeEl.value =
        nextState.punctuationLayoutMode === "pushout" ? "pushout" : "hanging";
    }

    function getSimpleSavedStateByLayout(layoutKey) {
      const key = normalizeSimpleLayoutKey(layoutKey);

      const saved =
        simpleSavedByLayout &&
        typeof simpleSavedByLayout === "object" &&
        simpleSavedByLayout[key] &&
        typeof simpleSavedByLayout[key] === "object"
          ? simpleSavedByLayout[key]
          : null;

      if (saved) {
        return {
          ...saved,
          htmlPrintLayoutMode: key,
        };
      }

      return {
        htmlPrintLayoutMode: key,
        htmlPrintOrientation: defaultState.htmlPrintOrientation || "portrait",
        showPageNumbers: defaultState.showPageNumbers,
        printFontSizePt: defaultState.printFontSizePt,
        printFontSizePx: ptToPx(defaultState.printFontSizePt),
        printLineHeight: defaultState.printLineHeight,
        printMarginMm: defaultState.printMarginMm,
        printBodyPaddingPx: defaultState.printBodyPaddingPx,
        charsPerLine: defaultState.charsPerLine,
        linesPerPage: defaultState.linesPerPage,
        punctuationLayoutMode: defaultState.punctuationLayoutMode,
      };
    }

    function switchSimplePresetByLayout(layoutKey) {
      const key = normalizeSimpleLayoutKey(layoutKey);
      const nextState = getSimpleSavedStateByLayout(key);

      applySimpleStateToInputs({
        ...nextState,
        htmlPrintLayoutMode: key,
      });
    }

    function updateExportModeHint() {
      if (!exportModeHintEl || !exportModeEl) return;

      if (exportModeEl.value === "real") {
        exportModeHintEl.textContent =
          "判型・余白・本文面を固定し、実寸出力、本文プレビュー確認ができます。";
        return;
      }

      exportModeHintEl.textContent =
        "印刷/PDF保存向けに文字数・行数を調整。収まりはブラウザ印刷設定に左右されます。";
    }

    function updateLayoutModeUI() {
      const isTwoUp = layoutModeEl.value === "2up";
      const isRealMode = exportModeEl.value === "real";

      updateExportModeHint();

      simpleLeftPaneEl.classList.toggle("is-hidden", isRealMode);

      singleOnlyFieldsEl.classList.toggle("is-hidden", isTwoUp || isRealMode);
      twoUpNoticeBoxEl.classList.toggle("is-hidden", !isTwoUp || isRealMode);

      realPrintFieldsEl.classList.toggle("is-hidden", !isRealMode);
      realPrintMetricsBoxEl.classList.toggle("is-hidden", !isRealMode);

      simpleRightPaneEl.classList.toggle("is-hidden", isRealMode);
    }

    function getPunctuationLayoutLabel(mode) {
      return mode === "pushout" ? "追い込み" : "ぶら下げ";
    }

    const SIMPLE_PRINT_GUIDE_LIMITS = {
      single: {
        landscape: {
          8: { chars: 62, lines: 54, lineHeight: 1.74 },
          9: { chars: 55, lines: 48, lineHeight: 1.74 },
          10: { chars: 50, lines: 44, lineHeight: 1.72 },
          11: { chars: 45, lines: 40, lineHeight: 1.72 },
        },
        portrait: {
          8: { lines: 36, lineHeight: 1.74 },
          9: { lines: 32, lineHeight: 1.74 },
          10: { lines: 30, lineHeight: 1.72 },
          11: { lines: 27, lineHeight: 1.72 },
        },
      },

      twoUp: {
        8: { chars: 62, lines: 26, lineHeight: 1.72 },
        9: { chars: 55, lines: 24, lineHeight: 1.72 },
        10: { chars: 50, lines: 22, lineHeight: 1.7 },
        11: { chars: 45, lines: 20, lineHeight: 1.7 },
      },
    };

    function getSimpleGuideFontKey(fontSizePt) {
      const pt = Number(fontSizePt);
      if (!Number.isFinite(pt)) return null;

      // 8pt未満は小さいフォントなので、ここでは警告対象にしない
      if (pt < 8) return null;

      if (pt >= 11) return 11;
      if (pt >= 10) return 10;
      if (pt >= 9) return 9;
      return 8;
    }

    function buildSimplePrintGuideText() {
      return [
        "簡易印刷/保存の体裁目安",
        "",
        "通常印刷 / A4横 / 余白12mm目安",
        "8pt  : 62字 × 54行 / 行送り1.74前後",
        "9pt  : 55字 × 48行 / 行送り1.74前後",
        "10pt : 50字 × 44行 / 行送り1.72前後",
        "11pt : 45字 × 40行 / 行送り1.72前後",
        "",
        "通常印刷 / A4縦 / 余白12mm目安",
        "8pt  : 36行前後",
        "9pt  : 32行前後",
        "10pt : 30行前後",
        "11pt : 27行前後",
        "",
        "2ページ面付け / A4横目安",
        "8pt  : 62字 × 26行 / 行送り1.72前後",
        "9pt  : 55字 × 24行 / 行送り1.72前後",
        "10pt : 50字 × 22行 / 行送り1.70前後",
        "11pt : 45字 × 20行 / 行送り1.70前後",
        "",
        "※ フォント、ルビ、見出し、ページ番号、PDF変換環境により収まりは変わります。",
        "※ 11pt以上は11ptの目安を基準にしてください。",
      ].join("\\n");
    }

    function getSimplePrintWarnings() {
      const layoutMode = normalizeSimpleLayoutKey(layoutModeEl.value);
      const orientation =
        htmlPrintOrientationEl.value === "landscape" ? "landscape" : "portrait";

      const fontSizePt = readNumber(printFontSizePtEl, defaultState.printFontSizePt);
      const lineHeight = readNumber(printLineHeightEl, defaultState.printLineHeight);
      const chars = readNumber(charsPerLineEl, defaultState.charsPerLine);
      const lines = readNumber(linesPerPageEl, defaultState.linesPerPage);
      const showPageNumbers = !!showPageNumbersEl.checked;

      const warnings = [];
      const guideFontKey = getSimpleGuideFontKey(fontSizePt);

      // 8pt未満は小さいフォントなので、細かな警告は出さない
      if (!guideFontKey) {
        if (lineHeight < 1.5) {
          warnings.push(
            "行送りが 1.5 未満です。ルビ・見出し・フォントによって欠ける可能性があります。",
          );
        }
        return warnings;
      }

      if (layoutMode === "single") {
        const limits =
          SIMPLE_PRINT_GUIDE_LIMITS.single[orientation]?.[guideFontKey] || null;

        if (!limits) return warnings;

        const orientationLabel = orientation === "landscape" ? "A4横" : "A4縦";
        const fontLabel =
          Number(fontSizePt) >= 11 ? "11pt以上" : \`\${guideFontKey}pt\`;

        if (
          orientation === "landscape" &&
          Number.isFinite(limits.chars) &&
          chars > limits.chars
        ) {
          warnings.push(
            \`通常印刷（\${orientationLabel}・\${fontLabel}）の文字数目安は \${limits.chars}字前後です。指定値では本文やページ番号が欠ける可能性があります。\`,
          );
        }

        if (Number.isFinite(limits.lines) && lines > limits.lines) {
          warnings.push(
            \`通常印刷（\${orientationLabel}・\${fontLabel}）の行数目安は \${limits.lines}行前後です。指定値では本文が印刷範囲から欠ける可能性があります。\`,
          );
        }

        if (lineHeight < 1.5) {
          warnings.push(
            "行送りが 1.5 未満です。ルビ・見出し・フォントによって欠ける可能性があります。",
          );
        }

        if (showPageNumbers && warnings.length > 0) {
          warnings.push(
            "ナンバリングありの場合、ページ番号ぶんの領域を使うため、収まりがさらに変わる場合があります。",
          );
        }
      }

      if (layoutMode === "2up") {
        const limits = SIMPLE_PRINT_GUIDE_LIMITS.twoUp[guideFontKey] || null;
        if (!limits) return warnings;

        const fontLabel =
          Number(fontSizePt) >= 11 ? "11pt以上" : \`\${guideFontKey}pt\`;

        if (chars > limits.chars) {
          warnings.push(
            \`2ページ面付け（\${fontLabel}）の文字数目安は \${limits.chars}字前後です。指定値では本文やページ番号が欠ける可能性があります。\`,
          );
        }

        if (lines > limits.lines) {
          warnings.push(
            \`2ページ面付け（\${fontLabel}）の行数目安は \${limits.lines}行前後です。指定値では本文が印刷範囲から欠ける可能性があります。\`,
          );
        }

        if (lineHeight < 1.5) {
          warnings.push(
            "行送りが 1.5 未満です。ルビ・見出し・フォントによって欠ける可能性があります。",
          );
        }

        if (showPageNumbers && warnings.length > 0) {
          warnings.push(
            "ナンバリングありの場合、ページ番号ぶんの領域を使うため、収まりがさらに変わる場合があります。",
          );
        }
      }

      return warnings;
    }

    function updateSimplePrintWarnings() {
      if (!simplePrintWarningBoxEl || !simplePrintWarningMessagesEl) return;
      if (!exportModeEl || !layoutModeEl) return;

      const isSimpleMode = exportModeEl.value !== "real";

      if (!isSimpleMode) {
        simplePrintWarningBoxEl.classList.add("is-hidden");
        simplePrintWarningMessagesEl.textContent = "";
        return;
      }

      const warnings = getSimplePrintWarnings();

      if (!warnings.length) {
        simplePrintWarningBoxEl.classList.add("is-hidden");
        simplePrintWarningMessagesEl.textContent = "";
        return;
      }

      simplePrintWarningMessagesEl.textContent = warnings.join("\\n");
      simplePrintWarningBoxEl.classList.remove("is-hidden");
    }

    function syncSimpleModeView() {
      syncCurrentSettingsView();
      updateSimplePrintWarnings();
    }

    function syncPanelView() {
      updateLayoutModeUI();

      if (exportModeEl.value === "real") {
        if (simplePrintWarningBoxEl) {
          simplePrintWarningBoxEl.classList.add("is-hidden");
        }
        if (simplePrintWarningMessagesEl) {
          simplePrintWarningMessagesEl.textContent = "";
        }

        updateRealPrintBookOptionsUI();
        updateRealPrintColumnModeUI();
        syncRealPrintMetricsView();
        refreshRealPreviewIfOpen();
        return;
      }

      syncCurrentSettingsView();
      updateSimplePrintWarnings();
    }

    function safelySyncPanelView() {
      try {
        syncPanelView();
      } catch (error) {
        showError(error?.message || String(error || "表示更新に失敗しました。"));
      }
    }

    function syncCurrentSettingsView() {
      currentCharsPerLineEl.textContent =
        \`\${readNumber(charsPerLineEl, defaultState.charsPerLine)} 字\`;

      currentLinesPerPageEl.textContent =
        \`\${readNumber(linesPerPageEl, defaultState.linesPerPage)} 行\`;

      currentFontFamilyEl.textContent = ${JSON.stringify(state.fontFamily)};

      currentPunctuationLayoutEl.textContent = getPunctuationLayoutLabel(
        punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",
      );
      if (currentTypographyAdjustmentsEl) {
        currentTypographyAdjustmentsEl.textContent =
          !useTypographyAdjustmentsEl || useTypographyAdjustmentsEl.checked
            ? "ON"
            : "OFF";
      }
    }

    function syncRealPrintMetricsView() {
      const metrics = calculateRealPrintMetricsFromInputs();

      if (Number(metrics.trimSize.bleedMm || 0) > 0) {
        const bleedLabel =
          metrics.trimSize.bleedMode === "nonSpine" ? "ノド以外" : "四方";

        realTrimSizeEl.innerHTML =
          \`<div class="realTrimMain">\${metrics.trimSize.label}（仕上がり \${metrics.trimSize.widthMm} × \${metrics.trimSize.heightMm} mm）</div>\` +
          \`<div class="realTrimSub">出力 \${metrics.trimSize.outputWidthMm} × \${metrics.trimSize.outputHeightMm} mm / 裁ち落とし: \${bleedLabel}</div>\`;
      } else {
        realTrimSizeEl.innerHTML =
          \`<div class="realTrimMain">\${metrics.trimSize.label}（\${metrics.trimSize.widthMm} × \${metrics.trimSize.heightMm} mm）</div>\`;
      }

      if (metrics.column && metrics.column.count === 2) {
        realContentBoxEl.textContent =
          \`\${metrics.contentBox.widthMm} × \${metrics.contentBox.heightMm} mm / \` +
          \`二段：1段 \${metrics.column.widthMm} × \${metrics.column.heightMm}mm・段間 \${metrics.column.gapMm}mm\`;
      } else {
        realContentBoxEl.textContent =
          \`\${metrics.contentBox.widthMm} × \${metrics.contentBox.heightMm} mm\`;
      }

      realFontSizeEl.textContent =
        \`\${metrics.font.sizePt} pt（約 \${metrics.font.sizeMm} mm）\`;

      realCharSpacingEl.textContent =
        \`\${metrics.estimated.outputCharSpacingMm} mm\`;

      realLineSpacingEl.textContent =
        \`\${metrics.estimated.lineSpacingMm} mm\`;

      realStatusEl.textContent = metrics.status;

      realMessagesBoxEl.innerHTML = Array.isArray(metrics.messages)
        ? metrics.messages.map((msg) => \`<div>\${String(msg)}</div>\`).join("")
        : "メッセージなし";
    }

    function clearRealPreviewFrame(message = "設定が変更されました。プレビューを再生成しています…") {
      if (realPreviewFrameEl) {
        realPreviewFrameEl.srcdoc = "";
      }
      if (realPreviewMetaEl) {
        realPreviewMetaEl.textContent = message;
      }
    }

    function fitRealPreviewFrameToPage() {
      if (!realPreviewFrameEl) return;

      const frame = realPreviewFrameEl;
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;

      const page = doc.querySelector(".realPrintPage, .a4PreviewPaper");
      const documentRoot = doc.querySelector(".realPrintDocument, .exportDocument");
      if (!page || !documentRoot) return;

      const body = doc.body;
      if (!body) return;

      // いったん等倍に戻してから測る
      documentRoot.style.zoom = "1";
      documentRoot.style.transform = "";
      documentRoot.style.transformOrigin = "top center";

      body.style.overflowX = "hidden";
      body.style.overflowY = "auto";

      const frameWidth = Math.max(1, frame.clientWidth);
      const frameHeight = Math.max(1, frame.clientHeight);

      const pageRect = page.getBoundingClientRect();

      // iframe内のbody paddingや影を少し見込む
      const safetyPx = 44;

      const widthScale = (frameWidth - safetyPx) / Math.max(1, pageRect.width);
      const heightScale = (frameHeight - safetyPx) / Math.max(1, pageRect.height);

      const scale = Math.min(1, widthScale, heightScale);

      // Chromium系WebViewなので zoom が扱いやすい
      documentRoot.style.zoom = String(Math.max(0.1, Math.floor(scale * 1000) / 1000));

      // 縮小後に中央寄せを維持
      documentRoot.style.justifyContent = "center";
    }

    function refreshRealPreviewIfOpen() {
      if (realPreviewOverlayEl.classList.contains("is-hidden")) return;

      realPreviewRequestId += 1;
      clearRealPreviewFrame();

      if (realPreviewRefreshTimerId) {
        clearTimeout(realPreviewRefreshTimerId);
      }

      realPreviewRefreshTimerId = setTimeout(() => {
        realPreviewRefreshTimerId = null;
        requestRealPrintPreview();
      }, 350);
    }

    function buildRealPreviewMetrics() {
      return calculateRealPrintMetricsFromInputs();
    }

    function renderRealPreview() {
      const metrics = buildRealPreviewMetrics();

      const trimWidth = Number(metrics.trimSize.widthMm || 1);
      const trimHeight = Number(metrics.trimSize.heightMm || 1);
      const topMm = readNumber(realPrintMarginTopMmEl, 0);
      const bottomMm = readNumber(realPrintMarginBottomMmEl, 0);
      const rightMm = readNumber(realPrintMarginRightMmEl, 0);
      const leftMm = readNumber(realPrintMarginLeftMmEl, 0);
      const linesPerPage = Math.max(1, readNumber(realPrintLinesPerPageEl, 1));
      const charsPerLine = Math.max(1, readNumber(realPrintCharsPerLineEl, 1));

      const maxPreviewHeightPx = 520;
      const scale = Math.min(3.2, maxPreviewHeightPx / trimHeight);

      const sheetWidthPx = Math.max(120, Math.round(trimWidth * scale));
      const sheetHeightPx = Math.max(180, Math.round(trimHeight * scale));

      const contentLeftPx = Math.round(leftMm * scale);
      const contentTopPx = Math.round(topMm * scale);
      const contentWidthPx = Math.max(1, Math.round(metrics.contentBox.widthMm * scale));
      const contentHeightPx = Math.max(1, Math.round(metrics.contentBox.heightMm * scale));

      realPreviewSheetEl.style.width = \`\${sheetWidthPx}px\`;
      realPreviewSheetEl.style.height = \`\${sheetHeightPx}px\`;

      realPreviewContentBoxEl.style.left = \`\${contentLeftPx}px\`;
      realPreviewContentBoxEl.style.top = \`\${contentTopPx}px\`;
      realPreviewContentBoxEl.style.width = \`\${contentWidthPx}px\`;
      realPreviewContentBoxEl.style.height = \`\${contentHeightPx}px\`;

      realPreviewMetaEl.textContent =
        \`\${metrics.trimSize.label} / 本文面 \${metrics.contentBox.widthMm} × \${metrics.contentBox.heightMm} mm / \${metrics.font.sizePt}pt / 判定: \${metrics.status}\`;

      realPreviewTopLabelEl.textContent = \`上 \${topMm}mm\`;
      realPreviewBottomLabelEl.textContent = \`下 \${bottomMm}mm\`;
      realPreviewRightLabelEl.textContent = \`右 \${rightMm}mm\`;
      realPreviewLeftLabelEl.textContent = \`左 \${leftMm}mm\`;

      realPreviewTopLabelEl.style.top = \`6px\`;
      realPreviewTopLabelEl.style.left = \`50%\`;
      realPreviewTopLabelEl.style.transform = \`translateX(-50%)\`;

      realPreviewBottomLabelEl.style.bottom = \`6px\`;
      realPreviewBottomLabelEl.style.left = \`50%\`;
      realPreviewBottomLabelEl.style.transform = \`translateX(-50%)\`;

      realPreviewRightLabelEl.style.top = \`50%\`;
      realPreviewRightLabelEl.style.right = \`6px\`;
      realPreviewRightLabelEl.style.transform = \`translateY(-50%)\`;

      realPreviewLeftLabelEl.style.top = \`50%\`;
      realPreviewLeftLabelEl.style.left = \`6px\`;
      realPreviewLeftLabelEl.style.transform = \`translateY(-50%)\`;

      const columnsHtml = [];
      for (let lineIndex = 0; lineIndex < linesPerPage; lineIndex += 1) {
        const rowGuides = [];
        for (let charIndex = 1; charIndex < charsPerLine; charIndex += 1) {
          const topPercent = (charIndex / charsPerLine) * 100;
          rowGuides.push(
            \`<div class="previewRowGuide" style="top:\${topPercent}%;"></div>\`,
          );
        }

        columnsHtml.push(
          \`<div class="previewColumn">\${rowGuides.join("")}</div>\`,
        );
      }

      realPreviewColumnsEl.innerHTML = columnsHtml.join("");
    }

    function openRealPreview() {
      realPreviewOverlayEl.classList.remove("is-hidden");
      requestRealPrintPreview();
    }

    function setRealPreviewLoading(isLoading) {
      if (!realPreviewLoadingEl) return;
      realPreviewLoadingEl.classList.toggle("is-hidden", !isLoading);
    }

    function requestRealPrintPreview() {
      if (realPreviewRefreshTimerId) clearTimeout(realPreviewRefreshTimerId);
      realPreviewRefreshTimerId = null;
      const requestId = ++realPreviewRequestId;
      showError("");
      clearRealPreviewFrame("プレビューを生成しています…");
      setRealPreviewLoading(true);

      try {
        const payload = collectPayload();
        if (previewChapterSelectEl) payload.previewChapterId = previewChapterSelectEl.value;
        realPreviewTitleEl.textContent = payload.exportMode === "real" ? "実寸優先の印刷プレビュー" : "簡易印刷のA4プレビュー";
        vscode.postMessage({type: "requestRealPrintPreview", payload, requestId});
      } catch (error) {
        setRealPreviewLoading(false);
        realPreviewMetaEl.textContent = "設定を確認してください。";
        showError(error.message || String(error));
      }
    }

    function closeRealPreview() {
      realPreviewRequestId += 1;
      if (realPreviewRefreshTimerId) {
        clearTimeout(realPreviewRefreshTimerId);
        realPreviewRefreshTimerId = null;
      }
      realPreviewOverlayEl.classList.add("is-hidden");
    }

    function resetToDefaults() {
      const currentMode = exportModeEl.value === "real" ? "real" : "simple";
      if (useTypographyAdjustmentsEl) {
        useTypographyAdjustmentsEl.checked =
          defaultState.useTypographyAdjustments !== false;
      }

      if (currentMode === "simple") {
        const currentLayout = normalizeSimpleLayoutKey(layoutModeEl.value);

        const nextState = {
          htmlPrintLayoutMode: currentLayout,
          htmlPrintOrientation: defaultState.htmlPrintOrientation || "portrait",
          showPageNumbers: defaultState.showPageNumbers,
          printFontSizePt: defaultState.printFontSizePt,
          printFontSizePx: ptToPx(defaultState.printFontSizePt),
          printLineHeight: defaultState.printLineHeight,
          printMarginMm: defaultState.printMarginMm,
          printBodyPaddingPx: defaultState.printBodyPaddingPx,
          charsPerLine: defaultState.charsPerLine,
          linesPerPage: defaultState.linesPerPage,
          punctuationLayoutMode: defaultState.punctuationLayoutMode,
        };

        simpleSavedByLayout = {
          ...(simpleSavedByLayout || {}),
          [currentLayout]: nextState,
        };

        applySimpleStateToInputs(nextState);
      } else {
        const sizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
        const columnMode = normalizeRealPrintColumnMode(
          realPrintColumnModeEl.value,
          sizeKey,
        );
        const nextState = getRealPrintDefaultsForLayout(sizeKey, columnMode);

        applyRealPrintStateToInputs({
          ...nextState,
          realPrintBleedMm: defaultState.realPrintBleedMm || 0,
          realPrintBleedMode: defaultState.realPrintBleedMode || "all",
          realPrintMirrorMargins: defaultState.realPrintMirrorMargins !== false,
          realPrintStartPageSide: defaultState.realPrintStartPageSide || "odd",
          realPrintBookOptionsEnabled: defaultState.realPrintBookOptionsEnabled === true,
          realPrintShowPageNumber: defaultState.realPrintShowPageNumber === true,
          realPrintPageNumberStart: defaultState.realPrintPageNumberStart || 1,
          realPrintShowHeading1: defaultState.realPrintShowHeading1 === true,
          realPrintHeading1Mode: defaultState.realPrintHeading1Mode || "all",
          realPrintHeaderOrder: defaultState.realPrintHeaderOrder || "numberTitle",
          realPrintHeaderPosition: defaultState.realPrintHeaderPosition || "bottom",
        });

        updateRealPrintBookOptionsUI();
        updateRealPrintColumnModeUI();
      }

      showError("");
      showSuccess("");
      safelySyncPanelView();
      savePanelUiState();
    }

    function collectPayload() {
      const currentMode = exportModeEl.value === "real" ? "real" : "simple";

      if (currentMode === "simple") {
        updateSavedSimpleStateFromCurrentInputs();
      }

      const printFontSizePt = readNumber(printFontSizePtEl, pxToPt(14.5));

      const payload = {
        format: "html",
        htmlTarget: "browser",
        htmlDirection: "vertical",
        htmlShowTitle: false,
        htmlPageSize: "auto",
        htmlOrientation: "auto",
        fontFamily: ${JSON.stringify(state.fontFamily)},

        exportMode: currentMode,

        htmlPrintLayoutMode: layoutModeEl.value === "2up" ? "2up" : "single",
        htmlPrintOrientation:
          htmlPrintOrientationEl.value === "landscape" ? "landscape" : "portrait",
        showPageNumbers: !!showPageNumbersEl.checked,
        printFontSizePx: ptToPx(printFontSizePt),
        printLineHeight: readNumber(printLineHeightEl, 1.72),
        charsPerLine: readNumber(charsPerLineEl, 42),
        linesPerPage: readNumber(linesPerPageEl, 16),
        punctuationLayoutMode:
          punctuationLayoutModeEl.value === "pushout" ? "pushout" : "hanging",
        useTypographyAdjustments:
          !useTypographyAdjustmentsEl || useTypographyAdjustmentsEl.checked,
        printMarginMm: readNumber(printMarginMmEl, 0),
        printBodyPaddingPx: readNumber(printBodyPaddingPxEl, 0),

        realPrintPageSize: realPrintPageSizeEl.value,
        realPrintFontSizePt: readNumber(realPrintFontSizePtEl, 9),

        realPrintColumnMode: normalizeRealPrintColumnMode(
          realPrintColumnModeEl.value,
          realPrintPageSizeEl.value,
        ),
        realPrintColumnGapMm:
          normalizeRealPrintColumnMode(
            realPrintColumnModeEl.value,
            realPrintPageSizeEl.value,
          ) === "two"
            ? readNumber(realPrintColumnGapMmEl, 0)
            : 0,

        realPrintBleedMm: readNumber(realPrintBleedMmEl, 0),
        realPrintBleedMode:
          realPrintBleedModeEl.value === "nonSpine" ? "nonSpine" : "all",
        realPrintMirrorMargins: !!realPrintMirrorMarginsEl.checked,
        realPrintStartPageSide:
          realPrintStartPageSideEl.value === "even" ? "even" : "odd",

        realPrintBookOptionsEnabled: !!realPrintBookOptionsEnabledEl.checked,

        realPrintShowPageNumber:
          !!realPrintBookOptionsEnabledEl.checked &&
          !!realPrintShowPageNumberEl.checked,

        realPrintPageNumberStart: readNumber(realPrintPageNumberStartEl, 1),

        realPrintShowHeading1:
          !!realPrintBookOptionsEnabledEl.checked &&
          !!realPrintShowHeading1El.checked,

        realPrintHeading1Mode:
          realPrintHeading1ModeEl.value === "evenOnly" ? "evenOnly" : "all",

        realPrintHeaderOrder:
          realPrintHeaderOrderEl.value === "titleNumber"
            ? "titleNumber"
            : "numberTitle",

        realPrintHeaderPosition:
          realPrintHeaderPositionEl.value === "top" ? "top" : "bottom",

        realPrintMarginTopMm: readNumber(realPrintMarginTopMmEl, 22),
        realPrintMarginBottomMm: readNumber(realPrintMarginBottomMmEl, 18),
        realPrintMarginRightMm: readNumber(realPrintMarginRightMmEl, 18),
        realPrintMarginLeftMm: readNumber(realPrintMarginLeftMmEl, 14),
        realPrintCharsPerLine: readNumber(realPrintCharsPerLineEl, 42),
        realPrintLinesPerPage: readNumber(realPrintLinesPerPageEl, 16),
      };

      if (currentMode === "simple") {
        if (printFontSizePt < 6) {
          throw new Error("印刷用フォントサイズは 6pt 以上で入力してください。");
        }
        if (!(payload.printLineHeight >= 1.4)) {
          throw new Error("印刷用行送りは 1.4 以上で入力してください。");
        }
        if (payload.htmlPrintLayoutMode === "single") {
          if (payload.printMarginMm < 0) {
            throw new Error("上余白 mm は 0 以上で入力してください。");
          }
          if (payload.printBodyPaddingPx < 0) {
            throw new Error("本文内余白 px は 0 以上で入力してください。");
          }
        }
        if (!(payload.charsPerLine >= 1)) {
          throw new Error("文字数は 1 以上で入力してください。");
        }
        if (!(payload.linesPerPage >= 1)) {
          throw new Error("行数は 1 以上で入力してください。");
        }
        if (payload.htmlPrintLayoutMode === "2up") {
          payload.printMarginMm = 0;
          payload.printBodyPaddingPx = 0;
        }
      } else {
        if (currentMode === "real" && !payload.realPrintBookOptionsEnabled) {
          payload.realPrintBleedMm = 0;
          payload.realPrintBleedMode = "all";
          payload.realPrintShowPageNumber = false;
          payload.realPrintShowHeading1 = false;
        }
        if (!(payload.realPrintFontSizePt > 0)) {
          throw new Error("フォントサイズは 1pt 以上で入力してください。");
        }
        if (payload.realPrintBleedMm < 0) {
          throw new Error("裁ち落とし mm は 0 以上で入力してください。");
        }
        if (payload.realPrintPageNumberStart < 1) {
          throw new Error("ページ番号開始は 1 以上で入力してください。");
        }
        if (!(payload.realPrintCharsPerLine >= 1)) {
          throw new Error("目標文字数は 1 以上で入力してください。");
        }
        if (!(payload.realPrintLinesPerPage >= 1)) {
          throw new Error("目標行数は 1 以上で入力してください。");
        }
      }
      return payload;
    }

    openRealPreviewButtonEl.addEventListener("click", () => {
      openRealPreview();
    });
    openSimplePreviewButtonEl.addEventListener("click", openRealPreview);
    if (previewChapterSelectEl) previewChapterSelectEl.addEventListener("change", requestRealPrintPreview);

    closeRealPreviewButtonEl.addEventListener("click", () => {
      closeRealPreview();
    });

    submitFromPreviewButtonEl.addEventListener("click", () => {
      submitButtonEl.click();
    });

    realPreviewFrameEl.addEventListener("load", () => {
      requestAnimationFrame(() => {
        fitRealPreviewFrameToPage();
      });
    });

    window.addEventListener("resize", () => {
      if (realPreviewOverlayEl.classList.contains("is-hidden")) return;

      requestAnimationFrame(() => {
        fitRealPreviewFrameToPage();
      });
    });

    realPreviewOverlayEl.addEventListener("click", (event) => {
      if (event.target === realPreviewOverlayEl) {
        closeRealPreview();
      }
    });

    openSimpleGuideButtonEl.addEventListener("click", () => {
      vscode.postMessage({
        type: "showSimplePrintGuide",
        message: buildSimplePrintGuideText(),
      });
    });

    resetButtonEl.addEventListener("click", () => {
      resetToDefaults();
    });

    cancelButtonEl.addEventListener("click", () => {
      savePanelUiState();
      vscode.postMessage({ type: "cancel" });
    });

    submitButtonEl.addEventListener("click", () => {
      if (isSubmitting) return;

      try {
        showError("");
        showSuccess("");

        savePanelUiState();

        const payload = collectPayload();

        setSubmitting(true);

        vscode.postMessage({ type: "submit", payload });
      } catch (error) {
        clearSubmitting();
        showError(error?.message || String(error || ""));
      }
    });

    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitButtonEl.click();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();

        if (!realPreviewOverlayEl.classList.contains("is-hidden")) {
          closeRealPreview();
          return;
        }

        cancelButtonEl.click();
      }
    });

    window.addEventListener("message", (event) => {
      const message = event.data || {};
      const type = String(message.type || "");

      if (type === "realPrintPreviewResult") {
        if (message.requestId !== realPreviewRequestId || realPreviewOverlayEl.classList.contains("is-hidden")) return;
        setRealPreviewLoading(false);

        if (!message.ok) {
          showError(message.message || "プレビュー生成に失敗しました。");
          realPreviewMetaEl.textContent = "プレビュー生成に失敗しました。";
          return;
        }

        const previewHtml = String(message.html || "");

        if (!previewHtml.trim()) {
          showError("プレビューHTMLが空です。原稿ファイルまたは生成処理を確認してください。");
          realPreviewMetaEl.textContent = "プレビューHTMLが空です。";
          return;
        }

        realPreviewFrameEl.srcdoc = previewHtml;
        realPreviewMetaEl.textContent =
          message.message || "現在の設定で本文プレビューを表示しています。";

        requestAnimationFrame(() => {
          fitRealPreviewFrameToPage();
        });

        return;
      }

      if (type === "submitResult") {
        clearSubmitting();

      if (message.ok) {
        updateSavedSimpleStateFromCurrentInputs();
        updateSavedRealPrintStateFromCurrentInputs();
        showError("");
        showSuccess(message.message || "書き出しました。");
      } else {
          showSuccess("");
          showError(message.message || "書き出しに失敗しました。");
        }
      }

      if (type === "resetDone") {
        showError("");
        showSuccess("");
      }
    });

    layoutModeEl.addEventListener("focus", () => {
      updateSavedSimpleStateFromCurrentInputs();
    });

    let previousSimpleLayoutKey = normalizeSimpleLayoutKey(layoutModeEl.value);

    layoutModeEl.addEventListener("focus", () => {
      previousSimpleLayoutKey = normalizeSimpleLayoutKey(layoutModeEl.value);
      updateSavedSimpleStateFromCurrentInputs();
    });

    layoutModeEl.addEventListener("change", () => {
      const nextKey = normalizeSimpleLayoutKey(layoutModeEl.value);

      // 変更前の版組を保存
      simpleSavedByLayout = {
        ...(simpleSavedByLayout || {}),
        [previousSimpleLayoutKey]: getCurrentSimpleInputState(),
      };

      // 変更後の版組を読み込み
      switchSimplePresetByLayout(nextKey);

      previousSimpleLayoutKey = nextKey;

      safelySyncPanelView();
      savePanelUiState();
    });

    [
      charsPerLineEl,
      linesPerPageEl,
      printFontSizePtEl,
      printLineHeightEl,
      printMarginMmEl,
      printBodyPaddingPxEl,
      htmlPrintOrientationEl,
      showPageNumbersEl,
      useTypographyAdjustmentsEl,
    ].forEach((el) => {
      if (!el) return;
      el.addEventListener("input", safelySyncPanelView);
      el.addEventListener("change", safelySyncPanelView);
    });

    punctuationLayoutModeEl.addEventListener("change", safelySyncPanelView);

    exportModeEl.addEventListener("change", () => {
      safelySyncPanelView();
      savePanelUiState();
    });

    function updateRealPrintBookOptionsUI() {
      const enabled = !!realPrintBookOptionsEnabledEl.checked;

      realPrintBookOptionsFieldsEl.classList.toggle("is-hidden", !enabled);

      if (!enabled) {
        realPrintBleedMmEl.value = realPrintBleedMmEl.value || "0";
      }
    }

    function updateRealPrintColumnModeUI() {
      const sizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
      const canTwoColumn = isRealPrintTwoColumnSize(sizeKey);

      if (!canTwoColumn && realPrintColumnModeEl.value === "two") {
        realPrintColumnModeEl.value = "single";
      }

      const columnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        sizeKey,
      );

      realPrintColumnModeEl.value = columnMode;

      const twoOption = Array.from(realPrintColumnModeEl.options).find(
        (option) => option.value === "two",
      );

      if (twoOption) {
        twoOption.disabled = !canTwoColumn;
      }

      realPrintColumnGapRowEl.classList.toggle(
        "fieldGridPlaceholder",
        columnMode !== "two",
      );

      if (realPrintColumnModeHintEl) {
        realPrintColumnModeHintEl.textContent = canTwoColumn
          ? "二段組みの行数は1段あたりとして扱います。"
          : "二段組みは A5 / 新書判のみ選択できます。";
      }

      if (realPrintLinesPerPageLabelEl) {
        realPrintLinesPerPageLabelEl.textContent =
          columnMode === "two" ? "行数（1段あたり）" : "行数";
      }
    }

    function handleRealPrintInput() {
      updateSavedRealPrintStateFromCurrentInputs();
      syncRealPrintMetricsView();
      refreshRealPreviewIfOpen();
    }

    let previousRealPrintSizeKey = normalizeRealPrintSizeKey(
      realPrintPageSizeEl.value,
    );

    let previousRealPrintColumnMode = normalizeRealPrintColumnMode(
      realPrintColumnModeEl.value,
      previousRealPrintSizeKey,
    );

    realPrintPageSizeEl.addEventListener("focus", () => {
      previousRealPrintSizeKey = normalizeRealPrintSizeKey(
        realPrintPageSizeEl.value,
      );

      previousRealPrintColumnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        previousRealPrintSizeKey,
      );

      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );
    });

    realPrintPageSizeEl.addEventListener("change", () => {
      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );

      const nextSizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
      const nextColumnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        nextSizeKey,
      );

      switchRealPrintPresetByLayout(nextSizeKey, nextColumnMode);

      previousRealPrintSizeKey = nextSizeKey;
      previousRealPrintColumnMode = nextColumnMode;

      savePanelUiState();
    });

    realPrintColumnModeEl.addEventListener("focus", () => {
      previousRealPrintSizeKey = normalizeRealPrintSizeKey(
        realPrintPageSizeEl.value,
      );

      previousRealPrintColumnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        previousRealPrintSizeKey,
      );

      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );
    });

    realPrintColumnModeEl.addEventListener("change", () => {
      updateSavedRealPrintStateFromCurrentInputs(
        previousRealPrintSizeKey,
        previousRealPrintColumnMode,
      );

      const sizeKey = normalizeRealPrintSizeKey(realPrintPageSizeEl.value);
      const columnMode = normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        sizeKey,
      );

      switchRealPrintPresetByLayout(sizeKey, columnMode);

      previousRealPrintSizeKey = sizeKey;
      previousRealPrintColumnMode = columnMode;

      savePanelUiState();
    });

    realPrintColumnGapMmEl.addEventListener("input", handleRealPrintInput);

    realPrintBleedModeEl.addEventListener("change", handleRealPrintInput);
    realPrintMirrorMarginsEl.addEventListener("change", handleRealPrintInput);
    realPrintStartPageSideEl.addEventListener("change", handleRealPrintInput);

    realPrintBookOptionsEnabledEl.addEventListener("change", () => {
      updateRealPrintBookOptionsUI();
      handleRealPrintInput();
    });

    realPrintShowPageNumberEl.addEventListener("change", handleRealPrintInput);
    realPrintPageNumberStartEl.addEventListener("input", handleRealPrintInput);
    realPrintShowHeading1El.addEventListener("change", handleRealPrintInput);
    realPrintHeading1ModeEl.addEventListener("change", handleRealPrintInput);
    realPrintHeaderOrderEl.addEventListener("change", handleRealPrintInput);
    realPrintHeaderPositionEl.addEventListener("change", handleRealPrintInput);

    realPrintColumnGapMmEl.addEventListener("input", handleRealPrintInput);
    realPrintColumnGapMmEl.addEventListener("change", handleRealPrintInput);

    realPrintFontSizePtEl.addEventListener("input", handleRealPrintInput);
    realPrintBleedMmEl.addEventListener("input", handleRealPrintInput);
    realPrintCharsPerLineEl.addEventListener("input", handleRealPrintInput);
    realPrintLinesPerPageEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginTopMmEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginBottomMmEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginRightMmEl.addEventListener("input", handleRealPrintInput);
    realPrintMarginLeftMmEl.addEventListener("input", handleRealPrintInput);

    restorePanelUiState();
    updateRealPrintColumnModeUI();

    // 古い vscode.getState() が single を持っていても、
    // 初期HTMLで描画された現在の判型・版組を正として上書きする。
    vscode.setState({
      ...(vscode.getState() || {}),
      exportMode: exportModeEl ? exportModeEl.value : "simple",
      realPrintPageSize: normalizeRealPrintSizeKey(realPrintPageSizeEl.value),
      realPrintColumnMode: normalizeRealPrintColumnMode(
        realPrintColumnModeEl.value,
        realPrintPageSizeEl.value,
      ),
      simpleSavedByLayout,
      realPrintSavedBySize,
    });

    previousSimpleLayoutKey = normalizeSimpleLayoutKey(layoutModeEl.value);

    previousRealPrintSizeKey = normalizeRealPrintSizeKey(
      realPrintPageSizeEl.value,
    );

    previousRealPrintColumnMode = normalizeRealPrintColumnMode(
      realPrintColumnModeEl.value,
      previousRealPrintSizeKey,
    );

    safelySyncPanelView();
  `;
}

module.exports = { getPanelScript };
