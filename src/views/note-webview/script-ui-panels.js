function getUiPanelsScript() {
  return `
    function setMoreMenuOpen(open) {
      isMoreMenuOpen = !!open;
      if (moreMenuPanel) {
        moreMenuPanel.hidden = !isMoreMenuOpen;
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
