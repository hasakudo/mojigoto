const vm = require("node:vm");
const { getConceptMemoUtilsScript } = require("../../src/views/concept-memo/script-utils");
const { getConceptMemoStateScript } = require("../../src/views/concept-memo/script-state");
const { getConceptMemoEditorScript } = require("../../src/views/concept-memo/script-editor");

function createEditorContext(data, script = getConceptMemoEditorScript()) {
  const calls = [], elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, { value: "", style: {}, addEventListener(name, callback) { this[name] = callback; } });
    return elements.get(id);
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-10-19T00:00:00Z"])); }
    static now() { return 1792368000000; }
  }
  const math = Object.create(Math); math.random = () => 0.25;
  const context = vm.createContext({ Date: FixedDate, Math: math, currentState: { data }, selectedMemoId: data.memos[0]?.id || "",
    activeQuickFilters: { state: [] }, selectedMemoIdsForDelete: [], isDirty: false, changeRevision: 0,
    autoSaveAfterApplyToNote: true, document: { getElementById: getElement },
    getSelectedMemo: () => data.memos.find((memo) => memo.id === context.selectedMemoId),
    getFilteredMemos: () => data.memos.filter((memo) => !memo.isArchived),
    vscode: { postMessage: (message) => calls.push(["post", message]) },
    setDirty: (value) => calls.push(["dirty", value]), renderAll: () => calls.push(["renderAll"]),
    renderMemoList: () => calls.push(["renderList"]), saveCurrentMemos: (options) => calls.push(["save", options]),
    showToast: (...args) => calls.push(["toast", ...args]),
  });
  const stateScript = getConceptMemoStateScript();
  const start = stateScript.indexOf("    function updateSelectedMemo(");
  const end = /\n    }\r?\n/.exec(stateScript.slice(start));
  vm.runInContext(getConceptMemoUtilsScript() + stateScript.slice(start, start + end.index + end[0].length) + script, context);
  context.renderEditor = () => calls.push(["renderEditor"]);
  context.renderTodoChecklist = () => calls.push(["renderTodo"]);
  context.renderTagSuggestions = () => calls.push(["renderTags"]);
  return { context, calls, data, elements, input(id, name, value) {
    const element = getElement(id); element.value = value; element[name]();
  } };
}

module.exports = { createEditorContext };
