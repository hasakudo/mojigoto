function getViewStateScript() {
  return `
    function loadPreviewMode() {
      try {
        const saved = localStorage.getItem(previewModeStorageKey);
        previewMode = saved === "board" ? "board" : "list";
      } catch {
        previewMode = "list";
      }
    }

    function savePreviewMode() {
      try {
        localStorage.setItem(
          previewModeStorageKey,
          previewMode === "board" ? "board" : "list",
        );
      } catch {}
    }

    function saveCollapsedGroups() {
      try {
        const values = Array.from(collapsedGroupIds);
        localStorage.setItem(collapsedGroupsStorageKey, JSON.stringify(values));
      } catch (error) {
        // 何もしない
      }
    }

    function loadCollapsedGroups() {
      try {
        const raw = localStorage.getItem(collapsedGroupsStorageKey);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        const validGroupIds = new Set(
          (Array.isArray(state.groups) ? state.groups : []).map((group) => group.id)
        );

        collapsedGroupIds = new Set(
          parsed.filter((groupId) => validGroupIds.has(groupId))
        );
      } catch (error) {
        // 何もしない
      }
    }

    function findVerticalScrollContainer(startEl) {
      let current = startEl?.parentElement || null;

      while (current && current !== document.body) {
        const overflowY = window.getComputedStyle(current).overflowY;
        if (["auto", "scroll", "overlay"].includes(overflowY)) {
          return current;
        }
        current = current.parentElement;
      }

      return document.scrollingElement || document.documentElement;
    }

    function getEditorScrollEl() {
      return findVerticalScrollContainer(groupsRoot);
    }

    function getPreviewScrollEl() {
      return findVerticalScrollContainer(previewRoot);
    }

    function saveScrollPositions() {
      const editorScrollEl = getEditorScrollEl();
      const previewScrollEl = getPreviewScrollEl();

      try {
        const data = {
          editor: editorScrollEl?.scrollTop || 0,
          preview: previewScrollEl?.scrollTop || 0,
        };

        localStorage.setItem(scrollStorageKey, JSON.stringify(data));
      } catch (error) {
        // 何もしない
      }
    }

    function loadScrollPositions() {
      try {
        const raw = localStorage.getItem(scrollStorageKey);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!parsed) return;

        const restoreScrollTop = (el, value) => {
          if (!el || typeof value !== "number") return;

          const apply = () => {
            const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
            const nextTop = Math.max(0, Math.min(value, maxScroll));
            el.scrollTop = nextTop;
          };

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              apply();
            });
          });
        };

        requestAnimationFrame(() => {
          const editorScrollEl = getEditorScrollEl();
          const previewScrollEl = getPreviewScrollEl();

          restoreScrollTop(editorScrollEl, parsed.editor);
          restoreScrollTop(previewScrollEl, parsed.preview);
        });
      } catch (error) {
        // 何もしない
      }
    }

    function savePreviewOnly() {
      try {
        localStorage.setItem(previewOnlyStorageKey, isPreviewOnly ? "1" : "0");
      } catch (error) {
        // 何もしない
      }
    }

    function loadPreviewOnly() {
      try {
        isPreviewOnly = localStorage.getItem(previewOnlyStorageKey) === "1";
      } catch (error) {
        isPreviewOnly = false;
      }
    }

    function applyPreviewOnly() {
      if (!noteAppRoot) return;

      noteAppRoot.classList.toggle("isPreviewOnly", isPreviewOnly);

      if (toggleEditorPaneBtn) {
        toggleEditorPaneBtn.textContent = isPreviewOnly ? "編集を表示" : "編集を隠す";
        toggleEditorPaneBtn.setAttribute(
          "aria-pressed",
          isPreviewOnly ? "true" : "false",
        );
      }
    }

    function togglePreviewOnly() {
      isPreviewOnly = !isPreviewOnly;
      savePreviewOnly();
      applyPreviewOnly();
    }

    function syncActiveEditingItemStyles() {
      const activeId = String(activeEditingItemId || "");

      groupsRoot?.querySelectorAll(".itemCard[data-item-id]").forEach((cardEl) => {
        cardEl.classList.toggle(
          "isActiveEditingItem",
          Boolean(activeId) && cardEl.dataset.itemId === activeId,
        );
      });

      previewRoot?.querySelectorAll("[data-preview-item-id]").forEach((itemEl) => {
        itemEl.classList.toggle(
          "isActiveEditingItem",
          Boolean(activeId) && itemEl.dataset.previewItemId === activeId,
        );
      });

      [noteBoardRoot, previewBoardRoot].forEach((boardRootEl) => {
        boardRootEl?.querySelectorAll(".noteBoardCard[data-board-item-id]").forEach((cardEl) => {
          cardEl.classList.toggle(
            "isActiveEditingItem",
            Boolean(activeId) && cardEl.dataset.boardItemId === activeId,
          );
        });
      });
    }

    function setActiveEditingItem(itemId) {
      const nextId = String(itemId || "");
      if (!nextId || activeEditingItemId === nextId) return;

      activeEditingItemId = nextId;
      syncActiveEditingItemStyles();
    }

    function captureEditorPosition(itemId = "") {
      const editorScrollEl = getEditorScrollEl();
      const targetItemId = String(itemId || activeEditingItemId || "");
      const itemEl = targetItemId
        ? groupsRoot?.querySelector(
            \`.itemCard[data-item-id="\${CSS.escape(targetItemId)}"]\`,
          )
        : null;

      let itemViewportOffset = null;
      if (editorScrollEl && itemEl) {
        itemViewportOffset =
          itemEl.getBoundingClientRect().top -
          editorScrollEl.getBoundingClientRect().top;
      }

      const position = {
        itemId: targetItemId,
        scrollTop: Number(editorScrollEl?.scrollTop || 0),
        itemViewportOffset,
      };

      saveScrollPositions();
      return position;
    }

    function restoreEditorPosition(position = {}) {
      const itemId = String(position?.itemId || "");
      const savedScrollTop =
        typeof position?.scrollTop === "number"
          ? position.scrollTop
          : Number.NaN;
      const savedItemOffset =
        typeof position?.itemViewportOffset === "number"
          ? position.itemViewportOffset
          : Number.NaN;

      if (itemId) {
        setActiveEditingItem(itemId);
      }

      const apply = () => {
        const editorScrollEl = getEditorScrollEl();
        if (!editorScrollEl) return;

        const maxScroll = Math.max(
          0,
          editorScrollEl.scrollHeight - editorScrollEl.clientHeight,
        );
        let nextScrollTop = Number.isFinite(savedScrollTop)
          ? savedScrollTop
          : editorScrollEl.scrollTop;

        if (itemId && Number.isFinite(savedItemOffset)) {
          const itemEl = groupsRoot?.querySelector(
            \`.itemCard[data-item-id="\${CSS.escape(itemId)}"]\`,
          );

          if (itemEl) {
            const currentItemOffset =
              itemEl.getBoundingClientRect().top -
              editorScrollEl.getBoundingClientRect().top;
            nextScrollTop =
              editorScrollEl.scrollTop + currentItemOffset - savedItemOffset;
          }
        }

        editorScrollEl.scrollTop = Math.max(
          0,
          Math.min(nextScrollTop, maxScroll),
        );
        saveScrollPositions();
      };

      apply();
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
      });
      setTimeout(apply, 80);
      setTimeout(apply, 180);
    }

    function persistWebviewState() {
      vscode.setState({
        filePath: String(state?.filePath || initial?.filePath || ""),
        type: String(state?.type || state?.noteType || initial?.type || initial?.noteType || ""),
        workDir: String(state?.workDir || initial?.workDir || ""),
        workName: String(state?.workName || initial?.workName || ""),
        workTitle: String(state?.workTitle || initial?.workTitle || ""),
      });
    }
  `;
}

module.exports = {
  getViewStateScript,
};
