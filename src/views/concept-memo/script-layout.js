function getConceptMemoLayoutScript() {
  return `
    function renderSidebarState() {
      const app = document.getElementById("conceptMemoApp");
      const toggleSidebarButton = document.getElementById("toggleSidebarButton");
      const toggleSidebarButtonMain = document.getElementById("toggleSidebarButtonMain");
      if (!app) return;

      app.classList.toggle("isSidebarCollapsed", isSidebarCollapsed);

      const label = isSidebarCollapsed ? "→" : "←";
      const title = isSidebarCollapsed
        ? "メモ一覧を表示"
        : "メモ一覧を折りたたむ";

      if (toggleSidebarButton) {
        toggleSidebarButton.textContent = label;
        toggleSidebarButton.title = title;
      }

      if (toggleSidebarButtonMain) {
        toggleSidebarButtonMain.textContent = label;
        toggleSidebarButtonMain.title = title;
      }

      syncResponsiveLayout();
    }

    function bindSidebarActions() {
      const toggleSidebarButton = document.getElementById("toggleSidebarButton");
      const toggleSidebarButtonMain = document.getElementById("toggleSidebarButtonMain");

      const handleToggle = () => {
        isSidebarCollapsed = !isSidebarCollapsed;
        renderSidebarState();
      };

      if (toggleSidebarButton) {
        toggleSidebarButton.addEventListener("click", handleToggle);
      }

      if (toggleSidebarButtonMain) {
        toggleSidebarButtonMain.addEventListener("click", handleToggle);
      }

      const clearSearchButton = document.getElementById("clearSearchButton");

      if (clearSearchButton) {
        clearSearchButton.addEventListener("click", () => {
          searchQuery = "";
          const memoSearchInput = document.getElementById("memoSearchInput");
          if (memoSearchInput) {
            memoSearchInput.value = "";
          }
          renderAll();
          showToast("検索をクリアしました。");
        });
      }
    }

    function renderOverviewState() {
      const body = document.getElementById("memoOverviewBody");
      const button = document.getElementById("toggleMemoOverviewButton");
      const icon = document.getElementById("memoOverviewToggleIcon");

      if (body) body.hidden = isOverviewCollapsed;
      if (button) {
        button.setAttribute("aria-expanded", String(!isOverviewCollapsed));
        button.title = isOverviewCollapsed ? "概要を表示" : "概要を折りたたむ";
      }
      if (icon) icon.textContent = isOverviewCollapsed ? "⌄" : "⌃";
    }

    function bindOverviewActions() {
      document.getElementById("toggleMemoOverviewButton")?.addEventListener("click", () => {
        isOverviewCollapsed = !isOverviewCollapsed;
        renderOverviewState();
        persistUiState();
      });
    }

    function renderCommonTodoState() {
      const app = document.getElementById("conceptMemoApp");
      const toggleButton = document.getElementById("toggleCommonTodoButton");
      const sidebarButton = document.getElementById("toggleCommonTodoButtonSidebar");
      if (!app) return;

      app.classList.toggle("isCommonTodoCollapsed", isCommonTodoCollapsed);

      if (toggleButton) {
        setConceptActionState(toggleButton, isCommonTodoCollapsed ? "作品共通TODOを表示" : "作品共通TODOを折りたたむ", !isCommonTodoCollapsed);
        toggleButton.setAttribute("aria-expanded", String(!isCommonTodoCollapsed));
      }

      if (sidebarButton) {
        setConceptActionState(sidebarButton, isCommonTodoCollapsed ? "作品共通TODOを表示" : "作品共通TODOを折りたたむ", !isCommonTodoCollapsed);
        sidebarButton.setAttribute("aria-expanded", String(!isCommonTodoCollapsed));
      }
    }

    function bindCommonTodoLayoutActions() {
      const toggleButton = document.getElementById("toggleCommonTodoButton");
      const sidebarButton = document.getElementById("toggleCommonTodoButtonSidebar");
      const closeButton = document.getElementById("closeCommonTodoButton");

      const handleToggle = () => {
        isCommonTodoCollapsed = !isCommonTodoCollapsed;
        renderCommonTodoState();
        persistUiState();
      };

      toggleButton?.addEventListener("click", handleToggle);
      sidebarButton?.addEventListener("click", handleToggle);
      closeButton?.addEventListener("click", handleToggle);
    }

    function syncResponsiveLayout() {
      const app = document.getElementById("conceptMemoApp");
      if (!app) return;

      const wasNarrow = isNarrowLayout;
      isNarrowLayout = window.innerWidth <= 700;

      app.classList.toggle("isNarrowLayout", isNarrowLayout);

      // 狭幅に入った瞬間だけ表示モードを整える
      if (isNarrowLayout && !wasNarrow) {
        if (selectedMemoId) {
          isSidebarCollapsed = true;
        } else {
          isSidebarCollapsed = false;
        }
      }

      // 広幅に戻ったら特殊モードを解除
      if (!isNarrowLayout) {
        app.classList.remove("showListOnly", "showEditorOnly");
        return;
      }

      const showEditorOnly = Boolean(selectedMemoId) && isSidebarCollapsed;
      app.classList.toggle("showEditorOnly", showEditorOnly);
      app.classList.toggle("showListOnly", !showEditorOnly);
    }

    function bindResponsiveLayout() {
      window.addEventListener("resize", () => {
        syncResponsiveLayout();
      });
    }
  `;
}

module.exports = {
  getConceptMemoLayoutScript,
};
