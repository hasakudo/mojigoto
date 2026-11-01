function getUiPanelsScript() {
  return `
    function positionMoreMenu() {
      if (!isMoreMenuOpen || !moreMenuPanel || !moreMenuBtn) return;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 8;
      const topEdge = (viewport?.offsetTop || 0) + 8;
      const rightEdge = leftEdge + (viewport?.width || window.innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height || window.innerHeight) - 16;
      const anchor = moreMenuBtn.getBoundingClientRect();
      const width = Math.max(0, Math.min(300, rightEdge - leftEdge));
      moreMenuPanel.style.width = width + "px";
      moreMenuPanel.style.left = Math.max(leftEdge, Math.min(anchor.right - width, rightEdge - width)) + "px";
      const below = Math.max(topEdge, Math.min(anchor.bottom + 6, bottomEdge));
      const above = Math.max(0, Math.min(anchor.top - 6, bottomEdge) - topEdge);
      const height = moreMenuPanel.scrollHeight + 2;
      const useAbove = bottomEdge - below < Math.min(120, height) && above > bottomEdge - below;
      const maxHeight = Math.max(0, useAbove ? above : bottomEdge - below);
      moreMenuPanel.style.maxHeight = maxHeight + "px";
      moreMenuPanel.style.top = (useAbove ? Math.max(topEdge, anchor.top - 6 - Math.min(height, maxHeight)) : below) + "px";
    }

    function setMoreMenuOpen(open) {
      isMoreMenuOpen = !!open;
      if (moreMenuPanel) {
        moreMenuPanel.hidden = !isMoreMenuOpen;
        moreMenuBtn?.setAttribute("aria-expanded", String(isMoreMenuOpen));
        if (isMoreMenuOpen) positionMoreMenu();
      }
    }

    function toggleMoreMenu() {
      setMoreMenuOpen(!isMoreMenuOpen);
    }

    function setTemplatePanelOpen(open) {
      isTemplatePanelOpen = !!open;
      if (templatePanelEl) {
        templatePanelEl.hidden = !isTemplatePanelOpen;
      }
    }

    function setSearchOpen(open) {
      isSearchOpen = !!open;

      if (searchPanelEl) {
        searchPanelEl.hidden = !isSearchOpen;
      }

      if (isSearchOpen && noteSearchInput) {
        setTimeout(() => {
          noteSearchInput.focus();
          noteSearchInput.select();
        }, 0);
      }
    }

    function toggleGroupMoreMenu(groupId) {
      openGroupMoreMenuId =
        openGroupMoreMenuId === groupId ? "" : groupId;

      renderGroups();
    }

    function setGroupMoreMenuOpen(groupId) {
      openItemMoreMenuId = "";
      openGroupMoreMenuId = String(groupId || "");
      renderGroups();
    }

    function setItemMoreMenuOpen(itemId) {
      openGroupMoreMenuId = "";
      openItemMoreMenuId = String(itemId || "");
      renderGroups();
    }

    function toggleItemMoreMenu(itemId) {
      openGroupMoreMenuId = "";
      openItemMoreMenuId =
        openItemMoreMenuId === itemId ? "" : itemId;

      renderGroups();
    }

  `;
}

module.exports = {
  getUiPanelsScript,
};
