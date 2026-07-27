function getConceptMemoListScript() {
  return `
    function sortMemosForList(memos) {
      return [...memos].sort((a, b) => {
        const aPinned = a?.isPinned ? 1 : 0;
        const bPinned = b?.isPinned ? 1 : 0;

        if (aPinned !== bPinned) {
          return bPinned - aPinned;
        }

        const field = sortField || "updated";
        const direction = sortDirection || "desc";

        if (field === "title") {
          const compared = compareText(
            a?.title || "無題メモ",
            b?.title || "無題メモ",
          );
          return direction === "asc" ? compared : -compared;
        }

        const aValue =
          field === "created"
            ? getTimeValue(a?.createdAt)
            : getTimeValue(a?.updatedAt);

        const bValue =
          field === "created"
            ? getTimeValue(b?.createdAt)
            : getTimeValue(b?.updatedAt);

        return direction === "asc" ? aValue - bValue : bValue - aValue;
      });
    }

    function renderSortSelect() {
      const fieldSelect = document.getElementById("memoSortFieldSelect");
      const directionRadio = document.querySelector(
        'input[name="memoSortDirection"][value="' + sortDirection + '"]',
      );

      if (fieldSelect && fieldSelect.value !== sortField) {
        fieldSelect.value = sortField;
      }

      if (directionRadio) {
        directionRadio.checked = true;
      }
    }

    function bindSortActions() {
      const fieldSelect = document.getElementById("memoSortFieldSelect");
      const directionRadios = document.querySelectorAll(
        'input[name="memoSortDirection"]',
      );

      const applySortChange = () => {
        const checkedDirection = document.querySelector(
          'input[name="memoSortDirection"]:checked',
        );

        sortDirection = checkedDirection?.value || "desc";
        sortField = fieldSelect?.value || "updated";

        localStorage.setItem(getSortDirectionStorageKey(), sortDirection);
        localStorage.setItem(getSortFieldStorageKey(), sortField);

        const visible = getFilteredMemos();
        if (visible.length && !visible.some((memo) => memo.id === selectedMemoId)) {
          selectedMemoId = visible[0].id;
        }

        renderAll();
      };

      if (fieldSelect) {
        fieldSelect.addEventListener("change", applySortChange);
      }

      directionRadios.forEach((radio) => {
        radio.addEventListener("change", applySortChange);
      });
    }

    function getSortModeLabel() {
      if (sortField === "title") {
        return sortDirection === "asc"
          ? "並び順: タイトル昇順"
          : "並び順: タイトル降順";
      }

      if (sortField === "created") {
        return sortDirection === "asc"
          ? "並び順: 作成が古い順"
          : "並び順: 作成が新しい順";
      }

      return sortDirection === "asc"
        ? "並び順: 更新が古い順"
        : "並び順: 更新が新しい順";
    }

    function isSourceFilterAvailable() {
      const typeFilter = String(activeQuickFilters?.type || "");
      return !typeFilter || typeFilter === "text";
    }

    function memoMatchesTypeFilter(memo) {
      const typeFilter = String(activeQuickFilters?.type || "");
      if (!typeFilter) return true;
      return String(memo?.type || "text") === typeFilter;
    }

    function memoMatchesStateFilter(memo) {
      const states = Array.isArray(activeQuickFilters?.state)
        ? activeQuickFilters.state
        : [];

      const wantsArchived = states.includes("archived");

      // 通常表示では、保管中メモは出さない
      if (!wantsArchived && Boolean(memo?.isArchived)) {
        return false;
      }

      if (!states.length) return true;

      return states.every((state) => {
        if (state === "dashboard") return Boolean(memo?.showInDashboard);
        if (state === "archived") return Boolean(memo?.isArchived);
        if (state === "pinned") return Boolean(memo?.isPinned);
        return true;
      });
    }

    function memoMatchesSourceFilter(memo) {
      const sourceFilter = String(activeQuickFilters?.source || "");
      if (!sourceFilter) return true;

      if (sourceFilter === "hasSource") {
        const sourceKind = String(memo?.source?.kind || "");
        return sourceKind === "noteItem" || sourceKind === "writingMemo";
      }

      if (sourceFilter === "cleared") {
        return String(memo?.source?.status || "") === "cleared";
      }

      if (sourceFilter === "missing") {
        return String(memo?.source?.status || "") === "missing";
      }

      return true;
    }

    function getFilteredMemos() {
      const memos = Array.isArray(currentState?.data?.memos)
        ? currentState.data.memos
        : [];

      const visibleByQuickFilter = memos.filter((memo) => {
        return (
          memoMatchesTypeFilter(memo) &&
          memoMatchesStateFilter(memo) &&
          memoMatchesSourceFilter(memo)
        );
      });

      const visibleByTag = activeTagFilter
        ? visibleByQuickFilter.filter((memo) => {
            const tags = Array.isArray(memo?.tags) ? memo.tags : [];
            return tags.includes(activeTagFilter);
          })
        : visibleByQuickFilter;

      const query = String(searchQuery || "").trim().toLowerCase();
      const filtered = !query
        ? visibleByTag
        : visibleByTag.filter((memo) => getMemoSearchText(memo).includes(query));

      return sortMemosForList(filtered);
    }

    function getActiveQuickFilterSummaryLabel() {
      const labels = [];

      if (activeQuickFilters.type) {
        if (activeQuickFilters.type === "text") labels.push("通常メモ");
        if (activeQuickFilters.type === "list") labels.push("リストメモ");
        if (activeQuickFilters.type === "todo") labels.push("TODOメモ");
      }

      if (Array.isArray(activeQuickFilters.state)) {
        if (activeQuickFilters.state.includes("dashboard")) labels.push("ダッシュボード");
        if (activeQuickFilters.state.includes("archived")) labels.push("アーカイブ");
        if (activeQuickFilters.state.includes("pinned")) labels.push("ピン留め");
      }

      if (activeQuickFilters.source === "hasSource") labels.push("出典あり");
      if (activeQuickFilters.source === "cleared") labels.push("元メモなし");
      if (activeQuickFilters.source === "missing") labels.push("リンク切れ");

      return labels.length ? "絞り込み: " + labels.join(" / ") : "絞り込み: なし";
    }

    function getMemoCounts() {
      const allMemos = Array.isArray(currentState?.data?.memos)
        ? currentState.data.memos
        : [];

      const archivedMemos = allMemos.filter((memo) => Boolean(memo?.isArchived));
      const normalMemos = allMemos.filter((memo) => !memo?.isArchived);
      const filteredMemos = getFilteredMemos();

      return {
        total: allMemos.length,
        normal: normalMemos.length,
        archived: archivedMemos.length,
        filtered: filteredMemos.length,
        text: filteredMemos.filter((memo) => (memo?.type || "text") === "text").length,
        list: filteredMemos.filter((memo) => memo?.type === "list").length,
        todo: filteredMemos.filter((memo) => memo?.type === "todo").length,
        pinned: filteredMemos.filter((memo) => memo?.isPinned).length,
        dashboard: filteredMemos.filter((memo) => memo?.showInDashboard).length,
      };
    }

    function renderMemoCounts() {
      const memoCountText = document.getElementById("memoCountText");
      const memoCountSubText = document.getElementById("memoCountSubText");
      const memoSortModeText = document.getElementById("memoSortModeText");
      if (!memoCountText || !memoCountSubText || !memoSortModeText) return;

      const counts = getMemoCounts();
      const hasFilter =
        Boolean(searchQuery) ||
        Boolean(activeTagFilter) ||
        Boolean(activeQuickFilters.type) ||
        (Array.isArray(activeQuickFilters.state) && activeQuickFilters.state.length > 0) ||
        Boolean(activeQuickFilters.source);

      memoCountText.textContent =
        "メモ " + counts.normal + "件 / 保管 " + counts.archived + "件" +
        (hasFilter ? " / 絞込 " + counts.filtered + "件" : "");

      memoCountSubText.textContent =
        "表示中: 通常 " + counts.text +
        " / リスト " + counts.list +
        " / TODO " + counts.todo +
        (counts.dashboard > 0 ? " / ダッシュボード " + counts.dashboard : "") +
        (counts.pinned > 0 ? " / ピン " + counts.pinned : "");

      memoSortModeText.textContent =
        getSortModeLabel() + " / " + getActiveQuickFilterSummaryLabel();
    }

    function setActiveTagFilter(tag) {
      activeTagFilter = String(tag || "").trim();

      const visible = getFilteredMemos();
      if (visible.length && !visible.some((memo) => memo.id === selectedMemoId)) {
        selectedMemoId = visible[0].id;
      }

      renderAll();
      showToast("タグで絞り込みました: " + activeTagFilter);
    }

    function clearActiveTagFilter() {
      activeTagFilter = "";

      const visible = getFilteredMemos();
      if (visible.length && !visible.some((memo) => memo.id === selectedMemoId)) {
        selectedMemoId = visible[0].id;
      }

      renderAll();
      showToast("タグ絞り込みを解除しました。");
    }

    function renderTagFilter() {
      const tagFilterBox = document.getElementById("tagFilterBox");
      const activeTagFilterLabel = document.getElementById("activeTagFilterLabel");

      if (!tagFilterBox || !activeTagFilterLabel) return;

      if (!activeTagFilter) {
        tagFilterBox.style.display = "none";
        activeTagFilterLabel.textContent = "";
        return;
      }

      tagFilterBox.style.display = "";
      activeTagFilterLabel.textContent = activeTagFilter;
    }

    function bindTagFilterActions() {
      const clearTagFilterButton = document.getElementById("clearTagFilterButton");
      if (!clearTagFilterButton) return;

      clearTagFilterButton.addEventListener("click", () => {
        clearActiveTagFilter();
      });
    }

    function renderQuickFilter() {
      const sourceAvailable = isSourceFilterAvailable();

      if (!sourceAvailable && activeQuickFilters.source) {
        activeQuickFilters.source = "";
      }

      document.querySelectorAll("[data-filter-group]").forEach((button) => {
        const group = button.dataset.filterGroup || "";
        const value = button.dataset.filterValue || "";

        let active = false;

        if (group === "type") {
          active = activeQuickFilters.type === value;
        } else if (group === "state") {
          active =
            Array.isArray(activeQuickFilters.state) &&
            activeQuickFilters.state.includes(value);
        } else if (group === "source") {
          active = activeQuickFilters.source === value;
        }

        const disabled = group === "source" && !sourceAvailable;

        button.classList.toggle("isActive", active);
        button.classList.toggle("isDisabled", disabled);
        button.disabled = disabled;
        button.setAttribute("aria-disabled", disabled ? "true" : "false");
        button.title = disabled
          ? "出典状態の絞り込みは通常メモでのみ使えます"
          : "";
      });
    }

    function bindQuickFilter() {
      document.querySelectorAll("[data-filter-group]").forEach((button) => {
        button.addEventListener("click", () => {
          const group = button.dataset.filterGroup || "";
          const value = button.dataset.filterValue || "";

          if (group === "source" && !isSourceFilterAvailable()) {
            return;
          }

          if (group === "type") {
            activeQuickFilters.type =
              activeQuickFilters.type === value ? "" : value;
          } else if (group === "state") {
            const current = Array.isArray(activeQuickFilters.state)
              ? [...activeQuickFilters.state]
              : [];

            activeQuickFilters.state = current.includes(value)
              ? current.filter((item) => item !== value)
              : [...current, value];
          } else if (group === "source") {
            activeQuickFilters.source =
              activeQuickFilters.source === value ? "" : value;
          }

          const visible = getFilteredMemos();
          if (visible.length && !visible.some((memo) => memo.id === selectedMemoId)) {
            selectedMemoId = visible[0].id;
          }
          if (!visible.length) {
            selectedMemoId = "";
          }

          renderAll();
        });
      });

      const clearButton = document.getElementById("clearQuickFilterButton");
      if (clearButton) {
        clearButton.addEventListener("click", () => {
          activeQuickFilters = {
            type: "",
            state: [],
            source: "",
          };

          const visible = getFilteredMemos();
          if (visible.length && !visible.some((memo) => memo.id === selectedMemoId)) {
            selectedMemoId = visible[0].id;
          }

          renderAll();
        });
      }
    }

    function toggleMemoPinnedById(memoId) {
      if (!memoId) return;

      const memo = currentState.data.memos.find((item) => item.id === memoId);
      if (!memo) return;

      const index = currentState.data.memos.findIndex((item) => item.id === memoId);
      if (index < 0) return;

      currentState.data.memos[index] = {
        ...memo,
        isPinned: !memo.isPinned,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      renderAll();
      showToast(currentState.data.memos[index].isPinned ? "ピン留めしました。" : "ピン留めを解除しました。");

      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function toggleMemoArchivedById(memoId) {
      if (!memoId) return;

      const memo = currentState.data.memos.find((item) => item.id === memoId);
      if (!memo) return;

      const index = currentState.data.memos.findIndex((item) => item.id === memoId);
      if (index < 0) return;

      const nextArchived = !memo.isArchived;
      const isArchivedView =
        Array.isArray(activeQuickFilters.state) &&
        activeQuickFilters.state.includes("archived");

      currentState.data.memos[index] = {
        ...memo,
        isArchived: nextArchived,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      if (!isArchivedView && nextArchived && selectedMemoId === memoId) {
        const visible = getFilteredMemos().filter((item) => item.id !== memoId);
        selectedMemoId = visible[0]?.id || "";
      }

      if (isArchivedView && !nextArchived && selectedMemoId === memoId) {
        const visible = getFilteredMemos().filter((item) => item.id !== memoId);
        selectedMemoId = visible[0]?.id || "";
      }

      renderAll();
      showToast(nextArchived ? "アーカイブしました。" : "アーカイブを解除しました。");
      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function toggleMemoDashboardById(memoId) {
      if (!memoId) return;

      const memo = currentState.data.memos.find((item) => item.id === memoId);
      if (!memo) return;

      const index = currentState.data.memos.findIndex((item) => item.id === memoId);
      if (index < 0) return;

      const nextValue = !memo.showInDashboard;

      currentState.data.memos[index] = {
        ...memo,
        showInDashboard: nextValue,
        updatedAt: new Date().toISOString(),
      };
      currentState.data.updatedAt = new Date().toISOString();

      renderAll();
      showToast(nextValue ? "ダッシュボードに表示します。" : "ダッシュボード表示を解除しました。");

      saveCurrentMemos({ silentToast: true, skipDirtyFlash: true });
    }

    function renderBulkDeleteActions() {
      const toggleButton = document.getElementById("toggleBulkDeleteButton");
      const executeButton = document.getElementById("executeBulkDeleteButton");

      if (toggleButton) {
        toggleButton.textContent = isBulkDeleteMode ? "選択解除" : "選択";
      }

      if (executeButton) {
        executeButton.hidden = !isBulkDeleteMode;
        executeButton.textContent = selectedMemoIdsForDelete.length > 0
          ? \`削除 (\${selectedMemoIdsForDelete.length})\`
          : "削除";
        executeButton.disabled = selectedMemoIdsForDelete.length === 0;
      }
    }

    function bindBulkDeleteActions() {
      const toggleButton = document.getElementById("toggleBulkDeleteButton");
      const executeButton = document.getElementById("executeBulkDeleteButton");

      if (toggleButton) {
        toggleButton.addEventListener("click", () => {
          isBulkDeleteMode = !isBulkDeleteMode;

          if (!isBulkDeleteMode) {
            selectedMemoIdsForDelete = [];
          }

          renderAll();
        });
      }

      if (executeButton) {
        executeButton.addEventListener("click", () => {
          requestBulkDeleteSelectedMemos();
        });
      }
    }

    function renderListPanels() {
      const searchPanel = document.getElementById("memoSearchPanel");
      const sortPanel = document.getElementById("memoSortPanel");
      const filterPanel = document.getElementById("memoFilterPanel");
      const bulkDeletePanel = document.getElementById("memoBulkDeletePanel");

      if (searchPanel) {
        searchPanel.hidden = openListPanel !== "search";
      }

      if (sortPanel) {
        sortPanel.hidden = openListPanel !== "sort";
      }

      if (filterPanel) {
        filterPanel.hidden = openListPanel !== "filter";
      }

      if (bulkDeletePanel) {
        bulkDeletePanel.hidden = openListPanel !== "bulkDelete";
      }
    }

    function bindListPanelActions() {
      const searchBtn = document.getElementById("openSearchPanelButton");
      const sortBtn = document.getElementById("openSortPanelButton");
      const filterBtn = document.getElementById("openFilterPanelButton");
      const bulkDeleteBtn = document.getElementById("openBulkDeletePanelButton");

      if (searchBtn) {
        searchBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openListPanel = openListPanel === "search" ? "" : "search";
          renderAll();
        });
      }

      if (sortBtn) {
        sortBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openListPanel = openListPanel === "sort" ? "" : "sort";
          renderAll();
        });
      }

      if (filterBtn) {
        filterBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openListPanel = openListPanel === "filter" ? "" : "filter";
          renderAll();
        });
      }

      if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openListPanel = openListPanel === "bulkDelete" ? "" : "bulkDelete";
          renderAll();
        });
      }

      document.addEventListener("click", (event) => {
        if (!openListPanel) return;

        const panelIds = [
          "memoSearchPanel",
          "memoSortPanel",
          "memoFilterPanel",
          "memoBulkDeletePanel",
        ];

        const buttonIds = [
          "openSearchPanelButton",
          "openSortPanelButton",
          "openFilterPanelButton",
          "openBulkDeletePanelButton",
        ];

        const clickedInsidePanel = panelIds.some((id) => {
          const el = document.getElementById(id);
          return el && el.contains(event.target);
        });

        const clickedButton = buttonIds.some((id) => {
          const el = document.getElementById(id);
          return el && el.contains(event.target);
        });

        if (!clickedInsidePanel && !clickedButton) {
          openListPanel = "";
          renderAll();
        }
      });

      window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!openListPanel) return;

        openListPanel = "";
        renderAll();

        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
    }

    function renderMemoList() {
      const listEl = document.getElementById("memoList");
      if (!listEl) return;

      const memos = getFilteredMemos();

      if (!memos.length) {
        listEl.innerHTML = '<div class="memoItem muted">該当するメモはありません。</div>';
        return;
      }

      listEl.innerHTML = memos.map((memo) => {
        const title = memo?.title || "無題メモ";
        const typeLabel = getMemoTypeLabel(memo?.type || "text");
        const tags = Array.isArray(memo?.tags) ? memo.tags : [];
        const sourceSummary = getSourceSummaryShort(memo);
        const sourceStatusBadgeHtml = getSourceStatusBadgeHtml(memo);
        const isSelectedClass = memo.id === selectedMemoId ? " isSelected" : "";

        const todoCounts = getTodoCounts(memo);
        const todoMeta = memo?.type === "todo"
          ? (
              todoCounts.undone > 0
                ? '<span class="todoMetaText isActive">未完了 ' + escapeHtml(String(todoCounts.undone)) + '</span>'
                : '<span class="todoMetaText isDone">完了</span>'
            )
          : "";

        const dashboardMark = memo?.showInDashboard
          ? '<button type="button" class="listStateBadge isClickable" data-dashboard-toggle-id="' + escapeHtml(memo.id) + '" title="ダッシュボード表示を解除">ダッシュボード</button>'
          : '<button type="button" class="listStateBadge isClickable" data-dashboard-toggle-id="' + escapeHtml(memo.id) + '" title="ダッシュボードに表示">ダッシュボードOFF</button>';

        const archiveMark = memo?.isArchived
          ? '<button type="button" class="listStateBadge isArchived isClickable" data-archive-toggle-id="' + escapeHtml(memo.id) + '" title="アーカイブを解除">保管中</button>'
          : "";

        const statusBadges = [dashboardMark, archiveMark].filter(Boolean).join("");

        const statusRowHtml = statusBadges
          ? '<div class="memoBadgeRow">' + statusBadges + '</div>'
          : "";

        const updatedAtText = memo?.updatedAt
          ? formatJstDateTimeShort(memo.updatedAt)
          : "";

        const updatedAtHtml = updatedAtText
          ? '<span class="memoUpdatedAt">' + escapeHtml(updatedAtText) + '</span>'
          : "";

        const sourceHtml = sourceSummary
          ? '<div class="muted sourceSummaryRow" style="margin-top:6px;">' +
              '<span class="' + getSourceSummaryClassName(memo) + '">' + escapeHtml(sourceSummary) + '</span>' +
              sourceStatusBadgeHtml +
            '</div>'
          : "";

        const tagsHtml = tags.length
          ? '<div class="tagList">' + tags.map((tag) => {
              const activeClass = tag === activeTagFilter ? ' style="font-weight:600;"' : '';
              return '<span class="tagChip isClickable" data-tag-filter="' + escapeHtml(tag) + '"' + activeClass + ' title="タグで絞り込み">' + escapeHtml(tag) + '</span>';
            }).join("") + '</div>'
          : "";

        const pinButtonHtml =
          '<button type="button" class="pinToggleButton' + (memo?.isPinned ? ' isPinned' : '') + '" data-pin-toggle-id="' + escapeHtml(memo.id) + '" title="' +
          (memo?.isPinned ? 'ピン留めを解除' : 'ピン留めする') +
          '">📌</button>';

        const bulkDeleteCheckboxHtml = isBulkDeleteMode
        ? '<input type="checkbox" class="bulkDeleteCheckbox" data-bulk-delete-id="' + escapeHtml(memo.id) + '"' +
          (selectedMemoIdsForDelete.includes(memo.id) ? ' checked' : '') +
          ' />'
        : "";

        return '<div class="memoItem' + isSelectedClass + '" data-memo-id="' + escapeHtml(memo.id) + '">' +
          '<div class="memoCardHeader">' +
            '<div class="row" style="align-items:flex-start; flex:1 1 auto;">' +
              bulkDeleteCheckboxHtml +
              '<div class="memoCardTitle">' + escapeHtml(title) + '</div>' +
            '</div>' +
            pinButtonHtml +
          '</div>' +
          statusRowHtml +
          '<div class="memoMetaRow">' +
            '<span class="muted">' + escapeHtml(typeLabel) + '</span>' +
            todoMeta +
            updatedAtHtml +
          '</div>' +
          sourceHtml +
          tagsHtml +
          '</div>';
      }).join("");

      listEl.querySelectorAll("[data-memo-id]").forEach((el) => {
        el.addEventListener("click", () => {
          selectedMemoId = el.dataset.memoId || "";

          if (window.innerWidth <= 700) {
            isSidebarCollapsed = true;
          }

          renderAll();
        });
      });

      listEl.querySelectorAll("[data-tag-filter]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          setActiveTagFilter(el.dataset.tagFilter || "");
        });
      });

      listEl.querySelectorAll("[data-pin-toggle-id]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleMemoPinnedById(el.dataset.pinToggleId || "");
        });
      });

      listEl.querySelectorAll("[data-archive-toggle-id]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleMemoArchivedById(el.dataset.archiveToggleId || "");
        });
      });

      listEl.querySelectorAll("[data-dashboard-toggle-id]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleMemoDashboardById(el.dataset.dashboardToggleId || "");
        });
      });

      listEl.querySelectorAll("[data-bulk-delete-id]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();

          const memoId = el.dataset.bulkDeleteId || "";
          if (!memoId) return;

          if (el.checked) {
            if (!selectedMemoIdsForDelete.includes(memoId)) {
              selectedMemoIdsForDelete.push(memoId);
            }
          } else {
            selectedMemoIdsForDelete = selectedMemoIdsForDelete.filter((id) => id !== memoId);
          }

          renderBulkDeleteActions();
        });
      });
    }

    function renderSearchInput() {
      const memoSearchInput = document.getElementById("memoSearchInput");
      if (!memoSearchInput) return;

      if (memoSearchInput.value !== searchQuery) {
        memoSearchInput.value = searchQuery;
      }
    }

    function handleSearchInput() {
      const memoSearchInput = document.getElementById("memoSearchInput");
      if (!memoSearchInput) return;

      memoSearchInput.addEventListener("input", () => {
        searchQuery = memoSearchInput.value || "";

        const visible = getFilteredMemos();
        if (visible.length && !visible.some((memo) => memo.id === selectedMemoId)) {
          selectedMemoId = visible[0].id;
        }

        renderAll();
      });
    }
  `;
}

module.exports = {
  getConceptMemoListScript,
};
