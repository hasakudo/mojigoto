const vm = require("node:vm");
const conceptNoteOrder = require("../../web/lib/concept-note-order");
const { getConceptMemoUtilsScript } = require("../../src/views/concept-memo/script-utils");
const { getConceptMemoFoldersScript } = require("../../src/views/concept-memo/script-folders");
const { getConceptMemoListScript } = require("../../src/views/concept-memo/script-list");
const { createConceptMemoListQuery } = require("../../src/views/concept-memo/list-query");
const { getConceptMemoWebviewHtml } = require("../../src/views/concept-memo/concept-memo-html");
const typeLabels = /const MEMO_TYPE_LABELS = \{[\s\S]*?};/.exec(getConceptMemoWebviewHtml({}, {}))[0];

function createListContext(options = {}, script = getConceptMemoListScript()) {
  const context = vm.createContext({
    conceptNoteOrder, conceptNoteIndex: [], activeNoteFilter: "", sortField: "updated", sortDirection: "desc",
    currentState: { data: { memos: [], folders: [] } }, activeFolderIds: [], activeTagFilters: [],
    activeQuickFilters: { type: "", state: [], source: "" }, searchQuery: "", ...options,
  });
  vm.runInContext(typeLabels + getConceptMemoUtilsScript() + getConceptMemoFoldersScript() + script, context);
  return context;
}

function queryFor(context) {
  return createConceptMemoListQuery({
    conceptNoteOrder,
    compareText: context.compareText,
    getTimeValue: context.getTimeValue,
    normalizeMemoFolderIds: context.normalizeMemoFolderIds,
    getMemoSearchText: context.getMemoSearchText,
  });
}

function queryOptions(context) {
  return {
    memos: context.currentState?.data?.memos, folders: context.getMemoFolders(),
    activeFolderIds: context.activeFolderIds, activeTagFilters: context.activeTagFilters,
    activeQuickFilters: context.activeQuickFilters, searchQuery: context.searchQuery,
    conceptNoteIndex: context.conceptNoteIndex, activeNoteFilter: context.activeNoteFilter,
    sortField: context.sortField, sortDirection: context.sortDirection,
  };
}

module.exports = { createListContext, queryFor, queryOptions, conceptNoteOrder };
