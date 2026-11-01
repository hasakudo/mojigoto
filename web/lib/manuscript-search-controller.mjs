import { createNoteSearchController } from "./note-search-controller.mjs";

// Adapt one live textarea to the shared field-based search/replace session.
// The transient document is never persisted; only the normal input event commits it.
export function createManuscriptSearchController({ state, elements, document, scopeKey, notifyInput, ...runtime }) {
  let draft = null, owner = null;
  function getNote() {
    const file = state.currentFile;
    if (!file) return null;
    const scope = scopeKey();
    if (!owner || owner.provider !== state.provider || owner.work !== state.selectedWork || owner.scope !== scope || owner.id !== file.id) {
      owner = { provider: state.provider, work: state.selectedWork, scope, id: file.id };
      draft = { id: String(file.id), title: file.name, groups: [{ id: "manuscript", title: file.name, items: [{ id: "body", kind: "entry", body: "" }] }] };
    }
    draft.groups[0].items[0].body = elements.readerContent.value;
    return draft;
  }
  const aliases = {};
  for (const key of ["openNoteSearchButton", "closeNoteSearchButton", "noteSearchDialog", "noteSearchTitle", "noteSearchQuery", "noteSearchNames", "noteSearchDetails", "noteSearchMemos", "noteSearchCase", "noteSearchResults", "noteSearchStatus", "noteSearchPrev", "noteSearchNext", "noteSearchPage", "noteSearchFilter", "noteSearchFilterSummary", "noteReplaceMode", "noteReplaceFields", "noteReplaceText", "noteReplaceActions", "noteReplaceSelectAll", "noteReplaceClear", "noteReplaceApply", "noteReplaceUndo"]) {
    aliases[key] = elements[key.replace("NoteSearch", "ManuscriptSearch").replace(/^note/, "manuscript")];
  }
  aliases.noteEditorSection = elements.readerSection;
  aliases.notePreviewDialog = elements.manuscriptPreviewDialog;
  return createNoteSearchController({ state, elements: aliases, document, scopeKey, ...runtime,
    getNote, getItem: () => state.currentFile,
    isVisible: () => !elements.readerSection.hidden && !elements.readerContent.disabled,
    defaultFields: { names: false, details: true, memos: false }, fieldLabels: { details: "本文" },
    locateControl: field => field.field === "body" ? elements.readerContent : null,
    formatLocation: (_field, row) => `${row.line}行 ${row.column}文字目`,
    onChange: () => {
      // Read the already-mutated document directly; getNote() would refresh it from the old textarea.
      elements.readerContent.value = draft.groups[0].items[0].body;
      notifyInput();
    },
  });
}
