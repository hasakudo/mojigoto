const vm = require("node:vm");
const { getUtilsScript } = require("../../src/views/note-webview/script-utils");
const { getGroupsScript } = require("../../src/views/note-webview/script-groups");
const { getPreviewScript } = require("../../src/views/note-webview/script-preview");
const { getBoardScript } = require("../../src/views/note-webview/script-board");
const { getNoteMemoVisibilityScript } = require("../../src/views/note-webview/script-memo-visibility");
const { createNoteDisplayRenderer } = require("../../src/views/note-webview/display-renderer");

class PreviewElement {
  constructor(dataset = {}, parents = {}) {
    this.dataset = dataset; this.parents = parents; this.handlers = {}; this.value = "";
    this.scrollTop = 0; this.scrollLeft = 0; this.scrollHeight = 2000; this.clientHeight = 400;
    this.classes = new Set(); this.details = [];
    this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  }
  closest(selector) {
    if (selector in this.parents) return this.parents[selector];
    const action = /\[data-action=['"]([^'"]+)['"]\]/.exec(selector)?.[1];
    if (action && action === this.dataset.action) return this;
    const role = /\[data-role=['"]([^'"]+)['"]\]/.exec(selector)?.[1];
    if (role && role === this.dataset.role) return this;
    if (selector === "[data-nav-id]" && this.dataset.navId) return this;
    if (selector.startsWith("button, select") && (this.dataset.action || this.dataset.role || this.interactive)) return this;
    return null;
  }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  querySelectorAll(selector) {
    if (selector.includes("noteDisplayMemo")) return this.details;
    if (selector.startsWith(".isBoard")) return this.markedElements || [];
    return [];
  }
  querySelector(selector) { return this.selectors?.[selector] || null; }
  set innerHTML(value) {
    this.html = value;
    this.details = [...value.matchAll(/<details class="noteDisplayMemo" data-display-key="([^"]+)"/g)].map(([, key]) => ({ dataset: { displayKey: key }, open: false, matches: selector => selector === "details.noteDisplayMemo" }));
  }
  get innerHTML() { return this.html || ""; }
  scrollTo(options) { if (options.top !== undefined) this.scrollTop = options.top; if (options.left !== undefined) this.scrollLeft = options.left; }
  getBoundingClientRect() { return { top: 0, bottom: 100, height: 100 }; }
  focus() {} select() {}
  contains(target) { return this.details.includes(target); }
}

function createPreviewClientHarness(note, scripts = {}) {
  const calls = [], frames = [], nodes = {};
  const element = (name) => nodes[name] || (nodes[name] = new PreviewElement());
  const bindings = Object.fromEntries(["groupsRoot", "previewRoot", "previewBoardRoot", "previewPane", "previewCountsEl", "previewListBtn", "previewBoardBtn",
    "noteBoardRoot", "noteBoardPanel", "noteBoardSearchInput", "noteBoardSearchNoticeEl", "openBoardBtn", "closeBoardBtn", "boardSaveBtn", "clearBoardSearchBtn", "noteSearchInput"].map(name => [name, element(name)]));
  bindings.noteBoardRoot.parents[".noteBoardRoot"] = bindings.noteBoardRoot;
  const memoButtons = ["openEditorMemos", "closeEditorMemos", "openPreviewMemos", "closePreviewMemos"].map(name => {
    const button = element(name); button.dataset.noteMemoAction = name.startsWith("open") ? "open" : "close"; return button;
  });
  const context = vm.createContext({ ...bindings, Element: PreviewElement, CSS: { escape: String },
    document: { getElementById: name => element(name), querySelectorAll: selector => memoButtons.filter(button => !selector.includes('="') || selector.includes('="' + button.dataset.noteMemoAction + '"')) },
    state: structuredClone(note), searchQuery: "", initial: {}, isPreviewOnly: false, isBoardOpen: false, previewMode: "list",
    collapsedGroupIds: new Set(), expandedBoardItemIds: new Set(), movePickerState: {}, boardMovePickerState: {}, boardDividerMovePickerState: {}, boardDragState: {}, boardDividerDragState: {},
    noteDisplayRenderer: createNoteDisplayRenderer(),
    requestAnimationFrame: callback => frames.push(callback),
    queueNoteDisplaySnapshot: () => calls.push(["snapshot"]), updateSearchNotices() {}, syncActiveEditingItemStyles() {},
    markDirty: () => calls.push(["dirty"]), setStatus: (...args) => calls.push(["status", ...args]),
    saveCurrentNote: () => calls.push(["save"]),
    scrollToEditorNavId: (...args) => calls.push(["navigate", ...args]), scrollToEditorItem: id => calls.push(["navigate", "item:" + id]),
    openItemMemoFromPreview: id => calls.push(["memo", id]), openItemMemoById: (...args) => calls.push(["memoById", ...args]),
    getPreviewScrollEl: () => bindings.previewRoot,
  });
  vm.runInContext(getNoteMemoVisibilityScript() + getUtilsScript() + getGroupsScript() + (scripts.preview || getPreviewScript()) + (scripts.board || getBoardScript()), context);
  // Editing DOM is outside this harness; preview rendering and event handlers run unchanged.
  context.renderGroups = () => calls.push(["renderEditor"]);
  context.registerNoteMemoVisibilityEvents();
  return { context, calls, nodes, element,
    flush() { while (frames.length) frames.shift()(); },
    event(dataset, parents = {}) {
      const event = { target: new PreviewElement(dataset, parents), prevented: 0, stopped: 0,
        preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; }, stopImmediatePropagation() { this.stopped++; },
        dataTransfer: { setData: (...args) => calls.push(["dragData", ...args]) } };
      return event;
    },
  };
}

module.exports = { createPreviewClientHarness, PreviewElement };
