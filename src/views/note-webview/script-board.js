const { getBoardMovePickerScript, getBoardDividerMovePickerScript, getBoardRendererScript } = require("./script-board-renderer");

const { getBoardEventsScript } = require("./script-board-events");

function getBoardScript() {
  return `
    function getBoardRoots() {
      return [noteBoardRoot, previewBoardRoot].filter(Boolean);
    }

    function getBoardRootFromElement(el) {
      return el?.closest?.(".noteBoardRoot") || noteBoardRoot || previewBoardRoot || null;
    }

    function getBoardRootFromEvent(event) {
      const target = event?.target instanceof Element ? event.target : null;
      return getBoardRootFromElement(target);
    }

    function captureBoardScrollState(rootEl = noteBoardRoot) {
      if (!rootEl) {
        return {
          rootScrollLeft: 0,
          columnScrollTops: {},
        };
      }

      const columnScrollTops = {};

      rootEl.querySelectorAll(".noteBoardColumn").forEach((columnEl) => {
        const groupId = String(columnEl.dataset.boardGroupId || "");
        const bodyEl = columnEl.querySelector(".noteBoardColumnBody");

        if (groupId && bodyEl) {
          columnScrollTops[groupId] = bodyEl.scrollTop || 0;
        }
      });

      return {
        rootScrollLeft: rootEl.scrollLeft || 0,
        columnScrollTops,
      };
    }

    function restoreBoardScrollState(snapshot, rootEl = noteBoardRoot) {
      if (!rootEl || !snapshot) return;

      requestAnimationFrame(() => {
        rootEl.scrollLeft = Number(snapshot.rootScrollLeft || 0);

        const columnScrollTops = snapshot.columnScrollTops || {};

        rootEl.querySelectorAll(".noteBoardColumn").forEach((columnEl) => {
          const groupId = String(columnEl.dataset.boardGroupId || "");
          const bodyEl = columnEl.querySelector(".noteBoardColumnBody");

          if (!groupId || !bodyEl) return;

          if (Object.prototype.hasOwnProperty.call(columnScrollTops, groupId)) {
            bodyEl.scrollTop = Number(columnScrollTops[groupId] || 0);
          }
        });
      });
    }

    function scrollBoardMovePickerIntoView(kind, id, rootEl = noteBoardRoot) {
      if (!rootEl || !id) return;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const selector =
            kind === "divider"
              ? \`.noteBoardDividerBlock[data-board-divider-id="\${CSS.escape(String(id))}"] .noteBoardDividerMovePicker\`
              : \`.noteBoardCard[data-board-item-id="\${CSS.escape(String(id))}"] .noteBoardMovePicker\`;

          const pickerEl = rootEl.querySelector(selector);
          if (!pickerEl) return;

          const columnBodyEl = pickerEl.closest(".noteBoardColumnBody");
          if (!columnBodyEl) return;

          const pickerRect = pickerEl.getBoundingClientRect();
          const bodyRect = columnBodyEl.getBoundingClientRect();

          const bottomGap = pickerRect.bottom - bodyRect.bottom;
          const topGap = bodyRect.top - pickerRect.top;

          if (bottomGap > 0) {
            columnBodyEl.scrollTop += bottomGap + 12;
            return;
          }

          if (topGap > 0) {
            columnBodyEl.scrollTop -= topGap + 12;
          }
        });
      });
    }

    function isBoardItemExpanded(itemId) {
      return expandedBoardItemIds.has(String(itemId || ""));
    }

    function toggleBoardItemExpanded(itemId) {
      const id = String(itemId || "");
      if (!id) return;

      if (expandedBoardItemIds.has(id)) {
        expandedBoardItemIds.delete(id);
      } else {
        expandedBoardItemIds.add(id);
      }

      renderBoard();
    }

    function isBoardMoveDisabledBySearch() {
      return hasActiveSearchQuery();
    }

    function updateBoardSearchNotice() {
      if (!noteBoardSearchNoticeEl) return;

      const query = String(searchQuery || "").trim();
      const visible = !!query;

      noteBoardSearchNoticeEl.hidden = !visible;
      noteBoardSearchNoticeEl.textContent = visible
        ? \`「\${query}」で絞り込み中です。検索中は区分・項目の移動はできません。\`
        : "";
    }

    function guardBoardMoveWhenSearching() {
      if (!isBoardMoveDisabledBySearch()) {
        return false;
      }

      setStatus("検索絞り込み中はボード移動を使えません。検索をクリアしてください。", true);
      return true;
    }

    function resetBoardDragState() {
      boardDragState = {
        groupId: "",
        itemId: "",
        overItemId: "",
        dropPosition: "",
      };
    }

    function resetBoardDividerDragState() {
      boardDividerDragState = {
        groupId: "",
        dividerId: "",
        overDividerId: "",
        dropPosition: "",
      };
    }

    function clearBoardDividerDropMarkers() {
      getBoardRoots().forEach((rootEl) => {
        rootEl
          ?.querySelectorAll(
            ".isBoardDividerDragging, .isBoardDividerDragOverBefore, .isBoardDividerDragOverAfter",
          )
          .forEach((el) => {
            el.classList.remove(
              "isBoardDividerDragging",
              "isBoardDividerDragOverBefore",
              "isBoardDividerDragOverAfter",
            );
          });
      });
    }

    function getBoardDividerDropPosition(event, blockEl) {
      const rect = blockEl.getBoundingClientRect();
      const middleY = rect.top + rect.height / 2;
      return event.clientY < middleY ? "before" : "after";
    }

    function getBoardDividerDropTarget(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return null;

      const sourceGroupId = String(boardDividerDragState.groupId || "");
      const sourceDividerId = String(boardDividerDragState.dividerId || "");

      if (!sourceGroupId || !sourceDividerId) {
        return null;
      }

      const columnEl = target.closest(".noteBoardColumn");
      if (!columnEl) {
        return null;
      }

      const columnGroupId = String(columnEl.dataset.boardGroupId || "");
      if (columnGroupId !== sourceGroupId) {
        return null;
      }

      const blocks = Array.from(
        columnEl.querySelectorAll(".noteBoardDividerBlock[data-board-divider-id]"),
      ).filter((block) => {
        const dividerId = String(block.dataset.boardDividerId || "");
        return dividerId && dividerId !== sourceDividerId;
      });

      if (!blocks.length) {
        return null;
      }

      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        const middleY = rect.top + rect.height / 2;

        if (event.clientY < middleY) {
          return {
            blockEl: block,
            targetDividerId: String(block.dataset.boardDividerId || ""),
            dropPosition: "before",
          };
        }
      }

      const lastBlock = blocks[blocks.length - 1];

      return {
        blockEl: lastBlock,
        targetDividerId: String(lastBlock.dataset.boardDividerId || ""),
        dropPosition: "after",
      };
    }

    function applyBoardDividerDropMarker(blockEl, position) {
      clearBoardDividerDropMarkers();

      const rootEl = getBoardRootFromElement(blockEl);

      const draggingEl = rootEl?.querySelector(
        \`.noteBoardDividerBlock[data-board-divider-id="\${CSS.escape(boardDividerDragState.dividerId || "")}"]\`,
      );

      draggingEl?.classList.add("isBoardDividerDragging");

      if (!blockEl || !position) return;

      blockEl.classList.add(
        position === "before"
          ? "isBoardDividerDragOverBefore"
          : "isBoardDividerDragOverAfter",
      );
    }

    function clearBoardDropMarkers() {
      getBoardRoots().forEach((rootEl) => {
        rootEl
          ?.querySelectorAll(
            ".isBoardDragging, .isBoardDragOverBefore, .isBoardDragOverAfter, .isBoardEmptyDropTarget, .isBoardDividerDragging, .isBoardDividerDragOverBefore, .isBoardDividerDragOverAfter",
          )
          .forEach((el) => {
            el.classList.remove(
              "isBoardDragging",
              "isBoardDragOverBefore",
              "isBoardDragOverAfter",
              "isBoardEmptyDropTarget",
              "isBoardDividerDragging",
              "isBoardDividerDragOverBefore",
              "isBoardDividerDragOverAfter",
            );
          });
      });
    }

    function getBoardDropPosition(event, cardEl) {
      const rect = cardEl.getBoundingClientRect();
      const middleY = rect.top + rect.height / 2;
      return event.clientY < middleY ? "before" : "after";
    }

    function applyBoardDropMarker(cardEl, position) {
      clearBoardDropMarkers();

      const rootEl = getBoardRootFromElement(cardEl);

      const draggingEl = rootEl?.querySelector(
        \`.noteBoardCard[data-board-item-id="\${CSS.escape(boardDragState.itemId || "")}"]\`,
      );

      draggingEl?.classList.add("isBoardDragging");

      if (!cardEl || !position) return;

      cardEl.classList.add(
        position === "before"
          ? "isBoardDragOverBefore"
          : "isBoardDragOverAfter",
      );
    }

    function moveBoardItemWithinGroup(groupId, itemId, targetItemId, dropPosition) {
      if (guardBoardMoveWhenSearching()) {
        return false;
      }

      const group = state.groups.find(
        (g) => String(g.id || "") === String(groupId || ""),
      );

      if (!group) {
        setStatus("移動する大分類を取得できませんでした。", true);
        return false;
      }

      const items = Array.isArray(group.items) ? group.items : [];

      const sourceIndex = items.findIndex(
        (item) => String(item?.id || "") === String(itemId || ""),
      );

      const targetIndexBeforeMove = items.findIndex(
        (item) => String(item?.id || "") === String(targetItemId || ""),
      );

      if (sourceIndex < 0 || targetIndexBeforeMove < 0) {
        setStatus("移動する項目を取得できませんでした。", true);
        return false;
      }

      if (String(itemId || "") === String(targetItemId || "")) {
        return false;
      }

      const movingItem = items[sourceIndex];

      if (!movingItem || movingItem.kind === "divider") {
        setStatus("区分はドラッグ移動できません。", true);
        return false;
      }

      const beforeIds = items.map((item) => String(item?.id || ""));

      items.splice(sourceIndex, 1);

      const targetIndex = items.findIndex(
        (item) => String(item?.id || "") === String(targetItemId || ""),
      );

      if (targetIndex < 0) {
        items.splice(sourceIndex, 0, movingItem);
        setStatus("移動先の項目を取得できませんでした。", true);
        return false;
      }

      let insertIndex =
        dropPosition === "before" ? targetIndex : targetIndex + 1;

      insertIndex = Math.max(0, Math.min(insertIndex, items.length));
      items.splice(insertIndex, 0, movingItem);
      group.items = items;

      const afterIds = items.map((item) => String(item?.id || ""));

      if (beforeIds.join("\\n") === afterIds.join("\\n")) {
        renderBoard();
        return false;
      }

      resetBoardMovePicker();
      resetBoardDividerMovePicker();
      resetBoardDragState();

      markDirty();
      renderGroups();
      renderPreview();
      renderBoard();
      setStatus("カードを移動しました。", true);

      return true;
    }

    function moveBoardItemIntoEmptyDivider(groupId, itemId, dividerId) {
      if (guardBoardMoveWhenSearching()) {
        return false;
      }

      const group = state.groups.find(
        (g) => String(g.id || "") === String(groupId || ""),
      );

      if (!group) {
        setStatus("移動する大分類を取得できませんでした。", true);
        return false;
      }

      const items = Array.isArray(group.items) ? group.items : [];

      const sourceIndex = items.findIndex(
        (item) => String(item?.id || "") === String(itemId || ""),
      );

      const dividerIndex = items.findIndex(
        (item) =>
          item &&
          item.kind === "divider" &&
          String(item.id || "") === String(dividerId || ""),
      );

      if (sourceIndex < 0 || dividerIndex < 0) {
        setStatus("移動する項目または区分を取得できませんでした。", true);
        return false;
      }

      const movingItem = items[sourceIndex];

      if (!movingItem || movingItem.kind === "divider") {
        setStatus("区分はこの操作では移動できません。", true);
        return false;
      }

      // すでにその空区分の直下にあるなら何もしない
      if (sourceIndex === dividerIndex + 1) {
        return false;
      }

      const beforeIds = items.map((item) => String(item?.id || ""));

      items.splice(sourceIndex, 1);

      const nextDividerIndex = items.findIndex(
        (item) =>
          item &&
          item.kind === "divider" &&
          String(item.id || "") === String(dividerId || ""),
      );

      if (nextDividerIndex < 0) {
        items.splice(sourceIndex, 0, movingItem);
        setStatus("移動先の区分を取得できませんでした。", true);
        return false;
      }

      items.splice(nextDividerIndex + 1, 0, movingItem);
      group.items = items;

      const afterIds = items.map((item) => String(item?.id || ""));

      if (beforeIds.join("\\n") === afterIds.join("\\n")) {
        renderBoard();
        return false;
      }

      resetBoardMovePicker();
      resetBoardDividerMovePicker();
      resetBoardDragState();

      markDirty();
      renderGroups();
      renderPreview();
      renderBoard();
      setStatus("空の区分へカードを移動しました。", true);

      return true;
    }

    function resetBoardMovePicker() {
      boardMovePickerState = {
        groupId: "",
        itemId: "",
        targetGroupId: "",
        insertPosition: "end",
      };
    }

    function isBoardMovePickerOpen(itemId) {
      return String(boardMovePickerState.itemId || "") === String(itemId || "");
    }

    function openBoardMovePicker(groupId, itemId) {
      if (guardBoardMoveWhenSearching()) {
        return;
      }

      boardMovePickerState = {
        groupId: String(groupId || ""),
        itemId: String(itemId || ""),
        targetGroupId: String(groupId || ""),
        insertPosition: "end",
      };

      resetBoardDividerMovePicker();
      renderBoard();

      getBoardRoots().forEach((rootEl) => {
        scrollBoardMovePickerIntoView("item", itemId, rootEl);
      });
    }

    function closeBoardMovePicker() {
      resetBoardMovePicker();
      renderBoard();
    }

    function getBoardMoveItemLabel(item) {
      if (!item) return "項目";

      if (item.kind === "divider") {
        return \`区分: \${String(item.label || "").trim() || "区分"}\`;
      }

      return \`項目: \${String(item.heading || "").trim() || "無題項目"}\`;
    }

${getBoardMovePickerScript()}
    function moveBoardItemToPosition(sourceGroupId, itemId, targetGroupId, insertPosition) {
      if (guardBoardMoveWhenSearching()) {
        return false;
      }

      const sourceGroup = state.groups.find(
        (group) => String(group.id || "") === String(sourceGroupId || ""),
      );

      const targetGroup = state.groups.find(
        (group) => String(group.id || "") === String(targetGroupId || ""),
      );

      if (!sourceGroup || !targetGroup) {
        setStatus("移動先を取得できませんでした。", true);
        return false;
      }

      const sourceItems = Array.isArray(sourceGroup.items) ? sourceGroup.items : [];
      const sourceIndex = sourceItems.findIndex(
        (entry) => String(entry.id || "") === String(itemId || ""),
      );

      if (sourceIndex < 0) {
        setStatus("移動する項目を取得できませんでした。", true);
        return false;
      }

      const movingItem = sourceItems[sourceIndex];

      if (!movingItem || movingItem.kind === "divider") {
        setStatus("区分はこのボード移動では移動できません。", true);
        return false;
      }

      sourceItems.splice(sourceIndex, 1);
      sourceGroup.items = sourceItems;

      const targetItems = Array.isArray(targetGroup.items) ? targetGroup.items : [];
      let insertIndex = targetItems.length;

      if (insertPosition === "start") {
        insertIndex = 0;
      } else if (String(insertPosition || "").startsWith("after:")) {
        const afterItemId = String(insertPosition).slice("after:".length);
        const afterIndex = targetItems.findIndex(
          (entry) => String(entry.id || "") === afterItemId,
        );

        insertIndex = afterIndex >= 0 ? afterIndex + 1 : targetItems.length;
      }

      insertIndex = Math.max(0, Math.min(insertIndex, targetItems.length));
      targetItems.splice(insertIndex, 0, movingItem);
      targetGroup.items = targetItems;

      resetBoardMovePicker();
      markDirty();
      renderGroups();
      renderPreview();
      renderBoard();
      setStatus("カードを移動しました。", true);

      return true;
    }

    function resetBoardDividerMovePicker() {
      boardDividerMovePickerState = {
        groupId: "",
        dividerId: "",
        targetGroupId: "",
        insertPosition: "end",
      };
    }

    function isBoardDividerMovePickerOpen(dividerId) {
      return String(boardDividerMovePickerState.dividerId || "") === String(dividerId || "");
    }

    function openBoardDividerMovePicker(groupId, dividerId) {
      if (guardBoardMoveWhenSearching()) {
        return;
      }

      boardDividerMovePickerState = {
        groupId: String(groupId || ""),
        dividerId: String(dividerId || ""),
        targetGroupId: String(groupId || ""),
        insertPosition: "end",
      };

      resetBoardMovePicker();
      renderBoard();

      getBoardRoots().forEach((rootEl) => {
        scrollBoardMovePickerIntoView("divider", dividerId, rootEl);
      });
    }

    function closeBoardDividerMovePicker() {
      resetBoardDividerMovePicker();
      renderBoard();
    }

    function getDividerBlockRange(items, dividerId) {
      const list = Array.isArray(items) ? items : [];
      const startIndex = list.findIndex(
        (item) =>
          item &&
          item.kind === "divider" &&
          String(item.id || "") === String(dividerId || ""),
      );

      if (startIndex < 0) {
        return null;
      }

      let endIndex = list.length;

      for (let i = startIndex + 1; i < list.length; i += 1) {
        if (list[i]?.kind === "divider") {
          endIndex = i;
          break;
        }
      }

      return {
        startIndex,
        endIndex,
        entries: list.slice(startIndex, endIndex),
      };
    }

    function getBoardDividerMoveLabel(item) {
      const label = String(item?.label || "").trim() || "区分";
      const value = String(item?.value || "").trim();

      return value ? \`区分: \${label} / \${value}\` : \`区分: \${label}\`;
    }

${getBoardDividerMovePickerScript()}
    function moveBoardDividerBlockToPosition(sourceGroupId, dividerId, targetGroupId, insertPosition) {
      if (guardBoardMoveWhenSearching()) {
        return false;
      }

      const sourceGroup = state.groups.find(
        (group) => String(group.id || "") === String(sourceGroupId || ""),
      );

      const targetGroup = state.groups.find(
        (group) => String(group.id || "") === String(targetGroupId || ""),
      );

      if (!sourceGroup || !targetGroup) {
        setStatus("移動先を取得できませんでした。", true);
        return false;
      }

      const sourceItems = Array.isArray(sourceGroup.items) ? sourceGroup.items : [];
      const range = getDividerBlockRange(sourceItems, dividerId);

      if (!range || !range.entries.length) {
        setStatus("移動する区分を取得できませんでした。", true);
        return false;
      }

      const movingEntries = range.entries;

      sourceItems.splice(range.startIndex, range.endIndex - range.startIndex);
      sourceGroup.items = sourceItems;

      const targetItems =
        String(sourceGroup.id || "") === String(targetGroup.id || "")
          ? sourceItems
          : Array.isArray(targetGroup.items)
            ? targetGroup.items
            : [];

      let insertIndex = targetItems.length;

      if (insertPosition === "start") {
        insertIndex = 0;
      } else if (String(insertPosition || "").startsWith("after:")) {
        const afterDividerId = String(insertPosition).slice("after:".length);
        const afterRange = getDividerBlockRange(targetItems, afterDividerId);

        insertIndex = afterRange ? afterRange.endIndex : targetItems.length;
      }

      insertIndex = Math.max(0, Math.min(insertIndex, targetItems.length));
      targetItems.splice(insertIndex, 0, ...movingEntries);
      targetGroup.items = targetItems;

      resetBoardDividerMovePicker();
      markDirty();
      renderGroups();
      renderPreview();
      renderBoard();
      setStatus("区分を配下の項目ごと移動しました。", true);

      return true;
    }

    function moveBoardDividerBlockWithinGroup(groupId, dividerId, targetDividerId, dropPosition) {
      if (guardBoardMoveWhenSearching()) {
        return false;
      }

      const group = state.groups.find(
        (g) => String(g.id || "") === String(groupId || ""),
      );

      if (!group) {
        setStatus("移動する大分類を取得できませんでした。", true);
        return false;
      }

      if (!dividerId || !targetDividerId) {
        setStatus("移動する区分を取得できませんでした。", true);
        return false;
      }

      if (String(dividerId) === String(targetDividerId)) {
        return false;
      }

      const items = Array.isArray(group.items) ? group.items : [];
      const sourceRange = getDividerBlockRange(items, dividerId);

      if (!sourceRange || !sourceRange.entries.length) {
        setStatus("移動する区分を取得できませんでした。", true);
        return false;
      }

      const beforeIds = items.map((item) => String(item?.id || ""));
      const movingEntries = sourceRange.entries;

      items.splice(
        sourceRange.startIndex,
        sourceRange.endIndex - sourceRange.startIndex,
      );

      const targetRange = getDividerBlockRange(items, targetDividerId);

      if (!targetRange) {
        items.splice(sourceRange.startIndex, 0, ...movingEntries);
        setStatus("移動先の区分を取得できませんでした。", true);
        return false;
      }

      let insertIndex =
        dropPosition === "before" ? targetRange.startIndex : targetRange.endIndex;

      insertIndex = Math.max(0, Math.min(insertIndex, items.length));
      items.splice(insertIndex, 0, ...movingEntries);
      group.items = items;

      const afterIds = items.map((item) => String(item?.id || ""));

      if (beforeIds.join("\\n") === afterIds.join("\\n")) {
        renderBoard();
        return false;
      }

      resetBoardMovePicker();
      resetBoardDividerMovePicker();
      resetBoardDragState();
      resetBoardDividerDragState();

      markDirty();
      renderGroups();
      renderPreview();
      renderBoard();
      setStatus("区分を配下の項目ごと移動しました。", true);

      return true;
    }

    function openBoard() {
      isBoardOpen = true;

      if (noteBoardPanel) {
        noteBoardPanel.hidden = false;
      }

      if (noteBoardSearchInput) {
        noteBoardSearchInput.value = searchQuery || "";
      }

      renderBoard();

      requestAnimationFrame(() => {
        noteBoardSearchInput?.focus?.();
        noteBoardSearchInput?.select?.();
      });
    }

    function closeBoard() {
      isBoardOpen = false;

      if (noteBoardPanel) {
        noteBoardPanel.hidden = true;
      }
    }

${getBoardRendererScript()}
${getBoardEventsScript()}
  `;
}

module.exports = {
  getBoardScript,
};
