function getCopyPanelScript() {
  return `
    function getGroupTitleLabel(group, index) {
      const title = String(group?.title || "").trim();
      return title || \`無題大分類 \${index + 1}\`;
    }

    function showCopyPanelMessage(message) {
      if (!copyPanelMessageEl) return;

      if (!message) {
        copyPanelMessageEl.hidden = true;
        copyPanelMessageEl.textContent = "";
        return;
      }

      copyPanelMessageEl.hidden = false;
      copyPanelMessageEl.textContent = message;
    }

    function updateCopyPreviewModeUi() {
      copyPreviewItemBtn?.classList.toggle("isActive", copyPreviewMode === "item");
      copyPreviewGroupBtn?.classList.toggle("isActive", copyPreviewMode === "group");
    }

    function showCopyPanelActionStatus(message) {
      if (!copyPanelActionStatus) return;

      const text = String(message || "").trim();

      if (copyPanelActionStatusTimer) {
        clearTimeout(copyPanelActionStatusTimer);
        copyPanelActionStatusTimer = null;
      }

      if (!text) {
        copyPanelActionStatus.hidden = true;
        copyPanelActionStatus.textContent = "";
        return;
      }

      copyPanelActionStatus.hidden = false;
      copyPanelActionStatus.textContent = text;

      copyPanelActionStatusTimer = setTimeout(() => {
        copyPanelActionStatus.hidden = true;
        copyPanelActionStatus.textContent = "";
        copyPanelActionStatusTimer = null;
      }, 1800);
    }

    function cloneGroupsForCopyUndo(groups) {
      return JSON.parse(JSON.stringify(Array.isArray(groups) ? groups : []));
    }

    function updateCopyUndoUi() {
      if (!copyUndoBtn) return;
      copyUndoBtn.disabled = !copyUndoState;
    }

    function rememberCopyUndoState() {
      copyUndoState = {
        groups: cloneGroupsForCopyUndo(state.groups),
        copyTargetGroupId: String(copyTargetGroupId || ""),
        copyTargetPositionValue: String(copyTargetPositionValue || "end"),
        copyGroupInsertPositionValue: String(copyGroupInsertPositionValue || "end"),
      };
      updateCopyUndoUi();
    }

    function clearCopyUndoState() {
      copyUndoState = null;
      updateCopyUndoUi();
    }

    function undoLastCopyAction() {
      if (!copyUndoState) return;

      state.groups = cloneGroupsForCopyUndo(copyUndoState.groups);
      copyTargetGroupId = String(copyUndoState.copyTargetGroupId || "");
      copyTargetPositionValue = String(copyUndoState.copyTargetPositionValue || "end");
      copyGroupInsertPositionValue = String(copyUndoState.copyGroupInsertPositionValue || "end");

      clearCopyUndoState();

      renderCopyTargetOptions();
      renderCopyGroupInsertPositionOptions();
      renderCopyPanelSummary();
      renderCopyTargetPreview();
      renderGroups();
      renderPreview();
      markDirty();

      requestApplyCopyDraft();

      clearStatus();
      setStatus("直前のコピーを取り消しました。", true);
      showCopyPanelActionStatus("取り消しました。");
    }

    function setCopySettingsOpen(open) {
      isCopySettingsOpen = !!open;

      if (copyPanelSettingsEl) {
        copyPanelSettingsEl.hidden = !isCopySettingsOpen;
      }
    }

    function getCopyTargetGroupLabel() {
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const index = groups.findIndex((g) => g.id === copyTargetGroupId);
      if (index < 0) return "未選択";
      return getGroupTitleLabel(groups[index], index);
    }

    function getCopySourceNoteLabel() {
      const items = Array.isArray(copySourceListState) ? copySourceListState : [];
      const found = items.find((item) => item.fsPath === copySourceNotePath);
      return found?.title || found?.name || "未選択";
    }

    function getCopyTargetNoteLabel() {
      const kind = String(initial?.type || initial?.noteType || "") === "plot"
        ? "プロット"
        : "資料";

      const title =
        typeof titleInput !== "undefined" && titleInput
          ? String(titleInput.value || state?.title || initial?.title || "").trim()
          : String(state?.title || initial?.title || "").trim();

      return title ? \`\${kind}: \${title}\` : kind;
    }

    function getCopyEntryPositionSummary() {
      if (!copyTargetGroupId) return "未選択";

      const targetGroup = state.groups.find((g) => g.id === copyTargetGroupId);
      if (!targetGroup) return "未選択";

      return getCopyPositionLabel(targetGroup, copyTargetPositionValue);
    }

    function getCopyGroupPositionSummary() {
      return getCopyGroupInsertPositionLabel(copyGroupInsertPositionValue);
    }

    function renderCopyPanelSummary() {
      if (!copyPanelSummaryEl) return;

      copyPanelSummaryEl.innerHTML = \`
        <div class="copySummaryLine"><span class="copySummaryLabel">コピー先</span><span class="copySummaryValue">\${esc(getCopyTargetNoteLabel())}</span></div>
        <div class="copySummaryLine"><span class="copySummaryLabel">コピー元</span><span class="copySummaryValue">\${esc(getCopySourceNoteLabel())}</span></div>
        <div class="copySummaryLine"><span class="copySummaryLabel">項目・区分</span><span class="copySummaryValue">\${esc(getCopyEntryPositionSummary())}</span></div>
        <div class="copySummaryLine"><span class="copySummaryLabel">大分類</span><span class="copySummaryValue">\${esc(getCopyGroupPositionSummary())}</span></div>
      \`;
    }

    function renderCopyTargetPreview() {
      updateCopyPreviewModeUi();

      if (copyPreviewMode === "group") {
        renderCopyGroupTargetPreview();
        return;
      }

      renderCopyItemTargetPreview();
    }

    function renderCopyItemTargetPreview() {
      if (!copyTargetPreviewEl) return;

      const groups = Array.isArray(state.groups) ? state.groups : [];
      const targetGroupIndex = groups.findIndex((g) => g.id === copyTargetGroupId);
      const targetGroup = targetGroupIndex >= 0 ? groups[targetGroupIndex] : null;

      const entryPreview = targetGroup
        ? esc(getCopyPositionLabel(targetGroup, copyTargetPositionValue))
        : "未選択";

      const groupPreview = esc(
        getCopyGroupInsertPositionLabel(copyGroupInsertPositionValue),
      );

      if (!targetGroup) {
        copyTargetPreviewEl.innerHTML = \`
          <div class="copyTargetPreviewTitle">現在のコピー先</div>

          <div class="copyTargetPreviewLine">
            <span class="copyTargetPreviewLabel">項目・区分</span>
            <span class="copyTargetPreviewValue">未選択</span>
          </div>

          <div class="copyTargetPreviewLine">
            <span class="copyTargetPreviewLabel">大分類</span>
            <span class="copyTargetPreviewValue">\${groupPreview}</span>
          </div>

          <div class="copyTargetPreviewHint">コピー先大分類を選ぶと、挿入位置の前後関係を表示します。</div>
        \`;
        return;
      }

      const items = Array.isArray(targetGroup.items) ? targetGroup.items : [];
      const insertIndex = resolveCopyInsertIndex(targetGroup, copyTargetPositionValue);

      const previewStart = Math.max(0, insertIndex - 2);
      const previewEnd = Math.min(items.length, insertIndex + 2);
      const previewItems = items.slice(previewStart, previewEnd);

      const aroundListHtml = previewItems.length
        ? previewItems
            .map((item, localIndex) => {
              const actualIndex = previewStart + localIndex;
              const isInsertBefore = actualIndex === insertIndex;
              const label = esc(getCopyInsertItemLabel(item, actualIndex));
              const sub = esc(
                item?.kind === "divider"
                  ? String(item?.value || "").trim()
                  : String(item?.body || "").trim()
              );

              return \`
                \${
                  isInsertBefore
                    ? \`
                      <div class="copyTargetPreviewListInsert">
                        <span class="copyTargetPreviewListInsertMark">挿入</span>
                        <span class="copyTargetPreviewListInsertText">ここに追加されます</span>
                      </div>
                    \`
                    : ""
                }

                <div class="copyTargetPreviewListItem">
                  <div class="copyTargetPreviewListItemLabel">\${label}</div>
                  <div class="copyTargetPreviewListItemSub">\${sub || "内容なし"}</div>
                </div>
              \`;
            })
            .join("")
        : \`
          <div class="copyTargetPreviewListInsert">
            <span class="copyTargetPreviewListInsertMark">挿入</span>
            <span class="copyTargetPreviewListInsertText">この大分類の先頭に追加されます</span>
          </div>
        \`;

      const insertAtEndHtml =
        insertIndex >= items.length
          ? \`
            <div class="copyTargetPreviewListInsert">
              <span class="copyTargetPreviewListInsertMark">挿入</span>
              <span class="copyTargetPreviewListInsertText">ここに追加されます</span>
            </div>
          \`
          : "";

      copyTargetPreviewEl.innerHTML = \`
        <div class="copyTargetPreviewTitle">現在のコピー先</div>

        <div class="copyTargetPreviewLine">
          <span class="copyTargetPreviewLabel">大分類</span>
          <span class="copyTargetPreviewValue">\${esc(getGroupTitleLabel(targetGroup, targetGroupIndex))}</span>
        </div>

        <div class="copyTargetPreviewLine">
          <span class="copyTargetPreviewLabel">項目・区分</span>
          <span class="copyTargetPreviewValue">\${entryPreview}</span>
        </div>

        <div class="copyTargetPreviewLine">
          <span class="copyTargetPreviewLabel">大分類位置</span>
          <span class="copyTargetPreviewValue">\${groupPreview}</span>
        </div>

        <div class="copyTargetPreviewBlockTitle">近辺プレビュー</div>
        <div class="copyTargetPreviewList">
          \${aroundListHtml}
          \${insertAtEndHtml}
        </div>
      \`;
    }

    function renderCopyGroupTargetPreview() {
      if (!copyTargetPreviewEl) return;

      const groups = Array.isArray(state.groups) ? state.groups : [];
      const insertIndex = resolveCopyGroupInsertIndex(copyGroupInsertPositionValue);

      const previewStart = Math.max(0, insertIndex - 2);
      const previewEnd = Math.min(groups.length, insertIndex + 2);
      const previewGroups = groups.slice(previewStart, previewEnd);

      const groupPreview = esc(
        getCopyGroupInsertPositionLabel(copyGroupInsertPositionValue),
      );

      const listHtml = previewGroups.length
        ? previewGroups
            .map((group, localIndex) => {
              const actualIndex = previewStart + localIndex;
              const isInsertBefore = actualIndex === insertIndex;
              const title = esc(getGroupTitleLabel(group, actualIndex));
              const itemCount = Array.isArray(group?.items) ? group.items.length : 0;

              return \`
                \${
                  isInsertBefore
                    ? \`
                      <div class="copyTargetPreviewListInsert">
                        <span class="copyTargetPreviewListInsertMark">挿入</span>
                        <span class="copyTargetPreviewListInsertText">ここに大分類が追加されます</span>
                      </div>
                    \`
                    : ""
                }

                <div class="copyTargetPreviewListItem">
                  <div class="copyTargetPreviewListItemLabel">大分類「\${title}」</div>
                  <div class="copyTargetPreviewListItemSub">項目・区分 \${itemCount} 件</div>
                </div>
              \`;
            })
            .join("")
        : \`
          <div class="copyTargetPreviewListInsert">
            <span class="copyTargetPreviewListInsertMark">挿入</span>
            <span class="copyTargetPreviewListInsertText">このノートの先頭に大分類が追加されます</span>
          </div>
        \`;

      const insertAtEndHtml =
        insertIndex >= groups.length
          ? \`
            <div class="copyTargetPreviewListInsert">
              <span class="copyTargetPreviewListInsertMark">挿入</span>
              <span class="copyTargetPreviewListInsertText">ここに大分類が追加されます</span>
            </div>
          \`
          : "";

      copyTargetPreviewEl.innerHTML = \`
        <div class="copyTargetPreviewTitle">現在のコピー先</div>

        <div class="copyTargetPreviewLine">
          <span class="copyTargetPreviewLabel">大分類位置</span>
          <span class="copyTargetPreviewValue">\${groupPreview}</span>
        </div>

        <div class="copyTargetPreviewBlockTitle">ノート全体の並び</div>
        <div class="copyTargetPreviewList">
          \${listHtml}
          \${insertAtEndHtml}
        </div>
      \`;
    }

    function getCollapsedCopyBody(text) {
      const value = String(text || "").trim();
      if (!value) return "内容なし";
      return value;
    }

    function getExpandedCopyBodyHtml(text) {
      const value = String(text || "").trim();
      if (!value) {
        return '<div class="copyItemExpandedBody isEmpty">内容なし</div>';
      }

      return \`<div class="copyItemExpandedBody">\${esc(value).replace(/\\n/g, "<br>")}</div>\`;
    }

    function cloneImportedItem(item) {
      const next = JSON.parse(JSON.stringify(item || {}));
      next.id = crypto.randomUUID();
      next.kind = next.kind === "divider" ? "divider" : "entry";

      if (next.kind === "divider") {
        next.label = String(next.label || "");
        next.value = String(next.value || "");
        return next;
      }

      next.heading = String(next.heading || "");
      next.body = String(next.body || "");
      if (next.memo && typeof next.memo === "object") {
        next.memo = JSON.parse(JSON.stringify(next.memo));
      }
      return next;
    }

    function cloneImportedGroup(group) {
      const next = JSON.parse(JSON.stringify(group || {}));
      next.id = crypto.randomUUID();
      next.title = String(next.title || "");
      next.items = Array.isArray(next.items)
        ? next.items.map(cloneImportedItem)
        : [];
      return next;
    }

    function ensureCopyTargetGroup() {
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const exists = groups.some((g) => g.id === copyTargetGroupId);

      if (!exists) {
        copyTargetGroupId = groups[0]?.id || "";
      }
    }

    function ensureCopyGroupInsertPosition() {
      const optionsHtml = getCopyGroupInsertPositionOptions(copyGroupInsertPositionValue);
      const temp = document.createElement("select");
      temp.innerHTML = optionsHtml;

      const exists = Array.from(temp.options).some(
        (option) => option.value === copyGroupInsertPositionValue,
      );

      if (!exists) {
        copyGroupInsertPositionValue = "end";
      }
    }

    function getCopyGroupInsertPositionOptions(selectedValue) {
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const options = [];

      options.push(
        \`<option value="" \${selectedValue === "" ? "selected" : ""}>位置を選択</option>\`
      );

      options.push(
        \`<option value="start" \${selectedValue === "start" ? "selected" : ""}>先頭</option>\`
      );

      options.push(
        \`<option value="end" \${selectedValue === "end" ? "selected" : ""}>末尾</option>\`
      );

      groups.forEach((group, index) => {
        const label = esc(getGroupTitleLabel(group, index));
        const value = \`after:\${group.id}\`;

        options.push(
          \`<option value="\${value}" \${selectedValue === value ? "selected" : ""}>\${label} の後</option>\`
        );
      });

      return options.join("");
    }

    function renderCopyGroupInsertPositionOptions() {
      if (!copyGroupInsertPositionSelect) return;

      ensureCopyGroupInsertPosition();
      copyGroupInsertPositionSelect.innerHTML = getCopyGroupInsertPositionOptions(
        copyGroupInsertPositionValue,
      );
      renderCopyPanelSummary();
      renderCopyTargetPreview();
    }

    function resolveCopyGroupInsertIndex(positionValue) {
      const groups = Array.isArray(state.groups) ? state.groups : [];

      if (!positionValue || positionValue === "end") {
        return groups.length;
      }

      if (positionValue === "start") {
        return 0;
      }

      const parts = String(positionValue).split(":");
      const mode = parts[0];
      const anchorId = parts.slice(1).join(":");

      if (mode !== "after" || !anchorId) {
        return groups.length;
      }

      const anchorIndex = groups.findIndex((group) => group.id === anchorId);
      if (anchorIndex < 0) {
        return groups.length;
      }

      return anchorIndex + 1;
    }

    function getCopyGroupInsertPositionLabel(positionValue) {
      const groups = Array.isArray(state.groups) ? state.groups : [];

      if (!positionValue || positionValue === "end") {
        return "末尾";
      }

      if (positionValue === "start") {
        return "先頭";
      }

      const parts = String(positionValue).split(":");
      const mode = parts[0];
      const anchorId = parts.slice(1).join(":");

      const anchorIndex = groups.findIndex((group) => group.id === anchorId);
      const anchorGroup = anchorIndex >= 0 ? groups[anchorIndex] : null;

      if (!anchorGroup || mode !== "after") {
        return "末尾";
      }

      return \`\${getGroupTitleLabel(anchorGroup, anchorIndex)} の後\`;
    }

    function getCopyInsertItemLabel(item, index) {
      const kind = item && item.kind === "divider" ? "divider" : "entry";

      if (kind === "divider") {
        const label = String(item?.label || "").trim() || \`無題区分 \${index + 1}\`;
        return \`区分「\${label}」\`;
      }

      const heading = String(item?.heading || "").trim() || \`無題項目 \${index + 1}\`;
      return \`項目「\${heading}」\`;
    }

    function getCopyTargetPositionOptions(targetGroupId, selectedValue) {
      if (!targetGroupId) {
        return '<option value="">位置を選択</option>';
      }

      const targetGroup = state.groups.find((g) => g.id === targetGroupId);
      if (!targetGroup) {
        return '<option value="">位置を選択</option>';
      }

      const targetItems = Array.isArray(targetGroup.items) ? targetGroup.items : [];
      const options = [];

      options.push(
        \`<option value="" \${selectedValue === "" ? "selected" : ""}>位置を選択</option>\`
      );

      options.push(
        \`<option value="start" \${selectedValue === "start" ? "selected" : ""}>先頭</option>\`
      );

      options.push(
        \`<option value="end" \${selectedValue === "end" ? "selected" : ""}>末尾</option>\`
      );

      targetItems.forEach((item, index) => {
        const label = esc(getCopyInsertItemLabel(item, index));
        const beforeValue = \`before:\${item.id}\`;
        const afterValue = \`after:\${item.id}\`;

        options.push(
          \`<option value="\${beforeValue}" \${selectedValue === beforeValue ? "selected" : ""}>\${label} の前</option>\`
        );

        options.push(
          \`<option value="\${afterValue}" \${selectedValue === afterValue ? "selected" : ""}>\${label} の後</option>\`
        );
      });

      return options.join("");
    }

    function renderCopyTargetOptions() {
      ensureCopyTargetGroup();

      const groups = Array.isArray(state.groups) ? state.groups : [];
      copyTargetGroupSelect.innerHTML = groups
        .map((group, index) => {
          const label = esc(getGroupTitleLabel(group, index));
          const selected = group.id === copyTargetGroupId ? "selected" : "";
          return \`<option value="\${group.id}" \${selected}>\${label}</option>\`;
        })
        .join("");

      renderCopyTargetPositionOptions();
      renderCopyGroupInsertPositionOptions();
      renderCopyPanelSummary();
      renderCopyTargetPreview();
    }

    function ensureCopyTargetPosition() {
      if (!copyTargetGroupId) {
        copyTargetPositionValue = "";
        return;
      }

      const optionsHtml = getCopyTargetPositionOptions(copyTargetGroupId, copyTargetPositionValue);
      const temp = document.createElement("select");
      temp.innerHTML = optionsHtml;

      const exists = Array.from(temp.options).some(
        (option) => option.value === copyTargetPositionValue,
      );

      if (!exists) {
        copyTargetPositionValue = "end";
      }
    }

    function renderCopyTargetPositionOptions() {
      if (!copyTargetPositionSelect) return;

      ensureCopyTargetPosition();
      copyTargetPositionSelect.innerHTML = getCopyTargetPositionOptions(
        copyTargetGroupId,
        copyTargetPositionValue,
      );
      renderCopyPanelSummary();
      renderCopyTargetPreview();
    }

    function resolveCopyInsertIndex(targetGroup, positionValue) {
      const items = Array.isArray(targetGroup?.items) ? targetGroup.items : [];

      if (!positionValue || positionValue === "end") {
        return items.length;
      }

      if (positionValue === "start") {
        return 0;
      }

      const parts = String(positionValue).split(":");
      const mode = parts[0];
      const anchorId = parts.slice(1).join(":");

      if (!mode || !anchorId) {
        return items.length;
      }

      const anchorIndex = items.findIndex((item) => item.id === anchorId);
      if (anchorIndex < 0) {
        return items.length;
      }

      if (mode === "before") {
        return anchorIndex;
      }

      if (mode === "after") {
        return anchorIndex + 1;
      }

      return items.length;
    }

    function getCopyPositionLabel(targetGroup, positionValue) {
      const items = Array.isArray(targetGroup?.items) ? targetGroup.items : [];

      if (!positionValue || positionValue === "end") {
        return "末尾";
      }

      if (positionValue === "start") {
        return "先頭";
      }

      const parts = String(positionValue).split(":");
      const mode = parts[0];
      const anchorId = parts.slice(1).join(":");

      const anchorIndex = items.findIndex((item) => item.id === anchorId);
      const anchorItem = anchorIndex >= 0 ? items[anchorIndex] : null;

      if (!anchorItem) {
        return "末尾";
      }

      const label = getCopyInsertItemLabel(anchorItem, anchorIndex);

      if (mode === "before") {
        return \`\${label} の前\`;
      }

      if (mode === "after") {
        return \`\${label} の後\`;
      }

      return "末尾";
    }

    function openCopyPanel() {
      setCopyPanelOpen(true);
      setCopySettingsOpen(true);
      showCopyPanelMessage("");
      requestCopySourceList();
      renderCopyTargetOptions();
      renderCopyGroupInsertPositionOptions();
      renderCopyPanelSummary();
      renderCopyTargetPreview();
      updateCopyUndoUi();

      requestAnimationFrame(() => {
        copySourceSelect?.focus();
      });
    }

    function closeCopyPanel() {
      setCopyPanelOpen(false);
      showCopyPanelActionStatus("");
    }

    function requestCopySourceList() {
      vscode.postMessage({
        type: "requestCopySourceList",
      });
    }

    function requestCopySourceNote(filePath) {
      vscode.postMessage({
        type: "requestCopySourceNote",
        filePath,
      });
    }

    function copyExternalGroup(groupIndex) {
      const groups = Array.isArray(copySourceNoteState?.groups)
        ? copySourceNoteState.groups
        : [];
      const sourceGroup = groups[groupIndex];
      if (!sourceGroup) return;

      if (!copyGroupInsertPositionValue) {
        showCopyPanelMessage("大分類の挿入位置を選択してください。");
        renderCopyGroupInsertPositionOptions();
        copyGroupInsertPositionSelect?.focus();
        return;
      }

      rememberCopyUndoState();

      const insertIndex = resolveCopyGroupInsertIndex(copyGroupInsertPositionValue);
      state.groups.splice(insertIndex, 0, cloneImportedGroup(sourceGroup));

      ensureCopyTargetGroup();
      renderCopyTargetOptions();
      renderCopyTargetPreview();
      renderCopyGroupInsertPositionOptions();
      markDirty();
      renderGroups();
      renderPreview();

      const title = getGroupTitleLabel(sourceGroup, groupIndex);
      const positionLabel = getCopyGroupInsertPositionLabel(copyGroupInsertPositionValue);

      clearStatus();
      setStatus(\`大分類「\${title}」を\${positionLabel}へコピーしました。\`, true);

      requestApplyCopyDraft();
      showCopyPanelActionStatus("コピーしました。");
    }

    function copyExternalItem(groupIndex, itemIndex) {
      ensureCopyTargetGroup();

      const targetGroup = state.groups.find((g) => g.id === copyTargetGroupId);
      if (!targetGroup) {
        showCopyPanelMessage("コピー先大分類が見つかりませんでした。");
        return;
      }

      if (!copyTargetPositionValue) {
        showCopyPanelMessage("挿入位置を選択してください。");
        renderCopyTargetPositionOptions();
        copyTargetPositionSelect?.focus();
        return;
      }

      const groups = Array.isArray(copySourceNoteState?.groups)
        ? copySourceNoteState.groups
        : [];
      const sourceGroup = groups[groupIndex];
      if (!sourceGroup) return;

      const sourceItems = Array.isArray(sourceGroup.items) ? sourceGroup.items : [];
      const sourceItem = sourceItems[itemIndex];
      if (!sourceItem) return;

      rememberCopyUndoState();

      const insertIndex = resolveCopyInsertIndex(targetGroup, copyTargetPositionValue);
      targetGroup.items.splice(insertIndex, 0, cloneImportedItem(sourceItem));

      markDirty();
      renderGroups();
      renderPreview();
      renderCopyTargetPositionOptions();
      renderCopyTargetPreview();

      const itemLabel =
        sourceItem.kind === "divider"
          ? String(sourceItem?.label || "区分")
          : String(sourceItem?.heading || "項目");

      const targetLabel = getGroupTitleLabel(
        targetGroup,
        state.groups.findIndex((g) => g.id === targetGroup.id),
      );

      const positionLabel = getCopyPositionLabel(targetGroup, copyTargetPositionValue);

      clearStatus();
      setStatus(
        \`「\${itemLabel || "項目"}」を「\${targetLabel}」の\${positionLabel}へコピーしました。\`,
        true,
      );

      requestApplyCopyDraft();
      showCopyPanelActionStatus("コピーしました。");
    }

    function renderCopyPanel() {
      if (!copySourceSelect || !copySourceContentEl) return;

      renderCopyTargetOptions();
      renderCopyGroupInsertPositionOptions();
      renderCopyPanelSummary();
      renderCopyTargetPreview();

      if (!Array.isArray(copySourceListState) || !copySourceListState.length) {
        copySourceSelect.innerHTML = '<option value="">コピー元ノートがありません</option>';
        copySourceContentEl.innerHTML =
          '<div class="templateEmpty">コピーできる同種ノートがまだありません。</div>';
        return;
      }

      copySourceSelect.innerHTML = copySourceListState
        .map((item) => {
          const label = esc(item.title || item.name || "無題ノート");
          const selected = item.fsPath === copySourceNotePath ? "selected" : "";
          return \`<option value="\${esc(item.fsPath)}" \${selected}>\${label}</option>\`;
        })
        .join("");

      const sourceGroups = Array.isArray(copySourceNoteState?.groups)
        ? copySourceNoteState.groups
        : [];

      if (!copySourceNotePath || !sourceGroups.length) {
        copySourceContentEl.innerHTML =
          '<div class="templateEmpty">コピー元ノートを選択してください。</div>';
        return;
      }

      copySourceContentEl.innerHTML = sourceGroups
        .map((group, groupIndex) => {
          const title = esc(getGroupTitleLabel(group, groupIndex));
          const items = Array.isArray(group?.items) ? group.items : [];

          const itemsHtml = items.length
            ? \`
              <div class="copyItemList">
                \${items
                  .map((item, itemIndex) => {
                    const isDivider = item?.kind === "divider";
                    const itemTypeLabel = isDivider ? "区分" : "項目";
                    const name = esc(
                      isDivider
                        ? item?.label || "区分"
                        : item?.heading || "無題項目"
                    );
                    const rawText = isDivider
                      ? item?.value || ""
                      : item?.body || "";
                    const previewText = esc(getCollapsedCopyBody(rawText));

                    return \`
                      <div class="copyItemRow" data-copy-item-row>
                        <div class="copyItemMeta">
                          <div class="copyItemNameRow">
                            <span class="copyItemKind">\${itemTypeLabel}</span>
                            <div class="copyItemName">\${name}</div>
                          </div>

                          <div class="copyItemSub copyItemSubCollapsed">\${previewText}</div>

                          <div class="copyItemExpanded" hidden>
                            \${getExpandedCopyBodyHtml(rawText)}
                          </div>
                        </div>

                        <div class="copyItemActions">
                          <button
                            class="secondary copyMiniToggle"
                            type="button"
                            data-action="toggleCopyItemExpand"
                          >
                            開く
                          </button>
                          <button
                            class="secondary"
                            type="button"
                            data-action="copyExternalItem"
                            data-group-index="\${groupIndex}"
                            data-item-index="\${itemIndex}"
                          >
                            \${itemTypeLabel}をコピー
                          </button>
                        </div>
                      </div>
                    \`;
                  })
                  .join("")}
              </div>
            \`
            : '<div class="templateEmpty">項目がありません。</div>';

          return \`
            <div class="copyGroupCard">
              <div class="copyGroupHead">
                <div class="copyGroupTitle">大分類: \${title}</div>
                <button
                  class="secondary"
                  type="button"
                  data-action="copyExternalGroup"
                  data-group-index="\${groupIndex}"
                >
                  大分類をコピー
                </button>
              </div>
              \${itemsHtml}
            </div>
          \`;
        })
        .join("");

      copySourceContentEl.querySelectorAll("[data-action='copyExternalGroup']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupIndex = Number(btn.dataset.groupIndex);
          copyExternalGroup(groupIndex);
        });
      });

      copySourceContentEl.querySelectorAll("[data-action='copyExternalItem']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupIndex = Number(btn.dataset.groupIndex);
          const itemIndex = Number(btn.dataset.itemIndex);
          copyExternalItem(groupIndex, itemIndex);
        });
      });

      copySourceContentEl.querySelectorAll("[data-action='toggleCopyItemExpand']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest("[data-copy-item-row]");
          if (!row) return;

          const expanded = row.querySelector(".copyItemExpanded");
          const isOpen = expanded && !expanded.hidden;

          if (expanded) {
            expanded.hidden = isOpen;
          }

          btn.textContent = isOpen ? "開く" : "閉じる";
        });
      });
    }

`;
}

module.exports = {
  getCopyPanelScript,
};
