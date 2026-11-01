function getPreviewMoveActionsScript() {
  return `    function openPreviewMovePicker(groupId, itemId) {
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
`;
}

function getPreviewEventsScript() {
  return `    previewRoot.onclick = (event) => {
      const interactiveEl = event.target.closest(
        "button, select, input, textarea, option, details, summary, [data-action], [data-role]"
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

        scrollToEditorNavId(navId);
        event.stopImmediatePropagation();
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
`;
}

module.exports = { getPreviewMoveActionsScript, getPreviewEventsScript };
