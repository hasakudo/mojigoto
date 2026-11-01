const { getPreviewMoveActionsScript, getPreviewEventsScript } = require("./script-preview-actions");

function getPreviewScript() {
  return `
    function escapePreviewText(value) {
      return esc(String(value || "")).replace(/\\n/g, "<br>");
    }

    function renderPreviewMovePicker(groupId, itemId) {
      const selectedMoveTargetGroupId = movePickerState.targetGroupId || groupId;
      const selectedMoveInsertIndex = movePickerState.insertIndex || "";
      const moveTargetOptions = renderMoveTargetOptions(
        groupId,
        selectedMoveTargetGroupId,
      );
      const movePositionOptions = renderMovePositionOptions(
        groupId,
        itemId,
        selectedMoveTargetGroupId,
        selectedMoveInsertIndex,
      );

      return \`
        <div class="previewMovePicker">
          <select
            data-role="previewMoveTargetGroup"
            data-group-id="\${groupId}"
            data-item-id="\${itemId}"
          >
            \${moveTargetOptions}
          </select>

          <select
            data-role="previewMoveTargetPosition"
            data-group-id="\${groupId}"
            data-item-id="\${itemId}"
          >
            \${movePositionOptions}
          </select>

          <button
            class="secondary previewMiniAction"
            type="button"
            data-action="previewConfirmMoveItem"
            data-group-id="\${groupId}"
            data-item-id="\${itemId}"
          >実行</button>

          <button
            class="secondary previewMiniAction"
            type="button"
            data-action="previewCloseMovePicker"
            data-group-id="\${groupId}"
            data-item-id="\${itemId}"
          >閉じる</button>
        </div>
      \`;
    }

${getPreviewMoveActionsScript()}
    function ensurePreviewScrollInRange() {
      const previewScrollEl = getPreviewScrollEl?.();
      if (!previewScrollEl) return;

      const maxScroll = Math.max(
        0,
        previewScrollEl.scrollHeight - previewScrollEl.clientHeight,
      );

      if (previewScrollEl.scrollTop > maxScroll) {
        previewScrollEl.scrollTop = maxScroll;
      }
    }

    function renderPreview() {
      refreshNoteSearchMatches();
      if (typeof queueNoteDisplaySnapshot === "function") queueNoteDisplaySnapshot();
      const isBoardMode = previewMode === "board";

      previewPane?.classList.toggle("isBoardMode", isBoardMode);
      updatePreviewModeButtons();
      const memoTools = document.getElementById("previewMemoTools");
      if (memoTools) memoTools.hidden = isBoardMode;
      updateNoteMemoVisibilityControls();

      if (isBoardMode) {
        if (previewRoot) previewRoot.hidden = true;

        if (previewBoardRoot) {
          previewBoardRoot.hidden = false;
          renderBoardTo(previewBoardRoot, { inline: true });
        }

        return;
      }

      if (previewRoot) previewRoot.hidden = false;
      if (previewBoardRoot) previewBoardRoot.hidden = true;

      renderPreviewList();

      requestAnimationFrame(() => {
        ensurePreviewScrollInRange();
      });
    }

    function renderPreviewList() {
      const title = esc(state.title || "");
      const visibleGroups = getVisibleGroupsForSearch();
      updatePreviewCounts(visibleGroups);

      if (!visibleGroups.length) {
        previewRoot.innerHTML = \`
          <div class="previewWrap">
            <div class="muted">該当する項目はありません。</div>
          </div>
        \`;
        return;
      }

      const groupsHtml = visibleGroups.map((group) => {
        const groupTitle = noteDisplayRenderer.text(group.title || "", searchQuery);
        const groupRelatedCount = (Array.isArray(group?.items) ? group.items : [])
          .reduce((total, item) => total + (Array.isArray(item?.relatedReferences) ? item.relatedReferences.length : 0), 0);
        const groupRelatedMarker = groupRelatedCount
          ? noteDisplayRenderer.related(groupRelatedCount)
          : "";
        const isCollapsed = collapsedGroupIds.has(group.id);

        const visibleItems = getVisibleItemsForGroup(group);

        if (isCollapsed) {
          return \`
            <section class="previewGroup">
              <div class="previewGroupHead">
                <h3 class="previewGroupTitle" data-nav-id="group:\${group.id}">
                  \${groupTitle || "無題大分類"} \${groupRelatedMarker}
                </h3>
                <button
                  class="secondary previewGroupToggle"
                  type="button"
                  data-action="previewToggleGroup"
                  data-group-id="\${group.id}"
                >
                  開く
                </button>
              </div>
              <div class="previewCollapsed">
                （内容は折りたたまれています）
              </div>
            </section>
          \`;
        }

        const itemsHtml = visibleItems.map((item) => {
          const kind = item && item.kind === "divider" ? "divider" : "entry";

          if (kind === "divider") {
            const label = noteDisplayRenderer.text(item.label || "", searchQuery);
            const value = noteDisplayRenderer.text(item.value || "", searchQuery);
            const dividerText = (label || "区分") + (value ? "（" + value + "）" : "");
            const relatedCount = Array.isArray(item?.relatedReferences) ? item.relatedReferences.length : 0;
            const relatedMarker = relatedCount
              ? noteDisplayRenderer.related(relatedCount)
              : "";

          return \`
            <section class="previewDivider" data-preview-item-id="\${item.id}">
              <div class="previewItemHead">
                <span class="previewDividerText" data-nav-id="item:\${item.id}">
                  \${dividerText} \${relatedMarker}
                </span>

                <div class="previewItemActions" data-preview-nojump="true">
                  <button
                    class="secondary previewMiniAction"
                    type="button"
                    data-action="previewMoveItemUp"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    title="上へ移動"
                  >↑</button>

                  <button
                    class="secondary previewMiniAction"
                    type="button"
                    data-action="previewMoveItemDown"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    title="下へ移動"
                  >↓</button>

                  <button
                    class="secondary previewMiniAction"
                    type="button"
                    data-action="previewToggleMovePicker"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    title="移動"
                  >移動</button>
                </div>
              </div>
              \${
                isMovePickerOpen(group.id, item.id)
                  ? renderPreviewMovePicker(group.id, item.id)
                  : ""
              }
            </section>
          \`;
          }

          const headingHtml = noteDisplayRenderer.heading(item, searchQuery);
          const bodyHtml = noteDisplayRenderer.body(item.body || "", searchQuery);
          const relatedCount = Array.isArray(item?.relatedReferences) ? item.relatedReferences.length : 0;
          const relatedMarker = relatedCount
            ? noteDisplayRenderer.related(relatedCount)
            : "";

          return \`
            <section class="previewItem" data-preview-item-id="\${item.id}">
              <div class="previewItemHead">
                <h4 data-nav-id="item:\${item.id}">
                  \${headingHtml}
                  \${relatedMarker}
                </h4>

                <div class="previewItemActions" data-preview-nojump="true">
                  <button
                    class="secondary previewMiniAction"
                    type="button"
                    data-action="previewMoveItemUp"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    title="上へ移動"
                  >↑</button>

                  <button
                    class="secondary previewMiniAction"
                    type="button"
                    data-action="previewMoveItemDown"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    title="下へ移動"
                  >↓</button>

                  <button
                    class="secondary previewMiniAction"
                    type="button"
                    data-action="previewToggleMovePicker"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    title="移動"
                  >移動</button>
                </div>
              </div>

              <div class="previewBody" data-nav-id="item:\${item.id}">\${bodyHtml}</div>
              \${noteDisplayRenderer.memo(item, true, searchQuery)}

              \${
                isMovePickerOpen(group.id, item.id)
                  ? renderPreviewMovePicker(group.id, item.id)
                  : ""
              }
            </section>
          \`;
        }).join("");

        const groupItemsHtml = itemsHtml || '<div class="muted">項目がありません。</div>';

        return \`
          <section class="previewGroup">
            <div class="previewGroupHead">
              <h3 class="previewGroupTitle" data-nav-id="group:\${group.id}">
                \${groupTitle || "無題大分類"} \${groupRelatedMarker}
              </h3>
              <button
                class="secondary previewGroupToggle"
                type="button"
                data-action="previewToggleGroup"
                data-group-id="\${group.id}"
              >
                畳む
              </button>
            </div>
            <div class="previewItems">
              \${groupItemsHtml}
            </div>
          </section>
        \`;
      }).join("");

      const allGroupsHtml = groupsHtml || '<div class="muted">大分類がありません。</div>';

      previewRoot.innerHTML = \`
        <div class="previewWrap">
          \${allGroupsHtml}
        </div>
      \`;
      syncActiveEditingItemStyles();
      restoreNoteListMemoState();
    }

    function capturePreviewMemoState(root) {
      return new Map([...root.querySelectorAll(".noteDisplayMemo")].map(el => [el.dataset.displayKey, el.open]));
    }
    function restorePreviewMemoState(root, snapshot) {
      root.querySelectorAll(".noteDisplayMemo").forEach(el => {
        if (snapshot.has(el.dataset.displayKey)) el.open = snapshot.get(el.dataset.displayKey);
      });
    }

${getPreviewEventsScript()}
    function updatePreviewCounts(groups, options = {}) {
      if (!previewCountsEl) return;

      previewCountsEl.textContent = buildCountsText(groups, options);
      updateSearchNotices();
    }

    function updatePreviewModeButtons() {
      previewListBtn?.classList.toggle("isActive", previewMode === "list");
      previewBoardBtn?.classList.toggle("isActive", previewMode === "board");
    }
  `;
}

module.exports = {
  getPreviewScript,
};
