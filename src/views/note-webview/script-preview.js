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

    function openPreviewMovePicker(groupId, itemId) {
      movePickerState = {
        groupId,
        itemId,
        targetGroupId: groupId,
        insertIndex: "",
      };
      renderPreview();
    }

    function closePreviewMovePicker() {
      movePickerState = {
        groupId: "",
        itemId: "",
        targetGroupId: "",
        insertIndex: "",
      };
      renderPreview();
    }

    function moveItemFromPreview(groupId, itemId, direction) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return;

      const items = Array.isArray(group.items) ? group.items : [];
      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) return;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;

      group.items = moveArrayItem(items, index, targetIndex);

      markDirty();

      if (!isPreviewOnly) {
        renderGroups();
      }
      renderPreview();
    }

    function moveItemToPositionFromPreview(sourceGroupId, itemId, targetGroupId, insertIndex) {
      if (!sourceGroupId || !itemId || !targetGroupId) return;

      const sourceGroup = state.groups.find((g) => g.id === sourceGroupId);
      const targetGroup = state.groups.find((g) => g.id === targetGroupId);

      if (!sourceGroup || !targetGroup) return;

      const sourceItems = Array.isArray(sourceGroup.items) ? [...sourceGroup.items] : [];
      const sourceIndex = sourceItems.findIndex((item) => item.id === itemId);
      if (sourceIndex < 0) return;

      const [movingItem] = sourceItems.splice(sourceIndex, 1);
      if (!movingItem) return;

      let targetItems;
      if (sourceGroupId === targetGroupId) {
        targetItems = sourceItems;
      } else {
        targetItems = Array.isArray(targetGroup.items) ? [...targetGroup.items] : [];
      }

      let targetIndex = Number(insertIndex);
      if (!Number.isInteger(targetIndex)) {
        setStatus("移動先の位置を選択してください。", true);
        return;
      }

      targetIndex = Math.max(0, Math.min(targetIndex, targetItems.length));
      targetItems.splice(targetIndex, 0, movingItem);

      if (sourceGroupId === targetGroupId) {
        sourceGroup.items = targetItems;
      } else {
        sourceGroup.items = sourceItems;
        targetGroup.items = targetItems;
        collapsedGroupIds.delete(targetGroupId);
      }

      movePickerState = {
        groupId: "",
        itemId: "",
        targetGroupId: "",
        insertIndex: "",
      };

      markDirty();

      if (!isPreviewOnly) {
        renderGroups();
      }
      renderPreview();

      const targetTitle = getGroupTitleForMove(
        targetGroup,
        state.groups.findIndex((g) => g.id === targetGroupId),
      );

      setStatus(\`「\${targetTitle}」内の選択位置へ移動しました。\`, true);
    }

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
      const isBoardMode = previewMode === "board";

      previewPane?.classList.toggle("isBoardMode", isBoardMode);
      updatePreviewModeButtons();

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
        const groupTitle = esc(group.title || "");
        const isCollapsed = collapsedGroupIds.has(group.id);

        const visibleItems = getVisibleItemsForGroup(group);

        if (isCollapsed) {
          return \`
            <section class="previewGroup">
              <div class="previewGroupHead">
                <h3 class="previewGroupTitle" data-nav-id="group:\${group.id}">
                  \${groupTitle || "無題大分類"}
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
            const label = esc(item.label || "");
            const value = esc(item.value || "");
            const dividerText = (label || "区分") + (value ? "（" + value + "）" : "");

          return \`
            <section class="previewDivider">
              <div class="previewItemHead">
                <span class="previewDividerText" data-nav-id="item:\${item.id}">
                  \${dividerText}
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

          const heading = esc(item.heading || "");
          const bodyHtml =
            esc(item.body || "")
              .replace(/《《([^《]*?)》》/g, '<span class="previewSideDots">$1</span>')
              .replace(/[|｜]([^《<]+)《([^》<]*)》/g, "<ruby>$1<rt>$2</rt></ruby>")
              .replace(/\\n/g, "<br>") || '<span class="muted">詳細未入力</span>';
          const hasMemo = Boolean(
            item?.memo &&
            (
              String(item.memo.body || "").trim() ||
              (Array.isArray(item.memo.tags) && item.memo.tags.length)
            )
          );

          return \`
            <section class="previewItem">
              <div class="previewItemHead">
                <h4 data-nav-id="item:\${item.id}">
                  \${heading || "無題項目"}
                  \${
                    hasMemo
                      ? \`
                        <button
                          type="button"
                          class="previewMemoIcon"
                          data-action="openPreviewItemMemo"
                          data-item-id="\${item.id}"
                          title="メモを開く"
                        >
                          📝
                        </button>
                      \`
                      : ""
                  }
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
                \${groupTitle || "無題大分類"}
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
    }

    previewRoot.onclick = (event) => {
      const interactiveEl = event.target.closest(
        "button, select, input, textarea, option, [data-action], [data-role]"
      );

      const navBlocked = Boolean(interactiveEl);

      const moveUpBtn = event.target.closest("[data-action='previewMoveItemUp']");
      if (moveUpBtn) {
        event.preventDefault();
        event.stopPropagation();

        moveItemFromPreview(
          moveUpBtn.dataset.groupId || "",
          moveUpBtn.dataset.itemId || "",
          "up",
        );
        return;
      }

      const moveDownBtn = event.target.closest("[data-action='previewMoveItemDown']");
      if (moveDownBtn) {
        event.preventDefault();
        event.stopPropagation();

        moveItemFromPreview(
          moveDownBtn.dataset.groupId || "",
          moveDownBtn.dataset.itemId || "",
          "down",
        );
        return;
      }

      const toggleMoveBtn = event.target.closest("[data-action='previewToggleMovePicker']");
      if (toggleMoveBtn) {
        event.preventDefault();
        event.stopPropagation();

        const groupId = toggleMoveBtn.dataset.groupId || "";
        const itemId = toggleMoveBtn.dataset.itemId || "";

        if (isMovePickerOpen(groupId, itemId)) {
          closePreviewMovePicker();
        } else {
          openPreviewMovePicker(groupId, itemId);
        }
        return;
      }

      const closeMoveBtn = event.target.closest("[data-action='previewCloseMovePicker']");
      if (closeMoveBtn) {
        event.preventDefault();
        event.stopPropagation();

        closePreviewMovePicker();
        return;
      }

      const confirmMoveBtn = event.target.closest("[data-action='previewConfirmMoveItem']");
      if (confirmMoveBtn) {
        event.preventDefault();
        event.stopPropagation();

        const groupId = confirmMoveBtn.dataset.groupId || "";
        const itemId = confirmMoveBtn.dataset.itemId || "";

        const targetGroupEl = previewRoot.querySelector(
          \`[data-role="previewMoveTargetGroup"][data-group-id="\${groupId}"][data-item-id="\${itemId}"]\`
        );
        const targetPositionEl = previewRoot.querySelector(
          \`[data-role="previewMoveTargetPosition"][data-group-id="\${groupId}"][data-item-id="\${itemId}"]\`
        );

        const targetGroupId = targetGroupEl?.value || "";
        const insertIndex = targetPositionEl?.value || "";

        if (!targetGroupId) {
          setStatus("移動先の大分類を選択してください。", true);
          return;
        }

        if (insertIndex === "") {
          setStatus("移動先の位置を選択してください。", true);
          return;
        }

        moveItemToPositionFromPreview(groupId, itemId, targetGroupId, insertIndex);
        return;
      }

      const memoBtn = event.target.closest("[data-action='openPreviewItemMemo']");
      if (memoBtn) {
        event.preventDefault();
        event.stopPropagation();

        const itemId = memoBtn.dataset.itemId;
        openItemMemoFromPreview(itemId);
        return;
      }

      if (navBlocked) {
        return;
      }

      const navEl = event.target.closest("[data-nav-id]");
      if (navEl) {
        const navId = navEl.dataset.navId;
        if (!navId) return;

        jumpFromPreview(navId);
      }
    };

    previewRoot.onchange = (event) => {
      const targetGroupEl = event.target.closest("[data-role='previewMoveTargetGroup']");
      if (targetGroupEl) {
        const groupId = targetGroupEl.dataset.groupId || "";
        const itemId = targetGroupEl.dataset.itemId || "";
        const targetGroupId = targetGroupEl.value || groupId;

        movePickerState = {
          groupId,
          itemId,
          targetGroupId,
          insertIndex: "",
        };

        renderPreview();
        return;
      }

      const targetPositionEl = event.target.closest("[data-role='previewMoveTargetPosition']");
      if (targetPositionEl) {
        movePickerState = {
          ...movePickerState,
          groupId: targetPositionEl.dataset.groupId || "",
          itemId: targetPositionEl.dataset.itemId || "",
          insertIndex: targetPositionEl.value || "",
        };
      }
    };

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
