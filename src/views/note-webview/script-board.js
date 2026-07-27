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

    function renderBoardMovePicker(group, item) {
      if (!isBoardMovePickerOpen(item?.id)) {
        return "";
      }

      const targetGroupId =
        String(boardMovePickerState.targetGroupId || "") ||
        String(group?.id || "");

      const targetGroup =
        state.groups.find((g) => String(g.id || "") === targetGroupId) ||
        group;

      const targetItems = Array.isArray(targetGroup?.items)
        ? targetGroup.items
        : [];

      const groupOptions = state.groups
        .map((g) => {
          const id = String(g.id || "");
          const selected = id === targetGroupId ? "selected" : "";
          const title = String(g.title || "").trim() || "無題大分類";

          return \`<option value="\${esc(id)}" \${selected}>\${esc(title)}</option>\`;
        })
        .join("");

      const positionOptions = [
        \`<option value="start" \${boardMovePickerState.insertPosition === "start" ? "selected" : ""}>先頭へ移動</option>\`,
        \`<option value="end" \${boardMovePickerState.insertPosition === "end" ? "selected" : ""}>末尾へ移動</option>\`,
        ...targetItems
          .filter((targetItem) => String(targetItem?.id || "") !== String(item?.id || ""))
          .map((targetItem) => {
            const value = \`after:\${String(targetItem.id || "")}\`;
            const selected =
              String(boardMovePickerState.insertPosition || "") === value
                ? "selected"
                : "";

            return \`<option value="\${esc(value)}" \${selected}>\${esc(getBoardMoveItemLabel(targetItem))} の下</option>\`;
          }),
      ].join("");

      return \`
        <div class="noteBoardMovePicker">
          <div class="noteBoardMoveTitle">カードを移動</div>

          <label class="noteBoardMoveLabel">
            移動先大分類
            <select
              data-action="changeBoardMoveTargetGroup"
              data-item-id="\${esc(item.id)}"
            >
              \${groupOptions}
            </select>
          </label>

          <label class="noteBoardMoveLabel">
            移動位置
            <select
              data-action="changeBoardMovePosition"
              data-item-id="\${esc(item.id)}"
            >
              \${positionOptions}
            </select>
          </label>

          <div class="noteBoardMoveActions">
            <button
              class="primary noteBoardMiniBtn"
              type="button"
              data-action="applyBoardMove"
              data-group-id="\${esc(group.id)}"
              data-item-id="\${esc(item.id)}"
            >
              移動する
            </button>

            <button
              class="secondary noteBoardMiniBtn"
              type="button"
              data-action="closeBoardMovePicker"
            >
              閉じる
            </button>
          </div>
        </div>
      \`;
    }

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

    function renderBoardDividerMovePicker(group, block) {
      if (!block?.id || !isBoardDividerMovePickerOpen(block.id)) {
        return "";
      }

      const targetGroupId =
        String(boardDividerMovePickerState.targetGroupId || "") ||
        String(group?.id || "");

      const targetGroup =
        state.groups.find((g) => String(g.id || "") === targetGroupId) ||
        group;

      const targetItems = Array.isArray(targetGroup?.items)
        ? targetGroup.items
        : [];

      const targetDividers = targetItems.filter((item) => {
        if (!item || item.kind !== "divider") return false;

        if (
          String(targetGroup?.id || "") === String(boardDividerMovePickerState.groupId || "") &&
          String(item.id || "") === String(boardDividerMovePickerState.dividerId || "")
        ) {
          return false;
        }

        return true;
      });

      const groupOptions = state.groups
        .map((g) => {
          const id = String(g.id || "");
          const selected = id === targetGroupId ? "selected" : "";
          const title = String(g.title || "").trim() || "無題大分類";

          return \`<option value="\${esc(id)}" \${selected}>\${esc(title)}</option>\`;
        })
        .join("");

      const dividerOptions = targetDividers
        .map((divider) => {
          const value = \`after:\${String(divider.id || "")}\`;
          const selected =
            String(boardDividerMovePickerState.insertPosition || "") === value
              ? "selected"
              : "";

          return \`<option value="\${esc(value)}" \${selected}>\${esc(getBoardDividerMoveLabel(divider))} の下</option>\`;
        })
        .join("");

      const positionOptions = [
        \`<option value="start" \${boardDividerMovePickerState.insertPosition === "start" ? "selected" : ""}>先頭へ移動</option>\`,
        \`<option value="end" \${boardDividerMovePickerState.insertPosition === "end" ? "selected" : ""}>末尾へ移動</option>\`,
        dividerOptions,
      ].join("");

      return \`
        <div class="noteBoardDividerMovePicker">
          <div class="noteBoardMoveTitle">区分を配下の項目ごと移動</div>

          <label class="noteBoardMoveLabel">
            移動先大分類
            <select
              data-action="changeBoardDividerMoveTargetGroup"
              data-divider-id="\${esc(block.id)}"
            >
              \${groupOptions}
            </select>
          </label>

          <label class="noteBoardMoveLabel">
            移動位置
            <select
              data-action="changeBoardDividerMovePosition"
              data-divider-id="\${esc(block.id)}"
            >
              \${positionOptions}
            </select>
          </label>

          <div class="noteBoardMoveHelp">
            この区分と、次の区分までの項目をまとめて移動します。
          </div>

          <div class="noteBoardMoveActions">
            <button
              class="primary noteBoardMiniBtn"
              type="button"
              data-action="applyBoardDividerMove"
              data-group-id="\${esc(group.id)}"
              data-divider-id="\${esc(block.id)}"
            >
              移動する
            </button>

            <button
              class="secondary noteBoardMiniBtn"
              type="button"
              data-action="closeBoardDividerMovePicker"
            >
              閉じる
            </button>
          </div>
        </div>
      \`;
    }

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

    function renderBoardEntryCard(group, item) {
      const heading = String(item?.heading || "").trim() || "無題項目";
      const body = String(item?.body || "").trim();
      const expanded = isBoardItemExpanded(item?.id);

      const moveDisabled = isBoardMoveDisabledBySearch();
      const moveDisabledAttrs = moveDisabled
        ? 'disabled aria-disabled="true" title="検索絞り込み中は移動できません"'
        : 'title="この項目を移動"';

      const dragDisabledAttrs = moveDisabled
        ? 'draggable="false" aria-disabled="true" title="検索絞り込み中はドラッグ移動できません"'
        : 'draggable="true" title="同じ大分類内でドラッグ移動"';

      const hasMemo = Boolean(
        item?.memo &&
        (
          String(item.memo.body || "").trim() ||
          (Array.isArray(item.memo.tags) && item.memo.tags.length)
        )
      );

      const hasBody = !!body;

      const bodyHtml =
        esc(body || "")
          .replace(/《《([^《]*?)》》/g, '<span class="previewSideDots">$1</span>')
          .replace(/[|｜]([^《<]+)《([^》<]*)》/g, "<ruby>$1<rt>$2</rt></ruby>")
          .replace(/\\n/g, "<br>") ||
        '<span class="muted">詳細未入力</span>';

      return \`
        <article
          class="noteBoardCard \${expanded ? "isExpanded" : ""}"
          data-board-group-id="\${esc(group.id)}"
          data-board-item-id="\${esc(item.id)}"
        >
          <div class="noteBoardCardHead">
            <button
              class="noteBoardCardTitle"
              type="button"
              data-action="toggleBoardCard"
              data-item-id="\${item.id}"
              title="カード本文を開閉"
            >
              \${esc(heading)}
            </button>

            <div class="noteBoardCardActions">
              <span
                class="noteBoardDragHandle \${moveDisabled ? "isDisabled" : ""}"
                role="button"
                tabindex="-1"
                data-action="dragBoardItem"
                data-group-id="\${esc(group.id)}"
                data-item-id="\${esc(item.id)}"
                \${dragDisabledAttrs}
              >
                ↕
              </span>
              \${
                hasMemo
                  ? \`
                    <button
                      class="secondary noteBoardMiniBtn"
                      type="button"
                      data-action="openBoardItemMemo"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                      title="項目メモを開く"
                    >
                      📝
                    </button>
                  \`
                  : ""
              }

              <button
                class="secondary noteBoardMiniBtn"
                type="button"
                data-action="jumpBoardItem"
                data-group-id="\${group.id}"
                data-item-id="\${item.id}"
                title="編集側の項目へ移動"
              >
                編集へ
              </button>

              <button
                class="secondary noteBoardMiniBtn noteBoardMoveBtn"
                type="button"
                data-action="openBoardMovePicker"
                data-group-id="\${group.id}"
                data-item-id="\${item.id}"
                \${moveDisabledAttrs}
              >
                移動
              </button>
            </div>
          </div>

          <button
            class="noteBoardCardBody \${expanded ? "isExpanded" : ""}"
            type="button"
            data-action="toggleBoardCard"
            data-item-id="\${item.id}"
            title="\${hasBody ? "本文を開閉" : "詳細未入力"}"
          >
            \${bodyHtml}
          </button>

          \${renderBoardMovePicker(group, item)}
        </article>
      \`;
    }

    function renderBoardDivider(item) {
      const label = String(item?.label || "").trim() || "区分";
      const value = String(item?.value || "").trim();

      return \`
        <section class="noteBoardDivider">
          <div class="noteBoardDividerLabel">\${esc(label)}</div>
          \${value ? \`<div class="noteBoardDividerValue">\${esc(value)}</div>\` : ""}
        </section>
      \`;
    }

    function renderBoardDividerHeadingFromValues(labelValue, detailValue, dividerId, groupId) {
      const label = String(labelValue || "").trim() || "区分";
      const value = String(detailValue || "").trim();
      const id = String(dividerId || "");
      const gid = String(groupId || "");

      const moveDisabled = isBoardMoveDisabledBySearch();
      const moveDisabledAttrs = moveDisabled
        ? 'disabled aria-disabled="true" title="検索絞り込み中は移動できません"'
        : 'title="この区分と配下の項目を移動"';

      const dragDisabledAttrs = moveDisabled
        ? 'draggable="false" aria-disabled="true" title="検索絞り込み中はドラッグ移動できません"'
        : 'draggable="true" title="同じ大分類内で区分をドラッグ移動"';

      return \`
        <header class="noteBoardDividerHead">
          \${
            id
              ? \`
                <span
                  class="noteBoardDividerDragHandle \${moveDisabled ? "isDisabled" : ""}"
                  role="button"
                  tabindex="-1"
                  data-action="dragBoardDivider"
                  data-group-id="\${esc(gid)}"
                  data-divider-id="\${esc(id)}"
                  \${dragDisabledAttrs}
                >
                  ↕
                </span>
               \`
              : ""
          }
          <button
            class="noteBoardDividerJumpBtn"
            type="button"
            data-action="jumpBoardDivider"
            data-divider-id="\${esc(id)}"
            title="編集側の区分へ移動"
          >
            <span class="noteBoardDividerLabel">\${esc(label)}</span>
            \${value ? \`<span class="noteBoardDividerValue">\${esc(value)}</span>\` : ""}
          </button>

          \${
            id
              ? \`
                <button
                  class="secondary noteBoardDividerMoveBtn"
                  type="button"
                  data-action="openBoardDividerMovePicker"
                  data-group-id="\${esc(gid)}"
                  data-divider-id="\${esc(id)}"
                  \${moveDisabledAttrs}
                >
                  移動
                </button>
              \`
              : ""
          }
        </header>
      \`;
    }

    function renderBoardEntryCards(group, entries, block = null) {
      const cards = (Array.isArray(entries) ? entries : [])
        .filter((item) => item && item.kind !== "divider")
        .map((item) => renderBoardEntryCard(group, item))
        .join("");

      if (cards) {
        return cards;
      }

      const emptyText = hasActiveSearchQuery()
        ? "この区分内に検索と一致する項目はありません。"
        : "この区分に項目はありません。";

      const dividerId = String(block?.id || "");

      return \`
        <div
          class="noteBoardBlockEmpty \${dividerId ? "noteBoardEmptyDividerDrop" : ""}"
          data-board-group-id="\${esc(group?.id || "")}"
          data-board-divider-id="\${esc(dividerId)}"
        >
          \${esc(emptyText)}
        </div>
      \`;
    }

    function buildBoardDividerBlocks(group, items) {
      const hasDivider = (Array.isArray(items) ? items : []).some(
        (item) => item && item.kind === "divider",
      );

      if (!hasDivider) {
        return [
          {
            type: "plain",
            entries: (Array.isArray(items) ? items : []).filter(
              (item) => item && item.kind !== "divider",
            ),
          },
        ];
      }

      const blocks = [];
      let currentBlock = null;
      let beforeFirstDividerEntries = [];

      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item) return;

        if (item.kind === "divider") {
          if (currentBlock) {
            blocks.push(currentBlock);
          } else if (beforeFirstDividerEntries.length) {
            blocks.push({
              type: "divider",
              label: "区分なし",
              value: "",
              entries: beforeFirstDividerEntries,
            });
            beforeFirstDividerEntries = [];
          }

          currentBlock = {
            type: "divider",
            id: String(item.id || ""),
            label: String(item.label || "").trim() || "区分",
            value: String(item.value || "").trim(),
            entries: [],
          };
          return;
        }

        if (currentBlock) {
          currentBlock.entries.push(item);
        } else {
          beforeFirstDividerEntries.push(item);
        }
      });

      if (currentBlock) {
        blocks.push(currentBlock);
      } else if (beforeFirstDividerEntries.length) {
        blocks.push({
          type: "divider",
          label: "区分なし",
          value: "",
          entries: beforeFirstDividerEntries,
        });
      }

      return blocks;
    }

    function renderBoardDividerBlock(group, block) {
      if (block.type === "plain") {
        return \`
          <div class="noteBoardPlainCards">
            \${renderBoardEntryCards(group, block.entries, block)}
          </div>
        \`;
      }

      return \`
        <section
          class="noteBoardDividerBlock"
          data-board-group-id="\${esc(group.id)}"
          data-board-divider-id="\${esc(block.id || "")}"
        >
          \${renderBoardDividerHeadingFromValues(block.label, block.value, block.id, group.id)}
          \${renderBoardDividerMovePicker(group, block)}
          <div class="noteBoardDividerCards">
            \${renderBoardEntryCards(group, block.entries, block)}
          </div>
        </section>
      \`;
    }

    function renderBoardColumn(group, groupIndex) {
      const groupTitle =
        String(group?.title || "").trim() || \`大分類 \${groupIndex + 1}\`;

      const items = getVisibleItemsForGroup(group);
      const entryCount = items.filter((item) => item && item.kind !== "divider").length;
      const dividerCount = items.filter((item) => item && item.kind === "divider").length;

      const blocks = buildBoardDividerBlocks(group, items);
      const blocksHtml = blocks
        .map((block) => renderBoardDividerBlock(group, block))
        .join("");

      return \`
        <section class="noteBoardColumn" data-board-group-id="\${group.id}">
          <header class="noteBoardColumnHead">
            <button
              class="noteBoardColumnTitle"
              type="button"
              data-action="jumpBoardGroup"
              data-group-id="\${group.id}"
              title="編集側の大分類へ移動"
            >
              \${esc(groupTitle)}
            </button>
            <div class="noteBoardColumnMeta">
              項目 \${entryCount}件\${dividerCount ? \` / 区分 \${dividerCount}\` : ""}
            </div>
          </header>

          <div class="noteBoardColumnBody">
            \${blocksHtml || '<div class="noteBoardEmpty">項目がありません。</div>'}
          </div>
        </section>
      \`;
    }

    function renderBoardTo(rootEl, options = {}) {
      if (!rootEl) return;

      const { inline = false } = options;
      const scrollSnapshot = captureBoardScrollState(rootEl);

      if (!inline) {
        updateBoardSearchNotice();
      }

      if (isBoardMoveDisabledBySearch()) {
        resetBoardMovePicker();
        resetBoardDividerMovePicker();
        resetBoardDragState();
        resetBoardDividerDragState();
      }

      const groups = getVisibleGroupsForSearch();

      if (inline) {
        updatePreviewCounts(groups);
      }

      if (!groups.length) {
        rootEl.innerHTML = \`
          <div class="noteBoardNoResult">
            該当する項目はありません。
          </div>
        \`;

        restoreBoardScrollState(scrollSnapshot, rootEl);
        return;
      }

      rootEl.innerHTML = groups
        .map((group, index) => renderBoardColumn(group, index))
        .join("");

      restoreBoardScrollState(scrollSnapshot, rootEl);
    }

    function renderBoard() {
      renderBoardTo(noteBoardRoot, { inline: false });

      if (previewMode === "board" && previewBoardRoot) {
        renderBoardTo(previewBoardRoot, { inline: true });
      }
    }

    function handleBoardClick(event) {
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
    }
  `;
}

module.exports = {
  getBoardScript,
};
