function getBoardMovePickerScript() {
  return `    function renderBoardMovePicker(group, item) {
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
`;
}

function getBoardDividerMovePickerScript() {
  return `    function renderBoardDividerMovePicker(group, block) {
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
`;
}

function getBoardRendererScript() {
  return `    function renderBoardEntryCard(group, item) {
      const headingHtml = noteDisplayRenderer.heading(item, searchQuery);
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

      const bodyHtml = noteDisplayRenderer.body(body, searchQuery);

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
              \${headingHtml}
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
                class="secondary noteBoardMiniBtn noteBoardJumpEditBtn"
                type="button"
                data-action="jumpBoardItem"
                data-group-id="\${group.id}"
                data-item-id="\${item.id}"
                title="編集側の項目へ移動"
                aria-label="編集側の項目へ移動"
              >
                ✎
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

          \${noteDisplayRenderer.memo(item, false, searchQuery)}
          \${renderBoardMovePicker(group, item)}
        </article>
      \`;
    }

    function renderBoardDivider(item) {
      const label = String(item?.label || "").trim() || "区分";
      const value = String(item?.value || "").trim();

      return \`
        <section class="noteBoardDivider">
          <div class="noteBoardDividerLabel">\${noteDisplayRenderer.text(label, searchQuery)}</div>
          \${value ? \`<div class="noteBoardDividerValue">\${noteDisplayRenderer.text(value, searchQuery)}</div>\` : ""}
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
            <span class="noteBoardDividerLabel">\${noteDisplayRenderer.text(label, searchQuery)}</span>
            \${value ? \`<span class="noteBoardDividerValue">\${noteDisplayRenderer.text(value, searchQuery)}</span>\` : ""}
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
              \${noteDisplayRenderer.text(groupTitle, searchQuery)}
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
      const memoOpenState = capturePreviewMemoState(rootEl);
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
      syncActiveEditingItemStyles();
      restorePreviewMemoState(rootEl, memoOpenState);
    }

    function renderBoard() {
      renderBoardTo(noteBoardRoot, { inline: false });

      if (previewMode === "board" && previewBoardRoot) {
        renderBoardTo(previewBoardRoot, { inline: true });
      }
    }
`;
}

module.exports = { getBoardMovePickerScript, getBoardDividerMovePickerScript, getBoardRendererScript };
