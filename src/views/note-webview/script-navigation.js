function getNavigationScript() {
  return `
    function revealEditorPaneBeforeJump(callback) {
      if (!isPreviewOnly) {
        callback?.();
        return;
      }

      isPreviewOnly = false;
      savePreviewOnly();
      applyPreviewOnly();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          callback?.();
        });
      });
    }

    function revealEditorPaneAndScrollTo(targetSelector) {
      const run = () => {
        const editorPane = document.querySelector(".editorPane");
        const target = document.querySelector(targetSelector);
        if (!editorPane || !target) return;

        const paneRect = editorPane.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const relativeTop = targetRect.top - paneRect.top + editorPane.scrollTop;

        editorPane.scrollTo({
          top: Math.max(0, relativeTop - 12),
          behavior: "smooth",
        });
      };

      if (!isPreviewOnly) {
        run();
        return;
      }

      isPreviewOnly = false;
      savePreviewOnly();
      applyPreviewOnly();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          run();
        });
      });
    }

    function openGroup(groupId) {
      if (!groupId) return false;
      if (!collapsedGroupIds.has(groupId)) return false;

      const toggleBtn = groupsRoot.querySelector(
        \`[data-action="toggleGroup"][data-group-id="\${groupId}"]\`
      );
      if (!toggleBtn) return false;

      toggleBtn.click();
      return true;
    }

    function closeGroup(groupId) {
      if (!groupId) return false;
      if (collapsedGroupIds.has(groupId)) return false;

      collapsedGroupIds.add(groupId);
      renderGroups();
      return true;
    }

    function toggleGroupCollapse(groupId) {
      if (!groupId) return false;

      if (collapsedGroupIds.has(groupId)) {
        collapsedGroupIds.delete(groupId);
      } else {
        collapsedGroupIds.add(groupId);
      }

      saveCollapsedGroups();
      renderGroups();
      renderPreview();
      return true;
    }

    function openItemMemoFromPreview(itemId) {
      openGroupMoreMenuId = "";
      openItemMoreMenuId = "";
      openItemMemoId = itemId;
      renderGroups();
      renderPreview();

      requestAnimationFrame(() => {
        const memoPanel = groupsRoot.querySelector(
          \`.itemMemoPanel[data-item-id="\${itemId}"]\`
        );
        memoPanel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }

    function openItemMemoById(groupId, itemId) {
      if (!itemId) return;

      revealEditorPaneBeforeJump(() => {
        if (groupId) {
          openGroup(groupId);
        }

        openGroupMoreMenuId = "";
        openItemMoreMenuId = "";
        openItemMemoId = itemId;

        renderGroups();
        renderPreview();

        requestAnimationFrame(() => {
          const memoPanel = groupsRoot.querySelector(
            \`.itemMemoPanel[data-item-id="\${itemId}"]\`
          );

          if (memoPanel) {
            memoPanel.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });

            const firstInput = memoPanel.querySelector(
              ".itemMemoBodyInput, .itemMemoTagsInput"
            );
            firstInput?.focus?.({ preventScroll: true });
            return;
          }

          const itemCard = groupsRoot.querySelector(\`[data-nav-id="item:\${itemId}"]\`);
          itemCard?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      });
    }

    function expandAllGroups() {
      collapsedGroupIds.clear();
      saveCollapsedGroups();
      renderGroups();
      renderPreview();
    }

    function collapseAllGroups() {
      collapsedGroupIds = new Set(state.groups.map((g) => g.id));
      saveCollapsedGroups();
      renderGroups();
      renderPreview();
    }

    function ensureGroupExpanded(groupId) {
      return openGroup(groupId);
    }

    function scrollToEditorNavId(navId) {
      if (!navId) return;

      revealEditorPaneBeforeJump(() => {
        const groupId = getGroupIdForNavId(navId);
        openGroup(groupId);

        requestAnimationFrame(() => {
          const target = groupsRoot.querySelector(\`[data-nav-id="\${navId}"]\`);
          if (!target) return;

          const align = String(navId).startsWith("group:") ? "start" : "center";

          target.scrollIntoView({
            behavior: "smooth",
            block: align,
          });

          target.classList.remove("editorJumpHighlight");
          void target.offsetWidth;
          target.classList.add("editorJumpHighlight");

          const focusTarget =
            target.querySelector("input, textarea, select, button") || target;

          if (typeof focusTarget.focus === "function") {
            focusTarget.focus({ preventScroll: true });
          }
        });
      });
    }

    function scrollPreviewElementIntoView(target, options = {}) {
      if (!target) return;

      const {
        align = "center",
        offset = 12,
      } = options;

      const previewPane = document.querySelector(".previewPane");
      const previewHead = document.querySelector(".previewHead");
      const scrollEl =
        typeof getPreviewScrollEl === "function"
          ? getPreviewScrollEl()
          : previewPane;

      if (!scrollEl) {
        target.scrollIntoView({
          behavior: "smooth",
          block: align,
        });
        return;
      }

      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const headerHeight = previewHead ? previewHead.getBoundingClientRect().height : 0;

      const relativeTop =
        targetRect.top - scrollRect.top + scrollEl.scrollTop;

      const nextTop =
        align === "start"
          ? relativeTop - headerHeight - offset
          : relativeTop - scrollEl.clientHeight / 2 + targetRect.height / 2;

      scrollEl.scrollTo({
        top: Math.max(0, nextTop),
        behavior: "smooth",
      });
    }

    function findItemForNavId(navId) {
      if (!String(navId || "").startsWith("item:")) {
        return null;
      }

      const itemId = String(navId).slice("item:".length);
      if (!itemId) return null;

      for (const group of state.groups || []) {
        const items = Array.isArray(group.items) ? group.items : [];
        const item = items.find((entry) => String(entry?.id || "") === itemId);

        if (item) {
          return {
            group,
            item,
            itemId,
          };
        }
      }

      return null;
    }

    function getPreviewBoardTargetForNavId(navId) {
      if (!previewBoardRoot || !navId) return null;

      const text = String(navId || "");

      if (text.startsWith("group:")) {
        const groupId = text.slice("group:".length);
        if (!groupId) return null;

        const columnEl = previewBoardRoot.querySelector(
          \`.noteBoardColumn[data-board-group-id="\${CSS.escape(groupId)}"]\`,
        );

        return columnEl
          ? {
              targetEl: columnEl,
              columnEl,
              columnBodyEl: columnEl.querySelector(".noteBoardColumnBody"),
              align: "start",
            }
          : null;
      }

      if (text.startsWith("item:")) {
        const found = findItemForNavId(text);
        if (!found?.itemId) return null;

        const selector =
          found.item?.kind === "divider"
            ? \`.noteBoardDividerBlock[data-board-divider-id="\${CSS.escape(found.itemId)}"]\`
            : \`.noteBoardCard[data-board-item-id="\${CSS.escape(found.itemId)}"]\`;

        const targetEl = previewBoardRoot.querySelector(selector);
        if (!targetEl) return null;

        const columnEl = targetEl.closest(".noteBoardColumn");
        const columnBodyEl = targetEl.closest(".noteBoardColumnBody");

        return {
          targetEl,
          columnEl,
          columnBodyEl,
          align: "center",
        };
      }

      return null;
    }

    function scrollPreviewBoardElementIntoView(navId) {
      const found = getPreviewBoardTargetForNavId(navId);
      if (!found?.targetEl) return false;

      const { targetEl, columnEl, columnBodyEl, align } = found;

      if (previewBoardRoot && columnEl) {
        const rootRect = previewBoardRoot.getBoundingClientRect();
        const columnRect = columnEl.getBoundingClientRect();

        const relativeLeft =
          columnRect.left - rootRect.left + previewBoardRoot.scrollLeft;

        const nextLeft =
          align === "start"
            ? relativeLeft - 12
            : relativeLeft - previewBoardRoot.clientWidth / 2 + columnRect.width / 2;

        previewBoardRoot.scrollTo({
          left: Math.max(0, nextLeft),
          behavior: "smooth",
        });
      }

      if (columnBodyEl && targetEl !== columnEl) {
        const bodyRect = columnBodyEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const relativeTop =
          targetRect.top - bodyRect.top + columnBodyEl.scrollTop;

        const nextTop =
          relativeTop - columnBodyEl.clientHeight / 2 + targetRect.height / 2;

        columnBodyEl.scrollTo({
          top: Math.max(0, nextTop),
          behavior: "smooth",
        });
      }

      targetEl.classList.remove("previewJumpHighlight");
      void targetEl.offsetWidth;
      targetEl.classList.add("previewJumpHighlight");

      setTimeout(() => {
        targetEl.classList.remove("previewJumpHighlight");
      }, 900);

      return true;
    }

    function scrollToPreviewNavId(navId) {
      if (!navId) return;

      const tryScroll = (retryCount = 0) => {
        if (previewMode === "board") {
          if (scrollPreviewBoardElementIntoView(navId)) {
            return;
          }
        } else {
          const target = previewRoot.querySelector(\`[data-nav-id="\${navId}"]\`);
          if (target) {
            const isGroup = String(navId).startsWith("group:");

            scrollPreviewElementIntoView(target, {
              align: isGroup ? "start" : "center",
              offset: 14,
            });

            target.classList.remove("previewJumpHighlight");
            void target.offsetWidth;
            target.classList.add("previewJumpHighlight");

            setTimeout(() => {
              target.classList.remove("previewJumpHighlight");
            }, 900);

            return;
          }
        }

        if (retryCount >= 6) return;

        requestAnimationFrame(() => {
          tryScroll(retryCount + 1);
        });
      };

      requestAnimationFrame(() => {
        tryScroll(0);
      });
    }

    function findGroupByItemId(itemId) {
      return state.groups.find((group) =>
        Array.isArray(group.items) && group.items.some((item) => item.id === itemId)
      ) || null;
    }

    function getGroupIdForNavId(navId) {
      if (!navId) return "";

      if (String(navId).startsWith("group:")) {
        return navId.slice("group:".length);
      }

      if (String(navId).startsWith("item:")) {
        const itemId = navId.slice("item:".length);
        if (!itemId) return "";

        const group = findGroupByItemId(itemId);
        return group?.id || "";
      }

      return "";
    }

    function scrollEditorElementIntoView(targetEl, align = "center") {
      if (!targetEl) return;

      targetEl.scrollIntoView({
        behavior: "smooth",
        block: align,
      });

      targetEl.classList.add("editorJumpHighlight");

      setTimeout(() => {
        targetEl.classList.remove("editorJumpHighlight");
      }, 900);
    }

    function jumpToEditorTarget(selector, options = {}) {
      const {
        groupId = "",
        align = "center",
      } = options;

      const expanded = ensureGroupExpanded(groupId);

      const tryScroll = (retryCount = 0) => {
        const targetEl = groupsRoot.querySelector(selector);
        if (targetEl) {
          scrollEditorElementIntoView(targetEl, align);
          return;
        }

        if (retryCount >= 6) return;

        requestAnimationFrame(() => {
          tryScroll(retryCount + 1);
        });
      };

      if (expanded) {
        requestAnimationFrame(() => {
          tryScroll(0);
        });
        return;
      }

      tryScroll(0);
    }

    function scrollToEditorItem(itemId) {
      if (!itemId) return;

      revealEditorPaneBeforeJump(() => {
        const target = groupsRoot.querySelector(\`[data-item-id="\${itemId}"]\`);
        if (!target) return;

        const groupEl = target.closest("[data-group-id]");
        const groupId = groupEl?.dataset.groupId || "";
        if (groupId) {
          openGroup(groupId);
        }

        requestAnimationFrame(() => {
          const nextTarget = groupsRoot.querySelector(\`[data-item-id="\${itemId}"]\`);
          if (!nextTarget) return;

          nextTarget.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          nextTarget.classList.remove("editorJumpHighlight");
          void nextTarget.offsetWidth;
          nextTarget.classList.add("editorJumpHighlight");

          const focusTarget =
            nextTarget.querySelector("input, textarea, select, button") || nextTarget;

          if (typeof focusTarget.focus === "function") {
            focusTarget.focus({ preventScroll: true });
          }
        });
      });
    }

    function scrollToEditorDivider(groupId, itemId) {
      if (!groupId || !itemId) return;

      jumpToEditorTarget(\`[data-nav-id="item:\${itemId}"]\`, {
        groupId,
        align: "center",
      });
    }

    function scrollToEditorGroup(groupId) {
      if (!groupId) return;

      jumpToEditorTarget(\`[data-nav-id="group:\${groupId}"]\`, {
        groupId,
        align: "start",
      });
    }
  `;
}

module.exports = {
  getNavigationScript,
};