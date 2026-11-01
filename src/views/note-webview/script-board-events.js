function getBoardEventsScript() {
  return `    function handleBoardClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const closeBtn = target.closest("[data-action='closeBoard']");
      if (closeBtn) {
        event.preventDefault();
        closeBoard();
        return;
      }

      const toggleBtn = target.closest("[data-action='toggleBoardCard']");
      if (toggleBtn) {
        event.preventDefault();
        toggleBoardItemExpanded(toggleBtn.dataset.itemId || "");
        return;
      }

      const openDividerMoveBtn = target.closest("[data-action='openBoardDividerMovePicker']");
      if (openDividerMoveBtn) {
        event.preventDefault();

        openBoardDividerMovePicker(
          openDividerMoveBtn.dataset.groupId || "",
          openDividerMoveBtn.dataset.dividerId || "",
        );
        return;
      }

      const applyDividerMoveBtn = target.closest("[data-action='applyBoardDividerMove']");
      if (applyDividerMoveBtn) {
        event.preventDefault();

        moveBoardDividerBlockToPosition(
          boardDividerMovePickerState.groupId,
          boardDividerMovePickerState.dividerId,
          boardDividerMovePickerState.targetGroupId,
          boardDividerMovePickerState.insertPosition,
        );
        return;
      }

      const closeDividerMoveBtn = target.closest("[data-action='closeBoardDividerMovePicker']");
      if (closeDividerMoveBtn) {
        event.preventDefault();
        closeBoardDividerMovePicker();
        return;
      }

      const openMoveBtn = target.closest("[data-action='openBoardMovePicker']");
      if (openMoveBtn) {
        event.preventDefault();

        openBoardMovePicker(
          openMoveBtn.dataset.groupId || "",
          openMoveBtn.dataset.itemId || "",
        );
        return;
      }

      const applyMoveBtn = target.closest("[data-action='applyBoardMove']");
      if (applyMoveBtn) {
        event.preventDefault();

        moveBoardItemToPosition(
          boardMovePickerState.groupId,
          boardMovePickerState.itemId,
          boardMovePickerState.targetGroupId,
          boardMovePickerState.insertPosition,
        );
        return;
      }

      const closeMoveBtn = target.closest("[data-action='closeBoardMovePicker']");
      if (closeMoveBtn) {
        event.preventDefault();
        closeBoardMovePicker();
        return;
      }

      const jumpDividerBtn = target.closest("[data-action='jumpBoardDivider']");
      if (jumpDividerBtn) {
        event.preventDefault();

        const dividerId = jumpDividerBtn.dataset.dividerId || "";
        if (!dividerId) return;

        closeBoard();
        scrollToEditorNavId(\`item:\${dividerId}\`);
        return;
      }

      const jumpItemBtn = target.closest("[data-action='jumpBoardItem']");
      if (jumpItemBtn) {
        event.preventDefault();

        const itemId = jumpItemBtn.dataset.itemId || "";
        closeBoard();
        scrollToEditorItem(itemId);
        return;
      }

      const jumpGroupBtn = target.closest("[data-action='jumpBoardGroup']");
      if (jumpGroupBtn) {
        event.preventDefault();

        const groupId = jumpGroupBtn.dataset.groupId || "";
        closeBoard();
        scrollToEditorNavId(\`group:\${groupId}\`);
        return;
      }

      const memoBtn = target.closest("[data-action='openBoardItemMemo']");
      if (memoBtn) {
        event.preventDefault();

        const groupId = memoBtn.dataset.groupId || "";
        const itemId = memoBtn.dataset.itemId || "";

        closeBoard();
        openItemMemoById(groupId, itemId);
        return;
      }
    }

    function handleBoardDragStart(event) {
      if (handleBoardDividerDragStart(event)) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const handle = target.closest("[data-action='dragBoardItem']");
      if (!handle) return;

      if (guardBoardMoveWhenSearching()) {
        event.preventDefault();
        return;
      }

      const cardEl = handle.closest(".noteBoardCard");
      if (!cardEl) {
        event.preventDefault();
        return;
      }

      const groupId = cardEl.dataset.boardGroupId || "";
      const itemId = cardEl.dataset.boardItemId || "";

      if (!groupId || !itemId) {
        event.preventDefault();
        return;
      }

      boardDragState = {
        groupId,
        itemId,
        overItemId: "",
        dropPosition: "",
      };

      resetBoardMovePicker();
      resetBoardDividerMovePicker();

      cardEl.classList.add("isBoardDragging");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", itemId);
      }
    }

    function handleBoardDragOver(event) {
      if (handleBoardDividerDragOver(event)) {
        return;
      }

      if (!boardDragState.itemId || !boardDragState.groupId) {
        return;
      }

      if (isBoardMoveDisabledBySearch()) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const emptyDividerEl = target.closest(".noteBoardEmptyDividerDrop");
      if (emptyDividerEl) {
        const targetGroupId = emptyDividerEl.dataset.boardGroupId || "";
        const dividerId = emptyDividerEl.dataset.boardDividerId || "";

        if (
          targetGroupId &&
          dividerId &&
          String(targetGroupId) === String(boardDragState.groupId)
        ) {
          event.preventDefault();

          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
          }

          boardDragState.overItemId = "";
          boardDragState.dropPosition = \`emptyDivider:\${dividerId}\`;

          clearBoardDropMarkers();

          const rootEl = getBoardRootFromElement(emptyDividerEl);
          const draggingEl = rootEl?.querySelector(
            \`.noteBoardCard[data-board-item-id="\${CSS.escape(boardDragState.itemId || "")}"]\`,
          );
          draggingEl?.classList.add("isBoardDragging");

          emptyDividerEl.classList.add("isBoardEmptyDropTarget");
        }

        return;
      }

      const cardEl = target.closest(".noteBoardCard");
      if (!cardEl) return;

      const targetGroupId = cardEl.dataset.boardGroupId || "";
      const targetItemId = cardEl.dataset.boardItemId || "";

      if (!targetGroupId || !targetItemId) return;

      // 大分類またぎは不可
      if (String(targetGroupId) !== String(boardDragState.groupId)) {
        return;
      }

      // 自分自身の上は不可
      if (String(targetItemId) === String(boardDragState.itemId)) {
        clearBoardDropMarkers();

        const rootEl = getBoardRootFromElement(cardEl);
        const draggingEl = rootEl?.querySelector(
          \`.noteBoardCard[data-board-item-id="\${CSS.escape(boardDragState.itemId || "")}"]\`,
        );
        draggingEl?.classList.add("isBoardDragging");
        return;
      }

      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }

      const dropPosition = getBoardDropPosition(event, cardEl);

      if (
        boardDragState.overItemId !== targetItemId ||
        boardDragState.dropPosition !== dropPosition
      ) {
        boardDragState.overItemId = targetItemId;
        boardDragState.dropPosition = dropPosition;
        applyBoardDropMarker(cardEl, dropPosition);
      }
    }

    function handleBoardDrop(event) {
      if (handleBoardDividerDrop(event)) {
        return;
      }

      if (!boardDragState.itemId || !boardDragState.groupId) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const emptyDividerEl = target.closest(".noteBoardEmptyDividerDrop");
      if (emptyDividerEl) {
        const targetGroupId = emptyDividerEl.dataset.boardGroupId || "";
        const dividerId = emptyDividerEl.dataset.boardDividerId || "";

        if (
          targetGroupId &&
          dividerId &&
          String(targetGroupId) === String(boardDragState.groupId)
        ) {
          event.preventDefault();

          moveBoardItemIntoEmptyDivider(
            boardDragState.groupId,
            boardDragState.itemId,
            dividerId,
          );
        }

        clearBoardDropMarkers();
        resetBoardDragState();
        return;
      }

      const cardEl = target.closest(".noteBoardCard");
      if (!cardEl) return;

      const targetGroupId = cardEl.dataset.boardGroupId || "";
      const targetItemId = cardEl.dataset.boardItemId || "";

      if (String(targetGroupId) !== String(boardDragState.groupId)) {
        clearBoardDropMarkers();
        resetBoardDragState();
        return;
      }

      event.preventDefault();

      moveBoardItemWithinGroup(
        boardDragState.groupId,
        boardDragState.itemId,
        targetItemId,
        boardDragState.dropPosition || "after",
      );

      clearBoardDropMarkers();
      resetBoardDragState();
    }

    function handleBoardDragEnd() {
      clearBoardDropMarkers();
      resetBoardDragState();
      resetBoardDividerDragState();
    }

    function handleBoardDividerDragStart(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return false;

      const handle = target.closest("[data-action='dragBoardDivider']");
      if (!handle) return false;

      if (guardBoardMoveWhenSearching()) {
        event.preventDefault();
        return true;
      }

      const blockEl = handle.closest(".noteBoardDividerBlock");
      if (!blockEl) {
        event.preventDefault();
        return true;
      }

      const groupId = blockEl.dataset.boardGroupId || "";
      const dividerId = blockEl.dataset.boardDividerId || "";

      if (!groupId || !dividerId) {
        event.preventDefault();
        return true;
      }

      boardDividerDragState = {
        groupId,
        dividerId,
        overDividerId: "",
        dropPosition: "",
      };

      resetBoardMovePicker();
      resetBoardDividerMovePicker();
      resetBoardDragState();

      blockEl.classList.add("isBoardDividerDragging");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", dividerId);
      }

      return true;
    }

    function handleBoardDividerDragOver(event) {
      if (!boardDividerDragState.dividerId || !boardDividerDragState.groupId) {
        return false;
      }

      if (isBoardMoveDisabledBySearch()) {
        return false;
      }

      const dropTarget = getBoardDividerDropTarget(event);
      if (!dropTarget?.blockEl || !dropTarget.targetDividerId) {
        return false;
      }

      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }

      if (
        boardDividerDragState.overDividerId !== dropTarget.targetDividerId ||
        boardDividerDragState.dropPosition !== dropTarget.dropPosition
      ) {
        boardDividerDragState.overDividerId = dropTarget.targetDividerId;
        boardDividerDragState.dropPosition = dropTarget.dropPosition;
        applyBoardDividerDropMarker(dropTarget.blockEl, dropTarget.dropPosition);
      }

      return true;
    }

    function handleBoardDividerDrop(event) {
      if (!boardDividerDragState.dividerId || !boardDividerDragState.groupId) {
        return false;
      }

      const dropTarget = getBoardDividerDropTarget(event);
      if (!dropTarget?.blockEl || !dropTarget.targetDividerId) {
        clearBoardDropMarkers();
        resetBoardDividerDragState();
        return false;
      }

      event.preventDefault();

      moveBoardDividerBlockWithinGroup(
        boardDividerDragState.groupId,
        boardDividerDragState.dividerId,
        dropTarget.targetDividerId,
        dropTarget.dropPosition || "after",
      );

      clearBoardDropMarkers();
      resetBoardDividerDragState();
      return true;
    }

    function registerBoardSurfaceEvents(surfaceEl) {
      if (!surfaceEl) return;

      surfaceEl.addEventListener("click", handleBoardClick);

      surfaceEl.addEventListener("dragstart", handleBoardDragStart);
      surfaceEl.addEventListener("dragover", handleBoardDragOver);
      surfaceEl.addEventListener("drop", handleBoardDrop);
      surfaceEl.addEventListener("dragend", handleBoardDragEnd);

      surfaceEl.addEventListener("change", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const targetGroupSelect = target.closest("[data-action='changeBoardMoveTargetGroup']");
        if (targetGroupSelect) {
          boardMovePickerState.targetGroupId = targetGroupSelect.value || "";
          boardMovePickerState.insertPosition = "end";
          renderBoard();
          return;
        }

        const positionSelect = target.closest("[data-action='changeBoardMovePosition']");
        if (positionSelect) {
          boardMovePickerState.insertPosition = positionSelect.value || "end";
          renderBoard();
          return;
        }

        const dividerTargetGroupSelect = target.closest("[data-action='changeBoardDividerMoveTargetGroup']");
        if (dividerTargetGroupSelect) {
          boardDividerMovePickerState.targetGroupId = dividerTargetGroupSelect.value || "";
          boardDividerMovePickerState.insertPosition = "end";
          renderBoard();
          return;
        }

        const dividerPositionSelect = target.closest("[data-action='changeBoardDividerMovePosition']");
        if (dividerPositionSelect) {
          boardDividerMovePickerState.insertPosition = dividerPositionSelect.value || "end";
          renderBoard();
          return;
        }
      });
    }

    function registerBoardEvents() {
      openBoardBtn?.addEventListener("click", () => {
        openBoard();
      });

      closeBoardBtn?.addEventListener("click", () => {
        closeBoard();
      });

      boardSaveBtn?.addEventListener("click", () => {
        saveCurrentNote();
      });

      registerBoardSurfaceEvents(noteBoardPanel);
      registerBoardSurfaceEvents(previewBoardRoot);

      noteBoardSearchInput?.addEventListener("input", () => {
        searchQuery = noteBoardSearchInput.value || "";

        if (noteBoardSearchInput) {
          noteBoardSearchInput.value = searchQuery;
        }

        if (noteSearchInput) {
          noteSearchInput.value = searchQuery;
        }

        if (searchQuery.trim()) {
          const matchedGroupIds = state.groups
            .filter((group) => groupMatchesQuery(group, searchQuery))
            .map((group) => group.id);

          matchedGroupIds.forEach((id) => collapsedGroupIds.delete(id));
        }

        renderGroups();
        renderPreview();
        renderBoard();
      });

      clearBoardSearchBtn?.addEventListener("click", () => {
        searchQuery = "";

        if (noteBoardSearchInput) {
          noteBoardSearchInput.value = "";
        }

        if (noteSearchInput) {
          noteSearchInput.value = "";
        }

        renderGroups();
        renderPreview();
        renderBoard();
      });
    }`;
}

module.exports = { getBoardEventsScript };
