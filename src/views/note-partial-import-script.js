function getScript(dataJson) {
  return `
    const vscode = acquireVsCodeApi();
    const initialData = ${dataJson};

    const insertTargetPanel = document.getElementById("insertTargetPanel");
    const replaceTargetPanel = document.getElementById("replaceTargetPanel");

    const sourceListEl = document.getElementById("sourceList");
    const previewMetaEl = document.getElementById("previewMeta");
    const previewBodyEl = document.getElementById("previewBody");

    const cancelBtn = document.getElementById("cancelBtn");
    const applyKeepOpenBtn = document.getElementById("applyKeepOpenBtn");
    const applyCloseBtn = document.getElementById("applyCloseBtn");
    
    let currentMode = String(initialData.initialMode || "insert_entry");
    let includeItemMemos = initialData.includeItemMemos !== false;
    let replaceItemMemo = initialData.replaceItemMemo === true;
    const includeItemMemosInput = document.getElementById("includeItemMemos");
    const replaceBodyOnlyInput = document.getElementById("replaceBodyOnly");
    const replaceBodyAndMemoInput = document.getElementById("replaceBodyAndMemo");

    const insertSourceEntries = Array.isArray(initialData.insertSourceEntries)
      ? initialData.insertSourceEntries
      : [];
    const replaceSourceEntries = Array.isArray(initialData.replaceSourceEntries)
      ? initialData.replaceSourceEntries
      : [];

    let insertTargetGroups = Array.isArray(initialData.insertTargetGroups)
      ? initialData.insertTargetGroups
      : [];
    let replaceTargetEntries = Array.isArray(initialData.replaceTargetEntries)
      ? initialData.replaceTargetEntries
      : [];

    const modeInsertBtn = document.getElementById("modeInsertBtn");
    const modeReplaceBtn = document.getElementById("modeReplaceBtn");

    const targetListEl = document.getElementById("targetList");
    const targetGroupSelect = document.getElementById("targetGroupSelect");
    const targetPositionSelect = document.getElementById("targetPositionSelect");
    const insertPreviewMetaEl = document.getElementById("insertPreviewMeta");

    const groupInsertControls = document.getElementById("groupInsertControls");
    const targetGroupPositionSelect = document.getElementById("targetGroupPositionSelect");
    const groupInsertPreviewMetaEl = document.getElementById("groupInsertPreviewMeta");

    const resultNoticeEl = document.getElementById("resultNotice");
    const resultNoticeTextEl = document.getElementById("resultNoticeText");

    const sourceFilterInput = document.getElementById("sourceFilterInput");
    const sourceTypeFilter = document.getElementById("sourceTypeFilter");

    const insertAroundPreviewEl = document.getElementById("insertAroundPreview");

    const sourceSectionTitleEl = document.getElementById("sourceSectionTitle");
    const jumpToSourceBtn = document.getElementById("jumpToSourceBtn");
    const jumpToTargetBtn = document.getElementById("jumpToTargetBtn");

    const appliedSourceIds = new Set();

    let warningsHidden = false;

    const warningCardEl = document.getElementById("warningCard");
    const warningSummaryEl = document.getElementById("warningSummary");
    const warningListEl = document.getElementById("warningList");

    const openSourceFileBtn = document.getElementById("openSourceFileBtn");
    const reloadImportSourceBtn = document.getElementById("reloadImportSourceBtn");

    let selectedSourceItemId = String(initialData.selectedSourceItemId || "");
    let selectedTargetItemId = String(initialData.selectedTargetItemId || "");
    let selectedTargetGroupId =
      String(initialData.selectedTargetGroupId || "") ||
      String(initialData.defaultTargetGroupId || "");
    let selectedInsertIndex = String(
      initialData.selectedInsertIndex || initialData.defaultInsertIndex || "0",
    );
    let selectedGroupInsertIndex = String(
      initialData.selectedGroupInsertIndex || "0",
    );

    let sourceFilterText = String(initialData.sourceFilterText || "");
    let sourceFilterType = String(initialData.sourceFilterType || "all");

    function isInsertMode() {
      return currentMode === "insert_entry";
    }

    function getCurrentSourceEntries() {
      return isInsertMode() ? insertSourceEntries : replaceSourceEntries;
    }

    function getCurrentTargetEntries() {
      return isInsertMode() ? [] : replaceTargetEntries;
    }

    function getCurrentTargetGroups() {
      return isInsertMode() ? insertTargetGroups : [];
    }

    function markSourceApplied(sourceItemId) {
      if (!sourceItemId) return;
      appliedSourceIds.add(String(sourceItemId));
    }

    function getFilteredSourceEntries() {
      const keyword = String(sourceFilterText || "").trim().toLowerCase();

      return getCurrentSourceEntries().filter((entry) => {
        const entryType = String(entry.sourceType || "entry");

        if (sourceFilterType !== "all" && entryType !== sourceFilterType) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        const haystack = [
          entry.title,
          entry.label,
          entry.heading,
          entry.sourceGroupTitle,
          entry.previewLine,
          entry.body,
          entry.value,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join("\\n");

        return haystack.includes(keyword);
      });
    }

    function getGroupedSourceEntries() {
      const visibleEntries = getFilteredSourceEntries();
      const groups = [];
      const groupMap = new Map();

      visibleEntries.forEach((entry) => {
        const sourceType = String(entry.sourceType || "");

        if (sourceType === "group") {
          const block = {
            groupId: String(entry.sourceGroupId || ""),
            groupEntry: entry,
            children: [],
          };
          groups.push(block);
          groupMap.set(block.groupId, block);
          return;
        }

        const groupId = String(entry.sourceGroupId || "");
        let block = groupMap.get(groupId);

        if (!block) {
          block = {
            groupId,
            groupEntry: null,
            children: [],
          };
          groups.push(block);
          groupMap.set(groupId, block);
        }

        block.children.push(entry);
      });

      return groups;
    }

    function esc(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderMiniBadges(importMeta) {
      const badges = [];

      if (importMeta?.supplemented) {
        badges.push('<span class="rowMiniBadge">補完</span>');
      }

      return badges.length
        ? \`<span class="rowBadges">\${badges.join("")}</span>\`
        : "";
    }

    function syncDynamicHeights() {
      const shell = document.querySelector(".shell");
      const warningEl = document.querySelector(".warning");
      if (!shell) return;

      const warningHeight = warningEl ? warningEl.offsetHeight : 0;
      shell.style.setProperty("--warning-h", \`\${warningHeight}px\`);
    }

    function updateWarningLayoutState() {
      const shellEl = document.querySelector(".shell");
      if (!shellEl) return;

      const hasWarnings = !warningCardEl?.hidden;
      shellEl.classList.toggle("hasWarnings", hasWarnings);
    }

    window.addEventListener("resize", syncDynamicHeights);
    requestAnimationFrame(syncDynamicHeights);

    function showResultNotice(message) {
      if (!resultNoticeEl || !resultNoticeTextEl) return;
      resultNoticeTextEl.textContent = String(message || "");
      resultNoticeEl.hidden = !message;
    }

    function clearResultNotice() {
      if (!resultNoticeEl || !resultNoticeTextEl) return;
      resultNoticeTextEl.textContent = "";
      resultNoticeEl.hidden = true;
    }

    function postApplyMessage(keepOpen) {
      const source = getSelectedSource();
      if (!source) return;

      clearResultNotice();

      if (isInsertMode()) {
        const isGroupSource = source.sourceType === "group";

        vscode.postMessage({
          type: "applyPartialInsertItem",
          payload: {
            keepOpen: !!keepOpen,
            includeItemMemos,
            source: {
              sourceType: String(source.sourceType || "entry"),
              sourceGroupId: String(source.sourceGroupId || ""),
              sourceItemId: String(source.sourceItemId || ""),
              title: String(source.title || ""),
              items: Array.isArray(source.items) ? source.items : [],
              heading: String(source.heading || ""),
              body: String(source.body || ""),
              ...(source.memo ? { memo: source.memo } : {}),
              label: String(source.label || ""),
              value: String(source.value || ""),
            },
            target: isGroupSource
              ? {
                  groupInsertIndex: String(targetGroupPositionSelect?.value || "0"),
                }
              : {
                  groupId: String(targetGroupSelect?.value || ""),
                  insertIndex: String(targetPositionSelect?.value || "0"),
                },
          },
        });
        return;
      }

      const target = getSelectedTarget();
      if (!target) return;

      vscode.postMessage({
        type: "applyPartialReplaceImport",
        payload: {
          keepOpen: !!keepOpen,
          replaceItemMemo: replaceItemMemo && !!source.memo,
          source: {
            sourceGroupId: String(source.sourceGroupId || ""),
            sourceGroupTitle: String(source.sourceGroupTitle || ""),
            sourceItemId: String(source.sourceItemId || ""),
            heading: String(source.heading || ""),
            body: String(source.body || ""),
            ...(source.memo ? { memo: source.memo } : {}),
          },
          target: {
            groupId: String(target.groupId || ""),
            itemId: String(target.itemId || ""),
            heading: String(target.heading || ""),
            body: String(target.body || ""),
            ...(target.memo ? { memo: target.memo } : {}),
          },
        },
      });
    }

    function moveToNextSource() {
      const currentSourceEntries = getCurrentSourceEntries();
      if (!Array.isArray(currentSourceEntries) || !currentSourceEntries.length) return;

      const currentIndex = currentSourceEntries.findIndex(
        (entry) => String(entry.sourceItemId || "") === String(selectedSourceItemId || ""),
      );

      if (currentIndex < 0) return;

      const next = currentSourceEntries[currentIndex + 1];
      if (!next) return;

      selectedSourceItemId = String(next.sourceItemId || "");
      renderAll();

      const nextButton = sourceListEl?.querySelector(
        '[data-role="pickSource"][data-source-item-id="' + CSS.escape(selectedSourceItemId) + '"]',
      );
      nextButton?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function getInsertPositionLabel(item, index) {
      if (item && item.kind === "divider") {
        const label = String(item?.label || "").trim() || \`無題区分 \${index + 1}\`;
        return \`区分「\${label}」の後\`;
      }

      const heading = String(item?.heading || "").trim() || \`無題項目 \${index + 1}\`;
      return \`項目「\${heading}」の後\`;
    }

    function getItemDisplayLabel(item, index) {
      if (!item) return "なし";

      if (item.kind === "divider") {
        const label = String(item.label || "").trim() || \`無題区分 \${index + 1}\`;
        const value = String(item.value || "").trim();
        return value ? \`区分: \${label}\\n\${value}\` : \`区分: \${label}\`;
      }

      const heading = String(item.heading || "").trim() || \`無題項目 \${index + 1}\`;
      const bodyLine =
        String(item.body || "")
          .split("\\n")
          .map((line) => line.trim())
          .filter(Boolean)[0] || "";

      return bodyLine ? \`項目: \${heading}\\n\${bodyLine}\` : \`項目: \${heading}\`;
    }

    function getSelectedSource() {
      return getCurrentSourceEntries().find(
        (entry) => String(entry.sourceItemId || "") === String(selectedSourceItemId || "")
      );
    }

    function buildSelectedSourceSnapshot() {
      const source = getSelectedSource();
      if (!source) return null;

      return {
        sourceType: String(source.sourceType || "entry"),
        sourceGroupTitle: String(source.sourceGroupTitle || ""),
        title: String(source.title || ""),
        label: String(source.label || ""),
        heading: String(source.heading || ""),
        body: String(source.body || ""),
        value: String(source.value || ""),
        previewLine: String(source.previewLine || ""),
      };
    }

    function isGroupSourceSelected() {
      const source = getSelectedSource();
      return !!source && String(source.sourceType || "") === "group";
    }

    function getSelectedTarget() {
      return getCurrentTargetEntries().find(
        (entry) => String(entry.itemId || "") === String(selectedTargetItemId || "")
      );
    }

    function renderSourceList() {
      const groupedEntries = getGroupedSourceEntries();

      if (!groupedEntries.length) {
        sourceListEl.innerHTML = '<div class="muted">該当する読み込み内容はありません。</div>';
        return;
      }

      sourceListEl.innerHTML = groupedEntries
        .map((block) => {
          const groupEntry = block.groupEntry;
          const children = Array.isArray(block.children) ? block.children : [];

          const groupHtml = groupEntry
            ? (() => {
                const done = appliedSourceIds.has(String(groupEntry.sourceItemId || ""));
                const active =
                  String(groupEntry.sourceItemId || "") === String(selectedSourceItemId || "");

                const lineText = \`区分 \${Number(groupEntry?.counts?.dividers || 0)}件 / 項目 \${Number(groupEntry?.counts?.entries || 0)}件\`;

                return \`
                  <button
                    type="button"
                    class="rowButton \${active ? "isActive" : ""} \${done ? "isDone" : ""}"
                    data-role="pickSource"
                    data-source-item-id="\${esc(groupEntry.sourceItemId)}"
                  >
                    <div class="rowTop">
                      <div class="rowTitleLine">
                        <span class="rowBadge">大分類</span>
                          <div class="rowTitle">
                            \${esc(String(groupEntry.title || ""))}
                            \${renderMiniBadges(groupEntry.importMeta)}
                          </div>
                      </div>
                    </div>
                    <div class="rowLine">\${esc(lineText)}</div>
                  </button>
                \`;
              })()
            : "";

          const childHtml = children
            .map((entry) => {
              const done = appliedSourceIds.has(String(entry.sourceItemId || ""));
              const active =
                String(entry.sourceItemId || "") === String(selectedSourceItemId || "");

              const typeLabel =
                entry.sourceType === "divider"
                  ? "区分"
                  : "項目";

              const mainLabel =
                entry.sourceType === "divider"
                  ? String(entry.label || "")
                  : String(entry.heading || "");

              const lineText = String(entry.previewLine || "");

              return \`
                <button
                  type="button"
                  class="rowButton isChild \${active ? "isActive" : ""} \${done ? "isDone" : ""}"
                  data-role="pickSource"
                  data-source-item-id="\${esc(entry.sourceItemId)}"
                >
                  <div class="rowTop">
                    <div class="rowTitleLine">
                      <span class="rowBadge">\${esc(typeLabel)}</span>
                      <div class="rowTitle">
                        \${esc(mainLabel)}
                        \${renderMiniBadges(entry.importMeta)}
                      </div>
                    </div>
                  </div>
                  <div class="rowLine">\${esc(lineText)}</div>
                </button>
              \`;
            })
            .join("");

          return \`
            <div class="sourceGroupBlock">
              \${groupHtml}
              \${childHtml ? \`<div class="childList">\${childHtml}</div>\` : ""}
            </div>
          \`;
        })
        .join("");

      sourceListEl.querySelectorAll("[data-role='pickSource']").forEach((button) => {
        button.addEventListener("click", () => {
          selectedSourceItemId = String(button.dataset.sourceItemId || "");
          renderAll();
        });
      });
    }

    function renderModeTabs() {
      modeInsertBtn?.classList.toggle("isActive", isInsertMode());
      modeReplaceBtn?.classList.toggle("isActive", !isInsertMode());
    }

    function renderModeLabels() {
      if (sourceSectionTitleEl) {
        sourceSectionTitleEl.textContent = isInsertMode() ? "読み込み内容" : "読み込み項目";
      }

      if (applyKeepOpenBtn) {
        applyKeepOpenBtn.textContent = isInsertMode()
          ? "挿入: 次を選択"
          : "上書き: 次を選択";
      }

      if (applyCloseBtn) {
        applyCloseBtn.textContent = isInsertMode()
          ? "挿入 → 閉じる"
          : "上書き → 閉じる";
      }

      if (jumpToSourceBtn) {
        jumpToSourceBtn.textContent = isInsertMode() ? "読込内容" : "読込項目";
      }

      if (jumpToTargetBtn) {
        jumpToTargetBtn.textContent = isInsertMode() ? "挿入先" : "上書き先";
      }
    }

    function getCurrentWarnings() {
      const warnings = Array.isArray(initialData.warnings)
        ? initialData.warnings
        : [];

      if (isInsertMode()) {
        return warnings;
      }

      return warnings.filter((warning) => {
        const code = String(warning?.code || "");
        return ![
          "MISSING_GROUP_FOR_ENTRY",
          "MISSING_GROUP_FOR_DIVIDER",
          "MISSING_GROUP_AND_ENTRY_FOR_BODY",
        ].includes(code);
      });
    }

    function renderWarnings() {
      if (!warningCardEl || !warningSummaryEl || !warningListEl) return;

      const currentWarnings = getCurrentWarnings();
      const warningDetailsEl = document.getElementById("warningDetails");

      if (!currentWarnings.length) {
        warningCardEl.hidden = true;
        warningListEl.innerHTML = "";
        updateWarningLayoutState();
        requestAnimationFrame(syncPanelHeights);
        return;
      }

      warningCardEl.hidden = false;

      warningSummaryEl.innerHTML =
        \`警告 \${currentWarnings.length}件\` +
        \`<span class="warningHint">クリックで開閉</span>\`;

      if (warningsHidden) {
        if (warningDetailsEl) {
          warningDetailsEl.open = false;
        }
        warningListEl.hidden = true;
        updateWarningLayoutState();
        requestAnimationFrame(syncPanelHeights);
        return;
      }

      if (warningDetailsEl) {
        warningDetailsEl.open = true;
      }

      warningListEl.hidden = false;
      warningListEl.innerHTML = currentWarnings
        .map((warning) => {
          const isAttention = String(warning?.level || "") === "attention";
          const sampleLine = String(warning?.sampleLine || "").trim();

          return \`
            <div class="warningItemBlock">
              <div class="warningHeaderLine">
                \${isAttention ? '<span class="warningFlag">要確認</span>' : ""}
                <span>\${esc(String(warning?.message || ""))}</span>
              </div>
              \${sampleLine ? \`<div class="warningSample">\${esc(sampleLine)}</div>\` : ""}
            </div>
          \`;
        })
        .join("");

      updateWarningLayoutState();
      requestAnimationFrame(syncPanelHeights);
    }

    function renderModePanels() {
      if (insertTargetPanel) {
        insertTargetPanel.hidden = !isInsertMode();
      }

      if (replaceTargetPanel) {
        replaceTargetPanel.hidden = isInsertMode();
      }

      if (sourceTypeFilter) {
        sourceTypeFilter.querySelectorAll("[data-insert-only='true']").forEach((option) => {
          option.hidden = !isInsertMode();
          option.disabled = !isInsertMode();
        });

        if (!isInsertMode() && sourceFilterType !== "all" && sourceFilterType !== "entry") {
          sourceFilterType = "all";
        }

        sourceTypeFilter.value = sourceFilterType;
      }
    }

    function renderTargetList() {
      if (!targetListEl) return;

      const currentTargetEntries = getCurrentTargetEntries();

      targetListEl.innerHTML = currentTargetEntries.map((entry) => {
        const active =
          String(entry.itemId || "") === String(selectedTargetItemId || "");
        return \`
          <button
            type="button"
            class="rowButton \${active ? "isActive" : ""}"
            data-role="pickTarget"
            data-item-id="\${esc(entry.itemId)}"
          >
            <div class="rowTop">
              <div class="rowTitle">\${esc(entry.heading)}</div>
            </div>
            <div class="rowMeta">\${esc(entry.groupTitle)}</div>
            <div class="rowLine">\${esc(entry.bodyPreview || "")}</div>
          </button>
        \`;
      }).join("");

      targetListEl.querySelectorAll("[data-role='pickTarget']").forEach((button) => {
        button.addEventListener("click", () => {
          selectedTargetItemId = String(button.dataset.itemId || "");
          renderAll();
        });
      });
    }

    function renderInsertTargetMode() {
      if (!isInsertMode()) return;

      const isGroupSource = isGroupSourceSelected();

      if (targetGroupSelect) {
        const wrapper = targetGroupSelect.closest("label");
        if (wrapper) wrapper.hidden = isGroupSource;
      }

      if (targetPositionSelect) {
        const wrapper = targetPositionSelect.closest("label");
        if (wrapper) wrapper.hidden = isGroupSource;
      }

      if (insertPreviewMetaEl) {
        insertPreviewMetaEl.hidden = isGroupSource;
      }

      if (groupInsertControls) {
        groupInsertControls.hidden = !isGroupSource;
      }
    }

    function renderGroupInsertPreview() {
      if (!groupInsertPreviewMetaEl) return;

      const positionLabel =
        targetGroupPositionSelect?.selectedOptions?.[0]?.textContent || "先頭";

      groupInsertPreviewMetaEl.innerHTML = \`
        <div>対象ノート: \${esc(initialData.noteTitle || "無題ノート")}</div>
        <div>大分類の位置: \${esc(positionLabel)}</div>
      \`;

      if (insertAroundPreviewEl) {
        insertAroundPreviewEl.innerHTML = "";
      }
    }

    function renderInsertAroundPreview() {
      if (!insertAroundPreviewEl || !isInsertMode()) return;

      const source = getSelectedSource();
      if (!source || source.sourceType === "group") {
        insertAroundPreviewEl.innerHTML = "";
        return;
      }

      const currentTargetGroups = getCurrentTargetGroups();
      const group = currentTargetGroups.find(
        (entry) => String(entry.groupId || "") === String(selectedTargetGroupId || ""),
      );

      if (!group) {
        insertAroundPreviewEl.innerHTML = "";
        return;
      }

      const items = Array.isArray(group.items) ? group.items : [];
      const index = Math.max(0, Math.min(Number(selectedInsertIndex || 0), items.length));

      const beforeItem = index > 0 ? items[index - 1] : null;
      const afterItem = index < items.length ? items[index] : null;

      insertAroundPreviewEl.innerHTML = \`
        <div class="insertAroundRow">
          <div class="insertAroundLabel">前列</div>
          <div class="insertAroundValue">\${esc(beforeItem ? getItemDisplayLabel(beforeItem, index - 1) : "なし")}</div>
        </div>
        <div class="insertAroundRow">
          <div class="insertAroundLabel">挿入位置</div>
          <div class="insertAroundValue">ここへ挿入</div>
        </div>
        <div class="insertAroundRow">
          <div class="insertAroundLabel">後列</div>
          <div class="insertAroundValue">\${esc(afterItem ? getItemDisplayLabel(afterItem, index) : "なし")}</div>
        </div>
      \`;
    }

    function renderTargetGroupOptions() {
      if (!isInsertMode() || !targetGroupSelect) return;

      const currentTargetGroups = getCurrentTargetGroups();

      targetGroupSelect.innerHTML = currentTargetGroups
        .map((group) => {
          const selected =
            String(group.groupId || "") === String(selectedTargetGroupId || "")
              ? "selected"
              : "";
          return \`<option value="\${esc(group.groupId)}" \${selected}>\${esc(group.groupTitle)}</option>\`;
        })
        .join("");
    }

    function renderGroupInsertPositionOptions() {
      const selectEl = document.getElementById("targetGroupPositionSelect");
      if (!selectEl) return;

      const currentTargetGroups = getCurrentTargetGroups();
      const groups = currentTargetGroups;
      const options = [];

      options.push(
        \`<option value="0" \${selectedGroupInsertIndex === "0" ? "selected" : ""}>先頭</option>\`,
      );

      groups.forEach((group, index) => {
        const insertIndex = index + 1;
        const selected =
          String(selectedGroupInsertIndex) === String(insertIndex) ? "selected" : "";

        options.push(
          \`<option value="\${insertIndex}" \${selected}>大分類「\${esc(group.groupTitle)}」の後</option>\`,
        );
      });

      selectEl.value = String(selectedGroupInsertIndex || "0");
      selectEl.innerHTML = options.join("");
    }

    function renderTargetPositionOptions() {
      if (!isInsertMode() || !targetPositionSelect) return;

      const currentTargetGroups = getCurrentTargetGroups();

      const group = currentTargetGroups.find(
        (entry) => String(entry.groupId || "") === String(selectedTargetGroupId || ""),
      );

      if (!group) {
        targetPositionSelect.innerHTML = \`<option value="0">先頭</option>\`;
        return;
      }

      const items = Array.isArray(group.items) ? group.items : [];
      const options = [];

      options.push(
        \`<option value="0" \${String(selectedInsertIndex) === "0" ? "selected" : ""}>先頭</option>\`,
      );

      items.forEach((item, index) => {
        const insertIndex = index + 1;
        const selected =
          String(selectedInsertIndex) === String(insertIndex) ? "selected" : "";
        options.push(
          \`<option value="\${insertIndex}" \${selected}>\${esc(getInsertPositionLabel(item, index))}</option>\`,
        );
      });

      if (!items.length) {
        options.push(\`<option value="0" selected>この大分類へ挿入</option>\`);
      }

      targetPositionSelect.innerHTML = options.join("");
    }

    function renderInsertPreview() {
      if (!isInsertMode() || !insertPreviewMetaEl) return;

      const currentTargetGroups = getCurrentTargetGroups();
      const group = currentTargetGroups.find(
        (entry) => String(entry.groupId || "") === String(selectedTargetGroupId || ""),
      );

      if (!group) {
        insertPreviewMetaEl.textContent = "";
        return;
      }

      const positionLabel =
        targetPositionSelect?.selectedOptions?.[0]?.textContent || "先頭";

      insertPreviewMetaEl.innerHTML = \`
        <div>挿入先: \${esc(group.groupTitle)}</div>
        <div>位置: \${esc(positionLabel)}</div>
      \`;

      renderInsertAroundPreview();
    }

    function formatMemoPreview(memo) {
      if (!memo) return "（項目メモなし）";
      return (memo.type === "list" ? "形式：リスト" : "形式：通常") + "\\n" + String(memo.body || "（本文なし）")
        + (memo.tags?.length ? "\\nタグ: " + memo.tags.join(" / ") : "");
    }

    function renderMemoOptions() {
      const source = getSelectedSource();
      document.getElementById("insertMemoOptions").hidden = !isInsertMode();
      document.getElementById("replaceMemoOptions").hidden = isInsertMode();
      const memoCount = source?.sourceType === "group"
        ? (source.items || []).filter((item) => item.kind !== "divider" && item.memo).length
        : source?.memo ? 1 : 0;
      includeItemMemosInput.checked = includeItemMemos;
      includeItemMemosInput.disabled = memoCount === 0;
      if (!isInsertMode() && !source?.memo) replaceItemMemo = false;
      replaceBodyOnlyInput.checked = !replaceItemMemo;
      replaceBodyAndMemoInput.checked = replaceItemMemo;
      replaceBodyAndMemoInput.disabled = !source?.memo;
      document.getElementById("memoImportSummary").textContent = !source ? "読み込む項目を選んでください。"
        : isInsertMode()
          ? "挿入：選択した" + (source.sourceType === "group" ? "大分類" : source.sourceType === "divider" ? "区分" : "項目") + "を指定位置へ挿入します。"
            + (memoCount ? "項目メモ " + memoCount + "件の本文・形式・タグは" + (includeItemMemos ? "一緒に挿入します。" : "挿入しません。") : "読み込み元に項目メモはありません。")
          : replaceItemMemo ? "上書き：詳細本文と項目メモの本文・形式・タグを上書きします。項目名・既存リンク・自動反映設定は保持します。"
            : "上書き：詳細本文だけを上書きし、既存の項目メモは保持します。";
    }

    function renderPreview() {
      renderMemoOptions();
      const source = getSelectedSource();

      if (!source) {
        previewMetaEl.textContent = "";
        previewBodyEl.classList.remove("isCompare");
        previewBodyEl.textContent = "左の項目を選択してください。";
        previewBodyEl.classList.add("muted");
        return;
      }

      if (!isInsertMode()) {
        const target = getSelectedTarget();

        const sourceBody = String(source.body || "");
        const targetBody = String(target?.body || "");

        previewMetaEl.innerHTML =
          \`<div class="muted">\${replaceItemMemo ? "詳細本文と項目メモを上書きします。項目名・既存リンク・自動反映設定は保持します。" : "上書きされるのは詳細本文のみです。項目名・項目メモは変更されません。"}</div>\`;

        previewBodyEl.classList.add("isCompare");
        previewBodyEl.innerHTML = \`
          <div class="comparePreview">
            <div class="compareBlock">
              <div class="compareLabel">読み込む詳細</div>
              <div class="compareBody">\${esc(sourceBody || "（空）")}</div>
              <div class="compareLabel">読み込む項目メモ（\${replaceItemMemo ? "上書き対象" : "対象外"}）</div>
              <div class="compareBody">\${esc(formatMemoPreview(source.memo))}</div>
            </div>

            <div class="compareBlock">
              <div class="compareLabel">上書き先の詳細</div>
              <div class="compareBody">\${esc(targetBody || "（空）")}</div>
              <div class="compareLabel">既存の項目メモ（\${replaceItemMemo ? "上書きされます" : "保持します"}）</div>
              <div class="compareBody">\${esc(formatMemoPreview(target?.memo))}</div>
            </div>
          </div>
        \`;
        previewBodyEl.classList.remove("muted");
        return;
      }

      if (source.sourceType === "group") {
        previewBodyEl.classList.remove("isCompare");
        previewMetaEl.textContent = \`大分類: \${source.title || "無題大分類"}\`;
        previewBodyEl.textContent =
          \`区分 \${Number(source?.counts?.dividers || 0)}件\\n項目 \${Number(source?.counts?.entries || 0)}件\`;
        const memos = (source.items || []).filter((item) => item.kind !== "divider" && item.memo);
        if (memos.length) previewBodyEl.textContent += "\\n\\n項目メモ（" + (includeItemMemos ? "挿入する" : "対象外") + "）\\n"
          + memos.map((item) => String(item.heading || "無題項目") + "\\n" + formatMemoPreview(item.memo)).join("\\n\\n");
        previewBodyEl.classList.remove("muted");
        return;
      }

      if (source.sourceType === "divider") {
        previewBodyEl.classList.remove("isCompare");
        previewMetaEl.textContent = \`区分: \${source.label || "無題区分"}\`;
        previewBodyEl.textContent = \`\${String(source.value || "")}\`;
        previewBodyEl.classList.remove("muted");
        return;
      }

      previewBodyEl.classList.remove("isCompare");
      previewMetaEl.textContent = \`項目: \${source.heading || "無題項目"}\`;
      previewBodyEl.textContent = \`\${String(source.body || "")}\`;
      if (source.memo) {
        previewBodyEl.textContent += "\\n\\n【項目メモ（" + (includeItemMemos ? "挿入する" : "対象外") + "）】\\n" + formatMemoPreview(source.memo);
      }
      previewBodyEl.classList.remove("muted");
    }

    function setApplyButtonsDisabled(disabled) {
      if (applyKeepOpenBtn) applyKeepOpenBtn.disabled = disabled;
      if (applyCloseBtn) applyCloseBtn.disabled = disabled;
    }

    function renderApplyState() {
      if (isInsertMode()) {
        if (isGroupSourceSelected()) {
          setApplyButtonsDisabled(!selectedSourceItemId);
          return;
        }

        setApplyButtonsDisabled(!(selectedSourceItemId && selectedTargetGroupId));
        return;
      }

      setApplyButtonsDisabled(!(selectedSourceItemId && selectedTargetItemId));
    }

    function switchMode(nextMode) {
      const prevMode = currentMode;

      currentMode =
        nextMode === "replace_entry_body"
          ? "replace_entry_body"
          : "insert_entry";

      sourceFilterType = "all";
      if (sourceTypeFilter) {
        sourceTypeFilter.value = "all";
      }

      selectedSourceItemId = "";
      selectedTargetItemId = "";
      selectedTargetGroupId = String(initialData.defaultTargetGroupId || "");
      selectedInsertIndex = String(initialData.defaultInsertIndex || "0");

      if (sourceFilterInput) {
        sourceFilterInput.value = sourceFilterText;
      }

      if (sourceTypeFilter) {
        sourceTypeFilter.value = sourceFilterType;
      }

      const currentSources = getCurrentSourceEntries();

      if (currentSources.length) {
        if (currentMode === "insert_entry" && prevMode !== "insert_entry") {
          const firstSelectable =
            currentSources.find((entry) => String(entry.sourceType || "") !== "group") ||
            currentSources[0];

          selectedSourceItemId = String(firstSelectable?.sourceItemId || "");
        } else {
          selectedSourceItemId = String(currentSources[0].sourceItemId || "");
        }
      }

      if (isInsertMode()) {
        const currentTargetGroups = getCurrentTargetGroups();

        if (!selectedTargetGroupId && currentTargetGroups.length) {
          selectedTargetGroupId = String(currentTargetGroups[0].groupId || "");
        }

        renderTargetGroupOptions();
        renderTargetPositionOptions();
        renderInsertPreview();
      } else {
        const currentTargets = getCurrentTargetEntries();
        if (currentTargets.length) {
          selectedTargetItemId = String(currentTargets[0].itemId || "");
        }
      }

      renderAll();
    }

    function syncPanelHeights() {
      const footerEl = document.querySelector(".footer");
      const shellEl = document.querySelector(".shell");
      if (!footerEl || !shellEl) return;

      const footerRect = footerEl.getBoundingClientRect();
      const bottomGap = 16;
      // Reserve the actual footer height, including wrapped buttons. When the
      // viewport is too short, the page can scroll its last card above it.
      shellEl.style.setProperty("--footer-space", (Math.ceil(footerRect.height) + bottomGap) + "px");
      const isSingleColumn = window.innerWidth <= 650;
      const hasWarnings = !warningCardEl?.hidden;
      const sourceList = document.getElementById("sourceList");
      const previewBody = document.getElementById("previewBody");
      const targetColumn = isInsertMode() ? insertTargetPanel : replaceTargetPanel;

      if (sourceList) {
        const available = footerRect.top - sourceList.getBoundingClientRect().top - bottomGap - 15;
        sourceList.style.boxSizing = "border-box";
        sourceList.style.maxHeight = Math.max(80, isSingleColumn ? Math.min(420, available) : available) + "px";
      }

      if (previewBody) {
        const available = footerRect.top - previewBody.getBoundingClientRect().top - bottomGap - 15;
        const preferred = isSingleColumn || hasWarnings ? 130 : 100;
        previewBody.style.boxSizing = "border-box";
        previewBody.style.minHeight = "0";
        previewBody.style.maxHeight = Math.max(40, Math.min(preferred, available)) + "px";
      }

      if (targetColumn) {
        // Measure after changing the preview height: that changes the target's
        // top edge. Constrain the whole card, including its padding and border.
        const available = footerRect.top - targetColumn.getBoundingClientRect().top - bottomGap;
        const targetList = document.getElementById("targetList");
        if (targetList) targetList.style.maxHeight = "none";
        targetColumn.style.boxSizing = "border-box";
        targetColumn.style.maxHeight = Math.max(isSingleColumn ? 240 : 100, available) + "px";
        targetColumn.style.overflow = "auto";
      }
    }

    const panelLayoutObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncPanelHeights);
    });
    [document.querySelector(".head"), document.querySelector(".footer")]
      .filter(Boolean).forEach((element) => panelLayoutObserver.observe(element));

    function renderAll() {
      renderModeTabs();
      renderModeLabels();
      renderModePanels();
      renderWarnings();
      renderSourceList();

      if (isInsertMode()) {
        renderInsertTargetMode();

        if (isGroupSourceSelected()) {
          renderGroupInsertPositionOptions();
          renderGroupInsertPreview();
        } else {
          renderTargetGroupOptions();
          renderTargetPositionOptions();
          renderInsertPreview();
        }
      } else {
        renderTargetList();
      }

      renderPreview();
      renderApplyState();
      requestAnimationFrame(syncPanelHeights);
    }

    cancelBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "cancelPartialImport" });
    });

    sourceFilterInput?.addEventListener("input", () => {
      sourceFilterText = String(sourceFilterInput.value || "");
      renderAll();
    });

    sourceTypeFilter?.addEventListener("change", () => {
      sourceFilterType = String(sourceTypeFilter.value || "all");
      renderAll();
    });

    modeInsertBtn?.addEventListener("click", () => {
      switchMode("insert_entry");
    });

    modeReplaceBtn?.addEventListener("click", () => {
      switchMode("replace_entry_body");
    });

    applyKeepOpenBtn?.addEventListener("click", () => {
      postApplyMessage(true);
    });
    includeItemMemosInput.addEventListener("change", () => {
      includeItemMemos = includeItemMemosInput.checked;
      renderPreview();
      requestAnimationFrame(syncPanelHeights);
    });
    [replaceBodyOnlyInput, replaceBodyAndMemoInput].forEach((radio) => radio.addEventListener("change", () => {
      replaceItemMemo = replaceBodyAndMemoInput.checked;
      renderPreview();
      requestAnimationFrame(syncPanelHeights);
    }));

    applyCloseBtn?.addEventListener("click", () => {
      postApplyMessage(false);
    });

    openSourceFileBtn?.addEventListener("click", () => {
      vscode.postMessage({ type: "openSourceFile" });
    });

    reloadImportSourceBtn?.addEventListener("click", () => {
      vscode.postMessage({
        type: "reloadImportSource",
        payload: {
          currentMode,
          includeItemMemos,
          replaceItemMemo,
          sourceFilterText,
          sourceFilterType,
          selectedSourceItemId,
          selectedTargetItemId,
          selectedTargetGroupId,
          selectedInsertIndex,
          selectedGroupInsertIndex,
          selectedSourceSnapshot: buildSelectedSourceSnapshot(),
        },
      });
    });

    jumpToSourceBtn?.addEventListener("click", () => {
      document.querySelector(".sourceColumn")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    jumpToTargetBtn?.addEventListener("click", () => {
      const activeTarget = isInsertMode() ? insertTargetPanel : replaceTargetPanel;
      activeTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data || {};

      if (message.type === "partialImportApplied") {
        const payload = message.payload || {};
        if (Array.isArray(payload.insertTargetGroups)) insertTargetGroups = payload.insertTargetGroups;
        if (Array.isArray(payload.replaceTargetEntries)) replaceTargetEntries = payload.replaceTargetEntries;
        const sourceItemId = String(payload.sourceItemId || "");
        const keepOpen = !!payload.keepOpen;
        const messageText = String(payload.message || "反映しました。");

        markSourceApplied(sourceItemId);
        showResultNotice(messageText);

        if (keepOpen) {
          moveToNextSource();
        }
        renderAll();
      }
    });

    window.addEventListener("resize", () => {
      requestAnimationFrame(syncPanelHeights);
    });

    const currentSources = getCurrentSourceEntries();
    if (
      !selectedSourceItemId ||
      !currentSources.some(
        (entry) =>
          String(entry.sourceItemId || "") === String(selectedSourceItemId || ""),
      )
    ) {
      if (currentSources.length) {
        selectedSourceItemId = String(currentSources[0].sourceItemId || "");
      }
    }

    const currentTargetGroups = getCurrentTargetGroups();
    if (
      (!selectedTargetGroupId ||
        !currentTargetGroups.some(
          (group) =>
            String(group.groupId || "") === String(selectedTargetGroupId || ""),
        )) &&
      currentTargetGroups.length
    ) {
      selectedTargetGroupId = String(currentTargetGroups[0].groupId || "");
    }

    renderTargetGroupOptions();
    renderTargetPositionOptions();

    const currentTargetEntries = getCurrentTargetEntries();
    if (
      (!selectedTargetItemId ||
        !currentTargetEntries.some(
          (entry) =>
            String(entry.itemId || "") === String(selectedTargetItemId || ""),
        )) &&
      currentTargetEntries.length
    ) {
      selectedTargetItemId = String(currentTargetEntries[0].itemId || "");
    }

    targetGroupSelect?.addEventListener("change", () => {
      selectedTargetGroupId = String(targetGroupSelect.value || "");
      selectedInsertIndex = "0";
      renderTargetPositionOptions();
      renderPreview();
      renderInsertPreview();
      renderApplyState();
    });

    targetPositionSelect?.addEventListener("change", () => {
      selectedInsertIndex = String(targetPositionSelect.value || "0");
      renderInsertPreview();
      renderApplyState();
    });

    targetGroupPositionSelect?.addEventListener("change", () => {
      selectedGroupInsertIndex = String(targetGroupPositionSelect.value || "0");
      renderGroupInsertPreview();
      renderApplyState();
    });

    const warningDetailsEl = document.getElementById("warningDetails");

    warningDetailsEl?.addEventListener("toggle", () => {
      warningsHidden = !warningDetailsEl.open;
      renderWarnings();
    });

    renderInsertAroundPreview();
    renderAll();
    requestAnimationFrame(syncPanelHeights);
  `;
}

module.exports = { getScript };
