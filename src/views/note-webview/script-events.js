function getEventsScript() {
  return `
  function requestCloseNote() {
    if (dirty) {
      vscode.postMessage({
        type: "requestClose",
        dirty: true,
      });
      return;
    }

    vscode.postMessage({
      type: "close",
    });
  }

  function handleNoteShortcut(event) {
    const key = event.key;
    const lowerKey = key.toLowerCase();

    const isSave = (event.ctrlKey || event.metaKey) && lowerKey === "s";
    if (isSave) {
      event.preventDefault();
      saveCurrentNote();
      return;
    }

    const isExpandAll = event.altKey && event.shiftKey && lowerKey === "p";
    if (isExpandAll) {
      event.preventDefault();
      expandAllGroups();
      clearStatus();
      setStatus("すべて開きました。", true);
      return;
    }

    const isCollapseAll = event.altKey && event.shiftKey && lowerKey === "l";
    if (isCollapseAll) {
      event.preventDefault();
      collapseAllGroups();
      clearStatus();
      setStatus("すべて畳みました。", true);
      return;
    }

    // Ctrl + F で検索パネル
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();

      if (!isSearchOpen) {
        setSearchOpen(true);
      }

      requestAnimationFrame(() => {
        noteSearchInput?.focus();
        noteSearchInput?.select();
      });

      return;
    }

    // Alt + Shift + N で専用コピー画面
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "n") {
      event.preventDefault();

      vscode.postMessage({
        type: "openDedicatedCopyPanel",
      });
      return;
    }

    // Ctrl + Alt + T でテンプレート一覧
    if ((event.ctrlKey || event.metaKey) && event.altKey && lowerKey === "t") {
      event.preventDefault();

      if (isTemplatePanelOpen) {
        const firstInsertBtn = document.querySelector("#templateList [data-template-id]");
        if (firstInsertBtn) {
          firstInsertBtn.focus?.();
        }
      } else {
        openTemplatePanelForAppend();
      }

      return;
    }

    if (openImagePreview) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGroupImagePreview();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveGroupImagePreview("prev");
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveGroupImagePreview("next");
        return;
      }
    }

    // Escape
    if (event.key === "Escape") {
      if (isBoardOpen) {
        event.preventDefault();
        closeBoard();
        return;
      }

      if (isAllImagesGalleryOpen) {
        closeAllImagesGallery();
        return;
      }

      if (openImageGalleryGroupId) {
        closeGroupImageGallery();
        return;
      }

      // テンプレート一覧
      if (isTemplatePanelOpen) {
        closeTemplatePanel();
        return;
      }

      // 項目メニュー
      if (openItemMoreMenuId) {
        openItemMoreMenuId = "";
        renderGroups();
        return;
      }

      // 大分類メニュー
      if (openGroupMoreMenuId) {
        openGroupMoreMenuId = "";
        renderGroups();
        return;
      }

      // 検索パネル
      if (!isSearchOpen) return;

      if (searchQuery) {
        searchQuery = "";
        noteSearchInput.value = "";
        renderGroups();
        renderPreview();
        return;
      }

      setSearchOpen(false);
    }
  }

  function registerTitleEvents() {
    titleInput.addEventListener("input", () => {
      state.title = titleInput.value;
      markDirty();
      renderPreview();
    });
  }

  function registerSearchEvents() {
    noteSearchInput?.addEventListener("input", () => {
      searchQuery = noteSearchInput.value || "";

      if (searchQuery.trim()) {
        const matchedGroupIds = state.groups
          .filter((group) => groupMatchesQuery(group, searchQuery))
          .map((group) => group.id);

        matchedGroupIds.forEach((id) => collapsedGroupIds.delete(id));
      }

      renderGroups();
      renderPreview();

      if (isBoardOpen) {
        renderBoard();
      }
    });
  
    document.getElementById("clearSearchBtn")?.addEventListener("click", () => {
      searchQuery = "";
      if (noteSearchInput) {
        noteSearchInput.value = "";
      }
      renderGroups();
      renderPreview();

      if (isBoardOpen) {
        renderBoard();
      }
    });

    closeSearchBtn?.addEventListener("click", () => {
      setSearchOpen(false);
    });
  }

  function registerToolbarEvents() {
    document.getElementById("addGroupBtnBottom").addEventListener("click", () => {
      state.groups.push(createGroup());
      updateDirtyUi();
      renderGroups();
      renderPreview();
      setStatus("大分類を追加しました。", true);
    });

    toggleAllImagesBtn?.addEventListener("click", () => {
      toggleAllImagesGallery();
    });

    document.getElementById("expandAllBtn").addEventListener("click", () => {
      expandAllGroups();
    });

    document.getElementById("collapseAllBtn").addEventListener("click", () => {
      collapseAllGroups();
    });

    document.getElementById("saveBtn").addEventListener("click", () => {
      saveCurrentNote();
    });

    document.getElementById("closeBtn")?.addEventListener("click", () => {
      requestCloseNote();
    });

    document.getElementById("deleteNoteBtn")?.addEventListener("click", () => {
      const noteTitle = (titleInput.value || "このノート").trim();

      setStatus(\`「\${noteTitle}」の削除確認を開いています...\`, true);

      vscode.postMessage({
        type: "delete",
        title: noteTitle,
      });
    });
  
    toggleEditorPaneBtn?.addEventListener("click", () => {
      togglePreviewOnly();
    });

    jumpToPreviewTopBtn?.addEventListener("click", () => {
      const previewPane = document.querySelector(".previewPane");
      const previewRoot = document.getElementById("preview");

      const target = previewPane || previewRoot;
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function registerPreviewEvents() {
    previewListBtn?.addEventListener("click", () => {
      previewMode = "list";
      savePreviewMode();
      renderPreview();
    });

    previewBoardBtn?.addEventListener("click", () => {
      previewMode = "board";
      savePreviewMode();
      renderPreview();
    });

    previewRoot.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest('[data-action="previewToggleGroup"]');
      if (toggleBtn) {
        const groupId = toggleBtn.dataset.groupId;
        if (!groupId) return;

        toggleGroupCollapse(groupId);
        renderPreview();
        return;
      }

      const navEl = event.target.closest("[data-nav-id]");
      if (!navEl) return;

      const navId = navEl.dataset.navId;
      if (!navId) return;

      scrollToEditorNavId(navId);
    });

    previewRoot.onkeydown = (event) => {
      const navEl = event.target.closest(".previewCard[data-nav-id]");
      if (!navEl) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const navId = navEl.dataset.navId;
        if (!navId) return;
        jumpFromPreview(navId);
      }
    };
  }

  function handleMenuAction(action, menuActionBtn) {
    if (action === "saveTemplate") {
      setMoreMenuOpen(false);
      vscode.postMessage({
        type: "saveTemplate",
        payload: collectPayload()
      });
      return;
    }

    if (action === "toggleSearch") {
      setMoreMenuOpen(false);
      setSearchOpen(!isSearchOpen);
      return;
    }

    if (action === "toggleTemplateList") {
      setMoreMenuOpen(false);
      setTemplatePanelOpen(true);
      requestTemplateList();
      return;
    }

    if (action === "toggleGroupMoreMenu") {
      const groupId = menuActionBtn.dataset.groupId || "";
      toggleGroupMoreMenu(groupId);
      return;
    }

    if (action === "toggleItemMoreMenu") {
      const itemId = menuActionBtn.dataset.itemId || "";
      toggleItemMoreMenu(itemId);
      return;
    }

    if (action === "toggleCopyPanel") {
      setMoreMenuOpen(false);

      vscode.postMessage({
        type: "openDedicatedCopyPanel",
      });
      return;
    }

    if (action === "exportNote") {
      vscode.postMessage({
        type: "saveAndExport",
        payload: collectPayload()
      });
      setMoreMenuOpen(false);
      return;
    }

    if (action === "importNote") {
      setMoreMenuOpen(false);

      vscode.postMessage({
        type: "importNote",
      });
      setStatus("インポート方法を開いています...", true);
      return;
    }

    if (action === "closeNote") {
      setMoreMenuOpen(false);
      requestCloseNote();
      return;
    }

    if (action === "deleteNote") {
      setMoreMenuOpen(false);

      const noteTitle = (titleInput.value || "このノート").trim();

      setStatus(\`「\${noteTitle}」の削除確認を開いています...\`, true);

      vscode.postMessage({
        type: "delete",
        title: noteTitle,
      });
      return;
    }
  }

  function registerMenuEvents() {
    document.getElementById("addGroupBtn").addEventListener("click", () => {
      state.groups.push(createGroup());
      updateDirtyUi();
      renderGroups();
      renderPreview();
      setStatus("大分類を追加しました。", true);
    });

    moreMenuBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMoreMenu();
    });

    importNoteBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      setStatus("インポートを開いています...", true);
      setMoreMenuOpen(false);

      vscode.postMessage({
        type: "importNote",
      });
    });

    templatePanelEl?.addEventListener("click", (event) => {
      if (event.target === templatePanelEl) {
        closeTemplatePanel();
      }
    });

    closeTemplatePanelBtn?.addEventListener("click", () => {
      resetTemplateInsertPending();
      openTemplatePreviewId = "";
      setTemplatePanelOpen(false);
    });

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      
      const menuActionBtn = target.closest("[data-menu-action]");
      if (menuActionBtn) {
        event.preventDefault();
        event.stopPropagation();

        const action = menuActionBtn.dataset.menuAction;
        handleMenuAction(action, menuActionBtn);
        return;
      }

      if (isMoreMenuOpen) {
        const clickedInsideMenu = target.closest(".menuWrap");
        if (!clickedInsideMenu) {
          setMoreMenuOpen(false);
        }
      }

      if (openGroupMoreMenuId) {
        const clickedInsideGroupMenu = target.closest(".groupMoreMenuWrap");
        if (!clickedInsideGroupMenu) {
          setGroupMoreMenuOpen("");
        }
      }

      if (openItemMoreMenuId) {
        const clickedInsideItemMenu = target.closest(".itemMoreMenuWrap");
        if (!clickedInsideItemMenu) {
          setItemMoreMenuOpen("");
        }
      }
    });
  }

  function registerMessageEvents() {
    window.addEventListener("keydown", handleNoteShortcut);
    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === "shortcutCloseNote") {
        requestCloseNote();
        return;
      }

      if (msg.type === "noteSaved") {
        clearDirty();

        if (suppressNextNoteSavedMessage) {
          suppressNextNoteSavedMessage = false;
          return;
        }

        setStatus("保存しました。", true);
        return;
      }

      if (msg.type === "noteReloaded") {
        const next = msg?.payload || {};

        state = {
          ...next,
          groups: Array.isArray(next?.groups)
            ? next.groups.map(normalizeGroup)
            : [],
        };

        if (!state.groups.length) {
          state.groups = [createGroup()];
        }

        titleInput.value = state.title || "";
        renderGroups();
        updateDirtyUi();
        applyPreviewOnly();
        stabilizePreviewRender();

        if (isBoardOpen) {
          renderBoard();
        }
        return;
      }

      if (msg.type === "focusNoteItem") {
        const payload = msg.payload || {};
        const itemId = String(payload.itemId || "");
        if (!itemId) return;

        scrollToEditorItem(itemId);
        return;
      }

      if (msg.type === "openNoteItemMemo") {
        const payload = msg.payload || {};
        const groupId = String(payload.groupId || "");
        const itemId = String(payload.itemId || "");
        if (!itemId) return;

        openItemMemoById(groupId, itemId);
        return;
      }

      if (msg.type === "templateSaved") {
        clearStatus();
        setStatus("テンプレートを保存しました。", true);
        if (isTemplatePanelOpen) {
          requestTemplateList();
        }
        return;
      }
          
      if (msg.type === "error") {
        setStatus(msg.message || "処理に失敗しました。", true);
      }

      if (msg.type === "templateDeleted") {
        showTemplatePanelMessage("テンプレートを削除しました。", true);
        requestTemplateList();
        return;
      }

      if (msg.type === "templateList") {
        templateListState = Array.isArray(msg.items) ? msg.items : [];
        renderTemplateList();
        return;
      }
          
      if (msg.type === "info") {
        clearStatus();
        setStatus(msg.message || "", true);
        return;
      }

      if (msg.type === "conceptMemoCreatedFromNoteItem") {
        const conceptMemoId = String(msg?.payload?.conceptMemoId || "");
        const groupId = String(msg?.payload?.groupId || "");
        const itemId = String(msg?.payload?.itemId || "");
        const mode = String(msg?.payload?.mode || "created");

        if (!conceptMemoId || !groupId || !itemId) {
          setStatus(
            mode === "updated" ? "構想メモを更新しました。" : "構想メモへコピーしました。",
            true,
          );
          return;
        }

        const group = state.groups.find((g) => g.id === groupId);
        if (!group) {
          setStatus(
            mode === "updated" ? "構想メモを更新しました。" : "構想メモへコピーしました。",
            true,
          );
          return;
        }

        const item = (Array.isArray(group.items) ? group.items : []).find(
          (entry) => entry.id === itemId,
        );
        if (!item || item.kind !== "entry") {
          setStatus(
            mode === "updated" ? "構想メモを更新しました。" : "構想メモへコピーしました。",
            true,
          );
          return;
        }

        if (!item.memo || typeof item.memo !== "object") {
          item.memo = {
            body: "",
            updatedAt: "",
            tags: [],
            linkedConceptMemoIds: [],
          };
        }

        if (!Array.isArray(item.memo.linkedConceptMemoIds)) {
          item.memo.linkedConceptMemoIds = [];
        }

        if (!item.memo.linkedConceptMemoIds.includes(conceptMemoId)) {
          item.memo.linkedConceptMemoIds.push(conceptMemoId);
        }

        item.memo.updatedAt = new Date().toISOString();
        markDirty();
        renderGroups();
        refreshViewsAfterItemMemoChange(item.id, item.memo.updatedAt);

        setStatus(
          mode === "updated" ? "構想メモを更新しました。" : "構想メモへコピーしました。",
          true,
        );

        suppressNextNoteSavedMessage = true;
        saveCurrentNote({ silentStatus: true });
        return;
      }
    });
  }

  function registerDomEvents() {
    registerTitleEvents();
    registerSearchEvents();
    registerToolbarEvents();
    registerPreviewEvents();
    registerBoardEvents();
    registerMenuEvents();
  }

  function registerWindowEvents() {
    registerMessageEvents();

    const rerenderPreviewOnVisible = () => {
      stabilizePreviewRender();
    };

    window.addEventListener("focus", rerenderPreviewOnVisible);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        rerenderPreviewOnVisible();
      }
    });

    window.addEventListener("pageshow", rerenderPreviewOnVisible);

    window.addEventListener("resize", () => {
      rerenderPreviewOnVisible();
    });
  }

  function registerNoteEvents() {
    registerDomEvents();
    registerWindowEvents();
  }
`;
}

module.exports = {
  getEventsScript,
};
