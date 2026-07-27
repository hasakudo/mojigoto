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

    function getEditorScrollEl() {
      return groupsRoot?.parentElement || groupsRoot;
    }

    function getPreviewScrollEl() {
      return previewRoot?.parentElement || previewRoot;
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