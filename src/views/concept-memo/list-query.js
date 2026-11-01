// Pure list selection. The browser provides its existing text/date/folder helpers.
function createConceptMemoListQuery({ conceptNoteOrder, compareText, getTimeValue, normalizeMemoFolderIds, getMemoSearchText }) {
  function sortMemosForList(memos, options) {
    const { sortField, sortDirection, conceptNoteIndex, activeNoteFilter } = options;
    if (sortField === "noteOrder") {
      return conceptNoteOrder.sortConceptMemosByNote(memos, conceptNoteIndex, activeNoteFilter, sortDirection);
    }
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

  function memoMatchesTypeFilter(memo, activeQuickFilters) {
    const typeFilter = String(activeQuickFilters?.type || "");
    if (!typeFilter) return true;
    return String(memo?.type || "text") === typeFilter;
  }

  function memoMatchesStateFilter(memo, activeQuickFilters) {
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

  function memoMatchesSourceFilter(memo, activeQuickFilters) {
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

  function getFilteredMemos(options) {
    const { activeFolderIds, activeTagFilters, activeQuickFilters, searchQuery, conceptNoteIndex, activeNoteFilter } = options;
    const memos = Array.isArray(options.memos)
      ? options.memos
      : [];
    const validFolderIds = new Set(options.folders.map((folder) => folder.id));
    const selectedFolderIds = (Array.isArray(activeFolderIds) ? activeFolderIds : [])
      .filter((folderId) => folderId === "" || validFolderIds.has(folderId));

    const visibleByQuickFilter = memos.filter((memo) => {
      return (
        memoMatchesTypeFilter(memo, activeQuickFilters) &&
        memoMatchesStateFilter(memo, activeQuickFilters) &&
        memoMatchesSourceFilter(memo, activeQuickFilters)
        && conceptNoteOrder.matchesConceptNote(memo, conceptNoteIndex, activeNoteFilter)
      );
    });

    const visibleByFolder = selectedFolderIds.length === 0
      ? visibleByQuickFilter
      : visibleByQuickFilter.filter((memo) => {
          const memoFolderIds = normalizeMemoFolderIds(memo);
          return selectedFolderIds.some((folderId) =>
            folderId === "" ? memoFolderIds.length === 0 : memoFolderIds.includes(folderId),
          );
        });

    const selectedTags = Array.isArray(activeTagFilters) ? activeTagFilters : [];
    const visibleByTag = selectedTags.length
      ? visibleByFolder.filter((memo) => {
          const tags = Array.isArray(memo?.tags) ? memo.tags : [];
          return selectedTags.some((tag) => tags.includes(tag));
        })
      : visibleByFolder;

    const query = String(searchQuery || "").trim().toLowerCase();
    const filtered = !query
      ? visibleByTag
      : visibleByTag.filter((memo) => getMemoSearchText(memo).includes(query));

    return sortMemosForList(filtered, options);
  }

  return { sortMemosForList, getFilteredMemos };
}

module.exports = { createConceptMemoListQuery };
